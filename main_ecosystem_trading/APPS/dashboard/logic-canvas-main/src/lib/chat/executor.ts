// Command Executor - Execute parsed commands against config state
// Now with Transaction Plan support for preview before apply

import type {
  ParsedCommand,
  CommandResult,
  FieldChange,
  QueryMatch,
  ProgressionType,
  TransactionPlan
} from "./types";
import type { MTConfig, EngineConfig, GroupConfig, LogicConfig } from "@/types/mt-config";
import {
  createProgressionPlan,
  createSetPlan,
  applyTransactionPlan,
  formatPlanForChat,
} from "./planner";
// NOTE: setfile loader/exporter removed - Rust bridge is the single source of truth
import { calculateProgression, validateForMT4 } from "./math";
import { applyOperation, clampToBounds, type SemanticCommand } from "./semanticEngine";
import { resolveValue, getValidSemanticValues, fieldAcceptsSemantic } from "./semantic-resolver";
import { getVersionControlManager } from "@/lib/version-control/manager";
import { getUndoRedoManager } from "@/lib/undo-redo/manager";
import { getMemorySystemManager } from "@/lib/memory-system/manager";
import { resourceManager } from "@/lib/resource/BoundedResourceManager";
import {
  validateField,
  validateFieldBounds,
  validateFieldOperation,
  getFieldEntity,
  type FieldEntity,
} from "./field-schema";
import { getFieldExplanation, FIELD_DESCRIPTIONS } from "./field-descriptions";

export class CommandExecutor {
  private config: MTConfig | null = null;
  private onConfigChange: ((config: MTConfig) => void) | null = null;
  private onClearSelection: (() => void) | null = null;
  private pendingPlan: TransactionPlan | null = null;
  private chatPendingPlan: TransactionPlan | null = null;
  private planHistory: TransactionPlan[] = [];
  private redoStack: TransactionPlan[] = [];
  private autoApproveTransactions: boolean = false;
  private vcManager = getVersionControlManager();
  private undoManager = getUndoRedoManager();
  private memoryManager = getMemorySystemManager();

  setAutoApprove(enabled: boolean) {
    this.autoApproveTransactions = enabled;
  }

  private validateFieldOp(
    field: string,
    entity: FieldEntity,
    value: number
  ): { valid: boolean; error?: string } {
    const result = validateFieldOperation(field, entity, value);
    if (!result.valid) {
      return { valid: false, error: result.error };
    }
    return { valid: true };
  }

  private validatePlanIntegrity(plan: TransactionPlan): { valid: boolean; error?: string } {
    if (!plan.id || !plan.type || !plan.preview) {
      return { valid: false, error: "INVALID_PLAN: Missing required plan fields" };
    }

    for (const p of plan.preview) {
      if (!p.engine || !p.group || !p.field) {
        return { valid: false, error: "INVALID_PREVIEW: Malformed preview entry" };
      }
    }

    return { valid: true };
  }

  private getEntityFromTarget(target: { type: string; engine?: string; group?: number; logic?: string }): FieldEntity {
    if (target.type === "general") return "general";
    if (target.type === "engine") return "engine";
    if (target.type === "group") return "group";
    if (target.type === "logic") return "logic";
    return "logic";
  }

  private executeImport(command: ParsedCommand): CommandResult {
    if (!this.config) return { success: false, message: "No config loaded" };
    const content: string | undefined = command.params.setContent;
    if (!content || content.length < 10) {
      return { success: false, message: "Missing .set content. Include it between triple backticks (``` ... ```)." };
    }

    // NOTE: Legacy loader/exporter removed. Use Rust bridge for setfile operations.
    // For now, return a message directing user to use the main export flow
    return {
      success: false,
      message: "Direct .set import via chat is temporarily disabled. Please use the main Export button which uses the Rust bridge for reliable setfile operations."
    };
  }

  // MEMORY LEAK FIX: Helper methods to limit array sizes using BoundedResourceManager
  private addToPlanHistory(plan: TransactionPlan) {
    this.planHistory = resourceManager.add('maxPlanHistory', this.planHistory, plan);
  }

  private addToRedoStack(plan: TransactionPlan) {
    this.redoStack = resourceManager.add('maxRedoStack', this.redoStack, plan);
  }

  // Get concise help message for chat display (panel shows full docs)
  private getShortHelpMessage(): string {
    return [
      "💡 Quick commands:",
      "• set <field> to <value> — Update config",
      "• show <target> — View settings",
      "• find <query> — Search values",
      "• copy / compare — Clone or diff",
      "• fibonacci / linear — Create progressions",
      "• apply / cancel — Confirm or reject changes",
      "",
      "📋 Full command reference → opened in panel",
    ].join("\n");
  }

  // FACTUAL HELP MESSAGE - SHORT VERSION
  private getHelpMessage(): string {
    return [
      "Commands:",
      "• set grid to 500 for G1",
      "• add 30% to lot for POWER", 
      "• show grid for all",
      "• enable reverse on G3",
      "",
      "Format: set/add/show/enable/disable + parameter + value + target",
      "Example: set grid to 600 for groups 1-8",
    ].join("\n");
  }

  // GREETINGS GO TO RUST - return unknown for command terminal

  private isGreeting(input: string): boolean {
    const trimmed = input.trim().toLowerCase();
    const greetingPatterns = ['hi', 'hey', 'hello', 'yo', 'sup', 'wassup', 'what\'s up'];
    return greetingPatterns.some(p => trimmed === p || trimmed.startsWith(p + ' '));
  }

  private createInversePlan(plan: TransactionPlan): TransactionPlan {
    return {
      ...structuredClone(plan),
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      appliedAt: undefined,
      status: "pending",
      description: `UNDO: ${plan.description}`,
      preview: plan.preview.map((p) => ({
        ...p,
        currentValue: p.newValue,
        newValue: p.currentValue,
        delta: undefined,
        deltaPercent: undefined,
      })),
    };
  }

  private applyPlan(plan: TransactionPlan): { newConfig: MTConfig; changes: FieldChange[]; appliedPlan: TransactionPlan } {
    const planIntegrity = this.validatePlanIntegrity(plan);
    if (!planIntegrity.valid) {
      throw new Error(planIntegrity.error);
    }

    const appliedPlan: TransactionPlan = structuredClone(plan);
    const newConfig = applyTransactionPlan(this.config!, appliedPlan);
    appliedPlan.status = "applied";
    appliedPlan.appliedAt = Date.now();
    const changes = appliedPlan.preview.map((p: any) => ({
      engine: p.engine,
      group: p.group,
      logic: p.logic,
      field: p.field,
      oldValue: p.currentValue,
      newValue: p.newValue,
    }));

    // Wire Version Control: Auto-create snapshot for significant changes
    if (changes.length > 0 && this.config) {
      try {
        this.vcManager.createSnapshot(
          this.config,
          `Chat: ${plan.description.substring(0, 100)}`,
          "user",
          ["chat-command", plan.type]
        );
      } catch (e) {
        console.warn("[VersionControl] Failed to create snapshot:", e);
      }
    }

    // Wire Undo/Redo: Record each change as an operation
    changes.forEach((change) => {
      try {
        this.undoManager.addOperation({
          type: 'UPDATE',
          target: {
            engineId: change.engine,
            groupId: change.group,
            logicName: change.logic,
            parameter: change.field,
          },
          before: change.oldValue,
          after: change.newValue,
          description: `${change.field}: ${change.oldValue} → ${change.newValue} (${change.logic} G${change.group})`,
        });
      } catch (e) {
        console.warn("[UndoRedo] Failed to record operation:", e);
      }
    });

    // Wire Memory System: Record the action with context
    if (changes.length > 0) {
      try {
        this.memoryManager.recordAction(
          "user",
          plan.type,
          changes.map(c => ({
            parameter: c.field,
            oldValue: c.oldValue,
            newValue: c.newValue,
            engineId: c.engine,
            groupId: c.group,
            logicName: c.logic,
          })),
          {
            marketConditions: plan.description,
          }
        );
      } catch (e) {
        console.warn("[MemorySystem] Failed to record action:", e);
      }
    }

    return { newConfig, changes, appliedPlan };
  }

  setConfig(config: MTConfig | null) {
    this.config = config;
  }

  setOnConfigChange(callback: (config: MTConfig) => void) {
    this.onConfigChange = callback;
  }

  setOnClearSelection(callback: () => void) {
    this.onClearSelection = callback;
  }

  getPendingPlan(): TransactionPlan | null {
    return this.pendingPlan;
  }

  approvePendingPlan(): CommandResult {
    if (!this.pendingPlan || !this.config) {
      return { success: false, message: "No pending plan to approve" };
    }

    const { newConfig, changes, appliedPlan } = this.applyPlan(this.pendingPlan);
    this.addToPlanHistory(appliedPlan);
    this.redoStack = [];
    this.pendingPlan = null;
    this.applyConfig(newConfig);

    return {
      success: true,
      message: `Applied ${changes.length} changes successfully`,
      changes,
      pendingPlan: appliedPlan,
    };
  }

  private approvePendingPlanSelection(selection: string): CommandResult {
    if (!this.pendingPlan || !this.config) {
      return { success: false, message: "No pending plan to approve" };
    }

    const raw = selection.trim();
    const lower = raw.toLowerCase();
    if (lower === "apply" || lower === "apply all" || lower === "apply remaining") {
      return this.approvePendingPlan();
    }

    const arg = lower.replace(/^apply\s+/, "").trim();
    if (!arg) {
      return this.approvePendingPlan();
    }

    const max = this.pendingPlan.preview.length;
    const selected = new Set<number>();
    const invalid: string[] = [];

    for (const part of arg.split(",").map(s => s.trim()).filter(Boolean)) {
      const range = part.split("-").map(s => s.trim()).filter(Boolean);
      if (range.length === 1) {
        const n = Number(range[0]);
        if (!Number.isInteger(n) || n < 1 || n > max) invalid.push(part);
        else selected.add(n);
        continue;
      }
      if (range.length === 2) {
        const start = Number(range[0]);
        const end = Number(range[1]);
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1 || start > max || end > max) {
          invalid.push(part);
          continue;
        }
        const lo = Math.min(start, end);
        const hi = Math.max(start, end);
        for (let i = lo; i <= hi; i++) selected.add(i);
        continue;
      }
      invalid.push(part);
    }

    if (invalid.length > 0) {
      return { success: false, message: `Invalid apply selection: ${invalid.join(", ")} (valid range: 1-${max})` };
    }

    const selectedList = Array.from(selected).sort((a, b) => a - b);
    if (selectedList.length === 0) {
      return { success: false, message: `No items selected. Use "apply 1-${max}" or "apply remaining".` };
    }

    const selectedPreview = selectedList.map((idx) => this.pendingPlan!.preview[idx - 1]).filter(Boolean);
    const selectedSet = new Set(selectedList);
    const remainingPreview = this.pendingPlan.preview.filter((_, idx) => !selectedSet.has(idx + 1));

    const partialPlan: TransactionPlan = {
      ...structuredClone(this.pendingPlan),
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      status: "pending",
      preview: selectedPreview,
      description: `${this.pendingPlan.description} (partial: ${selectedList.join(",")})`,
    };

    const { newConfig, changes, appliedPlan } = this.applyPlan(partialPlan);
    this.addToPlanHistory(appliedPlan);
    this.redoStack = [];

    if (remainingPreview.length === 0) {
      this.pendingPlan = null;
    } else {
      this.pendingPlan = {
        ...this.pendingPlan,
        preview: remainingPreview,
        status: "pending",
      };
    }

    this.applyConfig(newConfig);

    return {
      success: true,
      message: remainingPreview.length === 0
        ? `Applied ${changes.length} changes successfully`
        : `Applied ${changes.length} changes. ${remainingPreview.length} still pending (use "apply remaining" to finish).`,
      changes,
      pendingPlan: appliedPlan,
    };
  }

  rejectPendingPlan(): CommandResult {
    if (!this.pendingPlan) {
      return { success: false, message: "No pending plan to reject" };
    }
    this.pendingPlan.status = "rejected";
    this.pendingPlan = null;
    
    // Reset chat pending plan when rejecting
    this.chatPendingPlan = null;
    
    // Clear multi-edit selection state when canceling
    if (this.onClearSelection) {
      this.onClearSelection();
    }
    
    return { success: true, message: "Plan rejected. No changes made." };
  }

  getHistory(): TransactionPlan[] {
    return this.planHistory;
  }

  private formatHistory(limit: number): string {
    const total = this.planHistory.length;
    if (total === 0) return "No applied plans yet.";
    const take = Math.max(1, Math.min(limit, total));
    const slice = this.planHistory.slice(total - take);
    const lines = slice.map((p, i) => {
      const idx = total - take + i + 1;
      const when = p.appliedAt ? new Date(p.appliedAt).toLocaleString() : "n/a";
      const count = p.preview?.length ?? 0;
      return `#${idx} • ${when} • ${p.type} • ${count} changes • ${p.description}`;
    });
    return ["Recent plans:", ...lines].join("\n");
  }

  private undo(count: number): CommandResult {
    if (!this.config) return { success: false, message: "No config loaded" };
    if (count <= 0) return { success: false, message: "Undo count must be >= 1" };
    if (this.planHistory.length === 0) return { success: false, message: "Nothing to undo" };

    let working = this.config;
    const changes: FieldChange[] = [];
    let undoneCount = 0;

    for (let i = 0; i < count; i++) {
      const plan = this.planHistory.pop();
      if (!plan) break;
      const inverse = this.createInversePlan(plan);
      working = applyTransactionPlan(working, inverse);
      this.addToRedoStack(plan);
      undoneCount++;
      for (const p of inverse.preview) {
        changes.push({
          engine: p.engine,
          group: p.group,
          logic: p.logic,
          field: p.field,
          oldValue: p.currentValue,
          newValue: p.newValue,
        });
      }
    }

    this.applyConfig(working);
    return {
      success: true,
      message: `Undid ${undoneCount} plan${undoneCount === 1 ? "" : "s"} (${changes.length} changes)`,
      changes,
    };
  }

  private redo(count: number): CommandResult {
    if (!this.config) return { success: false, message: "No config loaded" };
    if (count <= 0) return { success: false, message: "Redo count must be >= 1" };
    if (this.redoStack.length === 0) return { success: false, message: "Nothing to redo" };

    let working = this.config;
    const changes: FieldChange[] = [];
    let redoneCount = 0;

    for (let i = 0; i < count; i++) {
      const plan = this.redoStack.pop();
      if (!plan) break;

      const reapply: TransactionPlan = {
        ...structuredClone(plan),
        createdAt: Date.now(),
        appliedAt: undefined,
        status: "pending",
      };

      const localPlan: TransactionPlan = structuredClone(reapply);
      working = applyTransactionPlan(working, localPlan);
      localPlan.status = "applied";
      localPlan.appliedAt = Date.now();
      this.addToPlanHistory(localPlan);
      redoneCount++;

      for (const p of localPlan.preview) {
        changes.push({
          engine: p.engine,
          group: p.group,
          logic: p.logic,
          field: p.field,
          oldValue: p.currentValue,
          newValue: p.newValue,
        });
      }
    }

    this.applyConfig(working);
    return {
      success: true,
      message: `Redid ${redoneCount} plan${redoneCount === 1 ? "" : "s"} (${changes.length} changes)`,
      changes,
    };
  }

  execute(command: ParsedCommand): CommandResult {
    // IDEMPOTENCY GUARD: Check operation limits
    if (!resourceManager.checkOperationLimit('execute', 1000)) {
      return {
        success: false,
        message: "Operation rate limit exceeded. Please wait and try again.",
      };
    }

    // INVARIANT: Validate config size before operations
    if (this.config) {
      const sizeCheck = resourceManager.validateConfigSize(this.config);
      if (!sizeCheck.valid) {
        return {
          success: false,
          message: `Config validation failed: ${sizeCheck.error}`,
        };
      }
    }

    const rawLower = command.raw.toLowerCase().trim();

    if (
      rawLower === "help" ||
      rawLower === "/help" ||
      rawLower === "#help" ||
      rawLower === "/commands" ||
      rawLower === "#commands"
    ) {
      return {
        success: true,
        message: this.getShortHelpMessage(),
        showPanel: "help",
      };
    }

    // GREETINGS ARE UNKNOWN - strict command terminal
    // Rust backend handles this, local parser returns unknown
    if (this.isGreeting(command.raw)) {
      return {
        success: false,
        message: "Unknown command. Try: 'set grid to 500 for G1'",
      };
    }

    if (rawLower === "plans" || rawLower.startsWith("plans ") || rawLower === "history" || rawLower.startsWith("history ")) {
      const nStr = rawLower.startsWith("plans ")
        ? rawLower.slice("plans ".length).trim()
        : rawLower.startsWith("history ")
          ? rawLower.slice("history ".length).trim()
          : "";
      const n = nStr ? Number(nStr) : 10;
      const limit = Number.isFinite(n) ? Math.max(1, Math.min(100, Math.floor(n))) : 10;
      return { success: true, message: this.formatHistory(limit) };
    }

    if (rawLower === "undo" || rawLower.startsWith("undo ")) {
      const nStr = rawLower.startsWith("undo ") ? rawLower.slice("undo ".length).trim() : "1";
      const n = Number(nStr);
      const count = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
      return this.undo(count);
    }

    if (rawLower === "redo" || rawLower.startsWith("redo ")) {
      const nStr = rawLower.startsWith("redo ") ? rawLower.slice("redo ".length).trim() : "1";
      const n = Number(nStr);
      const count = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
      return this.redo(count);
    }

    if (rawLower === "apply" || rawLower.startsWith("apply ") || rawLower === "yes" || rawLower === "confirm") {
      if (rawLower === "yes" || rawLower === "confirm") {
        return this.approvePendingPlan();
      }
      return this.approvePendingPlanSelection(command.raw);
    }
    if (rawLower === "cancel" || rawLower === "no" || rawLower === "reject") {
      return this.rejectPendingPlan();
    }

    if (this.pendingPlan) {
      this.pendingPlan = null;
    }

    if (!this.config) {
      return {
        success: false,
        message: "No config loaded. Load or import an explicit configuration before using chat commands.",
      };
    }

    switch (command.type) {
      case "query":
        return this.executeQuery(command);
      case "set":
        return this.executeSet(command);
      // NOTE: "semantic" command type not in CommandType enum - disabled
      // case "semantic":
      //   return this.executeSemantic(command);
      case "progression":
        return this.executeProgression(command);
      case "copy":
        return this.executeCopy(command);
      case "compare":
        return this.executeCompare(command);
      case "reset":
        return this.executeReset(command);
      case "formula":
        return this.executeFormula(command);
      case "import":
        return this.executeImport(command);
      case "unknown":
        // GREETINGS ARE UNKNOWN - strict command terminal
        if (this.isGreeting(command.raw)) {
          return {
            success: false,
            message: "Unknown command. Try: 'set grid to 500 for G1'",
          };
        }
        return {
          success: false,
          message: `Unknown command. Try: 'set grid to 500 for G1'`,
        };
      default:
        return { success: false, message: `Unknown command: ${command.raw}` };
    }
  }

  private executeQuery(command: ParsedCommand): CommandResult {
    const matches: QueryMatch[] = [];
    const { engines, groups, logics, field } = command.target;
    const { operator, compareValue } = command.params;

    if (!field) {
      const snapshotFields = [
        "initial_lot",
        "multiplier",
        "grid",
        "trail_value",
        "trail_start",
        "trail_step",
        "reverse_enabled",
        "hedge_enabled",
        "close_partial",
      ];

      const lines: string[] = [];
      const snapshotMatches: QueryMatch[] = [];

      this.iterateConfig(engines, groups, logics, (engine, group, logic) => {
        const parts: string[] = [];
        for (const f of snapshotFields) {
          const v = (logic as any)[f];
          if (v !== undefined) {
            const display = typeof v === "boolean" ? (v ? "ON" : "OFF") : v;
            parts.push(`${f}=${display}`);

            snapshotMatches.push({
              engine: engine.engine_id,
              group: group.group_number,
              logic: logic.logic_name,
              field: f,
              value: display
            });
          }
        }
        if (parts.length > 0) {
          lines.push(
            `${engine.engine_id} ${logic.logic_name} G${group.group_number}: ${parts.join(", ")}`
          );
        }
      });

      const targetParts: string[] = [];
      if (groups && groups.length > 0) {
        targetParts.push(`groups ${groups.join(",")}`);
      }
      if (logics && logics.length > 0) {
        targetParts.push(`logics ${logics.join(",")}`);
      }
      if (engines && engines.length > 0) {
        targetParts.push(`engines ${engines.join(",")}`);
      }
      const targetLabel = targetParts.length > 0 ? targetParts.join(" / ") : "all targets";

      const summary = lines.length > 0 ? lines.join("\n") : "No matches found";

      const navigationTargets = {
        engines: engines && engines.length > 0 ? engines : undefined,
        groups: groups && groups.length > 0 ? groups : undefined,
        logics: logics && logics.length > 0 ? logics : undefined,
        fields: snapshotFields
      };

      return {
        success: true,
        message: (engines || groups || logics) ? `Opened ${targetLabel} in canvas` : `Snapshot for ${targetLabel}`,
        queryResult: {
          matches: snapshotMatches,
          summary,
          navigationTargets: (engines || groups || logics) ? navigationTargets : undefined,
          isSnapshot: true
        },
      };
    }

    this.iterateConfig(engines, groups, logics, (engine, group, logic) => {
      const value = (logic as any)[field];
      if (value === undefined) return;

      if (operator && compareValue !== undefined) {
        const numValue = typeof value === "number" ? value : parseFloat(value);
        let matches_condition = false;
        switch (operator) {
          case ">": matches_condition = numValue > compareValue; break;
          case "<": matches_condition = numValue < compareValue; break;
          case ">=": matches_condition = numValue >= compareValue; break;
          case "<=": matches_condition = numValue <= compareValue; break;
          case "=":
          case "==": matches_condition = numValue === compareValue; break;
        }
        if (!matches_condition) return;
      }

      matches.push({
        engine: engine.engine_id,
        group: group.group_number,
        logic: logic.logic_name,
        field,
        value
      });
    });

    const navigationTargets = {
      engines: engines && engines.length > 0 ? engines : undefined,
      groups: groups && groups.length > 0 ? groups : undefined,
      logics: logics && logics.length > 0 ? logics : undefined,
      fields: field ? [field] : undefined
    };

    const fieldExplanation = field ? getFieldExplanation(field) : undefined;

    return {
      success: true,
      message: `Found ${matches.length} matches${fieldExplanation ? "" : ""}`,
      queryResult: {
        matches,
        summary: this.formatQuerySummary(matches, field),
        navigationTargets: (engines || groups || logics) ? navigationTargets : undefined,
        fieldExplanation: fieldExplanation || undefined
      }
    };
  }

  private executeSet(command: ParsedCommand): CommandResult {
    const { engines, groups, logics, field } = command.target;
    const { value } = command.params;

    if (!field || value === undefined) {
      const missing = !field && value === undefined ? "both field and value" : !field ? "field" : "value";
      return { 
        success: false, 
        message: `❌ Missing ${missing}.\n\nExamples:\n"set grid to 600 for groups 1-8"\n"set initial_lot to 0.02 for power"\n"set multiplier to 1.5 for all logics"` 
      };
    }

    // Use semantic resolver for INVARIANT GUARD
    // This prevents type errors and provides clear error messages
    let numValue: number;
    try {
      numValue = resolveValue(value, field);
    } catch (error: any) {
      // Provide helpful suggestions
      const validSemantics = getValidSemanticValues(field);
      const suggestion = validSemantics.length > 0 
        ? `\n\n💡 Try: ${validSemantics.slice(0, 5).join(', ')}${validSemantics.length > 5 ? '...' : ''} or a number`
        : "\n\n💡 Use a numeric value.";
      return { 
        success: false, 
        message: `❌ ${error.message}${suggestion}`
      };
    }

    try {
      const plan = createSetPlan(this.config!, {
        field,
        value: numValue,
        engines,
        groups,
        logics
      });

      if (this.autoApproveTransactions) {
        this.pendingPlan = plan;
        const approvalResult = this.approvePendingPlan();
        approvalResult.message = `✅ [Auto-Approved] Updated ${field} to ${value}\n\n${approvalResult.message}`;
        return approvalResult;
      }

      this.pendingPlan = plan;

      const navigationTargets = {
        engines: engines && engines.length > 0 ? engines : undefined,
        groups: groups && groups.length > 0 ? groups : undefined,
        logics: logics && logics.length > 0 ? logics : undefined,
        fields: [field]
      };

      return {
        success: true,
        message: plan.description,
        pendingPlan: plan,
        queryResult: {
          matches: [],
          summary: "",
          navigationTargets: (engines || groups || logics) ? navigationTargets : undefined
        }
      };
    } catch (error: any) {
      const errorMsg = error.message || "Failed to create change plan";
      if (errorMsg.includes("Target too vague")) {
        return { 
          success: false, 
          message: `${errorMsg}\n\nTry these instead:\n"set ${field} to ${value} for all groups"\n"set ${field} to ${value} for all logics"\n"set ${field} to ${value} for power groups 1-8"` 
        };
      }
      return { success: false, message: errorMsg };
    }
  }

  private executeSemantic(command: ParsedCommand): CommandResult {
    const { engines, groups, logics } = command.target;
    const semantic = command.semantic;

    if (!semantic || !semantic.operations || semantic.operations.length === 0) {
      return { success: false, message: "No semantic operations found" };
    }

    const applyToAll = (!engines || engines.length === 0) &&
      (!groups || groups.length === 0) &&
      (!logics || logics.length === 0);

    const plannedChanges: Array<{
      engine: string;
      group: number;
      logic: string;
      field: string;
      oldValue: any;
      newValue: any;
    }> = [];

    this.iterateConfig(engines, groups, logics, (engine, group, logic) => {
      for (const op of semantic.operations) {
        const currentValue = (logic as any)[op.field];

        if (currentValue !== undefined) {
          const isMathOp = op.op !== "set";
          if (isMathOp && typeof currentValue !== "number") continue;

          let newValue = applyOperation(currentValue, op);

          if (typeof newValue === "number") {
            newValue = clampToBounds(op.field, newValue);

            const fieldValidation = this.validateFieldOp(op.field, "logic", newValue);
            if (!fieldValidation.valid) {
              return {
                success: false,
                message: `Validation failed for ${op.field}: ${fieldValidation.error}`,
              };
            }
          }

          plannedChanges.push({
            engine: engine.engine_id,
            group: group.group_number,
            logic: logic.logic_name,
            field: op.field,
            oldValue: currentValue,
            newValue,
          });
        }
      }
    });

    if (plannedChanges.length === 0) {
      return { success: false, message: "No matching config entries to modify" };
    }

    const plan: TransactionPlan = {
      id: crypto.randomUUID(),
      type: "set",
      preview: plannedChanges.map(c => ({
        engine: c.engine,
        group: c.group,
        logic: c.logic,
        field: c.field,
        currentValue: c.oldValue,
        newValue: c.newValue,
      })),
      validation: { isValid: true, errors: [], warnings: [], mtCompatibility: { mt4: true, mt5: true, issues: [] } },
      risk: { level: "low", score: 0, reasons: [] },
      createdAt: Date.now(),
      status: "pending",
      description: semantic.description,
    };

    this.pendingPlan = plan;

    if (this.autoApproveTransactions) {
      const approvalResult = this.approvePendingPlan();
      approvalResult.message = `✅ [Auto-Approved] ${semantic.description}\n\n${approvalResult.message}`;
      return approvalResult;
    }

    const navigationTargets = {
      engines: engines && engines.length > 0 ? engines : undefined,
      groups: groups && groups.length > 0 ? groups : undefined,
      logics: logics && logics.length > 0 ? logics : undefined,
      fields: undefined
    };

    return {
      success: true,
      message: `**[SEMANTIC PREVIEW]** ${semantic.description}\n\n**Reply 'apply' to confirm or 'cancel' to discard.**`,
      pendingPlan: plan,
      queryResult: {
        matches: [],
        summary: "",
        navigationTargets: (engines || groups || logics) ? navigationTargets : undefined
      }
    };
  }

  private executeProgression(command: ParsedCommand): CommandResult {
    const { engines, groups, logics, field } = command.target;
    const { startValue, endValue, progressionType, factor, customSequence } = command.params;

    if (!field || !groups || groups.length < 2) {
      return { success: false, message: "Need field and at least 2 groups for progression" };
    }

    let defaultStart = startValue;
    if (defaultStart === undefined && groups && groups.length > 0) {
      let found: number | undefined = undefined;
      this.iterateConfig(engines, [groups[0]], logics, (engine, group, logic) => {
        const cur = (logic as any)[field];
        if (typeof cur === "number" && found === undefined) {
          found = cur;
        }
      });
      defaultStart = found !== undefined ? found : 600;
    }

    const plan = createProgressionPlan(this.config!, {
      field,
      progressionType: progressionType || "fibonacci",
      startValue: defaultStart || 600,
      endValue,
      factor,
      customSequence,
      engines,
      groups,
      logics
    });

    this.pendingPlan = plan;

    if (this.autoApproveTransactions) {
      const approvalResult = this.approvePendingPlan();
      approvalResult.message = `✅ [Auto-Approved] Generated progression for ${field}\n\n${approvalResult.message}`;
      return approvalResult;
    }

    const navigationTargets = {
      engines: engines && engines.length > 0 ? engines : undefined,
      groups: groups && groups.length > 0 ? groups : undefined,
      logics: logics && logics.length > 0 ? logics : undefined,
      fields: field ? [field] : undefined
    };

    return {
      success: true,
      message: formatPlanForChat(plan) + "\n\n**Reply 'apply' to confirm or 'cancel' to discard.**",
      pendingPlan: plan,
      queryResult: {
        matches: [],
        summary: "",
        navigationTargets: (engines || groups || logics) ? navigationTargets : undefined
      }
    };
  }

  private executeCopy(command: ParsedCommand): CommandResult {
    const { engines, groups, logics, field } = command.target;
    const { sourceGroup } = command.params;

    if (!sourceGroup || !groups) {
      return { success: false, message: "Need source group and target groups" };
    }

    const newConfig = structuredClone(this.config!);
    const sourceValues: Record<string, Record<string, any>> = {};

    this.iterateConfig(engines, [sourceGroup], logics, (engine, group, logic) => {
      const key = `${engine.engine_id}_${logic.logic_name}`;
      sourceValues[key] = { ...logic };
    });

    const changes: FieldChange[] = [];
    const targetGroups = groups.filter(g => g !== sourceGroup);

    this.iterateConfigMutable(newConfig, engines, targetGroups, logics, (engine, group, logic) => {
      const key = `${engine.engine_id}_${logic.logic_name}`;
      const source = sourceValues[key];
      if (!source) return;

      const fieldsToСopy = field ? [field] : Object.keys(source).filter(k =>
        !["logic_id", "logic_name"].includes(k)
      );

      for (const f of fieldsToСopy) {
        const oldValue = (logic as any)[f];
        const newValue = source[f];
        if (oldValue !== newValue) {
          (logic as any)[f] = newValue;
          changes.push({
            engine: engine.engine_id,
            group: group.group_number,
            logic: logic.logic_name,
            field: f,
            oldValue,
            newValue
          });
        }
      }
    });

    this.applyConfig(newConfig);

    return {
      success: true,
      message: `Copied settings from group ${sourceGroup} to ${targetGroups.length} groups`,
      changes
    };
  }

  private executeCompare(command: ParsedCommand): CommandResult {
    const { engines, groups, logics, field } = command.target;

    if (!groups || groups.length < 2) {
      return { success: false, message: "Need at least 2 groups to compare" };
    }

    const matches: QueryMatch[] = [];
    this.iterateConfig(engines, groups, logics, (engine, group, logic) => {
      if (!field) return;
      matches.push({
        engine: engine.engine_id,
        group: group.group_number,
        logic: logic.logic_name,
        field,
        value: (logic as any)[field]
      });
    });

    return {
      success: true,
      message: `Comparison for ${field}`,
      queryResult: {
        matches,
        summary: `Comparing ${field} across selected groups`
      }
    };
  }

  private executeReset(_command: ParsedCommand): CommandResult {
    return {
      success: false,
      message: "Reset to baked defaults is disabled. Load or import the exact values you want instead.",
    };
  }

  private executeFormula(command: ParsedCommand): CommandResult {
    return { success: false, message: "Formula commands not yet implemented" };
  }

  private applyConfig(config: MTConfig) {
    this.config = config;
    if (this.onConfigChange) {
      this.onConfigChange(config);
    }
  }

  private buildLogicTargets(logics: string[] | undefined) {
    const base = new Set<string>();
    const byEngine = new Map<string, Set<string>>();

    if (!logics || logics.length === 0) {
      return { base, byEngine };
    }

    for (const raw of logics) {
      const trimmed = String(raw).trim();
      if (!trimmed) continue;
      const upper = trimmed.toUpperCase();
      if (upper === "ALL") {
        base.add("ALL");
        continue;
      }

      const mColon = trimmed.match(/^([ABC])\s*[:/\\-]\s*(.+)$/i);
      if (mColon) {
        const engineId = mColon[1].toUpperCase();
        const logicName = String(mColon[2]).trim().toUpperCase();
        if (!logicName) continue;
        const set = byEngine.get(engineId) || new Set<string>();
        set.add(logicName);
        byEngine.set(engineId, set);
        continue;
      }

      const mLogicUnderscore = trimmed.match(/^LOGIC[_-]([ABC])[_-](.+)$/i);
      if (mLogicUnderscore) {
        const engineId = mLogicUnderscore[1].toUpperCase();
        const logicName = String(mLogicUnderscore[2]).trim().toUpperCase();
        if (!logicName) continue;
        const set = byEngine.get(engineId) || new Set<string>();
        set.add(logicName);
        byEngine.set(engineId, set);
        continue;
      }

      const mLogicCompact = trimmed.match(/^LOGIC[_-]([ABC])(.+)$/i);
      if (mLogicCompact) {
        const engineId = mLogicCompact[1].toUpperCase();
        const logicName = String(mLogicCompact[2]).trim().toUpperCase();
        if (!logicName) continue;
        const set = byEngine.get(engineId) || new Set<string>();
        set.add(logicName);
        byEngine.set(engineId, set);
        continue;
      }

      base.add(upper);
    }

    return { base, byEngine };
  }

  private logicIsAllowed(engineId: string, logicName: string, targets: ReturnType<CommandExecutor["buildLogicTargets"]>) {
    if (targets.base.size === 0 && targets.byEngine.size === 0) return true;
    if (targets.base.has("ALL")) return true;

    const logicUpper = logicName.toUpperCase();
    const perEngine = targets.byEngine.get(engineId);
    if (perEngine && perEngine.has(logicUpper)) return true;
    if (targets.base.has(logicUpper)) return true;
    return false;
  }

  private iterateConfig(
    engines: string[] | undefined,
    groups: number[] | undefined,
    logics: string[] | undefined,
    callback: (engine: EngineConfig, group: GroupConfig, logic: LogicConfig) => void
  ) {
    if (!this.config) return;

    const logicTargets = this.buildLogicTargets(logics);

    for (const engine of this.config.engines) {
      if (engines && engines.length > 0 && !engines.includes(engine.engine_id)) continue;

      for (const group of engine.groups) {
        if (groups && groups.length > 0 && !groups.includes(group.group_number)) continue;

        for (const logic of group.logics) {
          if (logics && logics.length > 0 && !this.logicIsAllowed(engine.engine_id, logic.logic_name, logicTargets)) continue;
          callback(engine, group, logic);
        }
      }
    }
  }

  private iterateConfigMutable(
    config: MTConfig,
    engines: string[] | undefined,
    groups: number[] | undefined,
    logics: string[] | undefined,
    callback: (engine: EngineConfig, group: GroupConfig, logic: LogicConfig) => void
  ) {
    const logicTargets = this.buildLogicTargets(logics);

    for (const engine of config.engines) {
      if (engines && engines.length > 0 && !engines.includes(engine.engine_id)) continue;

      for (const group of engine.groups) {
        if (groups && groups.length > 0 && !groups.includes(group.group_number)) continue;

        for (const logic of group.logics) {
          if (logics && logics.length > 0 && !this.logicIsAllowed(engine.engine_id, logic.logic_name, logicTargets)) continue;
          callback(engine, group, logic);
        }
      }
    }
  }

  private formatQuerySummary(matches: QueryMatch[], field: string): string {
    if (matches.length === 0) return `No matches for ${field}`;
    const head = matches.slice(0, 10);
    const lines = head.map(m => `${m.engine} ${m.logic} G${m.group}: ${m.value}`);
    if (matches.length > 10) lines.push(`... and ${matches.length - 10} more`);
    return lines.join("\n");
  }
}

export const commandExecutor = new CommandExecutor();

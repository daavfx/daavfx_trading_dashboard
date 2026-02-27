import type { MTConfig, EngineConfig, GroupConfig, LogicConfig } from "@/types/mt-config";
import { calculateProgression, validateForMT4, type ProgressionType } from "./math";
import {
  validateFieldOperation,
  getFieldEntity,
  type FieldEntity,
} from "./field-schema";
import type {
  TransactionPlan,
  ChangePreview,
  ValidationResult,
  RiskLevel,
  RiskAssessment
} from "./types";

function validatePlanFields(plan: TransactionPlan): void {
  for (const p of plan.preview) {
    const entity: FieldEntity = p.logic ? "logic" : (p.group ? "group" : "general");
    
    if (typeof p.newValue === "number") {
      const result = validateFieldOperation(p.field, entity, p.newValue);
      if (!result.valid) {
        throw new Error(`Plan validation failed for ${p.field}: ${result.error}`);
      }
    }
  }
  
  if (plan.validation && !plan.validation.isValid && plan.validation.errors.length > 0) {
    throw new Error(`Plan validation failed: ${plan.validation.errors.join(", ")}`);
  }
}

export interface ProgressionPlanParams {
  field: string;
  progressionType: ProgressionType;
  startValue: number;
  endValue?: number;
  factor?: number;
  customSequence?: number[];
  engines?: string[];
  groups: number[];
  logics?: string[];
}

function buildLogicTargets(logics: string[] | undefined) {
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

function logicIsAllowed(engineId: string, logicName: string, targets: ReturnType<typeof buildLogicTargets>) {
  if (targets.base.size === 0 && targets.byEngine.size === 0) return true;
  if (targets.base.has("ALL")) return true;

  const logicUpper = logicName.toUpperCase();
  const perEngine = targets.byEngine.get(engineId);
  if (perEngine && perEngine.has(logicUpper)) return true;
  if (targets.base.has(logicUpper)) return true;
  return false;
}

/**
 * Create a transaction plan for a progression command
 * Performs dry-run simulation without modifying state
 */
export function createProgressionPlan(
  config: MTConfig,
  params: ProgressionPlanParams
): TransactionPlan {
  const { field, progressionType, startValue, endValue, factor, customSequence, engines, groups, logics } = params;

  const logicTargets = buildLogicTargets(logics);

  // Calculate progression values
  const progression = calculateProgression({
    type: progressionType,
    startValue,
    endValue,
    steps: groups.length,
    factor,
    customSequence,
    roundTo: field === "initial_lot" ? 2 : 0
  });

  // Validate against MT4 constraints
  const mtValidation = validateForMT4(field, progression.values);

  // Build preview of changes
  const preview: ChangePreview[] = [];
  const targetEngines = engines || config.engines.map(e => e.engine_id);

  groups.forEach((groupNum, index) => {
    const newValue = mtValidation.corrected[index];

    for (const engine of config.engines) {
      if (!targetEngines.includes(engine.engine_id)) continue;

      const group = engine.groups.find(g => g.group_number === groupNum);
      if (!group) continue;

      for (const logic of group.logics) {
        if (logics && logics.length > 0 && !logicIsAllowed(engine.engine_id, logic.logic_name, logicTargets)) continue;

        const currentValue = (logic as any)[field];
        if (currentValue === undefined) continue;

        const delta = typeof currentValue === "number" ? newValue - currentValue : undefined;
        const deltaPercent = typeof currentValue === "number" && currentValue !== 0
          ? ((newValue - currentValue) / currentValue) * 100
          : undefined;

        preview.push({
          engine: engine.engine_id,
          group: groupNum,
          logic: logic.logic_name,
          field,
          currentValue,
          newValue,
          delta,
          deltaPercent
        });
      }
    }
  });

  // Build validation result
  const validation: ValidationResult = {
    isValid: mtValidation.valid && progression.warnings.length === 0,
    errors: [...mtValidation.errors],
    warnings: [...progression.warnings],
    mtCompatibility: {
      mt4: mtValidation.valid,
      mt5: mtValidation.valid,
      issues: mtValidation.errors
    }
  };

  // Check for disabled groups
  groups.forEach(g => {
    const engineGroups = config.engines.flatMap(e => e.groups);
    const group = engineGroups.find(eg => eg.group_number === g);
    if (group && !group.enabled) {
      validation.warnings.push(`Group ${g} is currently disabled`);
    }
  });

  // Generate description
  const description = `Apply ${progressionType} progression to ${field} for Groups ${groups[0]}-${groups[groups.length - 1]}\n` +
    `Formula: ${progression.formula}\n` +
    `Values: ${progression.values.map((v, i) => `G${groups[i]}=${v}`).join(", ")}`;

  // Calculate risk assessment
  const risk = calculateRisk(preview, field);

  return {
    id: `plan_${Date.now()}`,
    type: "progression",
    description,
    preview,
    validation,
    risk,
    createdAt: Date.now(),
    status: "pending"
  };
}

/**
 * Create a transaction plan for a simple set command
 */
export function createSetPlan(
  config: MTConfig,
  params: {
    field: string;
    value: number;
    engines?: string[];
    groups?: number[];
    logics?: string[];
  }
): TransactionPlan {
  const { field, value, engines, groups, logics } = params;

  const logicTargets = buildLogicTargets(logics);

  // VALIDATION: Ensure at least one target is specified
  if ((!engines || engines.length === 0) &&
    (!groups || groups.length === 0) &&
    (!logics || logics.length === 0)) {
    throw new Error("Target too vague. Must specify at least one of: engines, groups, or logics.");
  }

  const mtValidation = validateForMT4(field, [value]);
  const correctedValue = mtValidation.corrected[0];

  const preview: ChangePreview[] = [];

  for (const engine of config.engines) {
    // Skip engine if engines filter specified and this engine not in list
    if (engines && engines.length > 0 && !engines.includes(engine.engine_id)) continue;

    for (const group of engine.groups) {
      // Skip group if groups filter specified and this group not in list
      if (groups && groups.length > 0 && !groups.includes(group.group_number)) continue;

      for (const logic of group.logics) {
        if (logics && logics.length > 0 && !logicIsAllowed(engine.engine_id, logic.logic_name, logicTargets)) continue;

        const currentValue = (logic as any)[field];
        if (currentValue === undefined) continue;

        preview.push({
          engine: engine.engine_id,
          group: group.group_number,
          logic: logic.logic_name,
          field,
          currentValue,
          newValue: correctedValue,
          delta: typeof currentValue === "number" ? correctedValue - currentValue : undefined
        });
      }
    }
  }

  // Calculate risk assessment
  const risk = calculateRisk(preview, field);

  return {
    id: `plan_${Date.now()}`,
    type: "set",
    description: `Set ${field} to ${correctedValue} for ${preview.length} targets`,
    preview,
    validation: {
      isValid: mtValidation.valid,
      errors: mtValidation.errors,
      warnings: [],
      mtCompatibility: { mt4: true, mt5: true, issues: [] }
    },
    risk,
    createdAt: Date.now(),
    status: "pending"
  };
}

/**
 * Apply a transaction plan to the config
 * Only call this after user approval
 */
export function applyTransactionPlan(
  config: MTConfig,
  plan: TransactionPlan
): MTConfig {
  validatePlanFields(plan);
  
  const newConfig = structuredClone(config);

  for (const change of plan.preview) {
    if (change.engine === "GLOBAL") {
      (newConfig.global as any)[change.field] = change.newValue;
      continue;
    }
    const engine = newConfig.engines.find(e => e.engine_id === change.engine);
    if (!engine) continue;
    if (change.group <= 0) {
      if (change.field === "max_power_orders") {
        engine.max_power_orders = change.newValue as number;
      }
      continue;
    }
    const group = engine.groups.find(g => g.group_number === change.group);
    if (!group) continue;
    const logic = group.logics.find(l => l.logic_name.toUpperCase() === change.logic.toUpperCase());
    if (!logic) continue;
    (logic as any)[change.field] = change.newValue;
  }

  return newConfig;
}

/**
 * Format a transaction plan for chat display
 */
export function formatPlanForChat(plan: TransactionPlan): string {
  // Risk indicator emoji
  const riskEmoji = {
    low: "🟢",
    medium: "🟡",
    high: "🟠",
    critical: "🔴"
  }[plan.risk.level];

  let output = `📋 **Transaction Plan** ${riskEmoji} ${plan.risk.level.toUpperCase()} RISK\n\n`;
  output += `${plan.description}\n\n`;

  // Risk reasons
  if (plan.risk.reasons.length > 0 && plan.risk.level !== "low") {
    output += `⚠️ **Risk Factors:**\n`;
    for (const reason of plan.risk.reasons) {
      output += `• ${reason}\n`;
    }
    output += `\n`;
  }

  if (!plan.validation.isValid) {
    output += `⚠️ **Validation Issues:**\n`;
    for (const error of plan.validation.errors) {
      output += `• ${error}\n`;
    }
    output += `\n`;
  }

  if (plan.validation.warnings.length > 0) {
    output += `💡 **Warnings:**\n`;
    for (const warning of plan.validation.warnings) {
      output += `• ${warning}\n`;
    }
    output += `\n`;
  }

  // Group changes by group number
  const byGroup = new Map<number, ChangePreview[]>();
  for (const change of plan.preview) {
    const existing = byGroup.get(change.group) || [];
    existing.push(change);
    byGroup.set(change.group, existing);
  }

  output += `📊 **Preview (${plan.preview.length} changes):**\n`;

  // Show first 8 groups
  const groupNums = Array.from(byGroup.keys()).sort((a, b) => a - b).slice(0, 8);
  for (const groupNum of groupNums) {
    const changes = byGroup.get(groupNum)!;
    const change = changes[0]; // Just show first logic per group
    const deltaStr = change.delta !== undefined
      ? ` (${change.delta >= 0 ? "+" : ""}${change.delta.toFixed(0)})`
      : "";
    output += `G${groupNum}: ${change.currentValue} → ${change.newValue}${deltaStr}\n`;
  }

  if (byGroup.size > 8) {
    output += `... and ${byGroup.size - 8} more groups\n`;
  }

  return output;
}

/**
 * Serialize a transaction plan for undo/history
 */
/**
 * Calculate risk level based on changes
 */
function calculateRisk(preview: ChangePreview[], field: string): RiskAssessment {
  let score = 0;
  const reasons: string[] = [];

  // Risk multipliers by field type
  const fieldMultipliers: Record<string, number> = {
    initial_lot: 3.0,  // Lot changes are high risk
    multiplier: 2.5,   // Multiplier affects progression
    grid: 1.0,         // Grid is moderate
    trail_value: 0.5,  // Trail is low risk
    trail_start: 0.5,
    trail_step: 0.5,
    tp_value: 0.8,
    sl_value: 0.8,
    start_level: 0.3,
  };

  const multiplier = fieldMultipliers[field] || 1.0;

  // Analyze changes
  for (const change of preview) {
    if (change.deltaPercent !== undefined) {
      const absPercent = Math.abs(change.deltaPercent);

      if (absPercent > 200) {
        score += 30 * multiplier;
        if (!reasons.includes("Extreme value changes (>200%)")) {
          reasons.push("Extreme value changes (>200%)");
        }
      } else if (absPercent > 100) {
        score += 20 * multiplier;
        if (!reasons.includes("Large value changes (>100%)")) {
          reasons.push("Large value changes (>100%)");
        }
      } else if (absPercent > 50) {
        score += 10 * multiplier;
      }
    }

    // Check for dangerous values
    if (field === "initial_lot" && change.newValue > 1.0) {
      score += 25;
      if (!reasons.includes("High lot size (>1.0)")) {
        reasons.push("High lot size (>1.0)");
      }
    }
    if (field === "grid" && change.newValue < 20) {
      score += 15;
      if (!reasons.includes("Tight grid spacing (<20)")) {
        reasons.push("Tight grid spacing (<20)");
      }
    }
    if (field === "multiplier" && change.newValue > 2.0) {
      score += 20;
      if (!reasons.includes("Aggressive multiplier (>2.0)")) {
        reasons.push("Aggressive multiplier (>2.0)");
      }
    }
  }

  // Normalize score
  score = Math.min(100, score);

  // Determine level
  let level: RiskLevel;
  if (score >= 70) {
    level = "critical";
  } else if (score >= 45) {
    level = "high";
  } else if (score >= 20) {
    level = "medium";
  } else {
    level = "low";
  }

  if (reasons.length === 0) {
    reasons.push(level === "low" ? "Minor changes" : "Multiple significant changes");
  }

  return { level, score, reasons };
}

export function serializePlan(plan: TransactionPlan): string {
  return JSON.stringify(plan);
}

export function deserializePlan(json: string): TransactionPlan {
  return JSON.parse(json);
}

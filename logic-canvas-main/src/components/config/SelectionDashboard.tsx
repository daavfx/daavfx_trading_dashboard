import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { MTConfig } from "@/types/mt-config";
import type { TransactionPlan, ChangePreview, RiskLevel } from "@/lib/chat/types";
import { BarChart3, Target, Sparkles, Wand2, ArrowRight, X, ChevronDown, ChevronRight, ShieldAlert, CheckCircle2, XCircle, Database, FileSpreadsheet } from "lucide-react";
import { DefensiveWrapper } from "@/components/system/DefensiveWrapper";

type NumericFieldKey =
  | "initial_lot"
  | "multiplier"
  | "grid"
  | "trail_value"
  | "trail_start"
  | "trail_step"
  | "tp_value"
  | "sl_value";

type ToggleFieldKey = "reverse_enabled" | "hedge_enabled" | "close_partial";

const QUICK_FIELDS: Array<{ id: NumericFieldKey | ToggleFieldKey; label: string }> = [
  { id: "grid", label: "Grid" },
  { id: "initial_lot", label: "Initial Lot" },
  { id: "multiplier", label: "Multiplier" },
  { id: "trail_value", label: "Trail" },
  { id: "reverse_enabled", label: "Reverse" },
  { id: "hedge_enabled", label: "Hedge" },
];

const DEFAULT_COMMANDS = [
  { label: "set grid 600", command: "set grid 600", focusField: "grid" },
  { label: "set lot 0.02", command: "set lot 0.02", focusField: "initial_lot" },
  { label: "set mult 1.5", command: "set multiplier 1.5", focusField: "multiplier" },
  { label: "enable reverse", command: "enable reverse", focusField: "reverse_enabled" },
];

function parseEngineId(label: string) {
  const m = label.match(/Engine\s+([A-Z])/i);
  return m ? m[1].toUpperCase() : null;
}

function parseGroupNumber(label: string) {
  const m = label.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function formatNumber(n: number) {
  if (!Number.isFinite(n)) return "-";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 100) return n.toFixed(1);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function clampText(s: string, max = 64) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function SelectionDashboard(props: {
  config: MTConfig | null;
  selectedEngines: string[];
  selectedGroups: string[];
  selectedLogics: string[];
  selectedFields: string[];
  isMultiEdit: boolean;
  chatActive?: boolean;
  pendingPlan: TransactionPlan | null;
  lastAppliedPreview: ChangePreview[] | null;
  onFocusField: (field: string) => void;
  onSendToChat: (command: string) => void;
  onOpenVaultSave: (data: {
    name: string;
    category: string;
    tags: string[];
    comments: string;
    saveToVault: boolean;
    format: "set" | "json";
  }) => void;
  onClearSelection: () => void;
  onExportCompleteV3Legacy?: () => void;
}) {
  return (
    <DefensiveWrapper componentName="SelectionDashboard" renderThreshold={50} identicalPropsThreshold={10}>
      <SelectionDashboardInner {...props} />
    </DefensiveWrapper>
  );
}

function SelectionDashboardInner({
  config,
  selectedEngines,
  selectedGroups,
  selectedLogics,
  selectedFields,
  isMultiEdit,
  chatActive,
  pendingPlan,
  lastAppliedPreview,
  onFocusField,
  onSendToChat,
  onOpenVaultSave,
  onClearSelection,
  onExportCompleteV3Legacy,
}: {
  config: MTConfig | null;
  selectedEngines: string[];
  selectedGroups: string[];
  selectedLogics: string[];
  selectedFields: string[];
  isMultiEdit: boolean;
  chatActive?: boolean;
  pendingPlan: TransactionPlan | null;
  lastAppliedPreview: ChangePreview[] | null;
  onFocusField: (field: string) => void;
  onSendToChat: (command: string) => void;
  onOpenVaultSave: (data: {
    name: string;
    category: string;
    tags: string[];
    comments: string;
    saveToVault: boolean;
    format: "set" | "json";
  }) => void;
  onClearSelection: () => void;
  onExportCompleteV3Legacy?: () => void;
}) {
  return (
    <DefensiveWrapper componentName="SelectionDashboard" renderThreshold={50} identicalPropsThreshold={10}>
      <SelectionDashboardContent
        config={config}
        selectedEngines={selectedEngines}
        selectedGroups={selectedGroups}
        selectedLogics={selectedLogics}
        selectedFields={selectedFields}
        isMultiEdit={isMultiEdit}
        chatActive={chatActive}
        pendingPlan={pendingPlan}
        lastAppliedPreview={lastAppliedPreview}
        onFocusField={onFocusField}
        onSendToChat={onSendToChat}
        onOpenVaultSave={onOpenVaultSave}
        onClearSelection={onClearSelection}
        onExportCompleteV3Legacy={onExportCompleteV3Legacy}
      />
    </DefensiveWrapper>
  );
}

function SelectionDashboardContent({
  config,
  selectedEngines,
  selectedGroups,
  selectedLogics,
  selectedFields,
  isMultiEdit,
  chatActive,
  pendingPlan,
  lastAppliedPreview,
  onFocusField,
  onSendToChat,
  onOpenVaultSave,
  onClearSelection,
  onExportCompleteV3Legacy,
}: {
  config: MTConfig | null;
  selectedEngines: string[];
  selectedGroups: string[];
  selectedLogics: string[];
  selectedFields: string[];
  isMultiEdit: boolean;
  chatActive?: boolean;
  pendingPlan: TransactionPlan | null;
  lastAppliedPreview: ChangePreview[] | null;
  onFocusField: (field: string) => void;
  onSendToChat: (command: string) => void;
  onOpenVaultSave: (data: {
    name: string;
    category: string;
    tags: string[];
    comments: string;
    saveToVault: boolean;
    format: "set" | "json";
  }) => void;
  onClearSelection: () => void;
  onExportCompleteV3Legacy?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const selection = useMemo(() => {
    const engines = selectedEngines.map(parseEngineId).filter(Boolean) as string[];
    const groups = selectedGroups.map(parseGroupNumber).filter((n): n is number => typeof n === "number" && !Number.isNaN(n));
    const logics = selectedLogics.map((l) => l.toUpperCase());
    const issues: string[] = [];
    if (engines.length === 0) issues.push("Pick at least 1 engine");
    if (groups.length === 0) issues.push("Pick at least 1 group");
    if (logics.length === 0) issues.push("Pick at least 1 logic");
    return { engines, groups, logics, issues };
  }, [selectedEngines, selectedGroups, selectedLogics]);

  const analytics = useMemo(() => {
    if (!config) {
      return {
        targets: 0,
        num: {} as Record<NumericFieldKey, { min: number; max: number; avg: number; count: number }>,
        toggles: {} as Record<ToggleFieldKey, { on: number; off: number; total: number }>,
      };
    }

    const wantedEngines = selection.engines.length ? new Set(selection.engines) : new Set<string>();
    const wantedGroups = selection.groups.length ? new Set(selection.groups) : new Set<number>();
    const wantedLogics = selection.logics.length ? new Set(selection.logics) : new Set<string>();

    const numericKeys: NumericFieldKey[] = [
      "initial_lot",
      "multiplier",
      "grid",
      "trail_value",
      "trail_start",
      "trail_step",
      "tp_value",
      "sl_value",
    ];
    const toggleKeys: ToggleFieldKey[] = ["reverse_enabled", "hedge_enabled", "close_partial"];

    const accum: Record<NumericFieldKey, { min: number; max: number; sum: number; count: number }> = Object.fromEntries(
      numericKeys.map((k) => [k, { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, sum: 0, count: 0 }])
    ) as any;
    const toggles: Record<ToggleFieldKey, { on: number; off: number; total: number }> = Object.fromEntries(
      toggleKeys.map((k) => [k, { on: 0, off: 0, total: 0 }])
    ) as any;

    let targets = 0;

    for (const engine of config.engines || []) {
      const engineOk = wantedEngines.size === 0 || wantedEngines.has(engine.engine_id);
      if (!engineOk) continue;

      for (const group of engine.groups || []) {
        const groupOk = wantedGroups.size === 0 || wantedGroups.has(group.group_number);
        if (!groupOk) continue;

        for (const logic of group.logics || []) {
          const logicUpper = String(logic.logic_name || "").toUpperCase();
          const logicOk = wantedLogics.size === 0 || wantedLogics.has(logicUpper);
          if (!logicOk) continue;

          targets += 1;

          for (const k of numericKeys) {
            const v = (logic as any)[k];
            if (typeof v !== "number" || Number.isNaN(v)) continue;
            const slot = accum[k];
            slot.count += 1;
            slot.sum += v;
            slot.min = Math.min(slot.min, v);
            slot.max = Math.max(slot.max, v);
          }

          for (const k of toggleKeys) {
            const v = (logic as any)[k];
            if (typeof v !== "boolean") continue;
            toggles[k].total += 1;
            if (v) toggles[k].on += 1;
            else toggles[k].off += 1;
          }
        }
      }
    }

    const num: Record<NumericFieldKey, { min: number; max: number; avg: number; count: number }> = {} as any;
    for (const k of numericKeys) {
      const { min, max, sum, count } = accum[k];
      num[k] = {
        min: count ? min : NaN,
        max: count ? max : NaN,
        avg: count ? sum / count : NaN,
        count,
      };
    }

    return { targets, num, toggles };
  }, [config, selection.engines, selection.groups, selection.logics]);

  const headerSubtitle = useMemo(() => {
    const parts: string[] = [];
    if (selection.engines.length) parts.push(`Engine ${selection.engines.join(",")}`);
    if (selection.groups.length) parts.push(`G${selection.groups.join(",")}`);
    if (selection.logics.length) parts.push(selection.logics.join(","));
    return parts.length ? clampText(parts.join(" · "), 72) : "No selection yet";
  }, [selection.engines, selection.groups, selection.logics]);

  const vaultDraft = useMemo(() => {
    const platform = (config?.platform || "MT5").toUpperCase();
    const engines = selection.engines.length ? `E${selection.engines.join("")}` : "E";
    const groups = selection.groups.length ? `G${selection.groups.join("-")}` : "G";
    const logics = selection.logics.length ? selection.logics.join("-") : "LOGIC";
    const name = clampText(`${platform}_${engines}_${groups}_${logics}_v1`, 56);

    const tags = [
      platform,
      ...selection.engines.map((e) => `Engine${e}`),
      ...selection.groups.map((g) => `G${g}`),
      ...selection.logics.map((l) => l),
      isMultiEdit ? "multi-edit" : "single-edit",
    ].filter(Boolean);

    const commentLines = [
      `Target: ${headerSubtitle}`,
      `Targets: ${analytics.targets}`,
      `Generated: ${new Date().toLocaleString()}`,
      `Grid avg: ${formatNumber(analytics.num.grid?.avg)} (min ${formatNumber(analytics.num.grid?.min)} / max ${formatNumber(analytics.num.grid?.max)})`,
      `Lot avg: ${formatNumber(analytics.num.initial_lot?.avg)}`,
      `Mult avg: ${formatNumber(analytics.num.multiplier?.avg)}`,
    ];

    return {
      name,
      category: isMultiEdit ? "Testing" : "General",
      tags,
      comments: commentLines.join("\n"),
      saveToVault: true,
      format: "set" as const,
    };
  }, [
    analytics.num.grid?.avg,
    analytics.num.grid?.min,
    analytics.num.grid?.max,
    analytics.num.initial_lot?.avg,
    analytics.num.multiplier?.avg,
    analytics.targets,
    config?.platform,
    headerSubtitle,
    isMultiEdit,
    selection.engines,
    selection.groups,
    selection.logics,
  ]);

  const riskStyle = useMemo(() => {
    const level: RiskLevel | null = pendingPlan?.risk?.level ?? null;
    if (level === "critical") return "border-red-500/40 bg-red-500/5";
    if (level === "high") return "border-orange-500/40 bg-orange-500/5";
    if (level === "medium") return "border-yellow-500/40 bg-yellow-500/5";
    if (level === "low") return "border-emerald-500/40 bg-emerald-500/5";
    return "border-border/40 bg-background/30";
  }, [pendingPlan?.risk?.level]);

  return (
    <div className="card-elevated rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 border-b border-border/30 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("p-1.5 rounded", isMultiEdit ? "bg-primary/10" : "bg-muted/30")}>
            <Sparkles className={cn("w-4 h-4", isMultiEdit ? "text-primary" : "text-muted-foreground")} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium truncate">Selection Dashboard</span>
              {isMultiEdit && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
                  Multi-Edit
                </span>
              )}
              {chatActive && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 shrink-0">
                  Chat Preview
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">{headerSubtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            onClick={(e) => {
              e.stopPropagation();
              onClearSelection();
            }}
            className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            role="button"
            aria-label="Clear selection"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClearSelection();
              }
            }}
          >
            <X className="w-3.5 h-3.5" />
          </div>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          {(pendingPlan || lastAppliedPreview) && (
            <div className={cn("rounded-lg border p-3", pendingPlan ? riskStyle : "border-border/40 bg-background/30")}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldAlert className={cn("w-4 h-4", pendingPlan ? "text-primary" : "text-muted-foreground")} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {pendingPlan ? "Pending Plan" : "Last Applied"}
                    </div>
                    {pendingPlan ? (
                      <div className="text-[10px] text-muted-foreground truncate">
                        {pendingPlan.type.toUpperCase()} · {pendingPlan.preview.length} targets · {pendingPlan.risk.level.toUpperCase()} RISK
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted-foreground truncate">
                        {lastAppliedPreview ? `${lastAppliedPreview.length} targets updated` : ""}
                      </div>
                    )}
                  </div>
                </div>

                {pendingPlan && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onSendToChat("cancel")}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border/40 bg-background hover:bg-muted/20 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      cancel
                    </button>
                    <button
                      onClick={() => onSendToChat("apply")}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-primary/30 bg-primary/10 hover:bg-primary/15 text-[10px] text-primary transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      apply
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-2">
                {(pendingPlan ? pendingPlan.preview : (lastAppliedPreview || []))
                  .slice(0, 4)
                  .map((p, idx) => (
                    <button
                      key={`${p.engine}-${p.group}-${p.logic}-${p.field}-${idx}`}
                      onClick={() => onFocusField(p.field)}
                      className="rounded-md border border-border/30 bg-background/40 hover:bg-background/60 px-2 py-2 text-left transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] text-muted-foreground truncate">
                          {p.engine} G{p.group} · {String(p.logic).toUpperCase()}
                        </div>
                        <div className="text-[10px] text-muted-foreground shrink-0">{p.field}</div>
                      </div>
                      <div className="mt-1 flex items-center gap-2 font-mono text-[11px]">
                        <span className="text-muted-foreground/70 truncate">{String(p.currentValue)}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                        <span className="text-foreground truncate">{String(p.newValue)}</span>
                      </div>
                    </button>
                  ))}
              </div>

              {pendingPlan && pendingPlan.preview.length > 4 && (
                <div className="mt-2 text-[10px] text-muted-foreground">
                  Showing 4 of {pendingPlan.preview.length} diffs (full review stays in chat)
                </div>
              )}
            </div>
          )}

          {selection.issues.length > 0 && (
            <div className="rounded-md border border-border/40 bg-muted/10 px-3 py-2">
              <div className="text-[10px] text-muted-foreground">
                {selection.issues.join(" · ")}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border/40 bg-background/40 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold">Impact</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Engines" value={selection.engines.length || 0} />
                <Stat label="Groups" value={selection.groups.length || 0} />
                <Stat label="Logics" value={selection.logics.length || 0} />
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">
                Targets: <span className="text-foreground/90 font-medium">{analytics.targets || 0}</span>
              </div>
            </div>

            <div className="rounded-lg border border-border/40 bg-background/40 p-3">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold">Snapshot</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MiniMetric
                  label="Grid (avg)"
                  value={formatNumber(analytics.num.grid?.avg)}
                  onClick={() => onFocusField("grid")}
                />
                <MiniMetric
                  label="Lot (avg)"
                  value={formatNumber(analytics.num.initial_lot?.avg)}
                  onClick={() => onFocusField("initial_lot")}
                />
                <MiniMetric
                  label="Mult (avg)"
                  value={formatNumber(analytics.num.multiplier?.avg)}
                  onClick={() => onFocusField("multiplier")}
                />
                <MiniMetric
                  label="Trail (avg)"
                  value={formatNumber(analytics.num.trail_value?.avg)}
                  onClick={() => onFocusField("trail_value")}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border/40 bg-background/40 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Wand2 className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold">Quick Moves</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_FIELDS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => onFocusField(f.id)}
                    className="px-2 py-1 rounded border border-border/40 bg-muted/20 hover:bg-muted/30 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {DEFAULT_COMMANDS.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => {
                      onFocusField(c.focusField);
                      onSendToChat(c.command);
                    }}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-background border border-border/40 hover:border-border text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="truncate">{c.label}</span>
                    <ArrowRight className="w-3 h-3 shrink-0" />
                  </button>
                ))}
              </div>
              {onExportCompleteV3Legacy && (
                <button
                  onClick={onExportCompleteV3Legacy}
                  className="mt-2 w-full flex items-center justify-between gap-2 px-2 py-2 rounded bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 text-[11px] text-amber-600 transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <FileSpreadsheet className="w-4 h-4 shrink-0" />
                    <span className="truncate font-semibold">Generate V3 Legacy .set</span>
                  </span>
                  <span className="text-[10px] font-mono opacity-80 truncate">56K lines</span>
                </button>
              )}
              <button
                onClick={() => onOpenVaultSave(vaultDraft)}
                className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded bg-primary/10 border border-primary/20 hover:bg-primary/15 text-[11px] text-primary transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Database className="w-4 h-4 shrink-0" />
                  <span className="truncate">Save .set to Vault</span>
                </span>
                <span className="text-[10px] font-mono opacity-80 truncate">{vaultDraft.name}</span>
              </button>
            </div>
          </div>

          {selectedFields.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-background/30 p-3">
              <div className="text-[10px] text-muted-foreground">
                Focused fields: <span className="text-foreground/90">{selectedFields.join(", ")}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/15 border border-border/30 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md bg-muted/15 border border-border/30 px-2 py-1.5 text-left hover:bg-muted/20 transition-colors"
    >
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-xs font-mono text-foreground">{value}</div>
    </button>
  );
}


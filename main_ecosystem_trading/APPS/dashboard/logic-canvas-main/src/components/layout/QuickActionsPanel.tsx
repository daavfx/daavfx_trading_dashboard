import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch,
  Save,
  History,
  RotateCcw,
  Archive,
  Clock,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  FolderOpen,
  Layers,
  Check,
  X,
  CheckCheck,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  ShieldAlert,
  Undo2,
  FileCode,
  Eye,
  EyeOff,
  Hash,
  Target,
  Edit3,
  ChevronDown,
  ChevronUp,
  XOctagon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { MTConfig } from "@/types/mt-config";
import { useVersionControl } from "@/hooks/useVersionControl";
import { ViewMode } from "@/components/layout/Sidebar";
import type { TransactionPlan, FieldChange, ChangePreview } from "@/lib/chat/types";

interface QuickActionsPanelProps {
  config?: MTConfig | null;
  onConfigChange?: (config: MTConfig) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onViewModeChange?: (mode: ViewMode) => void;
  onOpenVaultSave?: (draft?: { name: string; category: string; tags: string[]; comments: string; saveToVault: boolean; format: "set" | "json" }) => void;
  viewMode?: ViewMode;
  // Chat/Plan related props for batch mode
  pendingPlan?: TransactionPlan | null;
  recentChanges?: FieldChange[];
  onConfirmPlan?: () => void;
  onCancelPlan?: () => void;
  onUndoChanges?: () => void;
}

export function QuickActionsPanel({
  config,
  onConfigChange,
  isCollapsed = false,
  onToggleCollapse,
  onViewModeChange,
  onOpenVaultSave,
  viewMode,
  pendingPlan,
  recentChanges = [],
  onConfirmPlan,
  onCancelPlan,
  onUndoChanges
}: QuickActionsPanelProps) {
  const { state, createSnapshot, restoreFromSnapshot } = useVersionControl(config || undefined);
  const snapshots = state.snapshots;
  const [isCreating, setIsCreating] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    changes: true,
    version: true,
    vault: false,
    history: false
  });
  const [showAllChanges, setShowAllChanges] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleCreateSnapshot = async () => {
    if (!config) return;
    setIsCreating(true);
    try {
      await createSnapshot(config, `Snapshot ${new Date().toLocaleString()}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestore = async (snapshotId: string) => {
    const restored = await restoreFromSnapshot(snapshotId);
    if (restored && onConfigChange) {
      onConfigChange(restored);
    }
  };

  // Check if we're in chat mode
  const isChatMode = viewMode === "chat";

  // Get risk styling
  const riskLevel = pendingPlan?.risk?.level || "low";
  const riskStyles = useMemo(() => {
    switch (riskLevel) {
      case "critical":
        return {
          bg: "from-red-500/20 to-red-600/5",
          border: "border-red-500/50",
          text: "text-red-400",
          glow: "shadow-red-500/20",
          icon: ShieldAlert,
          gradient: "from-red-500 to-rose-600",
          badge: "bg-red-500/20 text-red-400 border-red-500/30"
        };
      case "high":
        return {
          bg: "from-orange-500/20 to-orange-600/5",
          border: "border-orange-500/50",
          text: "text-orange-400",
          glow: "shadow-orange-500/20",
          icon: AlertTriangle,
          gradient: "from-orange-500 to-amber-600",
          badge: "bg-orange-500/20 text-orange-400 border-orange-500/30"
        };
      case "medium":
        return {
          bg: "from-amber-500/20 to-amber-600/5",
          border: "border-amber-500/50",
          text: "text-amber-400",
          glow: "shadow-amber-500/20",
          icon: TrendingUp,
          gradient: "from-amber-500 to-yellow-600",
          badge: "bg-amber-500/20 text-amber-400 border-amber-500/30"
        };
      default:
        return {
          bg: "from-emerald-500/20 to-emerald-600/5",
          border: "border-emerald-500/50",
          text: "text-emerald-400",
          glow: "shadow-emerald-500/20",
          icon: Check,
          gradient: "from-emerald-500 to-green-600",
          badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
        };
    }
  }, [riskLevel]);

  // Prepare changes for display
  const displayChanges = pendingPlan?.preview || recentChanges.map(c => ({
    engine: c.engine,
    group: c.group,
    logic: c.logic,
    field: c.field,
    currentValue: c.oldValue,
    newValue: c.newValue,
    delta: typeof c.oldValue === "number" && typeof c.newValue === "number"
      ? (c.newValue as number) - (c.oldValue as number)
      : undefined
  }));

  const visibleChanges = showAllChanges ? displayChanges : displayChanges?.slice(0, 6);

  if (isCollapsed) {
    return (
      <div className="h-full flex flex-col items-center py-3 gap-2 bg-background/80 backdrop-blur-xl border-l border-border/30">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg hover:bg-muted/50 transition-all duration-200 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 flex flex-col items-center gap-2 py-2">
          {isChatMode && pendingPlan && (
            <div className="relative">
              <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
              <div className={cn("p-2 rounded-lg", riskStyles.badge)}>
                <riskStyles.icon className="w-4 h-4" />
              </div>
            </div>
          )}
          <button
            onClick={handleCreateSnapshot}
            disabled={!config || isCreating}
            className="p-2 rounded-lg hover:bg-muted/50 transition-all duration-200 text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Create Snapshot"
          >
            <Save className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange?.("version-control")}
            className="p-2 rounded-lg hover:bg-muted/50 transition-all duration-200 text-muted-foreground hover:text-foreground"
            title="Version Control"
          >
            <GitBranch className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange?.("vault")}
            className="p-2 rounded-lg hover:bg-muted/50 transition-all duration-200 text-muted-foreground hover:text-foreground"
            title="Vault"
          >
            <Archive className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background/80 backdrop-blur-xl border-l border-border/30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-gradient-to-r from-background/50 to-transparent">
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-1.5 rounded-lg",
            isChatMode && pendingPlan ? riskStyles.badge : "bg-primary/10"
          )}>
            {isChatMode && pendingPlan ? (
              <riskStyles.icon className="w-4 h-4" />
            ) : (
              <Sparkles className="w-4 h-4 text-primary" />
            )}
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight">
              {isChatMode ? "Changes & Actions" : "Quick Actions"}
            </span>
            {isChatMode && displayChanges && displayChanges.length > 0 && (
              <div className="text-[10px] text-muted-foreground">
                {displayChanges.length} modifications
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg hover:bg-muted/50 transition-all duration-200 text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Change Preview Section - Only in Chat Mode with pending plan */}
          {isChatMode && pendingPlan && (
            <div className="rounded-xl border border-primary/30 p-4 bg-primary/5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    {pendingPlan.preview.length} Changes
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={onConfirmPlan}
                    className="text-xs font-medium bg-primary text-primary-foreground py-1.5 px-3 rounded hover:bg-primary/90 transition-colors"
                  >
                    Apply All
                  </button>
                  <button
                    onClick={onCancelPlan}
                    className="text-xs font-medium bg-muted text-muted-foreground py-1.5 px-3 rounded hover:bg-muted/80 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {pendingPlan.description || 'Review in sidebar →'}
              </p>
            </div>
          )}

          {/* No Changes Yet - Only in Chat Mode when no pending plan */}
          {isChatMode && !pendingPlan && (
            <div className="rounded-xl border border-border/30 p-4 bg-muted/10">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <FileCode className="w-8 h-8 opacity-50" />
                <div className="text-xs text-center">
                  <div className="font-medium">No Changes Yet</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Use chat commands to modify config
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Version Control Section */}
          <Section
            title="Version Control"
            icon={GitBranch}
            expanded={expandedSections.version}
            onToggle={() => toggleSection("version")}
          >
            <div className="space-y-2">
              <Button
                onClick={handleCreateSnapshot}
                disabled={!config || isCreating}
                className="w-full h-9 text-xs gap-2 bg-gradient-to-r from-primary/90 to-primary hover:from-primary hover:to-primary/90 text-primary-foreground shadow-md"
              >
                <Save className="w-3.5 h-3.5" />
                {isCreating ? "Saving..." : "Create Snapshot"}
              </Button>

              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider px-1">
                  Recent Snapshots
                </div>
                {snapshots.length === 0 ? (
                  <div className="text-xs text-muted-foreground/60 px-2 py-2 text-center bg-muted/10 rounded-lg">
                    No snapshots yet
                  </div>
                ) : (
                  <div className="space-y-1">
                    {[...snapshots].slice(-3).reverse().map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleRestore(s.id)}
                        className="w-full flex items-center gap-2 text-left text-xs px-2.5 py-2 rounded-lg hover:bg-muted/30 transition-all duration-200 group border border-transparent hover:border-border/50"
                      >
                        <div className="p-1.5 rounded-md bg-muted/30 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                          <Clock className="w-3 h-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{s.metadata.message}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(s.metadata.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                        <RotateCcw className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* Vault Section */}
          <Section
            title="Vault"
            icon={Archive}
            expanded={expandedSections.vault}
            onToggle={() => toggleSection("vault")}
          >
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenVaultSave?.()}
                className="h-9 text-xs gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewModeChange?.("vault")}
                className="h-9 text-xs gap-1.5"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Load
              </Button>
            </div>
          </Section>

          {/* History Section */}
          <Section
            title="History"
            icon={History}
            expanded={expandedSections.history}
            onToggle={() => toggleSection("history")}
          >
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewModeChange?.("undo-redo")}
                className="h-9 text-xs gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Undo/Redo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewModeChange?.("analytics")}
                className="h-9 text-xs gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                Analytics
              </Button>
            </div>
          </Section>

          {/* Config Stats */}
          {config && (
            <div className="rounded-xl border border-border/30 p-3 bg-muted/10">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Config Stats
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Engines:</span>
                  <span className="font-medium">{config.engines?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Groups:</span>
                  <span className="font-medium">{config.engines?.[0]?.groups?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Logics:</span>
                  <span className="font-medium">{config.engines?.[0]?.groups?.[0]?.logics?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Snapshots:</span>
                  <span className="font-medium">{snapshots.length}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Section Component
function Section({
  title,
  icon: Icon,
  expanded,
  onToggle,
  children
}: {
  title: string;
  icon: React.ElementType;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/30 overflow-hidden bg-muted/5">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{title}</span>
        </div>
        <ChevronRight className={cn(
          "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
          expanded && "rotate-90"
        )} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="p-3 pt-0 border-t border-border/20">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Individual change row
function ChangeRow({
  change,
  index,
  applied
}: {
  change: any;
  index: number;
  applied: boolean;
}) {
  const delta = change.delta || 0;
  const isIncrease = delta > 0;
  const isDecrease = delta < 0;
  const hasDelta = delta !== 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.15, delay: index * 0.02 }}
      className={cn(
        "rounded-lg border overflow-hidden transition-all duration-200",
        applied
          ? "bg-emerald-500/5 border-emerald-500/20"
          : "bg-background/50 border-border/40 hover:border-border/60"
      )}
    >
      <div className="p-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            "text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0",
            applied ? "bg-emerald-500/20 text-emerald-400" : "bg-muted/30 text-muted-foreground"
          )}>
            {change.logic?.substring(0, 3)} G{change.group}
          </div>
          <span className="text-xs font-medium truncate">{change.field}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-muted-foreground line-through">
            {formatValue(change.currentValue)}
          </span>
          <ArrowRightLeft className="w-3 h-3 text-muted-foreground/50" />
          <span className={cn(
            "text-xs font-mono font-medium",
            applied ? "text-emerald-400" : isIncrease ? "text-green-400" : isDecrease ? "text-red-400" : "text-foreground"
          )}>
            {formatValue(change.newValue)}
          </span>
          {hasDelta && (
            <span className={cn(
              "text-[9px] flex items-center gap-0.5",
              isIncrease ? "text-green-400" : "text-red-400"
            )}>
              {isIncrease ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              {Math.abs(delta).toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(4);
  }
  return String(value);
}

// Visual Change Review Inline Component - Advanced UI for reviewing changes
function VisualChangeReviewInline({
  plan,
  onConfirm,
  onCancel
}: {
  plan: TransactionPlan;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  const [approvedIndices, setApprovedIndices] = useState<Set<number>>(() => new Set(plan.preview.map((_, i) => i)));
  const [rejectedIndices, setRejectedIndices] = useState<Set<number>>(new Set());
  const [showRiskDetails, setShowRiskDetails] = useState(false);

  const totalChanges = plan.preview.length;
  const approvedCount = approvedIndices.size;
  const rejectedCount = rejectedIndices.size;
  const pendingCount = totalChanges - approvedCount - rejectedCount;

  const handleApprove = (index: number) => {
    setApprovedIndices(prev => new Set([...prev, index]));
    setRejectedIndices(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const handleReject = (index: number) => {
    setRejectedIndices(prev => new Set([...prev, index]));
    setApprovedIndices(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const handleApproveAll = () => {
    setApprovedIndices(new Set(plan.preview.map((_, i) => i)));
    setRejectedIndices(new Set());
  };

  const handleRejectAll = () => {
    setRejectedIndices(new Set(plan.preview.map((_, i) => i)));
    setApprovedIndices(new Set());
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "critical": return "text-red-500 bg-red-500/10 border-red-500/20";
      case "high": return "text-orange-500 bg-orange-500/10 border-orange-500/20";
      case "medium": return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
      case "low": return "text-green-500 bg-green-500/10 border-green-500/20";
      default: return "text-muted-foreground bg-muted border-border";
    }
  };

  return (
    <div className="space-y-3">
      {/* Header with Stats */}
      <div className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-card/50">
        <div className="flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <div>
            <div className="text-xs font-semibold">Review Changes</div>
            <div className="text-[10px] text-muted-foreground">
              {approvedCount} accepted · {rejectedCount} rejected · {pendingCount} pending
            </div>
          </div>
        </div>
        
        {/* Risk Badge */}
        <button
          onClick={() => setShowRiskDetails(!showRiskDetails)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-medium transition-colors",
            getRiskColor(plan.risk.level)
          )}
        >
          <AlertTriangle className="w-3 h-3" />
          {plan.risk.level.toUpperCase()} RISK
          {showRiskDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Risk Details */}
      <AnimatePresence>
        {showRiskDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className={cn(
              "p-3 rounded-lg border space-y-2",
              getRiskColor(plan.risk.level)
            )}>
              <div className="text-[10px] font-medium">Risk Score: {plan.risk.score}/100</div>
              {plan.risk.reasons.length > 0 && (
                <ul className="text-[10px] space-y-1 list-disc list-inside">
                  {plan.risk.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-[10px] gap-1.5"
          onClick={handleApproveAll}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          Accept All
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-[10px] gap-1.5"
          onClick={handleRejectAll}
        >
          <XOctagon className="w-3.5 h-3.5" />
          Reject All
        </Button>
      </div>

      {/* Change Cards */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        <AnimatePresence mode="popLayout">
          {plan.preview.map((change, index) => (
            <VisualChangeCard
              key={`${change.engine}-${change.group}-${change.field}-${index}`}
              change={change}
              index={index}
              isApproved={approvedIndices.has(index) ? true : rejectedIndices.has(index) ? false : null}
              onApprove={() => handleApprove(index)}
              onReject={() => handleReject(index)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-border/60">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-[10px]"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8 text-[10px] gap-1.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-400 hover:to-emerald-400"
          onClick={onConfirm}
          disabled={approvedCount === 0}
        >
          <Check className="w-3.5 h-3.5" />
          Apply {approvedCount} Changes
        </Button>
      </div>
    </div>
  );
}

// Visual Change Card Component
function VisualChangeCard({
  change,
  index,
  isApproved,
  onApprove,
  onReject
}: {
  change: ChangePreview;
  index: number;
  isApproved: boolean | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  const delta = change.delta || 0;
  const deltaPercent = change.deltaPercent || 0;
  const isIncrease = delta > 0;
  const isDecrease = delta < 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        "relative rounded-lg border p-3 transition-all",
        isApproved === true && "border-green-500/50 bg-green-500/5",
        isApproved === false && "border-red-500/50 bg-red-500/5 opacity-60",
        isApproved === null && "border-border/60 bg-card/40 hover:border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            <Hash className="w-3 h-3" />
            {index + 1}
          </span>
          <div className="flex items-center gap-1.5">
            <Target className="w-3 h-3 text-primary" />
            <span className="text-xs font-medium">{change.logic}</span>
            <span className="text-[10px] text-muted-foreground">G{change.group}</span>
          </div>
        </div>
        
        {/* Status Badge */}
        {isApproved === true && (
          <span className="flex items-center gap-1 text-[10px] text-green-500 font-medium">
            <Check className="w-3 h-3" /> Accepted
          </span>
        )}
        {isApproved === false && (
          <span className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
            <X className="w-3 h-3" /> Rejected
          </span>
        )}
      </div>

      {/* Change Display */}
      <div className="flex items-center gap-3 py-2">
        {/* Old Value */}
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Current</div>
          <div className="text-sm font-mono text-muted-foreground line-through decoration-red-400/50">
            {change.currentValue}
          </div>
        </div>

        {/* Arrow & Delta */}
        <div className="flex flex-col items-center">
          <ArrowRightLeft className="w-4 h-4 text-muted-foreground/50" />
          {(isIncrease || isDecrease) && (
            <div className={cn(
              "flex items-center gap-0.5 text-[9px] font-medium mt-1",
              isIncrease ? "text-green-500" : "text-red-500"
            )}>
              {isIncrease ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(deltaPercent).toFixed(1)}%
            </div>
          )}
        </div>

        {/* New Value */}
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-primary uppercase tracking-wide mb-1">New</div>
          <div className="text-sm font-mono text-foreground">
            {change.newValue}
          </div>
        </div>
      </div>

      {/* Field Label */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-medium bg-muted/30 px-2 py-0.5 rounded">
          {change.field}
        </span>
        
        {/* Action Buttons */}
        {isApproved === null && (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-green-500/10 hover:text-green-500"
              onClick={onApprove}
            >
              <Check className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-red-500/10 hover:text-red-500"
              onClick={onReject}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
        
        {isApproved !== null && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px]"
            onClick={() => isApproved === true ? onReject() : onApprove()}
          >
            {isApproved === true ? "Undo Accept" : "Undo Reject"}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

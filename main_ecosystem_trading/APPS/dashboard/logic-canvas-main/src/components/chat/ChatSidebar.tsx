import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Zap,
  TrendingUp,
  ShieldAlert,
  Check,
  X,
  RefreshCcw,
  ArrowRightLeft,
  TrendingDown,
  Layers,
  Archive,
  Save,
  History,
  RotateCcw,
  GitBranch,
  FolderOpen,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { MTConfig, TransactionPlan, FieldChange, ChangePreview } from "@/types/mt-config";
import { useVersionControl } from "@/hooks/useVersionControl";

interface ChatSidebarProps {
  config?: MTConfig | null;
  onConfigChange?: (config: MTConfig) => void;
  pendingPlan: TransactionPlan | null;
  recentChanges: FieldChange[];
  onConfirm: () => void;
  onCancel: () => void;
  onUndo: () => void;
  onRedo: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenVault?: () => void;
  onOpenVaultSave?: () => void;
}

export function ChatSidebar({
  config,
  onConfigChange,
  pendingPlan,
  recentChanges,
  onConfirm,
  onCancel,
  onUndo,
  onRedo,
  isCollapsed = false,
  onToggleCollapse,
  onOpenVault,
  onOpenVaultSave
}: ChatSidebarProps) {
  const { state, createSnapshot, restoreFromSnapshot, getSnapshots } = useVersionControl(config);
  const snapshots = state.snapshots;
  const [expandedSection, setExpandedSection] = useState<string | null>("changes");

  // Get risk styling
  const riskLevel = pendingPlan?.risk?.level || "low";
  const riskStyles = useMemo(() => {
    switch (riskLevel) {
      case "critical":
        return { bg: "bg-red-500/10", border: "border-red-500/40", text: "text-red-400", icon: ShieldAlert };
      case "high":
        return { bg: "bg-orange-500/10", border: "border-orange-500/40", text: "text-orange-400", icon: AlertTriangle };
      case "medium":
        return { bg: "bg-amber-500/10", border: "border-amber-500/40", text: "text-amber-400", icon: TrendingUp };
      default:
        return { bg: "bg-emerald-500/10", border: "border-emerald-500/40", text: "text-emerald-400", icon: Check };
    }
  }, [riskLevel]);

  // Count changes by field for smart grouping
  const changesByField = useMemo(() => {
    const changes = pendingPlan?.preview || recentChanges.map(c => ({
      engine: c.engine,
      group: c.group,
      logic: c.logic,
      field: c.field,
      currentValue: c.oldValue,
      newValue: c.newValue
    }));
    if (!changes) return {};
    
    return changes.reduce((acc, c) => {
      const key = c.field;
      if (!acc[key]) acc[key] = [];
      acc[key].push(c);
      return acc;
    }, {} as Record<string, ChangePreview[]>);
  }, [pendingPlan, recentChanges]);

  const totalChanges = Object.values(changesByField).reduce((sum, arr) => sum + arr.length, 0);
  const hasManyChanges = totalChanges > 20;
  const uniqueFields = Object.keys(changesByField).length;

  if (isCollapsed) {
    return (
      <div className="h-full flex flex-col items-center py-3 gap-2 bg-background-elevated border-l border-border w-12">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        
        {/* Changes indicator */}
        {(pendingPlan || recentChanges.length > 0) && (
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
            pendingPlan ? riskStyles.bg : "bg-emerald-500/10"
          )}>
            {totalChanges}
          </div>
        )}
        
        <div className="flex-1 flex flex-col items-center gap-2 py-2">
          <button
            onClick={onUndo}
            className="p-2 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            title="Undo"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            className="p-2 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            title="Redo"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenVault}
            className="p-2 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            title="Vault"
          >
            <Archive className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <aside className="h-full flex flex-col bg-background-elevated border-l border-border w-72 min-w-[280px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold">Actions & Changes</span>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* CHANGES SECTION - Primary focus */}
          {(pendingPlan || recentChanges.length > 0) && (
            <Section
              title="Changes"
              icon={<Zap className="w-3.5 h-3.5" />}
              expanded={expandedSection === "changes"}
              onToggle={() => setExpandedSection(expandedSection === "changes" ? null : "changes")}
              badge={totalChanges.toString()}
              badgeColor={pendingPlan ? riskLevel : "success"}
            >
              {/* Smart summary for massive changes */}
              {hasManyChanges ? (
                <div className="space-y-2">
                  {/* Field summary */}
                  <div className="text-[10px] text-muted-foreground mb-2">
                    {uniqueFields} fields across {totalChanges} targets
                  </div>
                  
                  {/* Grouped by field */}
                  {Object.entries(changesByField).map(([field, changes]) => (
                    <FieldGroup
                      key={field}
                      field={field}
                      changes={changes}
                      applied={!pendingPlan}
                    />
                  ))}
                </div>
              ) : (
                /* Individual changes for small sets */
                <div className="space-y-1.5">
                  {(pendingPlan?.preview || recentChanges.map(c => ({
                    engine: c.engine,
                    group: c.group,
                    logic: c.logic,
                    field: c.field,
                    currentValue: c.oldValue,
                    newValue: c.newValue
                  }))).slice(0, 10).map((change, idx) => (
                    <ChangeRow key={`${change.engine}-${change.group}-${change.field}-${idx}`} change={change} applied={!pendingPlan} />
                  ))}
                  {totalChanges > 10 && (
                    <div className="text-[10px] text-muted-foreground text-center py-1">
                      +{totalChanges - 10} more changes
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 mt-3 pt-2 border-t border-border/40">
                {pendingPlan ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 h-7 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={onCancel}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-7 text-[10px] bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:from-emerald-400 hover:to-green-400"
                      onClick={onConfirm}
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Apply
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-[10px]"
                    onClick={onUndo}
                  >
                    <RefreshCcw className="w-3 h-3 mr-1" />
                    Undo Last
                  </Button>
                )}
              </div>
            </Section>
          )}

          {/* QUICK ACTIONS */}
          <Section
            title="Quick Actions"
            icon={<Zap className="w-3.5 h-3.5" />}
            expanded={expandedSection === "quick"}
            onToggle={() => setExpandedSection(expandedSection === "quick" ? null : "quick")}
          >
            <div className="grid grid-cols-2 gap-1.5">
              <ActionButton icon={<RefreshCcw className="w-3.5 h-3.5" />} label="Undo" onClick={onUndo} />
              <ActionButton icon={<RotateCcw className="w-3.5 h-3.5" />} label="Redo" onClick={onRedo} />
              <ActionButton icon={<Save className="w-3.5 h-3.5" />} label="Save" onClick={onOpenVaultSave} />
              <ActionButton icon={<Archive className="w-3.5 h-3.5" />} label="Vault" onClick={onOpenVault} />
            </div>
          </Section>

          {/* VERSION CONTROL */}
          <Section
            title="Version Control"
            icon={<GitBranch className="w-3.5 h-3.5" />}
            expanded={expandedSection === "version"}
            onToggle={() => setExpandedSection(expandedSection === "version" ? null : "version")}
            badge={snapshots.length.toString()}
          >
            <div className="space-y-2">
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-[10px]"
                  onClick={async () => {
                    if (config) await createSnapshot(config, `Snapshot ${new Date().toLocaleTimeString()}`);
                  }}
                >
                  <Save className="w-3 h-3 mr-1" />
                  Create
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-[10px]"
                  onClick={async () => {
                    const snaps = getSnapshots();
                    if (snaps.length > 0) {
                      const last = snaps[snaps.length - 1];
                      const restored = await restoreFromSnapshot(last.id);
                      if (restored && onConfigChange) onConfigChange(restored);
                    }
                  }}
                  disabled={snapshots.length === 0}
                >
                  <History className="w-3 h-3 mr-1" />
                  Restore
                </Button>
              </div>
              
              {/* Recent snapshots */}
              {snapshots.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Recent</div>
                  {snapshots.slice(-3).reverse().map((snap) => (
                    <button
                      key={snap.id}
                      onClick={async () => {
                        const restored = await restoreFromSnapshot(snap.id);
                        if (restored && onConfigChange) onConfigChange(restored);
                      }}
                      className="w-full text-left text-[10px] px-2 py-1.5 rounded bg-muted/20 hover:bg-muted/40 transition-colors truncate"
                    >
                      {snap.metadata.message || "Snapshot"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </div>
      </ScrollArea>
    </aside>
  );
}

// Section component
function Section({
  title,
  icon,
  expanded,
  onToggle,
  badge,
  badgeColor,
  children
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}) {
  const badgeStyles = useMemo(() => {
    switch (badgeColor) {
      case "critical": return "bg-red-500/20 text-red-400";
      case "high": return "bg-orange-500/20 text-orange-400";
      case "medium": return "bg-amber-500/20 text-amber-400";
      case "success": return "bg-emerald-500/20 text-emerald-400";
      default: return "bg-muted text-muted-foreground";
    }
  }, [badgeColor]);

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/20 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium">{title}</span>
          {badge && (
            <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold", badgeStyles)}>
              {badge}
            </span>
          )}
        </div>
        {expanded ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Action button
function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 p-2 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors"
    >
      {icon}
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </button>
  );
}

// Change row
function ChangeRow({ change, applied }: { change: ChangePreview; applied: boolean }) {
  const delta = typeof change.currentValue === "number" && typeof change.newValue === "number"
    ? (change.newValue as number) - (change.currentValue as number)
    : 0;
  const isIncrease = delta > 0;
  const isDecrease = delta < 0;

  return (
    <div className={cn(
      "flex items-center justify-between p-2 rounded-md text-xs",
      applied ? "bg-emerald-500/5 border border-emerald-500/20" : "bg-muted/20 border border-border/40"
    )}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] text-muted-foreground shrink-0">
          {change.logic} G{change.group}
        </span>
        <span className="font-medium truncate">{change.field}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-muted-foreground line-through text-[10px]">
          {String(change.currentValue)}
        </span>
        <ArrowRightLeft className="w-2.5 h-2.5 text-muted-foreground" />
        <span className={cn(
          "font-mono font-medium text-[10px]",
          applied ? "text-emerald-400" : isIncrease ? "text-green-400" : isDecrease ? "text-red-400" : "text-foreground"
        )}>
          {String(change.newValue)}
        </span>
      </div>
    </div>
  );
}

// Field group for massive changes
function FieldGroup({ field, changes, applied }: { field: string; changes: ChangePreview[]; applied: boolean }) {
  const [expanded, setExpanded] = useState(false);
  
  // Calculate aggregate stats
  const avgDelta = changes.reduce((sum, c) => {
    const curr = typeof c.currentValue === "number" ? c.currentValue as number : 0;
    const newVal = typeof c.newValue === "number" ? c.newValue as number : 0;
    return sum + (newVal - curr);
  }, 0) / changes.length;

  return (
    <div className="rounded-md border border-border/40 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center justify-between p-2 text-xs",
          applied ? "bg-emerald-500/5" : "bg-muted/20"
        )}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium">{field}</span>
          <span className="text-[10px] text-muted-foreground">{changes.length} targets</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "font-mono text-[10px]",
            avgDelta > 0 ? "text-green-400" : avgDelta < 0 ? "text-red-400" : "text-muted-foreground"
          )}>
            {avgDelta > 0 ? "+" : ""}{avgDelta.toFixed(1)} avg
          </span>
          {expanded ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>
      </button>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2 space-y-1 border-t border-border/40 bg-background/50">
              {changes.slice(0, 20).map((change, idx) => (
                <ChangeRow key={`${change.engine}-${change.group}-${idx}`} change={change} applied={applied} />
              ))}
              {changes.length > 20 && (
                <div className="text-[10px] text-muted-foreground text-center py-1">
                  +{changes.length - 20} more
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Import ChevronLeft for Section

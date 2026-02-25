import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  X,
  CheckCheck,
  XOctagon,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Hash,
  Target,
  Sparkles,
  ShieldAlert,
  RefreshCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TransactionPlan, ChangePreview, FieldChange } from "@/lib/chat/types";

interface ChangePreviewPanelProps {
  pendingPlan: TransactionPlan | null;
  recentChanges: FieldChange[];
  onConfirm: () => void;
  onCancel: () => void;
  onUndo: () => void;
  compact?: boolean;
}

export function ChangePreviewPanel({
  pendingPlan,
  recentChanges,
  onConfirm,
  onCancel,
  onUndo,
  compact = false
}: ChangePreviewPanelProps) {
  const [expanded, setExpanded] = useState(!compact);

  // Get risk styling
  const riskLevel = pendingPlan?.risk?.level || "low";
  const riskStyles = useMemo(() => {
    switch (riskLevel) {
      case "critical":
        return {
          bg: "bg-red-500/10",
          border: "border-red-500/40",
          text: "text-red-400",
          icon: ShieldAlert
        };
      case "high":
        return {
          bg: "bg-orange-500/10",
          border: "border-orange-500/40",
          text: "text-orange-400",
          icon: AlertTriangle
        };
      case "medium":
        return {
          bg: "bg-amber-500/10",
          border: "border-amber-500/40",
          text: "text-amber-400",
          icon: TrendingUp
        };
      default:
        return {
          bg: "bg-emerald-500/10",
          border: "border-emerald-500/40",
          text: "text-emerald-400",
          icon: Check
        };
    }
  }, [riskLevel]);

  // No content to show
  if (!pendingPlan && recentChanges.length === 0) {
    return null;
  }

  // Compact mode - just show summary
  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={cn(
          "w-full p-2 rounded-lg border flex items-center justify-between gap-2 transition-colors",
          riskStyles.bg,
          riskStyles.border
        )}
      >
        <div className="flex items-center gap-2">
          <riskStyles.icon className={cn("w-4 h-4", riskStyles.text)} />
          <span className="text-xs font-medium">
            {pendingPlan ? `${pendingPlan.preview.length} pending changes` : `${recentChanges.length} applied`}
          </span>
        </div>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-lg border overflow-hidden",
        pendingPlan ? riskStyles.border : "border-border/60"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "p-3 flex items-center justify-between",
          pendingPlan ? riskStyles.bg : "bg-muted/20"
        )}
      >
        <div className="flex items-center gap-2">
          {pendingPlan ? (
            <>
              <riskStyles.icon className={cn("w-4 h-4", riskStyles.text)} />
              <div>
                <div className="text-xs font-semibold">Pending Changes</div>
                <div className="text-[10px] text-muted-foreground">
                  {pendingPlan.preview.length} targets · {riskLevel.toUpperCase()} risk
                </div>
              </div>
            </>
          ) : (
            <>
              <CheckCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-xs font-semibold">Applied Changes</div>
                <div className="text-[10px] text-muted-foreground">
                  {recentChanges.length} modifications
                </div>
              </div>
            </>
          )}
        </div>

        {compact && (
          <button onClick={() => setExpanded(false)} className="p-1 hover:bg-muted/30 rounded">
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2 max-h-[200px] overflow-y-auto">
        {pendingPlan ? (
          // Show pending plan preview
          pendingPlan.preview.slice(0, expanded ? undefined : 4).map((change, idx) => (
            <ChangeRow key={`${change.engine}-${change.group}-${change.field}-${idx}`} change={change} />
          ))
        ) : (
          // Show recent changes
          recentChanges.slice(0, expanded ? undefined : 4).map((change, idx) => (
            <ChangeRow
              key={`${change.engine}-${change.group}-${change.field}-${idx}`}
              change={{
                engine: change.engine,
                group: change.group,
                logic: change.logic,
                field: change.field,
                currentValue: change.oldValue,
                newValue: change.newValue,
                delta: typeof change.oldValue === "number" && typeof change.newValue === "number"
                  ? (change.newValue as number) - (change.oldValue as number)
                  : undefined,
                deltaPercent: typeof change.oldValue === "number" && change.oldValue !== 0 && typeof change.newValue === "number"
                  ? (((change.newValue as number) - (change.oldValue as number)) / (change.oldValue as number)) * 100
                  : undefined
              }}
              applied
            />
          ))
        )}

        {/* Show more/less toggle */}
        {((pendingPlan && pendingPlan.preview.length > 4) || (!pendingPlan && recentChanges.length > 4)) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full py-1 text-[10px] text-muted-foreground hover:text-foreground text-center transition-colors"
          >
            {expanded ? "Show less" : `Show ${pendingPlan ? pendingPlan.preview.length : recentChanges.length - 4} more`}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-border/40 flex items-center justify-between gap-2">
        {pendingPlan ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={onCancel}
            >
              <X className="w-3 h-3 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-[10px] bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:from-emerald-400 hover:to-green-400"
              onClick={onConfirm}
            >
              <Check className="w-3 h-3 mr-1" />
              Apply {pendingPlan.preview.length} Changes
            </Button>
          </>
        ) : (
          <>
            <span className="text-[10px] text-muted-foreground">Changes applied to config</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              onClick={onUndo}
            >
              <RefreshCcw className="w-3 h-3 mr-1" />
              Undo
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}

// Individual change row
function ChangeRow({ change, applied = false }: { change: ChangePreview; applied?: boolean }) {
  const delta = change.delta || 0;
  const isIncrease = delta > 0;
  const isDecrease = delta < 0;

  return (
    <div
      className={cn(
        "flex items-center justify-between p-2 rounded-md text-xs",
        applied ? "bg-emerald-500/5 border border-emerald-500/20" : "bg-muted/20 border border-border/40"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] text-muted-foreground shrink-0">
          {change.logic} G{change.group}
        </span>
        <span className="font-medium truncate">{change.field}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-muted-foreground line-through text-[10px]">
          {String(change.currentValue)}
        </span>
        <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
        <span className={cn(
          "font-mono font-medium",
          applied ? "text-emerald-400" : isIncrease ? "text-green-400" : isDecrease ? "text-red-400" : "text-foreground"
        )}>
          {String(change.newValue)}
        </span>
        {delta !== 0 && (
          <span className={cn(
            "text-[9px] flex items-center",
            isIncrease ? "text-green-400" : "text-red-400"
          )}>
            {isIncrease ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(delta).toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}


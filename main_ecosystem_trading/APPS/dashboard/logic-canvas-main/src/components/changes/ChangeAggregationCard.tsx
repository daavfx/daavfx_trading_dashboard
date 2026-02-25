/**
 * ChangeAggregationCard Component
 * 
 * Displays a grouped summary of changes with batch actions.
 * Used for efficient review of 100-1000+ changes.
 */

import { motion } from "framer-motion";
import {
  FolderOpen,
  Zap,
  Grid3X3,
  Check,
  X,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCheck,
  XOctagon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AggregatedGroup, AggregationType } from "@/lib/chat/aggregation";

interface ChangeAggregationCardProps {
  group: AggregatedGroup;
  selectionState: "all" | "some" | "none";
  onApprove: () => void;
  onReject: () => void;
  onDrillDown: () => void;
  compact?: boolean;
}

const typeIcons: Record<AggregationType, React.ReactNode> = {
  group: <FolderOpen className="w-3.5 h-3.5" />,
  logic: <Zap className="w-3.5 h-3.5" />,
  field: <Grid3X3 className="w-3.5 h-3.5" />,
  engine: <Grid3X3 className="w-3.5 h-3.5" />,
};

const typeColors: Record<AggregationType, string> = {
  group: "text-blue-400",
  logic: "text-amber-400",
  field: "text-green-400",
  engine: "text-purple-400",
};

const riskColors: Record<string, string> = {
  critical: "text-red-500 bg-red-500/10 border-red-500/20",
  high: "text-orange-500 bg-orange-500/10 border-orange-500/20",
  medium: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
  low: "text-green-500 bg-green-500/10 border-green-500/20",
};

export function ChangeAggregationCard({
  group,
  selectionState,
  onApprove,
  onReject,
  onDrillDown,
  compact = false,
}: ChangeAggregationCardProps) {
  const delta = group.delta ?? 0;
  const deltaPercent = group.deltaPercent ?? 0;
  const isIncrease = delta > 0;
  const isDecrease = delta < 0;
  const hasUniformValues = group.currentValue !== "various" && group.newValue !== "various";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-lg border transition-all",
        selectionState === "all" && "border-green-500/50 bg-green-500/5",
        selectionState === "none" && "border-red-500/50 bg-red-500/5 opacity-70",
        selectionState === "some" && "border-amber-500/50 bg-amber-500/5",
        !selectionState && "border-border/60 bg-card/40 hover:border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <span className={cn("text-muted-foreground", typeColors[group.type])}>
            {typeIcons[group.type]}
          </span>
          <span className="text-xs font-semibold">{group.key}</span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {group.count} changes
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Risk Badge */}
          <span className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-medium",
            riskColors[group.risk]
          )}>
            <AlertTriangle className="w-2.5 h-2.5" />
            {group.risk.toUpperCase()}
          </span>
          
          {/* Selection State */}
          {selectionState === "all" && (
            <span className="flex items-center gap-1 text-[10px] text-green-500 font-medium">
              <Check className="w-3 h-3" />
            </span>
          )}
          {selectionState === "none" && (
            <span className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
              <X className="w-3 h-3" />
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Field */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-muted-foreground">Field:</span>
          <span className="text-[10px] font-mono bg-muted/30 px-1.5 py-0.5 rounded">
            {group.field}
          </span>
        </div>

        {/* Value Change (if uniform) */}
        {hasUniformValues && (
          <div className="flex items-center gap-3 py-2">
            {/* Old Value */}
            <div className="flex-1 min-w-0">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">
                Current
              </div>
              <div className="text-sm font-mono text-muted-foreground line-through decoration-red-400/50">
                {group.currentValue}
              </div>
            </div>

            {/* Arrow & Delta */}
            <div className="flex flex-col items-center">
              <div className="text-muted-foreground/50 text-lg">→</div>
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
              <div className="text-[9px] text-primary uppercase tracking-wide mb-1">
                New
              </div>
              <div className="text-sm font-mono text-foreground">
                {group.newValue}
              </div>
            </div>
          </div>
        )}

        {/* Non-uniform values indicator */}
        {!hasUniformValues && (
          <div className="text-[10px] text-muted-foreground italic py-2">
            Multiple different values
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px] gap-1 hover:bg-green-500/10 hover:text-green-500"
              onClick={onApprove}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px] gap-1 hover:bg-red-500/10 hover:text-red-500"
              onClick={onReject}
            >
              <XOctagon className="w-3.5 h-3.5" />
              Reject
            </Button>
          </div>
          
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px] gap-1"
            onClick={onDrillDown}
          >
            Details
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

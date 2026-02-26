/**
 * BatchActionBar Component
 * 
 * Provides batch actions for accepting/rejecting multiple changes.
 */

import { motion } from "framer-motion";
import {
  CheckCheck,
  XOctagon,
  RotateCcw,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BatchActionBarProps {
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  totalCount: number;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onClearAll: () => void;
  onApply: () => void;
  onCancel?: () => void;
  compact?: boolean;
}

export function BatchActionBar({
  approvedCount,
  rejectedCount,
  pendingCount,
  totalCount,
  onApproveAll,
  onRejectAll,
  onClearAll,
  onApply,
  onCancel,
  compact = false,
}: BatchActionBarProps) {
  const hasApproved = approvedCount > 0;
  const hasRejected = rejectedCount > 0;
  const hasPending = pendingCount > 0;
  const allApproved = approvedCount === totalCount;
  const allRejected = rejectedCount === totalCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      {/* Stats Row */}
      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
        <div className="flex items-center gap-3">
          {/* Approved */}
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "w-2 h-2 rounded-full",
              hasApproved ? "bg-green-500" : "bg-muted-foreground/30"
            )} />
            <span className={cn(
              "text-[10px] font-medium",
              hasApproved ? "text-green-500" : "text-muted-foreground"
            )}>
              {approvedCount} accepted
            </span>
          </div>
          
          {/* Rejected */}
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "w-2 h-2 rounded-full",
              hasRejected ? "bg-red-500" : "bg-muted-foreground/30"
            )} />
            <span className={cn(
              "text-[10px] font-medium",
              hasRejected ? "text-red-500" : "text-muted-foreground"
            )}>
              {rejectedCount} rejected
            </span>
          </div>
          
          {/* Pending */}
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "w-2 h-2 rounded-full",
              hasPending ? "bg-amber-500" : "bg-muted-foreground/30"
            )} />
            <span className={cn(
              "text-[10px] font-medium",
              hasPending ? "text-amber-500" : "text-muted-foreground"
            )}>
              {pendingCount} pending
            </span>
          </div>
        </div>
        
        {/* Total */}
        <span className="text-[10px] text-muted-foreground font-mono">
          {totalCount} total
        </span>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "h-8 text-[10px] gap-1.5 flex-1",
            allApproved && "border-green-500/50 bg-green-500/10 text-green-500"
          )}
          onClick={onApproveAll}
          disabled={allApproved}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          Accept All
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "h-8 text-[10px] gap-1.5 flex-1",
            allRejected && "border-red-500/50 bg-red-500/10 text-red-500"
          )}
          onClick={onRejectAll}
          disabled={allRejected}
        >
          <XOctagon className="w-3.5 h-3.5" />
          Reject All
        </Button>
        {(hasApproved || hasRejected) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-[10px] gap-1.5"
            onClick={onClearAll}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </Button>
        )}
      </div>

      {/* Apply Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-border/60">
        {onCancel && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-[10px]"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          className={cn(
            "h-8 text-[10px] gap-1.5 ml-auto",
            hasApproved
              ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-400 hover:to-emerald-400"
              : "bg-muted text-muted-foreground"
          )}
          onClick={onApply}
          disabled={!hasApproved}
        >
          <Check className="w-3.5 h-3.5" />
          Apply {approvedCount} Changes
        </Button>
      </div>
    </motion.div>
  );
}

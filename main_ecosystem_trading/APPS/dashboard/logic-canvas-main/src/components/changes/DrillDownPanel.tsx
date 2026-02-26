/**
 * DrillDownPanel Component
 * 
 * Shows individual changes within an aggregated group.
 * Uses virtualization for efficient rendering of large lists.
 */

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Search,
  X,
  Hash,
  Target,
  Check,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { AggregatedGroup } from "@/lib/chat/aggregation";
import type { ChangePreview } from "@/lib/chat/types";
import type { SelectionStatus } from "@/hooks/useChangeSelection";

interface DrillDownPanelProps {
  group: AggregatedGroup;
  getStatus: (index: number) => SelectionStatus;
  onApprove: (index: number) => void;
  onReject: (index: number) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onBack: () => void;
}

export function DrillDownPanel({
  group,
  getStatus,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
  onBack,
}: DrillDownPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter changes within the group
  const filteredChanges = useMemo(() => {
    if (!searchQuery) return group.changes;
    const query = searchQuery.toLowerCase();
    return group.changes.filter(change =>
      change.field.toLowerCase().includes(query) ||
      change.currentValue.toLowerCase().includes(query) ||
      change.newValue.toLowerCase().includes(query) ||
      change.logic.toLowerCase().includes(query) ||
      change.group.toString().includes(query)
    );
  }, [group.changes, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    let approved = 0;
    let rejected = 0;
    let pending = 0;
    
    group.indices.forEach(index => {
      const status = getStatus(index);
      if (status === "approved") approved++;
      else if (status === "rejected") rejected++;
      else pending++;
    });
    
    return { approved, rejected, pending };
  }, [group.indices, getStatus]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={onBack}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="text-xs font-semibold">{group.key}</div>
          <div className="text-[10px] text-muted-foreground">
            {group.count} changes · {stats.approved} accepted · {stats.rejected} rejected
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px] gap-1 flex-1"
          onClick={onApproveAll}
        >
          <Check className="w-3 h-3" />
          Accept All
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px] gap-1 flex-1"
          onClick={onRejectAll}
        >
          <X className="w-3 h-3" />
          Reject All
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search in group..."
          className="pl-9 pr-8 h-8 text-xs"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Changes List */}
      <ScrollArea className="h-[300px] pr-1">
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filteredChanges.map((change, i) => {
              const originalIndex = group.indices[i];
              const status = getStatus(originalIndex);
              
              return (
                <DrillDownChangeCard
                  key={`${change.engine}-${change.group}-${change.field}-${originalIndex}`}
                  change={change}
                  index={originalIndex}
                  displayIndex={i + 1}
                  status={status}
                  onApprove={() => onApprove(originalIndex)}
                  onReject={() => onReject(originalIndex)}
                />
              );
            })}
          </AnimatePresence>
          
          {filteredChanges.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs">
              No changes match your search
            </div>
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
}

interface DrillDownChangeCardProps {
  change: ChangePreview;
  index: number;
  displayIndex: number;
  status: SelectionStatus;
  onApprove: () => void;
  onReject: () => void;
}

function DrillDownChangeCard({
  change,
  index,
  displayIndex,
  status,
  onApprove,
  onReject,
}: DrillDownChangeCardProps) {
  const delta = change.delta ?? 0;
  const deltaPercent = change.deltaPercent ?? 0;
  const isIncrease = delta > 0;
  const isDecrease = delta < 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className={cn(
        "rounded-lg border p-2.5 transition-all",
        status === "approved" && "border-green-500/50 bg-green-500/5",
        status === "rejected" && "border-red-500/50 bg-red-500/5 opacity-60",
        status === "pending" && "border-border/60 bg-card/40 hover:border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            <Hash className="w-2.5 h-2.5" />
            {displayIndex}
          </span>
          <div className="flex items-center gap-1.5">
            <Target className="w-3 h-3 text-primary" />
            <span className="text-[11px] font-medium">{change.logic}</span>
            <span className="text-[10px] text-muted-foreground">G{change.group}</span>
          </div>
        </div>
        
        {/* Status */}
        {status === "approved" && (
          <span className="flex items-center gap-1 text-[10px] text-green-500 font-medium">
            <Check className="w-3 h-3" /> Accepted
          </span>
        )}
        {status === "rejected" && (
          <span className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
            <X className="w-3 h-3" /> Rejected
          </span>
        )}
      </div>

      {/* Change Display */}
      <div className="flex items-center gap-2 py-1.5">
        {/* Old Value */}
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">
            Current
          </div>
          <div className="text-xs font-mono text-muted-foreground line-through decoration-red-400/50">
            {change.currentValue}
          </div>
        </div>

        {/* Arrow & Delta */}
        <div className="flex flex-col items-center">
          <span className="text-muted-foreground/50">→</span>
          {(isIncrease || isDecrease) && (
            <div className={cn(
              "flex items-center gap-0.5 text-[9px] font-medium",
              isIncrease ? "text-green-500" : "text-red-500"
            )}>
              {isIncrease ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              {Math.abs(deltaPercent).toFixed(1)}%
            </div>
          )}
        </div>

        {/* New Value */}
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-primary uppercase tracking-wide mb-0.5">
            New
          </div>
          <div className="text-xs font-mono text-foreground">
            {change.newValue}
          </div>
        </div>
      </div>

      {/* Field & Actions */}
      <div className="flex items-center justify-between pt-1.5 border-t border-border/40">
        <span className="text-[10px] text-muted-foreground font-medium bg-muted/30 px-1.5 py-0.5 rounded">
          {change.field}
        </span>
        
        {status === "pending" && (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 hover:bg-green-500/10 hover:text-green-500"
              onClick={onApprove}
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 hover:bg-red-500/10 hover:text-red-500"
              onClick={onReject}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
        
        {status !== "pending" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px]"
            onClick={status === "approved" ? onReject : onApprove}
          >
            Undo
          </Button>
        )}
      </div>
    </motion.div>
  );
}

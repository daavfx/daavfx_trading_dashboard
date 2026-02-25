/**
 * AggregatedChangeReview Component
 * 
 * Main component for reviewing massive changes (100-1000+).
 * Combines aggregation, filtering, drill-down, and batch actions.
 */

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { TransactionPlan } from "@/lib/chat/types";
import type { AggregationType, AggregatedGroup } from "@/lib/chat/aggregation";
import { useChangeAggregation } from "@/hooks/useChangeAggregation";
import { useChangeSelection } from "@/hooks/useChangeSelection";
import { ChangeAggregationCard } from "./ChangeAggregationCard";
import { FilterBar } from "./FilterBar";
import { BatchActionBar } from "./BatchActionBar";
import { DrillDownPanel } from "./DrillDownPanel";

interface AggregatedChangeReviewProps {
  plan: TransactionPlan;
  onConfirm: () => void;
  onCancel?: () => void;
  aggregationThreshold?: number;
}

export function AggregatedChangeReview({
  plan,
  onConfirm,
  onCancel,
  aggregationThreshold = 50,
}: AggregatedChangeReviewProps) {
  // Aggregation hook
  const {
    totalChanges,
    shouldAggregate,
    aggregationType,
    setAggregationType,
    aggregatedGroups,
    filteredGroups,
    searchQuery,
    setSearchQuery,
    riskFilter,
    setRiskFilter,
    drillDown,
    drilledDownGroup,
    exitDrillDown,
  } = useChangeAggregation(plan.preview, { aggregationThreshold });

  // Selection hook - pre-approve all changes by default
  const {
    approvedCount,
    rejectedCount,
    pendingCount,
    getStatus,
    approve,
    reject,
    approveAll,
    rejectAll,
    clearAll,
    approveGroup,
    rejectGroup,
    getGroupSelectionState,
  } = useChangeSelection({
    totalChanges,
    initialApproved: new Set(plan.preview.map((_, i) => i)),
  });

  // If below threshold, use simple view
  if (!shouldAggregate) {
    return (
      <SimpleChangeReview
        plan={plan}
        approvedCount={approvedCount}
        rejectedCount={rejectedCount}
        pendingCount={pendingCount}
        getStatus={getStatus}
        approve={approve}
        reject={reject}
        approveAll={approveAll}
        rejectAll={rejectAll}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
  }

  // Handle drill-down actions
  const handleDrillDown = (group: AggregatedGroup) => {
    drillDown(group);
  };

  const handleDrillDownApproveAll = () => {
    if (drilledDownGroup) {
      approveGroup(drilledDownGroup);
    }
  };

  const handleDrillDownRejectAll = () => {
    if (drilledDownGroup) {
      rejectGroup(drilledDownGroup);
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
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-medium",
            getRiskColor(plan.risk.level)
          )}
        >
          <AlertTriangle className="w-3 h-3" />
          {plan.risk.level.toUpperCase()} RISK
        </div>
      </div>

      {/* Filter Bar (only when not in drill-down) */}
      <AnimatePresence mode="wait">
        {!drilledDownGroup && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <FilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              riskFilter={riskFilter}
              onRiskFilterChange={setRiskFilter}
              aggregationType={aggregationType}
              onAggregationTypeChange={setAggregationType}
              totalChanges={aggregatedGroups.length}
              filteredCount={filteredGroups.length}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content Area */}
      <ScrollArea className={cn("pr-1", drilledDownGroup ? "h-[400px]" : "h-[300px]")}>
        <AnimatePresence mode="wait">
          {drilledDownGroup ? (
            <DrillDownPanel
              key="drilldown"
              group={drilledDownGroup}
              getStatus={getStatus}
              onApprove={approve}
              onReject={reject}
              onApproveAll={handleDrillDownApproveAll}
              onRejectAll={handleDrillDownRejectAll}
              onBack={exitDrillDown}
            />
          ) : (
            <motion.div
              key="aggregated"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              {filteredGroups.map((group) => (
                <ChangeAggregationCard
                  key={`${group.type}-${group.key}`}
                  group={group}
                  selectionState={getGroupSelectionState(group)}
                  onApprove={() => approveGroup(group)}
                  onReject={() => rejectGroup(group)}
                  onDrillDown={() => handleDrillDown(group)}
                />
              ))}
              
              {filteredGroups.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  No groups match your filters
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </ScrollArea>

      {/* Batch Actions */}
      <BatchActionBar
        approvedCount={approvedCount}
        rejectedCount={rejectedCount}
        pendingCount={pendingCount}
        totalCount={totalChanges}
        onApproveAll={approveAll}
        onRejectAll={rejectAll}
        onClearAll={clearAll}
        onApply={onConfirm}
        onCancel={onCancel}
      />
    </div>
  );
}

// Simple view for small number of changes
function SimpleChangeReview({
  plan,
  approvedCount,
  rejectedCount,
  pendingCount,
  getStatus,
  approve,
  reject,
  approveAll,
  rejectAll,
  onConfirm,
  onCancel,
}: {
  plan: TransactionPlan;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  getStatus: (index: number) => "approved" | "rejected" | "pending";
  approve: (index: number) => void;
  reject: (index: number) => void;
  approveAll: () => void;
  rejectAll: () => void;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="space-y-3">
      {/* Header */}
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
        
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-medium",
            getRiskColor(plan.risk.level)
          )}
        >
          <AlertTriangle className="w-3 h-3" />
          {plan.risk.level.toUpperCase()} RISK
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={approveAll}
          className="text-xs px-3 py-1.5 rounded-md border border-border/50 hover:bg-green-500/10 hover:text-green-500 hover:border-green-500/50 transition-colors"
        >
          Accept All
        </button>
        <button
          onClick={rejectAll}
          className="text-xs px-3 py-1.5 rounded-md border border-border/50 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/50 transition-colors"
        >
          Reject All
        </button>
      </div>

      {/* Changes List */}
      <ScrollArea className="h-[300px] pr-1">
        <div className="space-y-2">
          {plan.preview.map((change, index) => {
            const status = getStatus(index);
            return (
              <SimpleChangeCard
                key={index}
                change={change}
                index={index}
                status={status}
                onApprove={() => approve(index)}
                onReject={() => reject(index)}
              />
            );
          })}
        </div>
      </ScrollArea>

      {/* Actions */}
      <BatchActionBar
        approvedCount={approvedCount}
        rejectedCount={rejectedCount}
        pendingCount={pendingCount}
        totalCount={plan.preview.length}
        onApproveAll={approveAll}
        onRejectAll={rejectAll}
        onClearAll={() => {}}
        onApply={onConfirm}
        onCancel={onCancel}
      />
    </div>
  );
}

// Simple change card for small lists
function SimpleChangeCard({
  change,
  index,
  status,
  onApprove,
  onReject,
}: {
  change: any;
  index: number;
  status: "approved" | "rejected" | "pending";
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 transition-all",
        status === "approved" && "border-green-500/50 bg-green-500/5",
        status === "rejected" && "border-red-500/50 bg-red-500/5 opacity-60",
        status === "pending" && "border-border/60 bg-card/40"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground">#{index + 1}</span>
          <span className="text-xs font-medium">{change.logic}</span>
          <span className="text-[10px] text-muted-foreground">G{change.group}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground line-through">{change.currentValue}</span>
          <span className="text-[10px] text-muted-foreground">→</span>
          <span className="text-[10px] font-mono">{change.newValue}</span>
        </div>
        
        {status === "pending" && (
          <div className="flex items-center gap-1">
            <button
              onClick={onApprove}
              className="p-1 hover:bg-green-500/10 hover:text-green-500 rounded"
            >
              ✓
            </button>
            <button
              onClick={onReject}
              className="p-1 hover:bg-red-500/10 hover:text-red-500 rounded"
            >
              ✗
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function getRiskColor(level: string): string {
  switch (level) {
    case "critical": return "text-red-500 bg-red-500/10 border-red-500/20";
    case "high": return "text-orange-500 bg-orange-500/10 border-orange-500/20";
    case "medium": return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
    case "low": return "text-green-500 bg-green-500/10 border-green-500/20";
    default: return "text-muted-foreground bg-muted border-border";
  }
}

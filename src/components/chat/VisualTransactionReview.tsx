import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Check, 
  X, 
  CheckCheck, 
  XOctagon, 
  Edit3, 
  ChevronDown, 
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Hash,
  Target,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TransactionPlan, ChangePreview, RiskAssessment } from "@/lib/chat/types";

interface VisualChangeCardProps {
  change: ChangePreview;
  index: number;
  isApproved: boolean | null;
  onApprove: () => void;
  onReject: () => void;
  onEdit: (newValue: any) => void;
}

function VisualChangeCard({ change, index, isApproved, onApprove, onReject, onEdit }: VisualChangeCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(change.newValue));
  const [isExpanded, setIsExpanded] = useState(false);

  const delta = change.delta || 0;
  const deltaPercent = change.deltaPercent || 0;
  const isIncrease = delta > 0;
  const isDecrease = delta < 0;

  const handleSaveEdit = () => {
    const numValue = parseFloat(editValue);
    if (!isNaN(numValue)) {
      onEdit(numValue);
      setIsEditing(false);
    }
  };

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
          {isEditing ? (
            <div className="flex items-center gap-1">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-7 text-sm font-mono"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") setIsEditing(false);
                }}
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveEdit}>
                <Check className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div 
              className="text-sm font-mono text-foreground cursor-pointer hover:text-primary transition-colors"
              onClick={() => setIsEditing(true)}
              title="Click to edit"
            >
              {change.newValue}
              <Edit3 className="w-3 h-3 inline ml-1 opacity-0 group-hover:opacity-100" />
            </div>
          )}
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
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-primary/10"
              onClick={() => setIsEditing(true)}
            >
              <Edit3 className="w-3.5 h-3.5" />
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

interface VisualTransactionReviewProps {
  plan: TransactionPlan;
  onApply: (approvedChanges: ChangePreview[]) => void;
  onCancel: () => void;
  onEditChange: (index: number, newValue: any) => void;
}

export function VisualTransactionReview({ plan, onApply, onCancel, onEditChange }: VisualTransactionReviewProps) {
  const [approvedIndices, setApprovedIndices] = useState<Set<number>>(new Set());
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

  const handleApply = () => {
    const approvedChanges = plan.preview.filter((_, i) => approvedIndices.has(i));
    onApply(approvedChanges);
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
    <div className="space-y-4">
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
              key={`${change.engine}-${change.group}-${change.field}`}
              change={change}
              index={index}
              isApproved={approvedIndices.has(index) ? true : rejectedIndices.has(index) ? false : null}
              onApprove={() => handleApprove(index)}
              onReject={() => handleReject(index)}
              onEdit={(newValue) => onEditChange(index, newValue)}
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
          onClick={handleApply}
          disabled={approvedCount === 0}
        >
          <Check className="w-3.5 h-3.5" />
          Apply {approvedCount} Changes
        </Button>
      </div>
    </div>
  );
}

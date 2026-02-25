/**
 * useChangeSelection Hook
 * 
 * Manages selection state for batch actions on changes.
 * Supports selecting all, none, by group, by logic, by field, or by engine.
 */

import { useState, useCallback, useMemo } from "react";
import type { ChangePreview } from "@/lib/chat/types";
import type { AggregatedGroup } from "@/lib/chat/aggregation";

export type SelectionStatus = "approved" | "rejected" | "pending";

export interface UseChangeSelectionOptions {
  /** Total number of changes */
  totalChanges: number;
  /** Initial approved indices */
  initialApproved?: Set<number>;
  /** Initial rejected indices */
  initialRejected?: Set<number>;
}

export interface UseChangeSelectionReturn {
  /** Set of approved indices */
  approvedIndices: Set<number>;
  /** Set of rejected indices */
  rejectedIndices: Set<number>;
  /** Number of approved changes */
  approvedCount: number;
  /** Number of rejected changes */
  rejectedCount: number;
  /** Number of pending changes */
  pendingCount: number;
  /** Get status of a specific index */
  getStatus: (index: number) => SelectionStatus;
  /** Approve a single change */
  approve: (index: number) => void;
  /** Reject a single change */
  reject: (index: number) => void;
  /** Toggle approval status */
  toggle: (index: number) => void;
  /** Approve all changes */
  approveAll: () => void;
  /** Reject all changes */
  rejectAll: () => void;
  /** Clear all selections */
  clearAll: () => void;
  /** Approve changes at specific indices */
  approveIndices: (indices: number[]) => void;
  /** Reject changes at specific indices */
  rejectIndices: (indices: number[]) => void;
  /** Toggle changes at specific indices */
  toggleIndices: (indices: number[]) => void;
  /** Approve an aggregated group */
  approveGroup: (group: AggregatedGroup) => void;
  /** Reject an aggregated group */
  rejectGroup: (group: AggregatedGroup) => void;
  /** Toggle an aggregated group */
  toggleGroup: (group: AggregatedGroup) => void;
  /** Get approved changes from a list */
  getApprovedChanges: (changes: ChangePreview[]) => ChangePreview[];
  /** Check if all changes are approved */
  isAllApproved: boolean;
  /** Check if all changes are rejected */
  isAllRejected: boolean;
  /** Check if any changes are pending */
  hasPending: boolean;
  /** Partial selection state for a group */
  getGroupSelectionState: (group: AggregatedGroup) => "all" | "some" | "none";
}

export function useChangeSelection(
  options: UseChangeSelectionOptions
): UseChangeSelectionReturn {
  const { totalChanges, initialApproved, initialRejected } = options;

  const [approvedIndices, setApprovedIndices] = useState<Set<number>>(
    () => initialApproved ?? new Set()
  );
  const [rejectedIndices, setRejectedIndices] = useState<Set<number>>(
    () => initialRejected ?? new Set()
  );

  // Counts
  const approvedCount = approvedIndices.size;
  const rejectedCount = rejectedIndices.size;
  const pendingCount = totalChanges - approvedCount - rejectedCount;

  // Get status of a specific index
  const getStatus = useCallback((index: number): SelectionStatus => {
    if (approvedIndices.has(index)) return "approved";
    if (rejectedIndices.has(index)) return "rejected";
    return "pending";
  }, [approvedIndices, rejectedIndices]);

  // Approve a single change
  const approve = useCallback((index: number) => {
    setApprovedIndices(prev => new Set([...prev, index]));
    setRejectedIndices(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

  // Reject a single change
  const reject = useCallback((index: number) => {
    setRejectedIndices(prev => new Set([...prev, index]));
    setApprovedIndices(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

  // Toggle approval status
  const toggle = useCallback((index: number) => {
    const status = getStatus(index);
    if (status === "approved") {
      reject(index);
    } else {
      approve(index);
    }
  }, [getStatus, approve, reject]);

  // Approve all changes
  const approveAll = useCallback(() => {
    setApprovedIndices(new Set(Array.from({ length: totalChanges }, (_, i) => i)));
    setRejectedIndices(new Set());
  }, [totalChanges]);

  // Reject all changes
  const rejectAll = useCallback(() => {
    setRejectedIndices(new Set(Array.from({ length: totalChanges }, (_, i) => i)));
    setApprovedIndices(new Set());
  }, [totalChanges]);

  // Clear all selections
  const clearAll = useCallback(() => {
    setApprovedIndices(new Set());
    setRejectedIndices(new Set());
  }, []);

  // Approve changes at specific indices
  const approveIndices = useCallback((indices: number[]) => {
    setApprovedIndices(prev => new Set([...prev, ...indices]));
    setRejectedIndices(prev => {
      const next = new Set(prev);
      indices.forEach(i => next.delete(i));
      return next;
    });
  }, []);

  // Reject changes at specific indices
  const rejectIndices = useCallback((indices: number[]) => {
    setRejectedIndices(prev => new Set([...prev, ...indices]));
    setApprovedIndices(prev => {
      const next = new Set(prev);
      indices.forEach(i => next.delete(i));
      return next;
    });
  }, []);

  // Toggle changes at specific indices
  const toggleIndices = useCallback((indices: number[]) => {
    // If any are not approved, approve all; otherwise reject all
    const anyPending = indices.some(i => !approvedIndices.has(i));
    if (anyPending) {
      approveIndices(indices);
    } else {
      rejectIndices(indices);
    }
  }, [approvedIndices, approveIndices, rejectIndices]);

  // Approve an aggregated group
  const approveGroup = useCallback((group: AggregatedGroup) => {
    approveIndices(group.indices);
  }, [approveIndices]);

  // Reject an aggregated group
  const rejectGroup = useCallback((group: AggregatedGroup) => {
    rejectIndices(group.indices);
  }, [rejectIndices]);

  // Toggle an aggregated group
  const toggleGroup = useCallback((group: AggregatedGroup) => {
    toggleIndices(group.indices);
  }, [toggleIndices]);

  // Get approved changes from a list
  const getApprovedChanges = useCallback((changes: ChangePreview[]): ChangePreview[] => {
    return changes.filter((_, index) => approvedIndices.has(index));
  }, [approvedIndices]);

  // Check if all changes are approved
  const isAllApproved = useMemo(() => {
    return approvedCount === totalChanges;
  }, [approvedCount, totalChanges]);

  // Check if all changes are rejected
  const isAllRejected = useMemo(() => {
    return rejectedCount === totalChanges;
  }, [rejectedCount, totalChanges]);

  // Check if any changes are pending
  const hasPending = useMemo(() => {
    return pendingCount > 0;
  }, [pendingCount]);

  // Partial selection state for a group
  const getGroupSelectionState = useCallback((group: AggregatedGroup): "all" | "some" | "none" => {
    const approvedInGroup = group.indices.filter(i => approvedIndices.has(i)).length;
    if (approvedInGroup === group.indices.length) return "all";
    if (approvedInGroup > 0) return "some";
    return "none";
  }, [approvedIndices]);

  return {
    approvedIndices,
    rejectedIndices,
    approvedCount,
    rejectedCount,
    pendingCount,
    getStatus,
    approve,
    reject,
    toggle,
    approveAll,
    rejectAll,
    clearAll,
    approveIndices,
    rejectIndices,
    toggleIndices,
    approveGroup,
    rejectGroup,
    toggleGroup,
    getApprovedChanges,
    isAllApproved,
    isAllRejected,
    hasPending,
    getGroupSelectionState,
  };
}

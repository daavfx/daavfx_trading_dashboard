/**
 * useChangeAggregation Hook
 * 
 * Provides aggregation functionality for managing large numbers of changes.
 * Groups changes by group, logic, field, or engine for efficient review.
 */

import { useMemo, useState, useCallback } from "react";
import type { ChangePreview } from "@/lib/chat/types";
import {
  aggregateChanges,
  aggregateByGroup,
  aggregateByLogic,
  aggregateByField,
  aggregateByEngine,
  type AggregationType,
  type AggregatedGroup,
  type AggregationResult,
} from "@/lib/chat/aggregation";

export interface UseChangeAggregationOptions {
  /** Threshold to switch to aggregated view */
  aggregationThreshold?: number;
  /** Default aggregation type */
  defaultAggregationType?: AggregationType;
}

export interface UseChangeAggregationReturn {
  /** Total number of changes */
  totalChanges: number;
  /** Whether to show aggregated view */
  shouldAggregate: boolean;
  /** Current aggregation type */
  aggregationType: AggregationType;
  /** Set aggregation type */
  setAggregationType: (type: AggregationType) => void;
  /** Aggregated groups */
  aggregatedGroups: AggregatedGroup[];
  /** Full aggregation result */
  aggregationResult: AggregationResult | null;
  /** Filtered groups based on search */
  filteredGroups: AggregatedGroup[];
  /** Search query */
  searchQuery: string;
  /** Set search query */
  setSearchQuery: (query: string) => void;
  /** Filter by risk level */
  riskFilter: string[];
  /** Set risk filter */
  setRiskFilter: (risks: string[]) => void;
  /** Drill down to a specific group */
  drillDown: (group: AggregatedGroup) => void;
  /** Current drill-down group */
  drilledDownGroup: AggregatedGroup | null;
  /** Exit drill-down */
  exitDrillDown: () => void;
  /** Get changes for specific indices */
  getChangesForIndices: (indices: number[]) => ChangePreview[];
}

export function useChangeAggregation(
  changes: ChangePreview[],
  options: UseChangeAggregationOptions = {}
): UseChangeAggregationReturn {
  const {
    aggregationThreshold = 50,
    defaultAggregationType = "group",
  } = options;

  const [aggregationType, setAggregationType] = useState<AggregationType>(defaultAggregationType);
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<string[]>([]);
  const [drilledDownGroup, setDrilledDownGroup] = useState<AggregatedGroup | null>(null);

  // Calculate if we should aggregate
  const shouldAggregate = changes.length >= aggregationThreshold;

  // Full aggregation result
  const aggregationResult = useMemo(() => {
    if (!shouldAggregate || changes.length === 0) return null;
    return aggregateChanges(changes);
  }, [changes, shouldAggregate]);

  // Aggregated groups based on current type
  const aggregatedGroups = useMemo(() => {
    if (!shouldAggregate) return [];
    
    switch (aggregationType) {
      case "group":
        return aggregateByGroup(changes);
      case "logic":
        return aggregateByLogic(changes);
      case "field":
        return aggregateByField(changes);
      case "engine":
        return aggregateByEngine(changes);
      default:
        return aggregateByGroup(changes);
    }
  }, [changes, shouldAggregate, aggregationType]);

  // Filtered groups based on search and risk
  const filteredGroups = useMemo(() => {
    let filtered = aggregatedGroups;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(group =>
        group.key.toLowerCase().includes(query) ||
        group.field.toLowerCase().includes(query) ||
        group.currentValue.toLowerCase().includes(query) ||
        group.newValue.toLowerCase().includes(query)
      );
    }

    // Apply risk filter
    if (riskFilter.length > 0) {
      filtered = filtered.filter(group =>
        riskFilter.includes(group.risk)
      );
    }

    return filtered;
  }, [aggregatedGroups, searchQuery, riskFilter]);

  // Drill down to a specific group
  const drillDown = useCallback((group: AggregatedGroup) => {
    setDrilledDownGroup(group);
  }, []);

  // Exit drill-down
  const exitDrillDown = useCallback(() => {
    setDrilledDownGroup(null);
  }, []);

  // Get changes for specific indices
  const getChangesForIndices = useCallback((indices: number[]) => {
    return indices.map(i => changes[i]).filter(Boolean);
  }, [changes]);

  return {
    totalChanges: changes.length,
    shouldAggregate,
    aggregationType,
    setAggregationType,
    aggregatedGroups,
    aggregationResult,
    filteredGroups,
    searchQuery,
    setSearchQuery,
    riskFilter,
    setRiskFilter,
    drillDown,
    drilledDownGroup,
    exitDrillDown,
    getChangesForIndices,
  };
}

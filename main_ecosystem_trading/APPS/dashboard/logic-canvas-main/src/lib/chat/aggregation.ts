/**
 * Change Aggregation Utilities
 * 
 * Groups changes by various dimensions (group, logic, field, engine)
 * to enable scalable review of 100-1000+ changes.
 */

import type { ChangePreview } from "./types";

export type AggregationType = "group" | "logic" | "field" | "engine";

export interface AggregatedGroup {
  type: AggregationType;
  key: string;           // e.g., "Groups 1-15", "POWER", "grid"
  count: number;         // Number of changes in this group
  field: string;         // The field being modified (if same across all)
  currentValue: string;  // Current value (if same across all)
  newValue: string;      // New value (if same across all)
  delta?: number;        // Change amount (if same across all)
  deltaPercent?: number; // Change percentage (if same across all)
  risk: "low" | "medium" | "high" | "critical";
  changes: ChangePreview[]; // All changes in this group
  indices: number[];     // Original indices in the plan
}

export interface AggregationResult {
  groups: AggregatedGroup[];
  totalChanges: number;
  uniqueFields: string[];
  uniqueGroups: string[];
  uniqueLogics: string[];
  uniqueEngines: string[];
}

/**
 * Calculate risk level based on change characteristics
 */
function calculateRiskLevel(changes: ChangePreview[]): "low" | "medium" | "high" | "critical" {
  if (changes.length === 0) return "low";
  
  // Check for critical fields
  const criticalFields = ["lot", "stoploss", "takeprofit", "risk"];
  const hasCriticalField = changes.some(c => 
    criticalFields.some(f => c.field.toLowerCase().includes(f))
  );
  
  // Check for large percentage changes
  const hasLargeChange = changes.some(c => 
    c.deltaPercent !== undefined && Math.abs(c.deltaPercent) > 50
  );
  
  // Check for very large change count
  if (changes.length > 500) return "critical";
  if (changes.length > 200) return "high";
  
  if (hasCriticalField && hasLargeChange) return "critical";
  if (hasCriticalField || hasLargeChange) return "high";
  if (changes.length > 50) return "medium";
  
  return "low";
}

/**
 * Get common value if all values are the same
 */
function getCommonValue<T>(values: T[]): T | null {
  if (values.length === 0) return null;
  const first = values[0];
  return values.every(v => v === first) ? first : null;
}

/**
 * Aggregate changes by group
 */
export function aggregateByGroup(changes: ChangePreview[]): AggregatedGroup[] {
  const groupMap = new Map<string, { changes: ChangePreview[]; indices: number[] }>();
  
  changes.forEach((change, index) => {
    const key = `Group ${change.group}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { changes: [], indices: [] });
    }
    groupMap.get(key)!.changes.push(change);
    groupMap.get(key)!.indices.push(index);
  });
  
  return Array.from(groupMap.entries()).map(([key, { changes, indices }]) => {
    const field = getCommonValue(changes.map(c => c.field));
    const currentValue = getCommonValue(changes.map(c => c.currentValue));
    const newValue = getCommonValue(changes.map(c => c.newValue));
    const delta = getCommonValue(changes.map(c => c.delta));
    const deltaPercent = getCommonValue(changes.map(c => c.deltaPercent));
    
    return {
      type: "group" as AggregationType,
      key,
      count: changes.length,
      field: field || "multiple",
      currentValue: currentValue || "various",
      newValue: newValue || "various",
      delta: delta ?? undefined,
      deltaPercent: deltaPercent ?? undefined,
      risk: calculateRiskLevel(changes),
      changes,
      indices,
    };
  }).sort((a, b) => {
    // Sort by group number
    const numA = parseInt(a.key.replace("Group ", ""));
    const numB = parseInt(b.key.replace("Group ", ""));
    return numA - numB;
  });
}

/**
 * Aggregate changes by logic
 */
export function aggregateByLogic(changes: ChangePreview[]): AggregatedGroup[] {
  const logicMap = new Map<string, { changes: ChangePreview[]; indices: number[] }>();
  
  changes.forEach((change, index) => {
    const key = change.logic;
    if (!logicMap.has(key)) {
      logicMap.set(key, { changes: [], indices: [] });
    }
    logicMap.get(key)!.changes.push(change);
    logicMap.get(key)!.indices.push(index);
  });
  
  return Array.from(logicMap.entries()).map(([key, { changes, indices }]) => {
    const field = getCommonValue(changes.map(c => c.field));
    const currentValue = getCommonValue(changes.map(c => c.currentValue));
    const newValue = getCommonValue(changes.map(c => c.newValue));
    const delta = getCommonValue(changes.map(c => c.delta));
    const deltaPercent = getCommonValue(changes.map(c => c.deltaPercent));
    
    return {
      type: "logic" as AggregationType,
      key,
      count: changes.length,
      field: field || "multiple",
      currentValue: currentValue || "various",
      newValue: newValue || "various",
      delta: delta ?? undefined,
      deltaPercent: deltaPercent ?? undefined,
      risk: calculateRiskLevel(changes),
      changes,
      indices,
    };
  }).sort((a, b) => b.count - a.count);
}

/**
 * Aggregate changes by field
 */
export function aggregateByField(changes: ChangePreview[]): AggregatedGroup[] {
  const fieldMap = new Map<string, { changes: ChangePreview[]; indices: number[] }>();
  
  changes.forEach((change, index) => {
    const key = change.field;
    if (!fieldMap.has(key)) {
      fieldMap.set(key, { changes: [], indices: [] });
    }
    fieldMap.get(key)!.changes.push(change);
    fieldMap.get(key)!.indices.push(index);
  });
  
  return Array.from(fieldMap.entries()).map(([key, { changes, indices }]) => {
    const currentValue = getCommonValue(changes.map(c => c.currentValue));
    const newValue = getCommonValue(changes.map(c => c.newValue));
    const delta = getCommonValue(changes.map(c => c.delta));
    const deltaPercent = getCommonValue(changes.map(c => c.deltaPercent));
    
    return {
      type: "field" as AggregationType,
      key,
      count: changes.length,
      field: key,
      currentValue: currentValue || "various",
      newValue: newValue || "various",
      delta: delta ?? undefined,
      deltaPercent: deltaPercent ?? undefined,
      risk: calculateRiskLevel(changes),
      changes,
      indices,
    };
  }).sort((a, b) => b.count - a.count);
}

/**
 * Aggregate changes by engine
 */
export function aggregateByEngine(changes: ChangePreview[]): AggregatedGroup[] {
  const engineMap = new Map<string, { changes: ChangePreview[]; indices: number[] }>();
  
  changes.forEach((change, index) => {
    const key = change.engine;
    if (!engineMap.has(key)) {
      engineMap.set(key, { changes: [], indices: [] });
    }
    engineMap.get(key)!.changes.push(change);
    engineMap.get(key)!.indices.push(index);
  });
  
  return Array.from(engineMap.entries()).map(([key, { changes, indices }]) => {
    const field = getCommonValue(changes.map(c => c.field));
    const currentValue = getCommonValue(changes.map(c => c.currentValue));
    const newValue = getCommonValue(changes.map(c => c.newValue));
    const delta = getCommonValue(changes.map(c => c.delta));
    const deltaPercent = getCommonValue(changes.map(c => c.deltaPercent));
    
    return {
      type: "engine" as AggregationType,
      key,
      count: changes.length,
      field: field || "multiple",
      currentValue: currentValue || "various",
      newValue: newValue || "various",
      delta: delta ?? undefined,
      deltaPercent: deltaPercent ?? undefined,
      risk: calculateRiskLevel(changes),
      changes,
      indices,
    };
  }).sort((a, b) => b.count - a.count);
}

/**
 * Main aggregation function - creates all aggregation views
 */
export function aggregateChanges(changes: ChangePreview[]): AggregationResult {
  return {
    groups: [
      ...aggregateByGroup(changes),
      ...aggregateByLogic(changes),
      ...aggregateByField(changes),
      ...aggregateByEngine(changes),
    ],
    totalChanges: changes.length,
    uniqueFields: [...new Set(changes.map(c => c.field))],
    uniqueGroups: [...new Set(changes.map(c => c.group.toString()))].sort((a, b) => parseInt(a) - parseInt(b)),
    uniqueLogics: [...new Set(changes.map(c => c.logic))],
    uniqueEngines: [...new Set(changes.map(c => c.engine))],
  };
}

/**
 * Create a summary description for a set of changes
 */
export function createChangeSummary(changes: ChangePreview[]): string {
  if (changes.length === 0) return "No changes";
  
  const fields = [...new Set(changes.map(c => c.field))];
  const groups = [...new Set(changes.map(c => c.group))];
  const logics = [...new Set(changes.map(c => c.logic))];
  
  const parts: string[] = [];
  
  if (fields.length === 1) {
    parts.push(`Field: ${fields[0]}`);
  } else {
    parts.push(`${fields.length} fields`);
  }
  
  if (groups.length === 1) {
    parts.push(`Group ${groups[0]}`);
  } else {
    parts.push(`${groups.length} groups`);
  }
  
  if (logics.length === 1) {
    parts.push(`Logic: ${logics[0]}`);
  } else {
    parts.push(`${logics.length} logics`);
  }
  
  return parts.join(" · ");
}

/**
 * Create a compact range description for groups
 */
export function createGroupRange(groups: number[]): string {
  if (groups.length === 0) return "";
  if (groups.length === 1) return `Group ${groups[0]}`;
  
  const sorted = [...groups].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      if (start === end) {
        ranges.push(`${start}`);
      } else {
        ranges.push(`${start}-${end}`);
      }
      if (i < sorted.length) {
        start = sorted[i];
        end = sorted[i];
      }
    }
  }
  
  return `Groups ${ranges.join(", ")}`;
}

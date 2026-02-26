// Configuration Validation Utility
// Detects invalid configurations and returns warnings
// Based on EA logic constraints per audit (Dec 2024)

import type { MTConfig, EngineConfig, LogicConfig } from "@/types/mt-config";

export interface ConfigWarning {
  id: string;
  severity: "error" | "warning" | "info";
  category: "reverse" | "hedge" | "reference" | "startLevel" | "logic";
  engine?: string;
  group?: number;
  logic?: string;
  message: string;
  suggestion?: string;
}

// Logic names that reference Power A
const POWER_LOGICS = ["POWER", "BPOWER", "CPOWER"];
const REPOWER_LOGICS = ["REPOWER", "BREPOWER", "CREPOWER"];
const BS_OVERRIDE_FIELDS: Array<keyof LogicConfig> = [
  "initial_lot_b", "initial_lot_s",
  "multiplier_b", "multiplier_s",
  "grid_b", "grid_s",
  "trail_value_b", "trail_value_s",
  "trail_start_b", "trail_start_s",
  "trail_step_b", "trail_step_s",
];

/**
 * Validates the entire MTConfig and returns warnings for invalid setups
 */
export function validateConfig(config: MTConfig | null): ConfigWarning[] {
  if (!config) return [];
  
  const warnings: ConfigWarning[] = [];
  
  for (const engine of config.engines) {
    validateEngine(engine, warnings);
  }
  
  return warnings;
}

function validateEngine(engine: EngineConfig, warnings: ConfigWarning[]) {
  for (const group of engine.groups) {
    for (const logic of group.logics) {
      const upper = logic.logic_name.toUpperCase();
      const isPowerOrRepower = POWER_LOGICS.includes(upper) || REPOWER_LOGICS.includes(upper);

      for (const k of BS_OVERRIDE_FIELDS) {
        const v = logic[k] as unknown;
        if (typeof v !== "number") continue;

        if (!isPowerOrRepower || group.group_number > 15) {
          if (v >= 0) {
            warnings.push({
              id: `bs-override-outofscope-${engine.engine_id}-${group.group_number}-${logic.logic_name}-${String(k)}`,
              severity: "warning",
              category: "logic",
              engine: engine.engine_id,
              group: group.group_number,
              logic: logic.logic_name,
              message: `${logic.logic_name} has a Buy/Sell override (${String(k)}=${v}) outside the supported scope (Power/Repower, Groups 1–15).`,
              suggestion: `Clear the override back to -1, or limit directional overrides to Power/Repower in Groups 1–15.`,
            });
          }
          continue;
        }

        if (String(k).includes("initial_lot") || String(k).includes("multiplier")) {
          if (v !== -1 && v <= 0) {
            warnings.push({
              id: `bs-override-invalid-${engine.engine_id}-${group.group_number}-${logic.logic_name}-${String(k)}`,
              severity: "warning",
              category: "logic",
              engine: engine.engine_id,
              group: group.group_number,
              logic: logic.logic_name,
              message: `${logic.logic_name} has ${String(k)}=${v}. Use -1 for fallback or a positive number.`,
              suggestion: `Set it to -1 (fallback) or a value > 0.`,
            });
          }
        } else {
          if (v < -1) {
            warnings.push({
              id: `bs-override-invalid-${engine.engine_id}-${group.group_number}-${logic.logic_name}-${String(k)}`,
              severity: "warning",
              category: "logic",
              engine: engine.engine_id,
              group: group.group_number,
              logic: logic.logic_name,
              message: `${logic.logic_name} has ${String(k)}=${v}. Use -1 for fallback or a value >= 0.`,
              suggestion: `Set it to -1 (fallback) or a value >= 0.`,
            });
          }
        }
      }

      // Check Reverse on Power A
      if (POWER_LOGICS.includes(logic.logic_name)) {
        if (logic.reverse_enabled) {
          warnings.push({
            id: `reverse-power-${engine.engine_id}-${group.group_number}`,
            severity: "warning",
            category: "reverse",
            engine: engine.engine_id,
            group: group.group_number,
            logic: logic.logic_name,
            message: `Power ${engine.engine_id} has Reverse enabled. Since Power is the main counter-trend logic, reversing it removes the grid foundation.`,
            suggestion: `Consider using another logic (e.g., Repower) as the reference logic for reverse, or disable Reverse for Power.`
          });
        }
        
        if (logic.hedge_enabled) {
          warnings.push({
            id: `hedge-power-${engine.engine_id}-${group.group_number}`,
            severity: "info",
            category: "hedge",
            engine: engine.engine_id,
            group: group.group_number,
            logic: logic.logic_name,
            message: `Power ${engine.engine_id} has Hedge enabled. This will open opposing positions alongside the main grid.`,
            suggestion: `Ensure you understand the doubled spread cost and position lock behavior.`
          });
        }
      }
      
      // Check Start Level with missing reference
      if (logic.start_level && logic.start_level > 0 && !POWER_LOGICS.includes(logic.logic_name)) {
        const ref = logic.order_count_reference;
        if (ref === "Logic_None" || !ref) {
          warnings.push({
            id: `startlevel-noref-${engine.engine_id}-${group.group_number}-${logic.logic_name}`,
            severity: "warning",
            category: "startLevel",
            engine: engine.engine_id,
            group: group.group_number,
            logic: logic.logic_name,
            message: `${logic.logic_name} has Start Level = ${logic.start_level} but OrderCountReference = None. This logic will never start.`,
            suggestion: `Set OrderCountReference to Logic_Power or another active logic so the system knows when to trigger this logic.`
          });
        }
      }
      
      // Check Hedge enabled but no reference
      if (logic.hedge_enabled) {
        const hedgeRef = logic.hedge_reference;
        if (!hedgeRef || hedgeRef === "Logic_None") {
          warnings.push({
            id: `hedge-noref-${engine.engine_id}-${group.group_number}-${logic.logic_name}`,
            severity: "warning",
            category: "hedge",
            engine: engine.engine_id,
            group: group.group_number,
            logic: logic.logic_name,
            message: `${logic.logic_name} has Hedge enabled but no Hedge Reference set.`,
            suggestion: `Set Hedge Reference to specify which logic's positions to hedge against.`
          });
        }
      }
      
      // Check Reverse enabled but no reference
      if (logic.reverse_enabled) {
        const revRef = logic.reverse_reference;
        if (!revRef || revRef === "Logic_None") {
          warnings.push({
            id: `reverse-noref-${engine.engine_id}-${group.group_number}-${logic.logic_name}`,
            severity: "warning",
            category: "reverse",
            engine: engine.engine_id,
            group: group.group_number,
            logic: logic.logic_name,
            message: `${logic.logic_name} has Reverse enabled but no Reverse Reference set.`,
            suggestion: `Set Reverse Reference to Logic_Self to reverse own signals, or another logic to reverse its signals.`
          });
        }
      }
    }
    
    // Group-level validation: Check if at least one logic references Power for proper grid sync
    const hasLogicReferencingPower = group.logics.some(l => 
      l.order_count_reference?.includes("Power") || 
      POWER_LOGICS.includes(l.logic_name)
    );
    
    const activeNonPowerLogics = group.logics.filter(l => 
      l.enabled && !POWER_LOGICS.includes(l.logic_name)
    );
    
    if (activeNonPowerLogics.length > 0 && !hasLogicReferencingPower) {
      // Only warn if there are active non-Power logics but none reference Power
      const powerLogic = group.logics.find(l => POWER_LOGICS.includes(l.logic_name));
      if (!powerLogic?.enabled) {
        warnings.push({
          id: `no-power-ref-${engine.engine_id}-${group.group_number}`,
          severity: "info",
          category: "reference",
          engine: engine.engine_id,
          group: group.group_number,
          message: `Group ${group.group_number} has active logics but Power is disabled and no logic references Power. Grid sync may be affected.`,
          suggestion: `Enable Power or set OrderCountReference on other logics to sync with an active grid.`
        });
      }
    }
  }
}

/**
 * Returns a summary of warnings by severity
 */
export function getWarningSummary(warnings: ConfigWarning[]): { errors: number; warnings: number; info: number } {
  return {
    errors: warnings.filter(w => w.severity === "error").length,
    warnings: warnings.filter(w => w.severity === "warning").length,
    info: warnings.filter(w => w.severity === "info").length,
  };
}

/**
 * Hook-ready function to display warnings via toast
 */
export function showConfigWarnings(warnings: ConfigWarning[], toast: any) {
  const summary = getWarningSummary(warnings);
  
  if (summary.errors > 0) {
    toast.error(`Config has ${summary.errors} error(s) that need attention`, {
      description: warnings.filter(w => w.severity === "error")[0]?.message
    });
  } else if (summary.warnings > 0) {
    toast.warning(`Config has ${summary.warnings} warning(s)`, {
      description: "Review configuration for potential issues",
      action: {
        label: "View Details",
        onClick: () => { /* console.log("Warnings:", warnings) */ }
      }
    });
  }
}

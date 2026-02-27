/**
 * @deprecated ARCHIVED 2025-02-18
 * This was an experimental engine for quick actions and stress tests.
 * It is not currently imported or used in the production codebase.
 * Kept for reference only.
 * Archived in: _archive/deprecated_2025-02-18/
 */

// Ryiuk 2.0 - Quick Actions, Stress Tests, Variations Generator (EXPERIMENTAL - NOT USED)
// Efficient, deterministic, visual - no LLM required

import type { MTConfig, LogicConfig, GroupConfig } from "@/types/mt-config";

// ============================================================================
// QUICK ACTION DEFINITIONS
// ============================================================================

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  description: string;
  category: "set" | "progression" | "copy" | "test" | "export";
  execute: (config: MTConfig, params?: Record<string, any>) => QuickActionResult;
  params?: QuickActionParam[];
}

export interface QuickActionParam {
  id: string;
  label: string;
  type: "number" | "range" | "select" | "groups";
  default: any;
  options?: { label: string; value: any }[];
  min?: number;
  max?: number;
}

export interface QuickActionResult {
  success: boolean;
  message: string;
  newConfig?: MTConfig;
  changes?: FieldChange[];
  preview?: string;
}

export interface FieldChange {
  engine: string;
  group: number;
  logic: string;
  field: string;
  oldValue: any;
  newValue: any;
}

// ============================================================================
// STRESS TEST PRESETS
// ============================================================================

export interface StressTestPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  riskLevel: "low" | "medium" | "high" | "extreme";
  modifications: StressModification[];
}

export interface StressModification {
  field: string;
  operation: "set" | "multiply" | "add";
  value: number | boolean;
  groups?: number[];
  logics?: string[];
}

export const STRESS_TEST_PRESETS: StressTestPreset[] = [
  {
    id: "aggressive_grid",
    name: "Aggressive Grid",
    description: "Tighten all grids to 150pts for fast entry recovery testing",
    icon: "⚡",
    riskLevel: "high",
    modifications: [
      { field: "grid", operation: "set", value: 150 }
    ]
  },
  {
    id: "wide_grid",
    name: "Conservative Grid",
    description: "Widen all grids to 1000pts for low-frequency trading",
    icon: "🐢",
    riskLevel: "low",
    modifications: [
      { field: "grid", operation: "set", value: 1000 }
    ]
  },
  {
    id: "high_multiplier",
    name: "Martingale Stress",
    description: "Set multiplier to 2.0 for aggressive recovery testing",
    icon: "🎰",
    riskLevel: "extreme",
    modifications: [
      { field: "multiplier", operation: "set", value: 2.0 }
    ]
  },
  {
    id: "flat_lot",
    name: "Flat Lot (No Martingale)",
    description: "Set multiplier to 1.0 for consistent position sizing",
    icon: "📊",
    riskLevel: "low",
    modifications: [
      { field: "multiplier", operation: "set", value: 1.0 }
    ]
  },
  {
    id: "tight_trail",
    name: "Tight Trailing",
    description: "Set trail_value to 1000pts for quick profit locking",
    icon: "🎯",
    riskLevel: "medium",
    modifications: [
      { field: "trail_value", operation: "set", value: 1000 }
    ]
  },
  {
    id: "wide_trail",
    name: "Wide Trailing",
    description: "Set trail_value to 5000pts to let profits run",
    icon: "🌊",
    riskLevel: "medium",
    modifications: [
      { field: "trail_value", operation: "set", value: 5000 }
    ]
  },
  {
    id: "micro_lot",
    name: "Micro Lot Test",
    description: "Set initial_lot to 0.01 for minimum risk testing",
    icon: "🔬",
    riskLevel: "low",
    modifications: [
      { field: "initial_lot", operation: "set", value: 0.01 }
    ]
  },
  {
    id: "double_lot",
    name: "Double Lot",
    description: "Multiply all initial_lot by 2x",
    icon: "💪",
    riskLevel: "high",
    modifications: [
      { field: "initial_lot", operation: "multiply", value: 2.0 }
    ]
  },
  {
    id: "reverse_all",
    name: "Reverse All Logics",
    description: "Enable reverse mode on all Power logics",
    icon: "🔄",
    riskLevel: "high",
    modifications: [
      { field: "reverse_enabled", operation: "set", value: true, logics: ["Power"] }
    ]
  },
  {
    id: "deep_grid",
    name: "Deep Grid Recovery",
    description: "Start secondary logics earlier (level 2 instead of 4)",
    icon: "📉",
    riskLevel: "high",
    modifications: [
      { field: "start_level", operation: "set", value: 2 }
    ]
  }
];

// ============================================================================
// BATCH VARIATIONS GENERATOR
// ============================================================================

export interface VariationConfig {
  name: string;
  parameters: VariationParameter[];
  count: number;
}

export interface VariationParameter {
  field: string;
  min: number;
  max: number;
  step?: number;
  distribution: "linear" | "random" | "fibonacci";
  groups?: number[];
  logics?: string[];
}

export interface GeneratedVariation {
  id: string;
  name: string;
  config: MTConfig;
  parameterValues: Record<string, number>;
}

// ============================================================================
// FORMULA PRESETS
// ============================================================================

export interface FormulaPreset {
  id: string;
  label: string;
  formula: string;
  example: string;
  description?: string;
}

export const FORMULA_PRESETS: FormulaPreset[] = [
  { id: "linear", label: "Linear +N", formula: "start + (row * step)", example: "600, 700, 800...", description: "Increases value linearly by a fixed step" },
  { id: "exponential", label: "Exponential", formula: "start * (multiplier ^ row)", example: "100, 120, 144...", description: "Increases value exponentially by a multiplier" },
  { id: "fibonacci", label: "Fibonacci", formula: "fib(row) * base", example: "1, 1, 2, 3, 5...", description: "Follows Fibonacci sequence scaling" },
  { id: "percentage", label: "Percentage", formula: "base + (base * rate * row)", example: "+10% each", description: "Adds a fixed percentage of base value per row" },
  { id: "custom", label: "Custom Formula", formula: "", example: "Your formula", description: "Define your own mathematical formula" },
];

export function generateVariations(
  baseConfig: MTConfig,
  params: VariationParameter[],
  count: number
): GeneratedVariation[] {
  const variations: GeneratedVariation[] = [];
  
  for (let i = 0; i < count; i++) {
    const variation = structuredClone(baseConfig);
    const parameterValues: Record<string, number> = {};
    
    for (const param of params) {
      let value: number;
      
      switch (param.distribution) {
        case "linear":
          // Linear interpolation between min and max
          value = param.min + ((param.max - param.min) * i / Math.max(count - 1, 1));
          break;
        case "random":
          // Random value within range
          value = param.min + Math.random() * (param.max - param.min);
          break;
        case "fibonacci":
          // Fibonacci-based scaling
          const fibFactors = [1, 1, 2, 3, 5, 8, 13, 21];
          const factor = fibFactors[i % fibFactors.length] / fibFactors[0];
          value = param.min + (param.max - param.min) * (factor / fibFactors[Math.min(count - 1, fibFactors.length - 1)]);
          break;
        default:
          value = param.min;
      }
      
      // Apply step if specified
      if (param.step) {
        value = Math.round(value / param.step) * param.step;
      }
      
      // Round to 2 decimals for lots, integers for points
      value = param.field.includes("lot") ? Math.round(value * 100) / 100 : Math.round(value);
      parameterValues[param.field] = value;
      
      // Apply to config
      applyValueToConfig(variation, param.field, value, param.groups, param.logics);
    }
    
    variations.push({
      id: `var_${i + 1}`,
      name: `Variation ${i + 1}`,
      config: variation,
      parameterValues
    });
  }
  
  return variations;
}

export interface FormulaParams {
  start?: number;
  step?: number;
  multiplier?: number;
  base?: number;
  rate?: number;
  custom?: string;
}

export function applyFormula(
  config: MTConfig,
  formulaId: string,
  params: FormulaParams,
  targetField: string,
  targetGroups: number[]
): QuickActionResult {
  const newConfig = structuredClone(config);
  const changes: FieldChange[] = [];
  const preset = FORMULA_PRESETS.find(p => p.id === formulaId);

  if (!preset) {
    return { success: false, message: "Formula not found" };
  }

  targetGroups.sort((a, b) => a - b);
  
  targetGroups.forEach((groupNum, index) => {
    let value = 0;
    const row = index; // Use group index as 'row'

    switch (formulaId) {
      case "linear":
        value = (params.start || 0) + row * (params.step || 0);
        break;
      case "exponential":
        value = (params.base || 0) * Math.pow(params.multiplier || 1, row);
        break;
      case "fibonacci":
        const fib = (n: number): number => (n <= 1 ? 1 : fib(n - 1) + fib(n - 2));
        // fib(0)=1, fib(1)=1, fib(2)=2, ...
        // We want fib(row) where row 0 -> 1, row 1 -> 1? Or start higher?
        // GridBatchEditor implementation: fib(index) * base.
        value = fib(row) * (params.base || 0);
        break;
      case "percentage":
        // base + (base * rate * row) = base * (1 + rate * row)
        value = (params.base || 0) * (1 + (params.rate || 0) * row);
        break;
      case "custom":
        if (params.custom) {
          const SAFE_FUNCS: Record<string, (...args: number[]) => number> = {
            abs: Math.abs,
            max: Math.max,
            min: Math.min,
            round: Math.round,
            floor: Math.floor,
            ceil: Math.ceil,
            pow: Math.pow,
            sqrt: Math.sqrt,
            log: Math.log,
            exp: Math.exp,
          };

          const sanitized = params.custom.replace(/[^-+/*%^()0-9., a-zA-Z_]/g, "");
          const tokens = sanitized.split(/([^a-zA-Z0-9_]+)/).filter(Boolean);

          const rebuilt = tokens
            .map((t) => {
              if (t === "row") return String(row);
              if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) {
                if (t in SAFE_FUNCS) return `__f.${t}`;
                if (t === "Math") return "";
                return "";
              }
              return t;
            })
            .join("");

          try {
            // eslint-disable-next-line no-new-func
            const fn = new Function("__row", "__f", `return (${rebuilt});`);
            const result = fn(row, SAFE_FUNCS);
            value = typeof result === "number" && isFinite(result) ? result : 0;
          } catch {
            value = 0;
          }
        } else {
          value = 0;
        }
        break;
    }
    
    // Rounding
    if (targetField.includes("lot") || targetField.includes("multiplier")) {
       value = Math.round(value * 100) / 100;
    } else {
       value = Math.round(value);
    }

    // Apply to all engines/logics in this group
    for (const engine of newConfig.engines) {
      const group = engine.groups.find(g => g.group_number === groupNum);
      if (!group) continue;
      
      for (const logic of group.logics) {
         if (targetField in logic) {
            const oldValue = (logic as any)[targetField];
            if (oldValue !== value) {
               (logic as any)[targetField] = value;
               changes.push({
                 engine: engine.engine_id,
                 group: groupNum,
                 logic: logic.logic_name,
                 field: targetField,
                 oldValue,
                 newValue: value
               });
            }
         }
      }
    }
  });

  return {
    success: true,
    message: `Applied ${preset.label} formula to ${targetField} across ${targetGroups.length} groups`,
    newConfig,
    changes
  };
}

function applyValueToConfig(
  config: MTConfig,
  field: string,
  value: any,
  groups?: number[],
  logics?: string[]
): void {
  for (const engine of config.engines) {
    for (const group of engine.groups) {
      if (groups && !groups.includes(group.group_number)) continue;
      
      for (const logic of group.logics) {
        if (logics && !logics.map(l => l.toUpperCase()).includes(logic.logic_name.toUpperCase())) continue;
        
        if (field in logic) {
          (logic as any)[field] = value;
        }
      }
    }
  }
}

// ============================================================================
// QUICK ACTIONS LIBRARY
// ============================================================================

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "set_grid_all",
    label: "Set Grid",
    icon: "📊",
    description: "Set grid spacing for all groups",
    category: "set",
    params: [
      { id: "value", label: "Grid (pts)", type: "number", default: 500, min: 50, max: 5000 },
      { id: "groups", label: "Groups", type: "groups", default: [1, 2, 3, 4, 5, 6, 7, 8] }
    ],
    execute: (config, params) => {
      const newConfig = structuredClone(config);
      const changes: FieldChange[] = [];
      const value = params?.value || 500;
      const groups = params?.groups || [];
      
      for (const engine of newConfig.engines) {
        for (const group of engine.groups) {
          if (groups.length && !groups.includes(group.group_number)) continue;
          for (const logic of group.logics) {
            const oldValue = logic.grid;
            logic.grid = value;
            changes.push({
              engine: engine.engine_id,
              group: group.group_number,
              logic: logic.logic_name,
              field: "grid",
              oldValue,
              newValue: value
            });
          }
        }
      }
      
      return {
        success: true,
        message: `Set grid to ${value} for ${changes.length} logics`,
        newConfig,
        changes
      };
    }
  },
  {
    id: "set_lot_all",
    label: "Set Lot",
    icon: "💰",
    description: "Set initial lot for all logics",
    category: "set",
    params: [
      { id: "value", label: "Lot Size", type: "number", default: 0.02, min: 0.01, max: 1.0 },
      { id: "groups", label: "Groups", type: "groups", default: [1, 2, 3, 4, 5, 6, 7, 8] }
    ],
    execute: (config, params) => {
      const newConfig = structuredClone(config);
      const changes: FieldChange[] = [];
      const value = params?.value || 0.02;
      const groups = params?.groups || [];
      
      for (const engine of newConfig.engines) {
        for (const group of engine.groups) {
          if (groups.length && !groups.includes(group.group_number)) continue;
          for (const logic of group.logics) {
            if (logic.initial_lot !== undefined) {
              const oldValue = logic.initial_lot;
              logic.initial_lot = value;
              changes.push({
                engine: engine.engine_id,
                group: group.group_number,
                logic: logic.logic_name,
                field: "initial_lot",
                oldValue,
                newValue: value
              });
            }
          }
        }
      }
      
      return {
        success: true,
        message: `Set initial_lot to ${value} for ${changes.length} logics`,
        newConfig,
        changes
      };
    }
  },
  {
    id: "fibonacci_grid",
    label: "Fibonacci Grid",
    icon: "🌀",
    description: "Apply fibonacci progression to grid across groups",
    category: "progression",
    params: [
      { id: "start", label: "Start", type: "number", default: 300, min: 50, max: 2000 },
      { id: "end", label: "End", type: "number", default: 2000, min: 500, max: 10000 },
      { id: "groups", label: "Groups", type: "groups", default: [1, 2, 3, 4, 5, 6, 7, 8] }
    ],
    execute: (config, params) => {
      const newConfig = structuredClone(config);
      const changes: FieldChange[] = [];
      const start = params?.start || 300;
      const end = params?.end || 2000;
      const groups: number[] = params?.groups || [1, 2, 3, 4, 5, 6, 7, 8];
      
      const fibFactors = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
      const totalFib = fibFactors.slice(0, groups.length).reduce((a, b) => a + b, 0);
      
      groups.forEach((groupNum, idx) => {
        const cumFib = fibFactors.slice(0, idx + 1).reduce((a, b) => a + b, 0);
        const value = Math.round(start + (end - start) * (cumFib / totalFib));
        
        for (const engine of newConfig.engines) {
          const group = engine.groups.find(g => g.group_number === groupNum);
          if (!group) continue;
          
          for (const logic of group.logics) {
            const oldValue = logic.grid;
            logic.grid = value;
            changes.push({
              engine: engine.engine_id,
              group: group.group_number,
              logic: logic.logic_name,
              field: "grid",
              oldValue,
              newValue: value
            });
          }
        }
      });
      
      return {
        success: true,
        message: `Applied fibonacci grid progression (${start}→${end}) across ${groups.length} groups`,
        newConfig,
        changes
      };
    }
  },
  {
    id: "copy_group1",
    label: "Clone G1",
    icon: "📋",
    description: "Copy Group 1 settings to other groups",
    category: "copy",
    params: [
      { id: "targetGroups", label: "To Groups", type: "groups", default: [2, 3, 4, 5, 6, 7, 8] }
    ],
    execute: (config, params) => {
      const newConfig = structuredClone(config);
      const changes: FieldChange[] = [];
      const targetGroups: number[] = params?.targetGroups || [2, 3, 4, 5, 6, 7, 8];
      
      for (const engine of newConfig.engines) {
        const sourceGroup = engine.groups.find(g => g.group_number === 1);
        if (!sourceGroup) continue;
        
        for (const targetGroupNum of targetGroups) {
          const targetGroup = engine.groups.find(g => g.group_number === targetGroupNum);
          if (!targetGroup) continue;
          
          for (const sourceLogic of sourceGroup.logics) {
            const targetLogic = targetGroup.logics.find(l => l.logic_name === sourceLogic.logic_name);
            if (!targetLogic) continue;
            
            const copyFields = ["grid", "multiplier", "trail_value", "trail_method", "trail_start", "trail_step"];
            for (const field of copyFields) {
              const oldValue = (targetLogic as any)[field];
              const newValue = (sourceLogic as any)[field];
              if (oldValue !== newValue) {
                (targetLogic as any)[field] = newValue;
                changes.push({
                  engine: engine.engine_id,
                  group: targetGroupNum,
                  logic: targetLogic.logic_name,
                  field,
                  oldValue,
                  newValue
                });
              }
            }
          }
        }
      }
      
      return {
        success: true,
        message: `Cloned Group 1 to ${targetGroups.length} groups (${changes.length} changes)`,
        newConfig,
        changes
      };
    }
  },
  {
    id: "enable_reverse",
    label: "Enable Reverse",
    icon: "🔄",
    description: "Enable reverse mode for Power logics",
    category: "set",
    params: [
      { id: "groups", label: "Groups", type: "groups", default: [1, 2, 3, 4, 5] }
    ],
    execute: (config, params) => {
      const newConfig = structuredClone(config);
      const changes: FieldChange[] = [];
      const groups: number[] = params?.groups || [1, 2, 3, 4, 5];
      
      for (const engine of newConfig.engines) {
        for (const group of engine.groups) {
          if (!groups.includes(group.group_number)) continue;
          
          for (const logic of group.logics) {
            if (logic.logic_name.toUpperCase() === "POWER") {
              const oldValue = logic.reverse_enabled;
              logic.reverse_enabled = true;
              changes.push({
                engine: engine.engine_id,
                group: group.group_number,
                logic: logic.logic_name,
                field: "reverse_enabled",
                oldValue,
                newValue: true
              });
            }
          }
        }
      }
      
      return {
        success: true,
        message: `Enabled reverse mode on ${changes.length} Power logics`,
        newConfig,
        changes
      };
    }
  }
];

// ============================================================================
// APPLY STRESS TEST
// ============================================================================

export function applyStressTest(
  config: MTConfig,
  preset: StressTestPreset
): QuickActionResult {
  const newConfig = structuredClone(config);
  const changes: FieldChange[] = [];
  
  for (const mod of preset.modifications) {
    for (const engine of newConfig.engines) {
      for (const group of engine.groups) {
        if (mod.groups && !mod.groups.includes(group.group_number)) continue;
        
        for (const logic of group.logics) {
          if (mod.logics && !mod.logics.map(l => l.toUpperCase()).includes(logic.logic_name.toUpperCase())) continue;
          
          if (mod.field in logic) {
            const oldValue = (logic as any)[mod.field];
            let newValue: any;
            
            switch (mod.operation) {
              case "set":
                newValue = mod.value;
                break;
              case "multiply":
                // Ensure value is number before multiplying
                {
                  const val = mod.value;
                  if (typeof val === "number") {
                    newValue = typeof oldValue === "number" ? oldValue * val : oldValue;
                    // Round appropriately
                    newValue = mod.field.includes("lot") ? Math.round(newValue * 100) / 100 : Math.round(newValue);
                  } else {
                    newValue = oldValue;
                  }
                }
                break;
              case "add":
                 // Ensure value is number before adding
                 {
                   const val = mod.value;
                   if (typeof val === "number") {
                    newValue = typeof oldValue === "number" ? oldValue + val : oldValue;
                   } else {
                     newValue = oldValue;
                   }
                 }
                break;
              default:
                newValue = oldValue;
            }
            
            if (oldValue !== newValue) {
              (logic as any)[mod.field] = newValue;
              changes.push({
                engine: engine.engine_id,
                group: group.group_number,
                logic: logic.logic_name,
                field: mod.field,
                oldValue,
                newValue
              });
            }
          }
        }
      }
    }
  }
  
  return {
    success: true,
    message: `Applied "${preset.name}" stress test (${changes.length} changes)`,
    newConfig,
    changes
  };
}

// ============================================================================
// VALIDATION & RISK ASSESSMENT
// ============================================================================

export interface ValidationWarning {
  level: "info" | "warning" | "error";
  field: string;
  message: string;
  suggestion?: string;
}

export function validateConfig(config: MTConfig): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  
  for (const engine of config.engines) {
    for (const group of engine.groups) {
      for (const logic of group.logics) {
        // Check grid too tight
        if (logic.grid < 100) {
          warnings.push({
            level: "warning",
            field: `${engine.engine_id}/G${group.group_number}/${logic.logic_name}/grid`,
            message: `Grid ${logic.grid} is very tight - may cause overtrading`,
            suggestion: "Consider grid >= 200 for most conditions"
          });
        }
        
        // Check multiplier too high
        if (logic.multiplier > 2.0) {
          warnings.push({
            level: "error",
            field: `${engine.engine_id}/G${group.group_number}/${logic.logic_name}/multiplier`,
            message: `Multiplier ${logic.multiplier} is extreme - high blow-up risk`,
            suggestion: "Consider multiplier <= 1.8 for safety"
          });
        }
        
        // Check lot size vs multiplier
        if (logic.initial_lot && logic.initial_lot > 0.1 && logic.multiplier > 1.5) {
          warnings.push({
            level: "warning",
            field: `${engine.engine_id}/G${group.group_number}/${logic.logic_name}`,
            message: `High initial lot (${logic.initial_lot}) with high multiplier (${logic.multiplier})`,
            suggestion: "Reduce lot or multiplier to manage risk"
          });
        }
        
        // Check trail vs grid ratio
        if (logic.trail_value < logic.grid * 0.5) {
          warnings.push({
            level: "info",
            field: `${engine.engine_id}/G${group.group_number}/${logic.logic_name}/trail_value`,
            message: `Trail (${logic.trail_value}) is less than half of grid (${logic.grid})`,
            suggestion: "May exit before grid recovery - consider wider trail"
          });
        }
      }
    }
  }
  
  return warnings;
}

// ============================================================================
// PRESET LIBRARY
// ============================================================================

export interface ConfigPreset {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  config: MTConfig;
  tags: string[];
}

const PRESET_STORAGE_KEY = "daavfx_presets";

export function savePreset(config: MTConfig, name: string, description: string, tags: string[] = []): ConfigPreset {
  const preset: ConfigPreset = {
    id: `preset_${Date.now()}`,
    name,
    description,
    createdAt: Date.now(),
    config: structuredClone(config),
    tags
  };
  
  const existing = loadAllPresets();
  existing.push(preset);
  
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    console.error("Failed to save preset:", e);
  }
  
  return preset;
}

export function loadAllPresets(): ConfigPreset[] {
  try {
    const data = localStorage.getItem(PRESET_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load presets:", e);
    return [];
  }
}

export function deletePreset(id: string): boolean {
  const existing = loadAllPresets();
  const filtered = existing.filter(p => p.id !== id);
  
  if (filtered.length === existing.length) return false;
  
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (e) {
    console.error("Failed to delete preset:", e);
    return false;
  }
}

export function getPresetById(id: string): ConfigPreset | undefined {
  return loadAllPresets().find(p => p.id === id);
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

export interface KeyboardShortcut {
  key: string;
  modifiers: ("ctrl" | "alt" | "shift")[];
  description: string;
  action: string;
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { key: "g", modifiers: ["ctrl"], description: "Set grid for selected groups", action: "quick:set_grid" },
  { key: "l", modifiers: ["ctrl"], description: "Set lot for selected groups", action: "quick:set_lot" },
  { key: "f", modifiers: ["ctrl"], description: "Apply Fibonacci grid progression", action: "quick:fibonacci" },
  { key: "1", modifiers: ["ctrl"], description: "Clone Group 1 to selected", action: "quick:clone_g1" },
  { key: "r", modifiers: ["ctrl", "shift"], description: "Enable reverse mode", action: "quick:reverse" },
  { key: "s", modifiers: ["ctrl"], description: "Save current as preset", action: "preset:save" },
  { key: "e", modifiers: ["ctrl"], description: "Export .set file", action: "export:set" },
  { key: "z", modifiers: ["ctrl"], description: "Undo last change", action: "undo" },
];

// ============================================================================
// PARAMETER MATRIX EXTRACTION
// ============================================================================

export interface ParameterMatrixRow {
  group: number;
  power: { grid: number; lot: number; mult: number; trail: number };
  repower: { grid: number; lot: number; mult: number; trail: number };
  scalper: { grid: number; lot: number; mult: number; trail: number };
}

export function extractParameterMatrix(config: MTConfig, engineId = "A"): ParameterMatrixRow[] {
  const engine = config.engines.find(e => e.engine_id === engineId);
  if (!engine) return [];
  
  const matrix: ParameterMatrixRow[] = [];
  
  for (const group of engine.groups.slice(0, 10)) { // First 10 groups for compact view
    const powerLogic = group.logics.find(l => l.logic_name === "Power");
    const repowerLogic = group.logics.find(l => l.logic_name === "Repower");
    const scalperLogic = group.logics.find(l => l.logic_name === "Scalper");
    
    matrix.push({
      group: group.group_number,
      power: {
        grid: powerLogic?.grid || 0,
        lot: powerLogic?.initial_lot || 0,
        mult: powerLogic?.multiplier || 0,
        trail: powerLogic?.trail_value || 0
      },
      repower: {
        grid: repowerLogic?.grid || 0,
        lot: repowerLogic?.initial_lot || 0,
        mult: repowerLogic?.multiplier || 0,
        trail: repowerLogic?.trail_value || 0
      },
      scalper: {
        grid: scalperLogic?.grid || 0,
        lot: scalperLogic?.initial_lot || 0,
        mult: scalperLogic?.multiplier || 0,
        trail: scalperLogic?.trail_value || 0
      }
    });
  }
  
  return matrix;
}

// Field Schema Registry - Complete schema of all valid fields per entity type
// Provides runtime validation for all field operations in the chat system

import type { MTConfig } from "@/types/mt-config";

export type FieldEntity = "general" | "engine" | "group" | "logic";

export const FIELD_SCHEMA = {
  general: [
    "license_key",
    "license_server_url",
    "require_license",
    "license_check_interval",
    "config_file_name",
    "config_file_is_common",
    "allow_buy",
    "allow_sell",
    "enable_logs",
    "use_direct_price_grid",
    "group_mode",
    "grid_unit",
    "pip_factor",
    "compounding_enabled",
    "compounding_type",
    "compounding_target",
    "compounding_increase",
    "restart_policy_power",
    "restart_policy_non_power",
    "close_non_power_on_power_close",
    "hold_timeout_bars",
    "magic_number",
    "magic_number_buy",
    "magic_number_sell",
    "max_slippage_points",
    "reverse_magic_base",
    "hedge_magic_base",
    "hedge_magic_independent",
    "risk_management",
    "risk_management_b",
    "risk_management_s",
    "time_filters",
    "time_filters_b",
    "time_filters_s",
    "news_filter",
    "news_filter_b",
    "news_filter_s",
  ],
  engine: [
    "engine_id",
    "engine_name",
    "max_power_orders",
    "groups",
  ],
  group: [
    "group_number",
    "enabled",
    "reverse_mode",
    "hedge_mode",
    "hedge_reference",
    "entry_delay_bars",
    "logics",
  ],
  logic: [
    "logic_name",
    "logic_id",
    "enabled",
    "initial_lot",
    "initial_lot_b",
    "initial_lot_s",
    "multiplier",
    "multiplier_b",
    "multiplier_s",
    "grid",
    "grid_b",
    "grid_s",
    "trail_method",
    "trail_value",
    "trail_value_b",
    "trail_value_s",
    "trail_start",
    "trail_start_b",
    "trail_start_s",
    "trail_step",
    "trail_step_b",
    "trail_step_s",
    "trail_step_method",
    "start_level",
    "last_lot",
    "close_targets",
    "order_count_reference",
    "reset_lot_on_restart",
    "use_tp",
    "tp_mode",
    "tp_value",
    "use_sl",
    "sl_mode",
    "sl_value",
    "reverse_enabled",
    "hedge_enabled",
    "reverse_scale",
    "hedge_scale",
    "reverse_reference",
    "hedge_reference",
    "trading_mode",
    "trail_step_mode",
    "trail_step_cycle",
    "trail_step_balance",
    "close_partial",
    "close_partial_cycle",
    "close_partial_mode",
    "close_partial_balance",
    "close_partial_trail_step_mode",
    "trigger_type",
    "trigger_bars",
    "trigger_minutes",
    "trigger_pips",
    "grid_behavior",
  ],
} as const;

export type ValidField<T extends FieldEntity> = (typeof FIELD_SCHEMA)[T][number];

export interface FieldBounds {
  min: number;
  max: number;
  decimals?: number;
  unit?: string;
}

export const FIELD_BOUNDS: Record<string, FieldBounds> = {
  initial_lot: { min: 0.01, max: 100, decimals: 2, unit: "lots" },
  initial_lot_b: { min: 0.01, max: 100, decimals: 2, unit: "lots" },
  initial_lot_s: { min: 0.01, max: 100, decimals: 2, unit: "lots" },
  multiplier: { min: 1.0, max: 10.0, decimals: 2 },
  multiplier_b: { min: 1.0, max: 10.0, decimals: 2 },
  multiplier_s: { min: 1.0, max: 10.0, decimals: 2 },
  grid: { min: 1, max: 10000, unit: "points" },
  grid_b: { min: 1, max: 10000, unit: "points" },
  grid_s: { min: 1, max: 10000, unit: "points" },
  trail_method: { min: 0, max: 5 },
  trail_value: { min: 0, max: 100000, unit: "points" },
  trail_value_b: { min: 0, max: 100000, unit: "points" },
  trail_value_s: { min: 0, max: 100000, unit: "points" },
  trail_start: { min: 0, max: 1000, unit: "points" },
  trail_start_b: { min: 0, max: 1000, unit: "points" },
  trail_start_s: { min: 0, max: 1000, unit: "points" },
  trail_step: { min: 0, max: 100000, unit: "points" },
  trail_step_b: { min: 0, max: 100000, unit: "points" },
  trail_step_s: { min: 0, max: 100000, unit: "points" },
  trail_step_method: { min: 0, max: 5 },
  start_level: { min: 0, max: 20, decimals: 0 },
  last_lot: { min: 0, max: 100, decimals: 2, unit: "lots" },
  order_count_reference: { min: 0, max: 1 },
  reset_lot_on_restart: { min: 0, max: 1 },
  use_tp: { min: 0, max: 1 },
  tp_mode: { min: 0, max: 3 },
  tp_value: { min: 0, max: 1000000, unit: "points" },
  use_sl: { min: 0, max: 1 },
  sl_mode: { min: 0, max: 3 },
  sl_value: { min: 0, max: 1000000, unit: "points" },
  reverse_enabled: { min: 0, max: 1 },
  hedge_enabled: { min: 0, max: 1 },
  reverse_scale: { min: 0, max: 500, decimals: 1, unit: "%" },
  hedge_scale: { min: 0, max: 500, decimals: 1, unit: "%" },
  reverse_reference: { min: 0, max: 1 },
  hedge_reference: { min: 0, max: 1 },
  trail_step_mode: { min: 0, max: 3 },
  trail_step_cycle: { min: 1, max: 100, decimals: 0 },
  trail_step_balance: { min: 0, max: 1000000, unit: "currency" },
  close_partial: { min: 0, max: 1 },
  close_partial_cycle: { min: 1, max: 100, decimals: 0 },
  close_partial_mode: { min: 0, max: 5 },
  close_partial_balance: { min: 0, max: 3 },
  close_partial_trail_step_mode: { min: 0, max: 3 },
  trigger_type: { min: 0, max: 10 },
  trigger_bars: { min: 0, max: 1000, decimals: 0 },
  trigger_minutes: { min: 0, max: 10000, decimals: 0 },
  trigger_pips: { min: 0, max: 1000, decimals: 1 },
  grid_behavior: { min: 0, max: 2 },
  max_slippage_points: { min: 0, max: 1000, decimals: 0 },
  hold_timeout_bars: { min: 0, max: 1000, decimals: 0 },
  magic_number: { min: 0, max: 9999999, decimals: 0 },
  magic_number_buy: { min: 0, max: 9999999, decimals: 0 },
  magic_number_sell: { min: 0, max: 9999999, decimals: 0 },
  reverse_magic_base: { min: 0, max: 9999999, decimals: 0 },
  hedge_magic_base: { min: 0, max: 9999999, decimals: 0 },
  hedge_magic_independent: { min: 0, max: 1 },
  compounding_enabled: { min: 0, max: 1 },
  compounding_target: { min: 0, max: 10000, decimals: 0 },
  compounding_increase: { min: 0, max: 100, decimals: 1 },
  license_check_interval: { min: 60, max: 86400, decimals: 0 },
  entry_delay_bars: { min: 0, max: 100, decimals: 0 },
  max_power_orders: { min: 1, max: 100, decimals: 0 },
  group_number: { min: 1, max: 20, decimals: 0 },
};

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

export function validateField(field: string, entity: FieldEntity): ValidationResult {
  const validFields = FIELD_SCHEMA[entity];
  if (!validFields.includes(field as any)) {
    return {
      valid: false,
      error: `Invalid field '${field}' for entity '${entity}'. Valid fields: ${validFields.join(", ")}`,
    };
  }
  return { valid: true };
}

export function validateFieldBounds(
  field: string,
  value: number
): ValidationResult {
  const bounds = FIELD_BOUNDS[field];
  if (!bounds) {
    return { valid: true, warning: `No bounds defined for field '${field}'` };
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { valid: false, error: `Value for '${field}' must be a finite number` };
  }

  if (value < bounds.min) {
    return {
      valid: false,
      error: `Value ${value} for '${field}' is below minimum ${bounds.min}`,
    };
  }

  if (value > bounds.max) {
    return {
      valid: false,
      error: `Value ${value} for '${field}' exceeds maximum ${bounds.max}`,
    };
  }

  if (bounds.decimals !== undefined) {
    const decimals = (value.toString().split(".")[1] || "").length;
    if (decimals > bounds.decimals) {
      return {
        valid: false,
        error: `Value ${value} for '${field}' has too many decimal places (max ${bounds.decimals})`,
      };
    }
  }

  return { valid: true };
}

export function validateFieldOperation(
  field: string,
  entity: FieldEntity,
  value: number
): ValidationResult {
  const fieldValidation = validateField(field, entity);
  if (!fieldValidation.valid) {
    return fieldValidation;
  }

  const boundsValidation = validateFieldBounds(field, value);
  return boundsValidation;
}

export function getAllValidFields(): string[] {
  return [
    ...FIELD_SCHEMA.general,
    ...FIELD_SCHEMA.engine,
    ...FIELD_SCHEMA.group,
    ...FIELD_SCHEMA.logic,
  ];
}

export function getFieldEntity(field: string): FieldEntity | null {
  for (const [entity, fields] of Object.entries(FIELD_SCHEMA)) {
    if (fields.includes(field as any)) {
      return entity as FieldEntity;
    }
  }
  return null;
}

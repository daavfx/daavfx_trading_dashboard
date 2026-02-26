// TypeScript types for MT4/MT5 configuration
// ACCURATE MAPPING based on actual MT4/MT5 EA inputs (V17.04+)

export type Platform = "MT4" | "MT5";

export type TrailMethod = "Points" | "AVG_Percent" | "AVG_Points" | "Percent";

export type TrailStepMethod = "Step_Points" | "Step_Percent" | "Step_Pips";

// Trail Step Mode - controls how trail steps are applied
export type TrailStepMode = "TrailStepMode_Auto" | "TrailStepMode_Fixed" | "TrailStepMode_PerOrder" | "TrailStepMode_Disabled";

// V9.0: Trade Direction type for buy/sell separation
export type TradeDirection = "B" | "S" | "Both";

// V9.0: Direction-aware configuration for buy/sell separated inputs
// Each field can have separate values for BUY (_B) and SELL (_S) directions
export interface DirectionConfig<T = number> {
  // Unified value (used when direction-specific is not set or for backward compat)
  unified?: T;
  // BUY direction value (suffix _B)
  buy: T;
  // SELL direction value (suffix _S)
  sell: T;
}

// Helper to create a DirectionConfig with same value for both directions
export function createDirectionConfig<T>(value: T): DirectionConfig<T> {
  return { buy: value, sell: value };
}

// Helper to check if direction config has different values
export function hasDirectionalDifference<T>(config: DirectionConfig<T>): boolean {
  return config.buy !== config.sell;
}

// Helper to get value for specific direction
export function getDirectionValue<T>(config: DirectionConfig<T>, direction: TradeDirection): T {
  if (direction === "B") return config.buy;
  if (direction === "S") return config.sell;
  // For "Both", return unified if available, otherwise buy
  return config.unified ?? config.buy;
}

export type CompoundingType = "Compound_Balance" | "Compound_Equity";

export type RestartPolicy = "Restart_Default" | "Restart_Always" | "Continue_Always" | "Stop_Always";

// Complete Logic Reference - all 21 logics across 3 engines
export type LogicReference = 
  // Engine A (7 logics)
  | "Logic_Power" 
  | "Logic_Repower" 
  | "Logic_Scalp" 
  | "Logic_Stopper" 
  | "Logic_STO" 
  | "Logic_SCA" 
  | "Logic_RPO"
  // Engine B (7 logics)
  | "Logic_BPower"
  | "Logic_BRepower"
  | "Logic_BScalp"
  | "Logic_BStopper"
  | "Logic_BSTO"
  | "Logic_BSCA"
  | "Logic_BRPO"
  // Engine C (7 logics)
  | "Logic_CPower"
  | "Logic_CRepower"
  | "Logic_CScalp"
  | "Logic_CStopper"
  | "Logic_CSTO"
  | "Logic_CSCA"
  | "Logic_CRPO"
  // Special
  | "Logic_Self"   // Reference to self
  | "Logic_None";  // No reference

// TPSL modes
export type TPSLMode = "TPSL_Points" | "TPSL_Percent" | "TPSL_Currency";

// Partial close modes
export type PartialMode = "PartialMode_Low" | "PartialMode_High" | "PartialMode_Balanced";
export type PartialBalance = "PartialBalance_Aggressive" | "PartialBalance_Balanced" | "PartialBalance_Conservative";

// Reverse Lot Mode - how to calculate reversed lot size
export type ReverseLotMode = "Reverse_UseScale" | "Reverse_UseGroup1Params";

// Hedge Lot Mode - how to calculate hedge lot size
export type HedgeLotMode = "Hedge_UseScale" | "Hedge_UseGroup1Params" | "Hedge_MatchReference";

export interface MTConfig {
  version: string;
  platform: Platform;
  timestamp: string;
  total_inputs: number;
  last_saved_at?: string;
  last_saved_platform?: Platform;
  current_set_name?: string;
  tags?: string[];
  comments?: string;
  general: GeneralConfig;
  engines: EngineConfig[];
}

export interface GeneralConfig {
  // License
  license_key: string;
  license_server_url: string;
  require_license: boolean;
  license_check_interval: number;
  
  // Config
  config_file_name: string;
  config_file_is_common: boolean;
  
  // Trading (GLOBAL - not per logic!)
  allow_buy: boolean;
  allow_sell: boolean;
  
  // Logging
  enable_logs: boolean;

  use_direct_price_grid: boolean;

  // Clean EA math controls
  group_mode?: number; // 0=Independent, 1=Progressive
  grid_unit?: number; // 0=Points, 1=Pips
  pip_factor?: number; // 0=Auto
  
  // Compounding
  compounding_enabled: boolean;
  compounding_type: CompoundingType;
  compounding_target: number;
  compounding_increase: number;
  
  // Restart Policy
  restart_policy_power: RestartPolicy;
  restart_policy_non_power: RestartPolicy;
  close_non_power_on_power_close: boolean;
  hold_timeout_bars: number;
  
  // Global System Settings
  magic_number: number; // GLOBAL magic number
  magic_number_buy: number; // BUY direction magic number
  magic_number_sell: number; // SELL direction magic number
  max_slippage_points: number; // GLOBAL slippage
  reverse_magic_base: number;
  hedge_magic_base: number;
  hedge_magic_independent: boolean;
  
  // Risk Management (NEW!)
  risk_management: RiskManagementConfig;
  risk_management_b?: RiskManagementConfig;
  risk_management_s?: RiskManagementConfig;
  
  // Time Filters (NEW!)
  time_filters: TimeFiltersConfig;
  time_filters_b?: TimeFiltersConfig;
  time_filters_s?: TimeFiltersConfig;
  
  // News Filter (NEW!)
  news_filter: NewsFilterConfig;
  news_filter_b?: NewsFilterConfig;
  news_filter_s?: NewsFilterConfig;
}

export interface RiskManagementConfig {
  // Spread Filter
  spread_filter_enabled: boolean;
  max_spread_points: number;
  
  // Equity Stop
  equity_stop_enabled: boolean;
  equity_stop_value: number;
  
  // Drawdown Stop
  drawdown_stop_enabled: boolean;
  max_drawdown_percent: number;

  risk_action?: string; // ENUM_TRIGGER_ACTION
}

export interface TimeFiltersConfig {
  priority_settings: {
    news_filter_overrides_session: boolean;
    session_filter_overrides_news: boolean;
  };
  sessions: SessionConfig[];
}

export interface SessionConfig {
  session_number: number;
  enabled: boolean;
  day: number; // 0=Sunday, 1=Monday...
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
  action: string; // ENUM_TRIGGER_ACTION
  auto_restart: boolean;
  restart_mode: string; // ENUM_RESTART_MODE
  restart_bars: number;
  restart_minutes: number;
  restart_pips: number;
}

export interface NewsFilterConfig {
  enabled: boolean;
  api_key: string;
  api_url: string;
  countries: string; // Comma-separated (e.g., "US,GB,EU")
  impact_level: number; // 1=Low, 2=Med, 3=High
  minutes_before: number;
  minutes_after: number;
  action: string; // ENUM_TRIGGER_ACTION
  calendar_file?: string;
}

export interface EngineConfig {
  engine_id: "A" | "B" | "C";
  engine_name: string;
  max_power_orders: number; // Max consecutive Power orders for this engine
  groups: GroupConfig[];
}

export interface GroupConfig {
  group_number: number; // 1-20 (all groups supported)
  enabled: boolean;
  
  // ===== GROUP TRIGGER (Groups 2-20 only) =====
  group_power_start?: number;               // gInput_GroupPowerStart_P{N} - # of Power A trades needed to trigger this group
  
  // ===== GROUP-LEVEL REVERSE/HEDGE CONTROLS =====
  reverse_mode: boolean;                    // gInput_Group{N}_ReverseMode - flip counter-trend to trend-follow
  hedge_mode: boolean;                      // gInput_Group{N}_HedgeMode - maintain opposite volume to reference
  hedge_reference: LogicReference;          // gInput_Group{N}_HedgeReference - which logic to hedge against
  entry_delay_bars: number;                 // gInput_Group{N}_EntryDelayBars - stagger entry by X bars per logic
  
  logics: LogicConfig[];
}

// COMPLETE LogicConfig - ALL 21-23 fields based on templates
export interface LogicConfig {
  // METADATA (3 fields)
  logic_name: string; // "Power", "Repower", "Scalp", etc.
  logic_id: string; // "A_Power_G1", etc.
  enabled: boolean; // Always true for now (no per-logic enable in MT4)
  
  // ===== BASE PARAMS (8 fields) =====
  initial_lot: number;                  // gInput_Initial_loT_P1, _R1, etc.
  initial_lot_b?: number;
  initial_lot_s?: number;
  multiplier: number;                   // gInput_Mult_P1, _R1, etc.
  multiplier_b?: number;
  multiplier_s?: number;
  grid: number;                         // gInput_Grid_P1, _R1, etc.
  grid_b?: number;
  grid_s?: number;
  trail_method: TrailMethod;            // gInput_Trail_P1 (enum)
  trail_value: number;                  // gInput_TrailValue_P1
  trail_value_b?: number;
  trail_value_s?: number;
  trail_start: number;                  // gInput_Trail_Start_P1
  trail_start_b?: number;
  trail_start_s?: number;
  trail_step: number;                   // gInput_TrailStep_P1
  trail_step_b?: number;
  trail_step_s?: number;
  trail_step_method: TrailStepMethod;   // gInput_TrailStepMethod_P1 (enum)
  
  // ===== LOGIC-SPECIFIC (5 fields - 3 for Power, 5 for others) =====
  start_level?: number;                 // gInput_StartRepower, _StartScalp, etc. (not for Power)
  last_lot?: number;                    // gInput_LastLotRepower (not for Power)
  close_targets: string;                // gInput_CloseTargets_{Logic} - comma-separated logic labels (e.g. "Logic_A_Power,Logic_A_Repower")
  order_count_reference: LogicReference; // gInput_Power_OrderCountReference (enum)
  reset_lot_on_restart: boolean;        // gInput_Power_ResetLotOnRestart
  
  // ===== TPSL (6 fields - dashboard-managed, hidden in MT4) =====
  use_tp: boolean;                      // gInput_G1_UseTP_P
  tp_mode: TPSLMode;                    // gInput_G1_TP_Mode_P
  tp_value: number;                     // gInput_G1_TP_Value_P
  use_sl: boolean;                      // gInput_G1_UseSL_P
  sl_mode: TPSLMode;                    // gInput_G1_SL_Mode_P
  sl_value: number;                     // gInput_G1_SL_Value_P
  
  // ===== REVERSE/HEDGE PER-LOGIC (8 fields) =====
  reverse_enabled: boolean;             // gInput_G{group}_{logic}_ReverseEnabled
  hedge_enabled: boolean;               // gInput_G{group}_{logic}_HedgeEnabled
  reverse_scale: number;                // gInput_G{group}_Scale_{logic}_Reverse (e.g., 100.0 = 100%)
  hedge_scale: number;                  // gInput_G{group}_Scale_{logic}_Hedge (e.g., 50.0 = 50%)
  reverse_reference: LogicReference;    // gInput_G{group}_{logic}_ReverseReference - which logic to reverse against
  hedge_reference: LogicReference;      // gInput_G{group}_{logic}_HedgeReference - which logic to hedge against
  trading_mode?: string;
  
  // ===== TRAIL STEP ADVANCED (3 fields) =====
  trail_step_mode: TrailStepMode;       // gInput_TrailStepMode_{suffix} - how trail steps are applied
  trail_step_cycle: number;             // gInput_TrailStepCycle_{suffix} - update every Nth cycle (1=always)
  trail_step_balance: number;           // gInput_TrailStepBalance_{suffix} - skip if balance < threshold
  
  // ===== TRAIL STEP EXTENDED (Levels 2-7) =====
  trail_step_2?: number;
  trail_step_method_2?: TrailStepMethod;
  trail_step_cycle_2?: number;
  trail_step_balance_2?: number;
  trail_step_mode_2?: TrailStepMode;

  trail_step_3?: number;
  trail_step_method_3?: TrailStepMethod;
  trail_step_cycle_3?: number;
  trail_step_balance_3?: number;
  trail_step_mode_3?: TrailStepMode;

  trail_step_4?: number;
  trail_step_method_4?: TrailStepMethod;
  trail_step_cycle_4?: number;
  trail_step_balance_4?: number;
  trail_step_mode_4?: TrailStepMode;

  trail_step_5?: number;
  trail_step_method_5?: TrailStepMethod;
  trail_step_cycle_5?: number;
  trail_step_balance_5?: number;
  trail_step_mode_5?: TrailStepMode;

  trail_step_6?: number;
  trail_step_method_6?: TrailStepMethod;
  trail_step_cycle_6?: number;
  trail_step_balance_6?: number;
  trail_step_mode_6?: TrailStepMode;

  trail_step_7?: number;
  trail_step_method_7?: TrailStepMethod;
  trail_step_cycle_7?: number;
  trail_step_balance_7?: number;
  trail_step_mode_7?: TrailStepMode;

  // ===== CLOSE PARTIAL (5 fields) =====
  close_partial: boolean;               // gInput_ClosePartial_{suffix}
  close_partial_cycle: number;          // gInput_ClosePartialCycle_{suffix}
  close_partial_mode: PartialMode;      // gInput_ClosePartialMode_{suffix} (enum)
  close_partial_balance: PartialBalance; // gInput_ClosePartialBalance_{suffix} (enum)
  close_partial_trail_step_mode: TrailStepMode; // gInput_TrailStepMode_{suffix} for partial close

  // ===== CLOSE PARTIAL EXTENDED (Levels 2-4) =====
  close_partial_2?: boolean;
  close_partial_cycle_2?: number;
  close_partial_mode_2?: PartialMode;
  close_partial_balance_2?: PartialBalance;

  close_partial_3?: boolean;
  close_partial_cycle_3?: number;
  close_partial_mode_3?: PartialMode;
  close_partial_balance_3?: PartialBalance;

  close_partial_4?: boolean;
  close_partial_cycle_4?: number;
  close_partial_mode_4?: PartialMode;
  close_partial_balance_4?: PartialBalance;
  
  // ===== GROUP 1 ONLY (4 fields - optional for Groups 2-20) =====
  trigger_type?: string;                // gInput_G1_TriggerType_P (Group 1 ONLY!)
  trigger_bars?: number;                // gInput_G1_TriggerBars_P (Group 1 ONLY!)
  trigger_minutes?: number;             // gInput_G1_TriggerMinutes_P (Group 1 ONLY!)
  trigger_pips?: number;                // gInput_G1_TriggerPips_P (Group 1 ONLY!)
  grid_behavior?: string;               // Grid behavior setting (e.g., "Counter Trend")
  partial_close?: boolean;              // Partial close enabled
}

// Field count verification (V17.04+):
// GROUP 1:
// - Power: 3 meta + 8 base + 3 logic + 6 tpsl + 8 rev/hedge + 3 trail_adv + 5 partial + 4 triggers = 40 fields
// - Non-Power: 3 meta + 8 base + 5 logic + 6 tpsl + 8 rev/hedge + 3 trail_adv + 5 partial + 4 triggers = 42 fields
// GROUPS 2-20:
// - Power: 3 meta + 8 base + 3 logic + 6 tpsl + 8 rev/hedge + 3 trail_adv + 5 partial = 36 fields
// - Non-Power: 3 meta + 8 base + 5 logic + 6 tpsl + 8 rev/hedge + 3 trail_adv + 5 partial = 38 fields
// GROUP-LEVEL: 4 fields (reverse_mode, hedge_mode, hedge_reference, entry_delay_bars)

// UI-specific types
export interface EngineCardData {
  engine: string;
  tradingType: string;
  groups: string[];
}

export interface BatchEditData {
  selectedEngines: string[];
  selectedGroups: string[];
  selectedLogics: string[];
  changes: Partial<LogicConfig>;
}

// Helper type guards
export function isValidPlatform(platform: string): platform is Platform {
  return platform === "MT4" || platform === "MT5";
}

export function isValidTrailMethod(method: string): method is TrailMethod {
  return ["Points", "AVG_Percent", "AVG_Points", "Percent"].includes(method);
}

export function isValidLogicReference(ref: string): ref is LogicReference {
  return ref.startsWith("Logic_");
}

export function isValidTrailStepMode(mode: string): mode is TrailStepMode {
  return ["TrailStepMode_Auto", "TrailStepMode_Fixed", "TrailStepMode_PerOrder", "TrailStepMode_Disabled"].includes(mode);
}

// All 21 logic identifiers used across the EA
export const ALL_LOGIC_NAMES = [
  // Engine A
  "Power", "Repower", "Scalper", "Stopper", "STO", "SCA", "RPO",
  // Engine B  
  "BPower", "BRepower", "BScalper", "BStopper", "BSTO", "BSCA", "BRPO",
  // Engine C
  "CPower", "CRepower", "CScalper", "CStopper", "CSTO", "CSCA", "CRPO"
] as const;

export type LogicName = typeof ALL_LOGIC_NAMES[number];

// Logic suffix mapping for MT4/MT5 variable names
export const LOGIC_SUFFIX_MAP: Record<string, string> = {
  // Engine A
  "Power": "P", "Repower": "R", "Scalper": "S", "Stopper": "ST", "STO": "STO", "SCA": "SCA", "RPO": "RPO",
  // Engine B
  "BPower": "BP", "BRepower": "BR", "BScalper": "BS", "BStopper": "BST", "BSTO": "BSTO", "BSCA": "BSCA", "BRPO": "BRPO",
  // Engine C
  "CPower": "CP", "CRepower": "CR", "CScalper": "CS", "CStopper": "CST", "CSTO": "CSTO", "CSCA": "CSCA", "CRPO": "CRPO"
};

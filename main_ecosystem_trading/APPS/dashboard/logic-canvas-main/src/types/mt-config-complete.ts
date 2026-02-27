// TypeScript types for MT4/MT5 configuration - COMPLETE 88 FIELDS PER LOGIC
// Matches MQL4 LogicConfig struct exactly

export type Platform = "MT4" | "MT5";

// Enums matching MQL4
export type TrailMethod = "Points" | "AVG_Percent" | "AVG_Points" | "Percent";
export type TrailStepMethod = "Step_Points" | "Step_Percent";
export type TrailStepMode = "TrailStepMode_Auto" | "TrailStepMode_Points" | "TrailStepMode_Percent" | "TrailStepMode_PerOrder" | "TrailStepMode_Disabled";
export type TPSLMode = "TPSL_Points" | "TPSL_Price" | "TPSL_Percent";
export type PartialMode = "PartialMode_Low" | "PartialMode_Mid" | "PartialMode_Aggressive" | "PartialMode_High" | "PartialMode_Balanced";
export type PartialBalance = "PartialBalance_Negative" | "PartialBalance_Balanced" | "PartialBalance_Profit" | "PartialBalance_Aggressive" | "PartialBalance_Conservative";
export type PartialTrigger = "PartialTrigger_Cycle" | "PartialTrigger_Profit" | "PartialTrigger_Time" | "PartialTrigger_Both";
export type TradeDirection = "B" | "S" | "Both";
export type CompoundingType = "Compound_Balance" | "Compound_Equity";
export type RestartPolicy = "Restart_Default" | "Restart_Cycle" | "Continue_Cycle" | "Stop_Trading";
export type BreakevenMode = "Breakeven_Disabled" | "Breakeven_Points" | "Breakeven_Percent" | "Breakeven_Price";
export type GridBehavior = "GridBehavior_CounterTrend" | "GridBehavior_TrendFollowing" | "GridBehavior_Disabled";
export type EntryTrigger = "Trigger_Immediate" | "Trigger_AfterBars" | "Trigger_AfterSeconds" | "Trigger_AfterPips" | "Trigger_TimeFilter" | "Trigger_NewsFilter";
export type LogicReference = 
  | "Logic_None"
  | "Logic_Power" | "Logic_Repower" | "Logic_Scalp" | "Logic_Stopper" | "Logic_STO" | "Logic_SCA" | "Logic_RPO"
  | "Logic_BPower" | "Logic_BRepower" | "Logic_BScalp" | "Logic_BStopper" | "Logic_BSTO" | "Logic_BSCA" | "Logic_BRPO"
  | "Logic_CPower" | "Logic_CRepower" | "Logic_CScalp" | "Logic_CStopper" | "Logic_CSTO" | "Logic_CSCA" | "Logic_CRPO";

// Trail Step Configuration (7 levels)
export interface TrailStepConfig {
  step: number;
  method: TrailStepMethod;
  cycle: number;
  balance: number;
  mode: TrailStepMode;
}

// Partial Close Configuration (4 levels)
export interface PartialCloseConfig {
  enabled: boolean;
  cycle: number;
  mode: PartialMode;
  balance: PartialBalance;
  trailMode: TrailStepMode;
  trigger: PartialTrigger;
  profitThreshold: number;
  hours: number;
}

// COMPLETE LogicConfig - ALL 88 FIELDS matching MQL4 exactly
export interface LogicConfig {
  // === METADATA (3 fields) ===
  logic_name: string;
  logic_id: string;
  enabled: boolean;
  
  // === BASE CONTROLS (3 fields) ===
  allowBuy: boolean;
  allowSell: boolean;
  
  // === ORDER PARAMETERS (5 fields) - BASE VALUES ===
  initialLot: number;
  lastLot: number;
  multiplier: number;
  grid: number;
  gridBehavior: GridBehavior;
  
  // === ORDER PARAMETERS - BUY VALUES ===
  initialLotBuy?: number;
  lastLotBuy?: number;
  multiplierBuy?: number;
  gridBuy?: number;
  
  // === ORDER PARAMETERS - SELL VALUES ===
  initialLotSell?: number;
  lastLotSell?: number;
  multiplierSell?: number;
  gridSell?: number;
  
  // === TRAIL CONFIGURATION (4 fields) - BASE VALUES ===
  trailMethod: TrailMethod;
  trailValue: number;
  trailStart: number;
  trailStep: number; // Legacy, also sets trailSteps[0].step
  
  // === TRAIL CONFIGURATION - BUY VALUES ===
  trailValueBuy?: number;
  trailStartBuy?: number;
  trailStepBuy?: number;
  
  // === TRAIL CONFIGURATION - SELL VALUES ===
  trailValueSell?: number;
  trailStartSell?: number;
  trailStepSell?: number;
  
  // === TRAIL STEPS - 7 LEVELS (7 × 5 = 35 fields) ===
  trailSteps: TrailStepConfig[]; // Array of 7
  
  // === PARTIAL CLOSE - 4 LEVELS (4 × 8 = 32 fields) ===
  partials: PartialCloseConfig[]; // Array of 4
  
  // === TP/SL SETTINGS (6 fields) ===
  useTP: boolean;
  takeProfit: number;
  tpMode: TPSLMode;
  useSL: boolean;
  stopLoss: number;
  slMode: TPSLMode;
  
  // === BREAK-EVEN SETTINGS (4 fields) ===
  breakEvenMode: BreakevenMode;
  breakEvenActivation: number;
  breakEvenLock: number;
  breakEvenTrail: boolean;
  
  // === PROFIT TRAIL SETTINGS (5 fields) ===
  profitTrailEnabled: boolean;
  profitTrailPeakDropPercent: number;
  profitTrailLockPercent: number;
  profitTrailCloseOnTrigger: boolean;
  profitTrailUseBreakEven: boolean;
  
  // === TRIGGER SETTINGS (4 fields) ===
  triggerType: EntryTrigger;
  triggerBars: number;
  triggerMinutes: number;
  triggerPips: number;
  
  // === CROSS-LOGIC REFERENCES (8 fields) ===
  reverseReference: LogicReference;
  hedgeReference: LogicReference;
  orderCountReferenceLogic: LogicReference;
  reverseScale: number;
  hedgeScale: number;
  reverseEnabled: boolean;
  hedgeEnabled: boolean;
  closeTargets: string;
  
  // === ENGINE-SPECIFIC SETTINGS (4 fields) ===
  maxOrderCap: number;
  startLevel: number;
  resetLotOnRestart: boolean;
  restartPolicy: RestartPolicy;
}

// Group-level configuration
export interface GroupConfig {
  group_number: number;
  enabled: boolean;
  group_power_start?: number;
  reverse_mode: boolean;
  hedge_mode: boolean;
  hedge_reference: LogicReference;
  entry_delay_bars: number;
  logics: LogicConfig[];
}

// Engine configuration
export interface EngineConfig {
  engine_id: "A" | "B" | "C";
  engine_name: string;
  max_power_orders: number;
  groups: GroupConfig[];
}

// Session configuration
export interface SessionConfig {
  enabled: boolean;
  day: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  action: string;
}

// Risk configuration
export interface RiskConfig {
  maxDailyLoss: number;
  maxWeeklyLoss: number;
  maxMonthlyLoss: number;
  maxDrawdownPercent: number;
  maxLotSize: number;
  maxTotalOrders: number;
  stopMode: string;
  action: string;
}

// Global EA configuration
export interface GlobalConfig {
  // Magic numbers
  baseMagicNumber: number;
  magicNumberBuy: number;
  magicNumberSell: number;
  maxSlippage: number;
  
  // Feature toggles
  enableLogs: boolean;
  enableReverseMode: boolean;
  enableHedgeMode: boolean;
  useCompounding: boolean;
  allowBuy: boolean;
  allowSell: boolean;
  compoundingType: CompoundingType;
  gridUnit: number;
  pipFactor: number;
  groupMode: number;
  groupPowerStart: number[][]; // [engine][group]
  groupReverseMode: boolean[];
  groupHedgeMode: boolean[];
  groupHedgeReference: LogicReference[];
  groupEntryDelayBars: number[];
  
  // Session filters
  sessions: SessionConfig[];
  sessionFilterEnabled: boolean;
  newsFilterEnabled: boolean;
  sessionOverridesNews: boolean;
  newsOverridesSession: boolean;
  newsCountries: string;
  newsImpactLevel: number;
  newsMinutesBefore: number;
  newsMinutesAfter: number;
  newsAction: string;
  newsCalendarFile: string;
  
  // Risk limits
  risk: RiskConfig;
  
  // UI settings
  showUI: boolean;
  showTrailLines: boolean;
  colorBuy: string;
  colorSell: string;
  
  // License
  licenseKey: string;
  licenseServer: string;
  requireLicense: boolean;
  
  // Debug
  debugMode: boolean;
  verboseLogging: boolean;
  logProfile: number;
}

// Main MT Configuration (internal/complete schema used by setfile tooling)
export interface MTConfigComplete {
  version: string;
  platform: Platform;
  timestamp: string;
  total_inputs: number;
  last_saved_at?: string;
  last_saved_platform?: Platform;
  current_set_name?: string;
  tags?: string[];
  comments?: string;
  global: GlobalConfig;
  engines: EngineConfig[];
}

// Logic suffix mapping for setfile keys - v19 format: gInput_{Group}_{Engine}{Logic}_{Direction}_{Param}
export const LOGIC_SUFFIX_MAP: Record<string, { suffix: string; engine: number; logic: number }> = {
  // Engine A (Engine prefix empty)
  "Power": { suffix: "AP", engine: 0, logic: 0 },
  "Repower": { suffix: "AR", engine: 0, logic: 1 },
  "Scalp": { suffix: "AS", engine: 0, logic: 2 },
  "Stopper": { suffix: "AT", engine: 0, logic: 3 },
  "STO": { suffix: "AO", engine: 0, logic: 4 },
  "SCA": { suffix: "AC", engine: 0, logic: 5 },
  "RPO": { suffix: "AX", engine: 0, logic: 6 },
  // Engine B (Engine prefix = B)
  "BPower": { suffix: "BP", engine: 1, logic: 0 },
  "BRepower": { suffix: "BR", engine: 1, logic: 1 },
  "BScalp": { suffix: "BS", engine: 1, logic: 2 },
  "BStopper": { suffix: "BT", engine: 1, logic: 3 },
  "BSTO": { suffix: "BO", engine: 1, logic: 4 },
  "BSCA": { suffix: "BC", engine: 1, logic: 5 },
  "BRPO": { suffix: "BX", engine: 1, logic: 6 },
  // Engine C (Engine prefix = C)
  "CPower": { suffix: "CP", engine: 2, logic: 0 },
  "CRepower": { suffix: "CR", engine: 2, logic: 1 },
  "CScalp": { suffix: "CS", engine: 2, logic: 2 },
  "CStopper": { suffix: "CT", engine: 2, logic: 3 },
  "CSTO": { suffix: "CO", engine: 2, logic: 4 },
  "CSCA": { suffix: "CC", engine: 2, logic: 5 },
  "CRPO": { suffix: "CX", engine: 2, logic: 6 },
};

// MASSIVE v19 setfile validator baseline:
// - test_13.set verified: 110 fields per logic-direction across all 630 logic-directions
export const FIELDS_PER_LOGIC = 110;
export const LOGICS_PER_ENGINE = 7;
export const ENGINES = 3;
export const GROUPS = 15;
export const DIRECTIONS = 2;
export const TOTAL_LOGIC_DIRECTIONS = GROUPS * ENGINES * LOGICS_PER_ENGINE * DIRECTIONS; // 630
export const TOTAL_LOGIC_INPUTS = TOTAL_LOGIC_DIRECTIONS * FIELDS_PER_LOGIC; // 69,300
export const TOTAL_GENERAL_INPUTS = 100; // Approximate; validate from exported .set
export const TOTAL_INPUTS = TOTAL_LOGIC_INPUTS + TOTAL_GENERAL_INPUTS; // ~69,400

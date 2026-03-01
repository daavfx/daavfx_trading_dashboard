// SetFile Exporter - Exports to MQL4 .set format
// Matches Loader.mqh key format exactly

import type { MTConfigComplete, LogicConfig, TrailStepConfig, PartialCloseConfig, GlobalConfig } from "@/types/mt-config-complete";
import { LOGIC_SUFFIX_MAP } from "@/types/mt-config-complete";

// Key formatting helpers - v19 format: gInput_{Group}_{Engine}{Logic}_{Direction}_{Param}
function formatKey(param: string, suffix: string, group: number, direction?: "B" | "S"): string {
  // v19 format: gInput_1_AP_Buy_InitialLot
  // suffix is like "AP", "BP", "CR", etc.
  const dir = direction ? (direction === "B" ? "Buy" : "Sell") : "";
  if (direction) {
    return `gInput_${group}_${suffix}_${dir}_${param}`;
  }
  return `gInput_${group}_${suffix}_${param}`;
}

function formatGlobalKey(param: string): string {
  return `gInput_${param}`;
}

function formatGroupKey(group: number, param: string): string {
  return `gInput_Group${group}${param}`;
}

function formatSessionKey(session: number, param: string): string {
  return `gInput_Session${session}${param}`;
}

// Value formatting
function formatValue(val: any): string {
  if (typeof val === "boolean") return val ? "1" : "0";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return val;
  return String(val);
}

// Trail method to number
function trailMethodToInt(method: string): number {
  switch (method) {
    case "Trail_Points":
    case "Points":
      return 0;
    case "Trail_AVG_Percent":
    case "AVG_Percent":
      return 1;
    default:
      return 0;
  }
}

// Trail step method to number
function trailStepMethodToInt(method: string): number {
  switch (method) {
    case "Step_Points": return 0;
    case "Step_Percent": return 1;
    default: return 0;
  }
}

// Trail step mode to number
function trailStepModeToInt(mode: string): number {
  switch (mode) {
    case "TrailStepMode_Auto": return 0;
    case "TrailStepMode_Fixed":
    case "TrailStepMode_Points": return 1;
    case "TrailStepMode_Percent": return 1;
    case "TrailStepMode_PerOrder": return 3;
    default: return 0;
  }
}

// TP/SL mode to number
function tpslModeToInt(mode: string): number {
  switch (mode) {
    case "TPSL_Points": return 0;
    case "TPSL_Price": return 1;
    case "TPSL_Percent": return 2;
    default: return 0;
  }
}

// Partial mode to number
function partialModeToInt(mode: string): number {
  switch (mode) {
    case "PartialMode_Low": return 0;
    case "PartialMode_Mid": return 1;
    case "PartialMode_Aggressive": return 2;
    // Legacy aliases normalize into active canonical values.
    case "PartialMode_High": return 2;
    case "PartialMode_Balanced": return 1;
    default: return 1;
  }
}

// Partial balance to number
function partialBalanceToInt(balance: string): number {
  switch (balance) {
    case "PartialBalance_Negative": return 0;
    case "PartialBalance_Balanced": return 1;
    case "PartialBalance_Profit": return 2;
    case "PartialBalance_Aggressive": return 3;
    case "PartialBalance_Conservative": return 4;
    default: return 1;
  }
}

// Partial trigger to number
function partialTriggerToInt(trigger: string): number {
  switch (trigger) {
    case "PartialTrigger_Cycle": return 0;
    case "PartialTrigger_Profit": return 1;
    case "PartialTrigger_Time": return 2;
    case "PartialTrigger_Both": return 3;
    default: return 0;
  }
}

// News action to number
function newsActionToInt(action: string): number {
  switch (action) {
    case "TriggerAction_None": return 0;
    case "TriggerAction_StopEA": return 1;
    case "TriggerAction_StopEA_KeepTrades": return 2;
    case "TriggerAction_CloseAll": return 3;
    case "TriggerAction_KeepEA_CloseTrades": return 4;
    case "TriggerAction_StopEA_CloseTrades": return 5;
    case "TriggerAction_PauseEA_CloseTrades": return 6;
    case "TriggerAction_PauseEA_KeepTrades": return 7;
    default: return 2; // Default to StopEA_KeepTrades
  }
}

// Entry trigger to number
function entryTriggerToInt(trigger: string): number {
  switch (trigger) {
    case "Trigger_Immediate": return 0;
    case "Trigger_AfterBars": return 1;
    case "Trigger_AfterSeconds": return 2;
    case "Trigger_AfterPips": return 3;
    case "Trigger_TimeFilter": return 4;
    case "Trigger_NewsFilter": return 5;
    default: return 0;
  }
}

// Logic reference to string
function logicReferenceToString(ref: string): string {
  return ref.replace("Logic_", "");
}

// Grid behavior to number
function gridBehaviorToInt(behavior: string): number {
  switch (behavior) {
    case "GridBehavior_CounterTrend": return 0;
    case "GridBehavior_TrendFollowing": return 1;
    case "GridBehavior_Disabled": return 2;
    default: return 0;
  }
}

// Restart policy to number
function restartPolicyToInt(policy: string): number {
  switch (policy) {
    case "Restart_Default": return 0;
    case "Restart_Cycle": return 1;
    case "Continue_Cycle": return 2;
    case "Stop_Trading": return 3;
    default: return 0;
  }
}

// Breakeven mode to number
function breakevenModeToInt(mode: string): number {
  switch (mode) {
    case "Breakeven_Disabled": return 0;
    case "Breakeven_Points": return 1;
    case "Breakeven_Percent": return 2;
    case "Breakeven_Price": return 3;
    default: return 0;
  }
}

// Resolve logic suffix based on engine and logic name
function getLogicSuffix(engineId: "A" | "B" | "C", logicName: string): string {
  // Normalize: "BPOWER" -> "BPower", "BREPOWER" -> "BRepower" etc.
  let normalizedLogic = logicName;
  if (engineId !== "A") {
    const prefix = engineId; // "B" or "C"
    // Check if already prefixed (e.g., "BPOWER") and convert to camelCase ("BPower")
    if (logicName.startsWith(prefix)) {
      // "BPOWER" -> "BPower", "BREPOWER" -> "BRepower"
      const rest = logicName.slice(1);
      normalizedLogic = prefix + rest.charAt(0).toUpperCase() + rest.slice(1).toLowerCase();
    }
  }
  const key = engineId === "A" ? normalizedLogic : (engineId + normalizedLogic);
  const mapped = (LOGIC_SUFFIX_MAP as any)[key];
  return mapped?.suffix || (LOGIC_SUFFIX_MAP[normalizedLogic]?.suffix ?? "AP");
}

// Export logic config to setfile entries
function exportLogicConfig(
  engineId: "A" | "B" | "C",
  engineMaxPower: number,
  logic: LogicConfig,
  group: number,
  entries: Map<string, string>
): void {
  const suffix = getLogicSuffix(engineId, logic.logic_name);
  const add = (direction: "B" | "S", param: string, value: any) => {
    const key = formatKey(param, suffix, group, direction);
    entries.set(key, formatValue(value));
  };

  const directions: Array<"B" | "S"> = [];
  if (logic.allowBuy) directions.push("B");
  if (logic.allowSell) directions.push("S");
  if (directions.length === 0) return;

  directions.forEach((direction) => {
    // Base controls (3 fields)
    add(direction, "Enabled", logic.enabled);
    if (direction === "B") add(direction, "AllowBuy", true);
    if (direction === "S") add(direction, "AllowSell", true);

    // Order params
    add(direction, "InitialLot", logic.initialLot);
    add(direction, "LastLotPower", logic.lastLot);
    add(direction, "LastLot", logic.lastLot);
    add(direction, "Mult", logic.multiplier);
    add(direction, "Grid", logic.grid);
    add(direction, "MaxPowerOrders", engineMaxPower);
    add(direction, "GridBehavior", gridBehaviorToInt(logic.gridBehavior));

    // Trail config
    add(direction, "Trail", trailMethodToInt(logic.trailMethod));
    add(direction, "TrailValue", logic.trailValue);
    add(direction, "TrailStart", logic.trailStart);
    add(direction, "TrailStep", logic.trailStep);

    // Trail steps - 7 levels
    const stepSuffixes = ["", "2", "3", "4", "5", "6", "7"];
    logic.trailSteps.forEach((step, idx) => {
      const s = stepSuffixes[idx];
      add(direction, `TrailStep${s}`, step.step);
      add(direction, `TrailStepMethod${s}`, trailStepMethodToInt(step.method));
      add(direction, `TrailStepCycle${s}`, step.cycle);
      add(direction, `TrailStepBalance${s}`, step.balance);
      add(direction, `TrailStepMode${s}`, trailStepModeToInt(step.mode));
    });

    // Partial close - 4 levels
    const partialSuffixes = ["", "2", "3", "4"];
    logic.partials.forEach((partial, idx) => {
      const s = partialSuffixes[idx];
      add(direction, `ClosePartial${s}`, partial.enabled);
      add(direction, `ClosePartialCycle${s}`, partial.cycle);
      add(direction, `ClosePartialMode${s}`, partialModeToInt(partial.mode));
      add(direction, `ClosePartialBalance${s}`, partialBalanceToInt(partial.balance));
      add(direction, `ClosePartialTrailMode${s}`, trailStepModeToInt(partial.trailMode));
      add(direction, `ClosePartialTrigger${s}`, partialTriggerToInt(partial.trigger));
      add(direction, `ClosePartialProfitThreshold${s}`, partial.profitThreshold);
      // Keep legacy alias used by existing setfiles.
      add(direction, `ClosePartialPercent${s}`, partial.profitThreshold);
      add(direction, `ClosePartialHours${s}`, partial.hours);
    });

    // TP/SL
    add(direction, "UseTP", logic.useTP);
    add(direction, "TPMode", tpslModeToInt(logic.tpMode));
    add(direction, "TPValue", logic.takeProfit);
    add(direction, "UseSL", logic.useSL);
    add(direction, "SLMode", tpslModeToInt(logic.slMode));
    add(direction, "SLValue", logic.stopLoss);

    // Break-even
    add(direction, "BreakEvenMode", breakevenModeToInt(logic.breakEvenMode));
    add(direction, "BreakEvenActivation", logic.breakEvenActivation);
    add(direction, "BreakEvenLock", logic.breakEvenLock);
    add(direction, "BreakEvenTrail", logic.breakEvenTrail);

    // Profit trail
    add(direction, "ProfitTrailEnabled", logic.profitTrailEnabled);
    add(direction, "ProfitTrailPeakDropPercent", logic.profitTrailPeakDropPercent);
    add(direction, "ProfitTrailLockPercent", logic.profitTrailLockPercent);
    add(direction, "ProfitTrailCloseOnTrigger", logic.profitTrailCloseOnTrigger);
    add(direction, "ProfitTrailUseBreakEven", logic.profitTrailUseBreakEven);

    // Triggers
    add(direction, "TriggerType", entryTriggerToInt(logic.triggerType));
    add(direction, "TriggerBars", logic.triggerBars);
    add(direction, "TriggerMinutes", logic.triggerMinutes);
    add(direction, "TriggerPips", logic.triggerPips);

    // Cross-logic
    add(direction, "ReverseEnabled", logic.reverseEnabled);
    add(direction, "ReverseReference", logicReferenceToString(logic.reverseReference));
    add(direction, "ReverseScale", logic.reverseScale);
    add(direction, "HedgeEnabled", logic.hedgeEnabled);
    add(direction, "HedgeReference", logicReferenceToString(logic.hedgeReference));
    add(direction, "HedgeScale", logic.hedgeScale);
    add(direction, "OrderCountReferenceLogic", logicReferenceToString(logic.orderCountReferenceLogic));
    add(direction, "CloseTargets", logic.closeTargets);

    // Engine-specific
    add(direction, "StartLevel", logic.startLevel);
    add(direction, "ResetLotOnRestart", logic.resetLotOnRestart);
    add(direction, "RestartPolicy", restartPolicyToInt(logic.restartPolicy));
  });
}

// Export global config
function exportGlobalConfig(global: GlobalConfig, entries: Map<string, string>): void {
  const add = (param: string, value: any) => {
    entries.set(formatGlobalKey(param), formatValue(value));
  };

  // Core global settings
  add("MagicNumber", global.baseMagicNumber);
  add("MagicNumberBuy", global.magicNumberBuy);
  add("MagicNumberSell", global.magicNumberSell);
  add("MaxSlippage", global.maxSlippage);
  add("EnableLogs", global.enableLogs);
  add("AllowBuy", global.allowBuy);
  add("AllowSell", global.allowSell);
  add("EnableReverseMode", global.enableReverseMode);
  add("EnableHedgeMode", global.enableHedgeMode);
  add("UseCompounding", global.useCompounding);
  add("CompoundingType", global.compoundingType === "Compound_Balance" ? 0 : 1);
  add("GridUnit", global.gridUnit);
  add("PipFactor", global.pipFactor);

  // Session filters
  add("SessionFilterEnabled", global.sessionFilterEnabled);
  add("NewsFilterEnabled", global.newsFilterEnabled);
  add("SessionOverridesNews", global.sessionOverridesNews);
  add("NewsOverridesSession", global.newsOverridesSession);
  add("NewsFilterCountries", global.newsCountries);
  add("NewsImpactLevel", global.newsImpactLevel);
  add("MinutesBeforeNews", global.newsMinutesBefore);
  add("MinutesAfterNews", global.newsMinutesAfter);
  add("NewsAction", newsActionToInt(global.newsAction));
  add("NewsCalendarFile", global.newsCalendarFile);

  // Risk management
  add("MaxDailyLoss", global.risk.maxDailyLoss);
  add("MaxWeeklyLoss", global.risk.maxWeeklyLoss);
  add("MaxMonthlyLoss", global.risk.maxMonthlyLoss);
  add("MaxDrawdown", global.risk.maxDrawdownPercent);
  add("MaxDrawdownPercent", global.risk.maxDrawdownPercent);
  add("MaxLotSize", global.risk.maxLotSize);
  add("MaxOrders", global.risk.maxTotalOrders);
  add("MaxTotalOrders", global.risk.maxTotalOrders);
  add("RiskStopMode", global.risk.stopMode === "Stop_ByPercent" ? 0 : 1);
  add("RiskAction", global.risk.action);

  // UI settings
  add("ShowUI", global.showUI);
  add("ShowTrailLines", global.showTrailLines);

  // License
  add("RequireLicense", global.requireLicense);
  add("LicenseKey", global.licenseKey);
  add("LicenseServer", global.licenseServer);

  // Debug
  add("DebugMode", global.debugMode);
  add("VerboseLogging", global.verboseLogging);
  add("LogProfile", global.logProfile);

  // Sessions
  global.sessions.forEach((session, idx) => {
    if (idx < 10) {
      add(`Session${idx + 1}Enabled`, session.enabled);
      add(`Session${idx + 1}Day`, session.day);
      add(`Session${idx + 1}StartHour`, session.startHour);
      add(`Session${idx + 1}StartMinute`, session.startMinute);
      add(`Session${idx + 1}EndHour`, session.endHour);
      add(`Session${idx + 1}EndMinute`, session.endMinute);
      add(`Session${idx + 1}Action`, session.action);
    }
  });

  // Group-level settings
  for (let g = 1; g <= 15; g++) {
    add(`Group${g}ReverseMode`, global.groupReverseMode[g] || false);
    add(`Group${g}HedgeMode`, global.groupHedgeMode[g] || false);
    add(`Group${g}HedgeReference`, logicReferenceToString(global.groupHedgeReference[g] || "Logic_None"));
    add(`Group${g}EntryDelayBars`, global.groupEntryDelayBars[g] || 0);

    // Group power start for engines
    add(`GroupPowerStart_P${g}`, global.groupPowerStart[0][g] || 0);
    add(`GroupPowerStart_BP${g}`, global.groupPowerStart[1][g] || 0);
    add(`GroupPowerStart_CP${g}`, global.groupPowerStart[2][g] || 0);
  }
}

// Main export function
export function exportToSetFile(config: MTConfigComplete): string {
  const entries = new Map<string, string>();

  // Export global config
  exportGlobalConfig(config.global, entries);

  // Export all engines, groups, and logics with directional separation
  config.engines.forEach(engine => {
    engine.groups.forEach(group => {
      group.logics.forEach(logic => {
        // Export direction-aware full schema
        exportLogicConfig(engine.engine_id, engine.max_power_orders, logic, group.group_number, entries);
      });
    });
  });

  // Generate setfile content
  let content = `; DAAVILEFX MASSIVE CONFIG v${config.version}\n`;
  content += `; Generated: ${config.timestamp}\n`;
  content += `; Total Inputs: ${entries.size.toLocaleString()}\n`;
  content += `; Structure: 15 Groups x 3 Engines x 7 Logics x 2 Directions (Buy/Sell)\n`;
  content += `; Directional Format: gInput_1_AP_Buy_InitialLot, gInput_1_AP_Sell_InitialLot\n`;
  content += `; ============================================\n\n`;

  // Sort keys alphabetically for consistent output
  const sortedKeys = Array.from(entries.keys()).sort();
  sortedKeys.forEach(key => {
    content += `${key}=${entries.get(key)}\n`;
  });

  return content;
}

// Export with directional separation (BUY/SELL)
export function exportToSetFileWithDirections(config: MTConfigComplete): string {
  const entries = new Map<string, string>();

  // Export global config
  exportGlobalConfig(config.global, entries);

  // Export all engines, groups, and logics with directional separation
  config.engines.forEach(engine => {
    engine.groups.forEach(group => {
      group.logics.forEach(logic => {
        // Export direction-aware full schema
        exportLogicConfig(engine.engine_id, engine.max_power_orders, logic, group.group_number, entries);
      });
    });
  });

  // Generate setfile content
  let content = `; DAAVILEFX MASSIVE CONFIG v${config.version}\n`;
  content += `; Generated: ${config.timestamp}\n`;
  content += `; Total Inputs: ${entries.size.toLocaleString()}\n`;
  content += `; Structure: 15 Groups x 3 Engines x 7 Logics x 2 Directions\n`;
  content += `; ============================================\n\n`;

  // Sort keys alphabetically
  const sortedKeys = Array.from(entries.keys()).sort();
  sortedKeys.forEach(key => {
    content += `${key}=${entries.get(key)}\n`;
  });

  return content;
}

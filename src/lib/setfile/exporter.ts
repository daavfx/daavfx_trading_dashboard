// SetFile Exporter - Exports to MQL4 .set format
// Matches Loader.mqh key format exactly

import type { MTConfig, LogicConfig, TrailStepConfig, PartialCloseConfig, GlobalConfig } from "@/types/mt-config-complete";
import { LOGIC_SUFFIX_MAP } from "@/types/mt-config-complete";

// Key formatting helpers
function formatKey(param: string, suffix: string, group: number, direction?: "B" | "S"): string {
  const base = `${param}_${suffix}${group}`;
  return direction ? `${base}_${direction}` : base;
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
    case "Trail_Points": return 0;
    case "Trail_AVG_Percent": return 1;
    case "Trail_Profit_Percent": return 2;
    default: return 0;
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
    case "TrailStepMode_Points": return 1;
    case "TrailStepMode_Percent": return 2;
    case "TrailStepMode_PerOrder": return 3;
    case "TrailStepMode_Disabled": return 4;
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
    case "PartialMode_High": return 3;
    case "PartialMode_Balanced": return 4;
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

// Export logic config to setfile entries
function exportLogicConfig(
  logic: LogicConfig,
  group: number,
  suffix: string,
  entries: Map<string, string>
): void {
  const logicType = LOGIC_SUFFIX_MAP[logic.logic_name];
  if (!logicType) return;

  // Helper to add entry
  const add = (param: string, value: any, direction?: "B" | "S") => {
    const key = formatKey(param, suffix, group, direction);
    entries.set(key, formatValue(value));
  };

  // Base controls (3 fields)
  add("Start", logic.enabled);
  add("AllowBuy", logic.allowBuy);
  add("AllowSell", logic.allowSell);

  // Order params (5 fields)
  add("Initial_loT", logic.initialLot);
  add("LastLot", logic.lastLot);
  add("Mult", logic.multiplier);
  add("Grid", logic.grid);
  add("GridBehavior", gridBehaviorToInt(logic.gridBehavior));

  // Trail config (4 fields)
  add("Trail", trailMethodToInt(logic.trailMethod));
  add("TrailValue", logic.trailValue);
  add("Trail_Start", logic.trailStart);
  add("TrailStep", logic.trailStep);

  // Trail steps - 7 levels (35 fields)
  const stepSuffixes = ["", "2", "3", "4", "5", "6", "7"];
  logic.trailSteps.forEach((step, idx) => {
    const s = stepSuffixes[idx];
    add(`TrailStep${s}`, step.step);
    add(`TrailStepMethod${s}`, trailStepMethodToInt(step.method));
    add(`TrailStepMode${s}`, trailStepModeToInt(step.mode));
    add(`TrailStepCycle${s}`, step.cycle);
    add(`TrailStepBalance${s}`, step.balance);
  });

  // Partial close - 4 levels (32 fields)
  const partialSuffixes = ["", "2", "3", "4"];
  logic.partials.forEach((partial, idx) => {
    const s = partialSuffixes[idx];
    add(`ClosePartial${s}`, partial.enabled);
    add(`ClosePartialCycle${s}`, partial.cycle);
    add(`ClosePartialMode${s}`, partialModeToInt(partial.mode));
    add(`ClosePartialBalance${s}`, partialBalanceToInt(partial.balance));
    // Note: trailMode, trigger, profitThreshold, hours not in standard setfile format
    // but we can add them if Loader supports them
  });

  // TP/SL (6 fields)
  add("UseTP", logic.useTP);
  add("TPMode", tpslModeToInt(logic.tpMode));
  add("TPValue", logic.takeProfit);
  add("UseSL", logic.useSL);
  add("SLMode", tpslModeToInt(logic.slMode));
  add("SLValue", logic.stopLoss);

  // Break-even (4 fields)
  add("BreakEvenMode", breakevenModeToInt(logic.breakEvenMode));
  add("BreakEvenActivation", logic.breakEvenActivation);
  add("BreakEvenLock", logic.breakEvenLock);
  add("BreakEvenTrail", logic.breakEvenTrail);

  // Profit trail (5 fields)
  add("ProfitTrailEnabled", logic.profitTrailEnabled);
  add("ProfitTrailPeakDropPercent", logic.profitTrailPeakDropPercent);
  add("ProfitTrailLockPercent", logic.profitTrailLockPercent);
  add("ProfitTrailCloseOnTrigger", logic.profitTrailCloseOnTrigger);
  add("ProfitTrailUseBreakEven", logic.profitTrailUseBreakEven);

  // Triggers (4 fields) - only for Group 1
  if (group === 1) {
    add("G1_TriggerType", entryTriggerToInt(logic.triggerType));
    add("G1_TriggerBars", logic.triggerBars);
    add("G1_TriggerMinutes", logic.triggerMinutes);
    add("G1_TriggerPips", logic.triggerPips);
  }

  // Cross-logic (8 fields)
  add("ReverseEnabled", logic.reverseEnabled);
  add("ReverseReference", logicReferenceToString(logic.reverseReference));
  add("ReverseScale", logic.reverseScale);
  add("HedgeEnabled", logic.hedgeEnabled);
  add("HedgeReference", logicReferenceToString(logic.hedgeReference));
  add("HedgeScale", logic.hedgeScale);
  add("OrderCountReference", logicReferenceToString(logic.orderCountReferenceLogic));
  add("CloseTargets", logic.closeTargets);

  // Engine-specific (4 fields)
  add("MaxPowerOrders", logic.orderCountReference);
  if (!logic.logic_name.includes("Power")) {
    add("StartLevel", logic.startLevel);
    add("LastLotPower", logic.lastLot);
  }
  add("ResetLotOnRestart", logic.resetLotOnRestart);
  add("RestartPolicy", restartPolicyToInt(logic.restartPolicy));
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
  add("GroupMode", global.groupMode);
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
  add("NewsAction", global.newsAction);
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
export function exportToSetFile(config: MTConfig): string {
  const entries = new Map<string, string>();

  // Export global config
  exportGlobalConfig(config.global, entries);

  // Export all engines, groups, and logics
  config.engines.forEach(engine => {
    engine.groups.forEach(group => {
      group.logics.forEach(logic => {
        const logicType = LOGIC_SUFFIX_MAP[logic.logic_name];
        if (logicType) {
          exportLogicConfig(logic, group.group_number, logicType.suffix, entries);
        }
      });
    });
  });

  // Generate setfile content
  let content = `; DAAVILEFX MASSIVE CONFIG v${config.version}\n`;
  content += `; Generated: ${config.timestamp}\n`;
  content += `; Total Inputs: ${entries.size.toLocaleString()}\n`;
  content += `; Structure: 15 Groups x 3 Engines x 7 Logics x 2 Directions\n`;
  content += `; ============================================\n\n`;

  // Sort keys alphabetically for consistent output
  const sortedKeys = Array.from(entries.keys()).sort();
  sortedKeys.forEach(key => {
    content += `${key}=${entries.get(key)}\n`;
  });

  return content;
}

// Export with directional separation (BUY/SELL)
export function exportToSetFileWithDirections(config: MTConfig): string {
  const entries = new Map<string, string>();

  // Export global config
  exportGlobalConfig(config.global, entries);

  // Export all engines, groups, and logics with directional separation
  config.engines.forEach(engine => {
    engine.groups.forEach(group => {
      group.logics.forEach(logic => {
        const logicType = LOGIC_SUFFIX_MAP[logic.logic_name];
        if (logicType) {
          // Export BUY direction
          exportLogicConfig(logic, group.group_number, logicType.suffix, entries);
          
          // Export SELL direction (duplicate for now, but could have different values)
          // We'll add _S suffix entries for SELL-specific values
          const addSell = (param: string, value: any) => {
            const key = formatKey(param, logicType.suffix, group.group_number, "S");
            entries.set(key, formatValue(value));
          };
          
          // Add SELL-specific values (can be customized)
          addSell("Initial_loT", logic.initialLot);
          addSell("Mult", logic.multiplier);
          addSell("Grid", logic.grid);
          addSell("TrailValue", logic.trailValue);
          addSell("TrailStep", logic.trailStep);
        }
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

/**
 * @deprecated ARCHIVED 2025-02-18
 * This is an OLD duplicate of src/lib/config/generateMassiveConfig.ts
 * It generates 55,500 inputs (88 fields) but current standard is 69,930 (111 fields)
 * Use src/lib/config/generateMassiveConfig.ts instead
 * Archived in: _archive/deprecated_2025-02-18/
 */

// Complete Massive Setfile Generator - 55,500+ inputs (DEPRECATED - use generateMassiveConfig.ts instead)
// Matches MQL4 Loader.mqh format exactly

import type {
  MTConfigComplete, 
  LogicConfig, 
  TrailStepConfig, 
  PartialCloseConfig,
  TrailMethod,
  TrailStepMethod,
  TrailStepMode,
  TPSLMode,
  PartialMode,
  PartialBalance,
  PartialTrigger,
  EntryTrigger,
  LogicReference,
  RestartPolicy,
  BreakevenMode,
  GridBehavior,
  GlobalConfig,
  GroupConfig,
  EngineConfig,
  SessionConfig,
  RiskConfig
} from "@/types/mt-config-complete";
import { LOGIC_SUFFIX_MAP, TOTAL_INPUTS } from "@/types/mt-config-complete";

// Generate default trail step config
function createDefaultTrailStep(step: number = 5): TrailStepConfig {
  return {
    step,
    method: "Step_Points",
    cycle: 0,
    balance: 0,
    mode: "TrailStepMode_Auto"
  };
}

// Generate default partial close config
function createDefaultPartial(): PartialCloseConfig {
  return {
    enabled: false,
    cycle: 0,
    mode: "PartialMode_Mid",
    balance: "PartialBalance_Balanced",
    trailMode: "TrailStepMode_Auto",
    trigger: "PartialTrigger_Cycle",
    profitThreshold: 0,
    hours: 0
  };
}

// Generate default logic config with all 88 fields
function createDefaultLogicConfig(logicName: string, groupNum: number, isPower: boolean): LogicConfig {
  // Generate trail steps with variations
  const trailSteps: TrailStepConfig[] = [];
  for (let i = 0; i < 7; i++) {
    trailSteps.push({
      step: i === 0 ? 5 : 0,
      method: "Step_Points",
      cycle: 0,
      balance: 0,
      mode: "TrailStepMode_Auto"
    });
  }

  // Generate partial closes
  const partials: PartialCloseConfig[] = [];
  for (let i = 0; i < 4; i++) {
    partials.push(createDefaultPartial());
  }

  return {
    // Metadata
    logic_name: logicName,
    logic_id: `${logicName}_G${groupNum}`,
    enabled: groupNum === 1, // Only enable Group 1 by default
    
    // Base controls
    allowBuy: true,
    allowSell: true,
    
    // Order params
    initialLot: 0.01,
    lastLot: 0.0,
    multiplier: 1.0,
    grid: 10.0,
    gridBehavior: "GridBehavior_CounterTrend",
    
    // Trail config
    trailMethod: "Trail_Points",
    trailValue: 5.0,
    trailStart: 0.0,
    trailStep: 5.0,
    
    // Trail steps (35 fields)
    trailSteps,
    
     // Partials (32 fields)
     partials,
     
     // TP/SL - Dummy/Backup
     useTP: false,
     takeProfit: 0.0,
     tpMode: "TPSL_Points",
     useSL: false,
     stopLoss: 0.0,
     slMode: "TPSL_Points",
     
      // Break-even
    breakEvenMode: "Breakeven_Disabled",
    breakEvenActivation: 0.0,
    breakEvenLock: 0.0,
    breakEvenTrail: false,
    
    // Profit trail
    profitTrailEnabled: false,
    profitTrailPeakDropPercent: 20.0,
    profitTrailLockPercent: 50.0,
    profitTrailCloseOnTrigger: false,
    profitTrailUseBreakEven: false,
    
    // Triggers
    triggerType: "Trigger_Immediate",
    triggerBars: 0,
    triggerMinutes: 0,
    triggerPips: 0.0,
    
    // Cross-logic
    reverseReference: "Logic_None",
    hedgeReference: "Logic_None",
    orderCountReferenceLogic: "Logic_None",
    reverseScale: 1.0,
    hedgeScale: 1.0,
    reverseEnabled: false,
    hedgeEnabled: false,
    closeTargets: "",
    
    // Engine-specific (Power doesn't have startLevel)
    maxOrderCap: 0,
    startLevel: isPower ? 0 : 1,
    resetLotOnRestart: false,
    restartPolicy: "Restart_Default"
  };
}

// Generate complete logic config with variations
function generateLogicConfig(
  logicName: string, 
  groupNum: number, 
  engineIdx: number, 
  logicIdx: number,
  isPower: boolean
): LogicConfig {
  const base = createDefaultLogicConfig(logicName, groupNum, isPower);
  
  // Add variations based on group/engine/logic
  const variationSeed = (groupNum * 100) + (engineIdx * 10) + logicIdx;
  
  // Vary initial lot
  base.initialLot = 0.01 + (variationSeed % 10) * 0.01;
  
  // Vary multiplier
  base.multiplier = 1.0 + (variationSeed % 5) * 0.5;
  
  // Vary grid
  base.grid = 10.0 + (variationSeed % 20) * 5;
  
  // Vary trail
  base.trailValue = 5.0 + (variationSeed % 10) * 5;
  base.trailStart = (variationSeed % 5) * 10;
  base.trailStep = 5.0 + (variationSeed % 8) * 5;
  
  // Vary trail steps (35 fields)
  for (let i = 0; i < 7; i++) {
    base.trailSteps[i].step = base.trailStep + (i * 10) + (variationSeed % 20);
    base.trailSteps[i].cycle = i + 1;
    base.trailSteps[i].balance = (variationSeed + i) * 100;
    
    // Vary method
    const methods: TrailStepMethod[] = ["Step_Points", "Step_Percent"];
    base.trailSteps[i].method = methods[(variationSeed + i) % 2];
    
    // Vary mode
    const modes: TrailStepMode[] = [
      "TrailStepMode_Auto", 
      "TrailStepMode_Points", 
      "TrailStepMode_Percent",
      "TrailStepMode_PerOrder",
      "TrailStepMode_Disabled"
    ];
    base.trailSteps[i].mode = modes[(variationSeed + i) % 5];
  }
  
  // Vary partials (32 fields)
  for (let i = 0; i < 4; i++) {
    base.partials[i].enabled = (variationSeed + i) % 3 === 0;
    base.partials[i].cycle = 5 + (variationSeed + i) * 2;
    
    const modes: PartialMode[] = ["PartialMode_Low", "PartialMode_Mid", "PartialMode_Aggressive"];
    base.partials[i].mode = modes[(variationSeed + i) % 3];
    
    const balances: PartialBalance[] = ["PartialBalance_Negative", "PartialBalance_Balanced", "PartialBalance_Profit"];
    base.partials[i].balance = balances[(variationSeed + i) % 3];
    
    const triggers: PartialTrigger[] = ["PartialTrigger_Cycle", "PartialTrigger_Profit", "PartialTrigger_Time"];
    base.partials[i].trigger = triggers[(variationSeed + i) % 3];
    
    base.partials[i].profitThreshold = (variationSeed + i) * 10;
    base.partials[i].hours = (variationSeed + i) % 24;
  }
  
  // Vary TP/SL (dummy/backup settings)
  base.useTP = variationSeed % 2 === 0;
  base.takeProfit = 50.0 + (variationSeed % 20) * 10;
  base.useSL = variationSeed % 3 === 0;
  base.stopLoss = 30.0 + (variationSeed % 15) * 5;
  
   // Vary triggers
  if (groupNum === 1) {
    const triggers: EntryTrigger[] = [
      "Trigger_Immediate",
      "Trigger_AfterBars",
      "Trigger_AfterSeconds",
      "Trigger_AfterPips"
    ];
    base.triggerType = triggers[variationSeed % 4];
    base.triggerBars = 5 + (variationSeed % 10);
    base.triggerMinutes = 30 + (variationSeed % 30);
    base.triggerPips = 10.0 + (variationSeed % 20);
  }
  
  // Vary cross-logic
  base.reverseEnabled = variationSeed % 5 === 0;
  base.hedgeEnabled = variationSeed % 7 === 0;
  base.reverseScale = 50.0 + (variationSeed % 10) * 10;
  base.hedgeScale = 50.0 + (variationSeed % 8) * 10;
  
  // Vary engine settings
  base.orderCountReference = 10 + (variationSeed % 20);
  if (!isPower) {
    base.startLevel = 1 + (variationSeed % 5);
    base.lastLot = 0.01 + (variationSeed % 5) * 0.01;
  }
  base.resetLotOnRestart = variationSeed % 2 === 0;
  
  return base;
}

// Generate global config
function generateGlobalConfig(): GlobalConfig {
  const groupPowerStart: number[][] = [];
  for (let e = 0; e < 3; e++) {
    groupPowerStart[e] = [];
    for (let g = 0; g <= 15; g++) {
      groupPowerStart[e][g] = g >= 2 ? (g - 1) * 3 : 0;
    }
  }

  const sessions: SessionConfig[] = [];
  for (let i = 0; i < 10; i++) {
    sessions.push({
      enabled: i < 3,
      day: (i % 7),
      startHour: 0,
      startMinute: 0,
      endHour: 23,
      endMinute: 59,
      action: "TriggerAction_None"
    });
  }

  return {
    baseMagicNumber: 777,
    magicNumberBuy: 777,
    magicNumberSell: 1777,
    maxSlippage: 3,
    enableLogs: true,
    enableReverseMode: false,
    enableHedgeMode: false,
    useCompounding: false,
    allowBuy: true,
    allowSell: true,
    compoundingType: "Compound_Balance",
    gridUnit: 0,
    pipFactor: 0,
    groupMode: 0,
    groupPowerStart,
    groupReverseMode: Array(16).fill(false),
    groupHedgeMode: Array(16).fill(false),
    groupHedgeReference: Array(16).fill("Logic_None"),
    groupEntryDelayBars: Array(16).fill(0),
    sessions,
    sessionFilterEnabled: false,
    newsFilterEnabled: false,
    sessionOverridesNews: false,
    newsOverridesSession: false,
    newsCountries: "US,GB,EU",
    newsImpactLevel: 3,
    newsMinutesBefore: 15,
    newsMinutesAfter: 15,
    newsAction: "TriggerAction_StopEA_KeepTrades",
    newsCalendarFile: "DAAVFX_NEWS.csv",
    risk: {
      maxDailyLoss: 0,
      maxWeeklyLoss: 0,
      maxMonthlyLoss: 0,
      maxDrawdownPercent: 20,
      maxLotSize: 0,
      maxTotalOrders: 100,
      stopMode: "Stop_ByPercent",
      action: "TriggerAction_StopEA_KeepTrades"
    },
    showUI: true,
    showTrailLines: false,
    colorBuy: "clrGreen",
    colorSell: "clrRed",
    licenseKey: "",
    licenseServer: "",
    requireLicense: false,
    debugMode: false,
    verboseLogging: false,
    logProfile: 0
  };
}

// Generate complete massive config
export function generateMassiveCompleteConfig(): MTConfigComplete {
  const logicTypes = ["Power", "Repower", "Scalp", "Stopper", "STO", "SCA", "RPO"];
  const engines: Array<"A" | "B" | "C"> = ["A", "B", "C"];
  const directions: Array<"B" | "S"> = ["B", "S"];

  const generatedEngines: EngineConfig[] = engines.map((engineId, engineIdx) => {
    const groups: GroupConfig[] = [];

    for (let groupNum = 1; groupNum <= 15; groupNum++) {
      const logics: LogicConfig[] = [];
      logicTypes.forEach((logicType, logicIdx) => {
        const isPower = logicType === "Power";
        directions.forEach((dir) => {
          const base = generateLogicConfig(logicType, groupNum, engineIdx, logicIdx, isPower);
          base.logic_id = `${engineId}_${logicType}_${dir}_G${groupNum}`;
          base.allowBuy = dir === "B";
          base.allowSell = dir === "S";
          logics.push(base);
        });
      });

      groups.push({
        group_number: groupNum,
        enabled: true,
        group_power_start: groupNum === 1 ? undefined : (groupNum - 1) * 3,
        reverse_mode: false,
        hedge_mode: false,
        hedge_reference: "Logic_None",
        entry_delay_bars: 0,
        logics
      });
    }

    return {
      engine_id: engineId,
      engine_name: `Engine ${engineId}`,
      max_power_orders: 10,
      groups
    };
  });

  return {
    version: "18.0",
    platform: "MT4",
    timestamp: new Date().toISOString(),
    total_inputs: TOTAL_INPUTS,
    global: generateGlobalConfig(),
    engines: generatedEngines
  };
}

// Export to console for verification
export function printConfigStats(config: MTConfigComplete): void {
  console.log("=== MASSIVE CONFIG GENERATED ===");
  console.log(`Version: ${config.version}`);
  console.log(`Total Inputs: ${config.total_inputs.toLocaleString()}`);
  console.log(`Engines: ${config.engines.length}`);
  
  let totalLogics = 0;
  let totalGroups = 0;
  config.engines.forEach(engine => {
    totalGroups += engine.groups.length;
    engine.groups.forEach(group => {
      totalLogics += group.logics.length;
    });
  });
  
  console.log(`Total Groups: ${totalGroups}`);
  console.log(`Total Logics: ${totalLogics}`);
  console.log(`Logic-Directions: ${totalLogics * 2}`);
  console.log(`Fields per Logic: 88`);
  console.log(`Total Logic Inputs: ${(totalLogics * 2 * 88).toLocaleString()}`);
}

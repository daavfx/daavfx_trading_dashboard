// generateMassiveConfig.ts - Generates complete MQL4-compatible configuration
// Structure: 15 groups × 3 engines × 7 logics × 2 directions = 630 logic-directions
// Total inputs: ~69,930 (630 × 111 fields per logic-direction)

import type { MTConfig, Platform } from "@/types/mt-config";
import type {
  MTConfigComplete,
  GlobalConfig,
} from "@/types/mt-config-complete";

export interface GeneratedConfig {
  config: MTConfigComplete;
  stats: {
    totalLogicDirections: number;
    totalInputs: number;
    groups: number;
    engines: number;
    logics: number;
    directions: number;
  };
}

export function generateMassiveCompleteConfig(
  platform: Platform,
): GeneratedConfig {
  console.log(
    "[GENERATE] Creating massive setfile: 15 groups × 3 engines × 7 logics × 2 directions",
  );

  const logicTypes = [
    "Power",
    "Repower",
    "Scalper",
    "Stopper",
    "STO",
    "SCA",
    "RPO",
  ];
  const engines: Array<"A" | "B" | "C"> = ["A", "B", "C"];
  const directions: Array<"B" | "S"> = ["B", "S"]; // Buy and Sell

  const generatedEngines = engines.map((engineId, engineIndex) => {
    const engineName = `Engine ${engineId}`;
    const groups = [];

    for (let groupNum = 1; groupNum <= 15; groupNum++) {
      const groupLogics: any[] = [];

      // Generate 7 logics × 2 directions = 14 logic-directions per group
      logicTypes.forEach((logicType, logicIndex) => {
        directions.forEach((direction, dirIndex) => {
          const isPower = logicType === "Power";
          const isBuy = direction === "B";
          const logicDirectionId = `${engineId}_${logicType}_${direction}_G${groupNum}`;

          // Base configuration varies by direction
          const directionMultiplier = isBuy ? 1 : -1;

          const logicConfig: any = {
            // METADATA
            logic_name: logicType,
            logic_id: logicDirectionId,
            direction: direction, // B or S
            enabled: true,

            // BASE PARAMS - Direction aware
            initial_lot: 0.01 + logicIndex * 0.005,
            multiplier: 1.5 + logicIndex * 0.1,
            grid: 50 + logicIndex * 10 + groupNum * 5,

            // Trail configuration
            trail_method:
              logicIndex % 4 === 0
                ? "Points"
                : logicIndex % 4 === 1
                  ? "AVG_Percent"
                  : logicIndex % 4 === 2
                    ? "AVG_Points"
                    : "Percent",
            trail_value: 100 + logicIndex * 20,
            trail_start: 20 + logicIndex * 5,
            trail_step: 25 + logicIndex * 5,
            trail_step_method:
              logicIndex % 3 === 0
                ? "Step_Points"
                : logicIndex % 3 === 1
                  ? "Step_Percent"
                  : "Step_Pips",

            // LOGIC-SPECIFIC (Power has fewer fields)
            // Start level: 0 for A-Power, 4 for B-Power/C-Power (based on engine)
            // Engine IDs: A=0, B=1, C=2
            // Power logics: A-Power = 0, B-Power = 4, C-Power = 4
            // Non-Power logics: B/C engines = 4, others = calculated
            ...(isPower
              ? {
                  // Power logics: A=0, B/C=4
                  start_level: engineIndex > 0 ? 4 : 0,
                }
              : {
                  // Non-Power logics: default to 1 (start after 1 order from reference)
                  start_level: 1,
                  last_lot: 0.01 + logicIndex * 0.005,
                }),

            close_targets: `Logic_${engineId}_Power,Logic_${engineId}_Repower`,
            order_count_reference: `Logic_${engineId}_Power`,
            reset_lot_on_restart: logicIndex % 2 === 0,

            // TPSL - Direction aware
            use_tp: true,
            tp_mode: "TPSL_Points",
            tp_value: 200 + logicIndex * 50,
            use_sl: true,
            sl_mode: "TPSL_Points",
            sl_value: 100 + logicIndex * 25,

            // REVERSE/HEDGE
            reverse_enabled: logicIndex % 3 === 0,
            hedge_enabled: logicIndex % 3 === 1,
            reverse_scale: 100 + logicIndex * 10,
            hedge_scale: 50 + logicIndex * 5,
            reverse_reference: `Logic_${engineId}_Power`,
            hedge_reference: `Logic_${engineId}_Repower`,

            // TRAIL STEP ADVANCED (7 levels)
            trail_step_mode:
              logicIndex % 4 === 0
                ? "TrailStepMode_Auto"
                : logicIndex % 4 === 1
                  ? "TrailStepMode_Fixed"
                  : logicIndex % 4 === 2
                    ? "TrailStepMode_PerOrder"
                    : "TrailStepMode_Disabled",
            trail_step_cycle: 1 + (logicIndex % 5),
            trail_step_balance: 1000 + groupNum * 100,

            // Trail Steps 2-7
            trail_step_2: 150 + logicIndex * 25 + dirIndex * 10,
            trail_step_method_2:
              logicIndex % 2 === 0 ? "Step_Points" : "Step_Percent",
            trail_step_cycle_2: 2 + (logicIndex % 3),
            trail_step_balance_2: 1000 + groupNum * 100,
            trail_step_mode_2: "TrailStepMode_Auto",

            trail_step_3: 200 + logicIndex * 30 + dirIndex * 15,
            trail_step_method_3:
              logicIndex % 3 === 0 ? "Step_Points" : "Step_Percent",
            trail_step_cycle_3: 3 + (logicIndex % 2),
            trail_step_balance_3: 1500 + groupNum * 150,
            trail_step_mode_3: "TrailStepMode_Fixed",

            trail_step_4: 250 + logicIndex * 35 + dirIndex * 20,
            trail_step_method_4: "Step_Points",
            trail_step_cycle_4: 4 + (logicIndex % 2),
            trail_step_balance_4: 2000 + groupNum * 200,
            trail_step_mode_4: "TrailStepMode_PerOrder",

            trail_step_5: 300 + logicIndex * 40 + dirIndex * 25,
            trail_step_method_5: "Step_Percent",
            trail_step_cycle_5: 5,
            trail_step_balance_5: 2500 + groupNum * 250,
            trail_step_mode_5: "TrailStepMode_Disabled",

            trail_step_6: 350 + logicIndex * 45 + dirIndex * 30,
            trail_step_method_6: "Step_Points",
            trail_step_cycle_6: 6,
            trail_step_balance_6: 3000 + groupNum * 300,
            trail_step_mode_6: "TrailStepMode_Auto",

            trail_step_7: 400 + logicIndex * 50 + dirIndex * 35,
            trail_step_method_7: "Step_Percent",
            trail_step_cycle_7: 7,
            trail_step_balance_7: 3500 + groupNum * 350,
            trail_step_mode_7: "TrailStepMode_Fixed",

            // CLOSE PARTIAL
            close_partial: logicIndex % 2 === 0,
            close_partial_cycle: 5 + logicIndex * 3,
            close_partial_mode:
              logicIndex % 3 === 0
                ? "PartialMode_Low"
                : logicIndex % 3 === 1
                  ? "PartialMode_High"
                  : "PartialMode_Balanced",
            close_partial_balance:
              logicIndex % 3 === 0
                ? "PartialBalance_Aggressive"
                : logicIndex % 3 === 1
                  ? "PartialBalance_Conservative"
                  : "PartialBalance_Balanced",
            close_partial_trail_step_mode: "TrailStepMode_Auto",

            // Close Partial 2-4
            close_partial_2: logicIndex % 2 === 0,
            close_partial_cycle_2: 10 + logicIndex * 5,
            close_partial_mode_2:
              logicIndex % 3 === 0
                ? "PartialMode_Low"
                : logicIndex % 3 === 1
                  ? "PartialMode_High"
                  : "PartialMode_Balanced",
            close_partial_balance_2:
              logicIndex % 2 === 0
                ? "PartialBalance_Aggressive"
                : "PartialBalance_Conservative",

            close_partial_3: logicIndex % 3 === 0,
            close_partial_cycle_3: 15 + logicIndex * 7,
            close_partial_mode_3:
              logicIndex % 2 === 0 ? "PartialMode_High" : "PartialMode_Low",
            close_partial_balance_3: "PartialBalance_Balanced",

            close_partial_4: logicIndex % 2 === 0,
            close_partial_cycle_4: 20 + logicIndex * 10,
            close_partial_mode_4: "PartialMode_Balanced",
            close_partial_balance_4: "PartialBalance_Aggressive",

            // GROUP 1 ONLY fields (triggers)
            ...(groupNum === 1
              ? {
                  trigger_type: "Immediate",
                  trigger_bars: 10 + logicIndex * 5,
                  trigger_minutes: 30 + logicIndex * 15,
                  trigger_pips: 20 + logicIndex * 10,
                }
              : {}),
          };

          groupLogics.push(logicConfig);
        });
      });

      const group = {
        group_number: groupNum,
        enabled: true,
        group_power_start: groupNum === 1 ? undefined : (groupNum - 1) * 3,
        reverse_mode: groupNum % 3 === 0,
        hedge_mode: groupNum % 3 === 1,
        hedge_reference: `Logic_${engineId}_Power` as any,
        entry_delay_bars: groupNum % 5,
        logics: groupLogics,
      };

      groups.push(group);
    }

    return {
      engine_id: engineId,
      engine_name: engineName,
      max_power_orders: 10 + (engineId.charCodeAt(0) - 65) * 5,
      groups,
    };
  });

  // Calculate magic numbers: 3 engines × 7 logics × 2 directions = 42
  const magicNumbers: number[][] = [];
  const magicNumbersSell: number[][] = [];
  const baseMagic = 12345;

  engines.forEach((engineId, engineIdx) => {
    const engineBuyMagics: number[] = [];
    const engineSellMagics: number[] = [];

    logicTypes.forEach((logicType, logicIdx) => {
      // Buy magic numbers (even offsets)
      engineBuyMagics.push(baseMagic + engineIdx * 14 + logicIdx * 2);
      // Sell magic numbers (odd offsets)
      engineSellMagics.push(baseMagic + engineIdx * 14 + logicIdx * 2 + 1);
    });

    magicNumbers.push(engineBuyMagics);
    magicNumbersSell.push(engineSellMagics);
  });

  // Create the global config object with all required properties
  const globalConfig: GlobalConfig = {
    // Magic numbers
    baseMagicNumber: baseMagic,
    magicNumberBuy: baseMagic,
    magicNumberSell: baseMagic + 1,
    maxSlippage: 3,

    // Feature toggles
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
    groupPowerStart: Array(3)
      .fill(null)
      .map(() => Array(16).fill(0)), // [engine][group]
    groupReverseMode: Array(16).fill(false),
    groupHedgeMode: Array(16).fill(false),
    groupHedgeReference: Array(16).fill("Logic_None"),
    groupEntryDelayBars: Array(16).fill(0),

    // Session filters
    sessions: Array(10).fill({
      enabled: false,
      day: 1,
      startHour: 0,
      startMinute: 0,
      endHour: 23,
      endMinute: 59,
      action: "Trade",
    }),
    sessionFilterEnabled: false,
    newsFilterEnabled: false,
    sessionOverridesNews: false,
    newsOverridesSession: false,
    newsCountries: "US,GB,EU",
    newsImpactLevel: 3,
    newsMinutesBefore: 30,
    newsMinutesAfter: 30,
    newsAction: "StopTrading",
    newsCalendarFile: "",

    // Risk limits
    risk: {
      maxDailyLoss: 0,
      maxWeeklyLoss: 0,
      maxMonthlyLoss: 0,
      maxDrawdownPercent: 20,
      maxLotSize: 100,
      maxTotalOrders: 100,
      stopMode: "Stop_ByPercent",
      action: "CloseAll",
    },

    // UI settings
    showUI: true,
    showTrailLines: true,
    colorBuy: "#00ff00",
    colorSell: "#ff0000",

    // License
    licenseKey: "",
    licenseServer: "",
    requireLicense: false,

    // Debug
    debugMode: false,
    verboseLogging: false,
    logProfile: 0,
  };

  const massiveConfig: MTConfigComplete = {
    version: "17.04",
    platform: platform,
    timestamp: new Date().toISOString(),
    total_inputs: 15 * 3 * 7 * 2 * 111, // 15 groups × 3 engines × 7 logics × 2 directions × 111 fields
    global: globalConfig,
    engines: generatedEngines,
  };

  const stats = {
    totalLogicDirections: 15 * 3 * 7 * 2, // 630
    totalInputs: 15 * 3 * 7 * 2 * 111, // 69,930
    groups: 15,
    engines: 3,
    logics: 7,
    directions: 2,
  };

  console.log("[GENERATE] Configuration complete:");
  console.log(`  - Total logic-directions: ${stats.totalLogicDirections}`);
  console.log(`  - Total inputs: ${stats.totalInputs.toLocaleString()}`);
  console.log(
    `  - Structure: ${stats.groups} groups × ${stats.engines} engines × ${stats.logics} logics × ${stats.directions} directions`,
  );
  console.log(
    `  - Magic numbers: 42 total (${magicNumbers.flat().length} buy + ${magicNumbersSell.flat().length} sell)`,
  );

  return { config: massiveConfig, stats };
}

export function printConfigStats(config: MTConfigComplete): void {
  console.log("[CONFIG STATS] ==========================================");

  let totalLogics = 0;
  let totalGroups = 0;

  config.engines?.forEach((engine, eIdx) => {
    const engineLogics =
      engine.groups?.reduce((sum, g) => sum + (g.logics?.length || 0), 0) || 0;
    totalLogics += engineLogics;
    totalGroups += engine.groups?.length || 0;

    console.log(
      `[ENGINE ${engine.engine_id}] ${engine.groups?.length} groups, ${engineLogics} logic-directions`,
    );
  });

  console.log(`[TOTAL] ${totalGroups} groups, ${totalLogics} logic-directions`);
  console.log(`[INPUTS] ${config.total_inputs?.toLocaleString()} total inputs`);
  console.log(
    `[MAGIC] Base: ${config.global?.baseMagicNumber}, Buy: ${config.global?.magicNumberBuy}, Sell: ${config.global?.magicNumberSell}`,
  );
  console.log("[CONFIG STATS] ==========================================");
}

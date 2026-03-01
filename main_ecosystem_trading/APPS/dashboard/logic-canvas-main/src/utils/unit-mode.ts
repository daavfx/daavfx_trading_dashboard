import type { SettingsState } from "@/contexts/SettingsContext";
import type { MTConfig } from "@/types/mt-config";
import { hydrateMTConfigDefaults } from "@/utils/hydrate-mt-config-defaults";

export const getUseDirectPriceGrid = (settings: SettingsState): boolean => {
  const symbol = (settings.unitSymbol || "").trim().toUpperCase();
  const mode = (settings.unitModeBySymbol && symbol && settings.unitModeBySymbol[symbol]) || settings.unitModeDefault;
  return mode === "direct_price";
};

export const withUseDirectPriceGrid = (config: MTConfig, settings: SettingsState): MTConfig => {
  return {
    ...config,
    general: {
      ...config.general,
      use_direct_price_grid: getUseDirectPriceGrid(settings),
    },
  };
};

export const normalizeConfigForExport = (config: any): any => {
  // Single source of truth: do not coerce values at export time.
  // Export should serialize exactly what is in state.
  return config;
};

const LOGIC_KEY_ALIASES: Record<string, string> = {
  startLevel: "start_level",
  lastLot: "last_lot",
  initialLot: "initial_lot",
  initialLotBuy: "initial_lot_b",
  initialLotSell: "initial_lot_s",
  multiplierBuy: "multiplier_b",
  multiplierSell: "multiplier_s",
  gridBuy: "grid_b",
  gridSell: "grid_s",
  trailMethod: "trail_method",
  trailValue: "trail_value",
  trailValueBuy: "trail_value_b",
  trailValueSell: "trail_value_s",
  trailStart: "trail_start",
  trailStartBuy: "trail_start_b",
  trailStartSell: "trail_start_s",
  trailStep: "trail_step",
  trailStepBuy: "trail_step_b",
  trailStepSell: "trail_step_s",
  trailStepMethod: "trail_step_method",
  useTP: "use_tp",
  takeProfit: "tp_value",
  useSL: "use_sl",
  stopLoss: "sl_value",
  triggerType: "trigger_type",
  triggerBars: "trigger_bars",
  triggerPips: "trigger_pips",
  gridBehavior: "grid_behavior",
  hedgeReference: "hedge_reference",
  reverseReference: "reverse_reference",
  hedgeScale: "hedge_scale",
  partialClose: "close_partial",
  partialMode: "close_partial_mode",
  partialProfitThreshold: "close_partial_profit_threshold",
  tradingMode: "trading_mode",
};

const normalizeTradingMode = (raw: unknown): "Counter Trend" | "Hedge" | "Reverse" => {
  const mode = String(raw ?? "").trim().toLowerCase();
  if (mode === "hedge") return "Hedge";
  if (mode === "reverse") return "Reverse";
  if (
    mode === "counter trend" ||
    mode === "countertrend" ||
    mode === "counter_trend" ||
    mode === "counter-trend" ||
    mode === "trending" ||
    mode === "trend following" ||
    mode === "trend_following" ||
    mode === ""
  ) {
    return "Counter Trend";
  }
  return "Counter Trend";
};

const normalizeTrailMethod = (raw: unknown): "Points" | "AVG_Percent" => {
  const mode = String(raw ?? "").trim().toLowerCase();
  if (mode === "avg_percent" || mode === "trail_avg_percent") return "AVG_Percent";
  if (
    mode === "avg_points" ||
    mode === "trail_avg_points" ||
    mode === "percent" ||
    mode === "trail_profit_percent"
  ) {
    return "Points";
  }
  return "Points";
};

const normalizeTrailStepMethod = (raw: unknown): "Step_Points" | "Step_Percent" => {
  const mode = String(raw ?? "").trim().toLowerCase();
  if (mode === "step_percent") return "Step_Percent";
  if (mode === "step_pips" || mode === "step_points") return "Step_Points";
  return "Step_Points";
};

const normalizeTrailStepMode = (
  raw: unknown,
): "TrailStepMode_Auto" | "TrailStepMode_Fixed" | "TrailStepMode_PerOrder" => {
  const mode = String(raw ?? "").trim().toLowerCase();
  if (mode === "trailstepmode_perorder") return "TrailStepMode_PerOrder";
  if (
    mode === "trailstepmode_fixed" ||
    mode === "trailstepmode_points" ||
    mode === "trailstepmode_percent"
  ) {
    return "TrailStepMode_Fixed";
  }
  return "TrailStepMode_Auto";
};

const normalizePartialMode = (
  raw: unknown,
): "PartialMode_Low" | "PartialMode_Mid" | "PartialMode_Aggressive" => {
  const mode = String(raw ?? "").trim().toLowerCase();
  if (mode === "partialmode_low") return "PartialMode_Low";
  if (mode === "partialmode_aggressive" || mode === "partialmode_high") {
    return "PartialMode_Aggressive";
  }
  if (mode === "partialmode_mid" || mode === "partialmode_balanced") {
    return "PartialMode_Mid";
  }
  return "PartialMode_Mid";
};

function canonicalizeLogicObject(logic: Record<string, any>): Record<string, any> {
  const rawLogicName = String(logic.logic_name ?? "");
  if (rawLogicName) {
    const upper = rawLogicName.toUpperCase();
    if (upper === "SCALP") {
      logic.logic_name = "SCALPER";
    }
  }

  for (const [alias, canonical] of Object.entries(LOGIC_KEY_ALIASES)) {
    if (!(alias in logic)) continue;
    // Alias value wins when present to avoid exporting stale canonical defaults.
    if (logic[alias] !== undefined) {
      logic[canonical] = logic[alias];
    } else if (!(canonical in logic)) {
      logic[canonical] = logic[alias];
    }
    delete logic[alias];
  }

  if ("trading_mode" in logic) {
    logic.trading_mode = normalizeTradingMode(logic.trading_mode);
  }
  if ("trail_method" in logic) {
    logic.trail_method = normalizeTrailMethod(logic.trail_method);
  }
  if ("trail_step_method" in logic) {
    logic.trail_step_method = normalizeTrailStepMethod(logic.trail_step_method);
  }
  if ("trail_step_mode" in logic) {
    logic.trail_step_mode = normalizeTrailStepMode(logic.trail_step_mode);
  }
  for (let level = 2; level <= 7; level += 1) {
    const methodKey = `trail_step_method_${level}`;
    const modeKey = `trail_step_mode_${level}`;
    if (methodKey in logic && logic[methodKey] !== undefined && logic[methodKey] !== null && logic[methodKey] !== "") {
      logic[methodKey] = normalizeTrailStepMethod(logic[methodKey]);
    }
    if (modeKey in logic && logic[modeKey] !== undefined && logic[modeKey] !== null && logic[modeKey] !== "") {
      logic[modeKey] = normalizeTrailStepMode(logic[modeKey]);
    }
  }

  // Active partial-close contract: keep only mode + profit threshold controls.
  logic.close_partial_mode = normalizePartialMode(logic.close_partial_mode);
  for (let level = 2; level <= 4; level += 1) {
    const modeKey = `close_partial_mode_${level}`;
    if (modeKey in logic && logic[modeKey] !== undefined && logic[modeKey] !== null && logic[modeKey] !== "") {
      logic[modeKey] = normalizePartialMode(logic[modeKey]);
    }
  }

  if (!("close_partial_profit_threshold" in logic)) {
    logic.close_partial_profit_threshold = 0;
  }
  for (let level = 2; level <= 4; level += 1) {
    const key = `close_partial_profit_threshold_${level}`;
    if (!(key in logic)) {
      logic[key] = 0;
    }
  }

  delete logic.close_partial_cycle;
  delete logic.close_partial_balance;
  delete logic.close_partial_trail_step_mode;
  delete logic.close_partial_cycle_2;
  delete logic.close_partial_balance_2;
  delete logic.close_partial_cycle_3;
  delete logic.close_partial_balance_3;
  delete logic.close_partial_cycle_4;
  delete logic.close_partial_balance_4;

  return logic;
}

export const canonicalizeConfigForBackend = (config: MTConfig): MTConfig => {
  const hydrated = hydrateMTConfigDefaults(config);
  const cloned = JSON.parse(JSON.stringify(hydrated)) as MTConfig;
  for (const engine of cloned.engines || []) {
    for (const group of engine.groups || []) {
      group.logics = (group.logics || []).map((logic) =>
        canonicalizeLogicObject(logic as unknown as Record<string, any>) as typeof logic,
      );
    }
  }
  return cloned;
};

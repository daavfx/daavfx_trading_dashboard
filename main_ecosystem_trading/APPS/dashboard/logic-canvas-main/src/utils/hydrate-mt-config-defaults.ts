import type {
  MTConfig,
  GeneralConfig,
  RiskManagementConfig,
  TimeFiltersConfig,
  NewsFilterConfig,
  SessionConfig,
  EngineConfig,
  TradingMode,
} from "@/types/mt-config";

const defaultRiskManagement: RiskManagementConfig = {
  spread_filter_enabled: false,
  max_spread_points: 25,
  equity_stop_enabled: false,
  equity_stop_value: 35,
  drawdown_stop_enabled: false,
  max_drawdown_percent: 35,
  risk_action: "TriggerAction_StopEA_KeepTrades",
};

const defaultSessions = (): SessionConfig[] =>
  Array.from({ length: 7 }, (_, i) => ({
    session_number: i + 1,
    enabled: false,
    day: i % 7,
    start_hour: 9,
    start_minute: 30,
    end_hour: 17,
    end_minute: 0,
    action: "TriggerAction_StopEA_KeepTrades",
    auto_restart: true,
    restart_mode: "Restart_Immediate",
    restart_bars: 0,
    restart_minutes: 0,
    restart_pips: 0,
  }));

const defaultTimeFilters: TimeFiltersConfig = {
  priority_settings: {
    news_filter_overrides_session: false,
    session_filter_overrides_news: true,
  },
  sessions: defaultSessions(),
};

const defaultNewsFilter: NewsFilterConfig = {
  enabled: false,
  api_key: "",
  api_url: "https://www.jblanked.com/news/api/calendar/",
  countries: "US,GB,EU",
  impact_level: 3,
  minutes_before: 30,
  minutes_after: 30,
  action: "TriggerAction_StopEA_KeepTrades",
  calendar_file: "DAAVFX_NEWS.csv",
  check_interval: 60,
  alert_minutes: 5,
  filter_high_only: true,
  filter_weekends: false,
  use_local_cache: true,
  cache_duration: 3600,
  fallback_on_error: "Fallback_Continue",
  filter_currencies: "",
  include_speeches: true,
  include_reports: true,
  visual_indicator: true,
  alert_before_news: false,
};

const defaultGeneral: GeneralConfig = {
  license_key: "",
  license_server_url: "https://license.daavfx.com",
  require_license: false,
  license_check_interval: 3600,
  config_file_name: "DAAVFX_Config.json",
  config_file_is_common: true,
  allow_buy: true,
  allow_sell: true,
  enable_logs: false,
  use_direct_price_grid: false,
  grid_unit: 0,
  pip_factor: 0,
  compounding_enabled: false,
  compounding_type: "Compound_Balance",
  compounding_target: 40,
  compounding_increase: 2,
  restart_policy_power: "Restart_Default",
  restart_policy_non_power: "Restart_Default",
  close_non_power_on_power_close: false,
  hold_timeout_bars: 10,
  magic_number: 777,
  magic_number_buy: 777,
  magic_number_sell: 8988,
  max_slippage_points: 30,
  reverse_magic_base: 20000,
  hedge_magic_base: 30000,
  hedge_magic_independent: false,
  risk_management: defaultRiskManagement,
  time_filters: defaultTimeFilters,
  news_filter: defaultNewsFilter,
};

function normalizeSessions(sessions: SessionConfig[] | undefined): SessionConfig[] {
  const base = defaultSessions();
  const src = Array.isArray(sessions) ? sessions : [];
  const byNumber = new Map<number, SessionConfig>();
  for (const s of src) {
    if (!s || typeof s.session_number !== "number") continue;
    byNumber.set(s.session_number, s);
  }
  return base.map((d) => ({
    ...d,
    ...(byNumber.get(d.session_number) ?? {}),
    session_number: d.session_number,
  }));
}

function normalizeTimeFilters(
  time: Partial<TimeFiltersConfig> | undefined,
): TimeFiltersConfig {
  const src = time ?? ({} as Partial<TimeFiltersConfig>);
  return {
    ...defaultTimeFilters,
    ...src,
    sessions: normalizeSessions(src.sessions),
  };
}

const DIRECTIONAL_NUMERIC_FIELDS = [
  "initial_lot",
  "multiplier",
  "grid",
  "trail_value",
  "trail_start",
  "trail_step",
] as const;

const normalizeTradingMode = (raw: unknown): TradingMode => {
  const mode = String(raw ?? "").trim().toLowerCase();
  if (mode === "hedge") return "Hedge";
  if (mode === "reverse") return "Reverse";
  if (
    mode === "counter trend" ||
    mode === "countertrend" ||
    mode === "counter_trend" ||
    mode === "counter-trend" ||
    mode === "trend following" ||
    mode === "trend_following" ||
    mode === "trending" ||
    mode === ""
  ) {
    return "Counter Trend";
  }
  return "Counter Trend";
};

const parseExplicitTradingMode = (raw: unknown): TradingMode | null => {
  if (raw === undefined || raw === null) return null;
  if (String(raw).trim() === "") return null;
  return normalizeTradingMode(raw);
};

const parseBool = (raw: unknown): boolean => {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
};

const parseScale = (raw: unknown, fallback: number): number => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const n = parseFloat(String(raw ?? ""));
  return Number.isFinite(n) ? n : fallback;
};

const normalizeTrailMethod = (raw: unknown): "Points" | "AVG_Percent" => {
  const mode = String(raw ?? "").trim().toLowerCase();
  if (mode === "avg_percent" || mode === "trail_avg_percent") return "AVG_Percent";
  return "Points";
};

const normalizeTrailStepMethod = (raw: unknown): "Step_Points" | "Step_Percent" => {
  const mode = String(raw ?? "").trim().toLowerCase();
  if (mode === "step_percent") return "Step_Percent";
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

const isEngineAPowerLogic = (engineId: string, logicName: unknown): boolean =>
  String(engineId).trim().toUpperCase() === "A" &&
  normalizeLogicName(logicName) === "POWER";

const normalizeModeState = (
  row: Record<string, any>,
  engineId: string,
): Record<string, any> => {
  const explicitMode = parseExplicitTradingMode(row.trading_mode);
  const reverseEnabled = parseBool(row.reverse_enabled);
  const hedgeEnabled = parseBool(row.hedge_enabled);

  let mode: TradingMode;
  if (explicitMode) {
    mode = explicitMode;
  } else if (hedgeEnabled && !reverseEnabled) {
    mode = "Hedge";
  } else if (reverseEnabled && !hedgeEnabled) {
    mode = "Reverse";
  } else {
    mode = "Counter Trend";
  }

  // Invalid legacy conflict: both enabled with no explicit mode.
  if (!explicitMode && reverseEnabled && hedgeEnabled) {
    mode = "Counter Trend";
  }

  if (isEngineAPowerLogic(engineId, row.logic_name)) {
    mode = "Counter Trend";
  }

  const out = { ...row, trading_mode: mode };
  if (mode === "Hedge") {
    out.hedge_enabled = true;
    out.reverse_enabled = false;
    out.hedge_reference = String(out.hedge_reference ?? "Logic_None");
    out.hedge_scale = parseScale(out.hedge_scale, 50);
    out.reverse_reference = "Logic_None";
    out.reverse_scale = 100;
    return out;
  }

  if (mode === "Reverse") {
    out.reverse_enabled = true;
    out.hedge_enabled = false;
    out.reverse_reference = String(out.reverse_reference ?? "Logic_None");
    out.reverse_scale = parseScale(out.reverse_scale, 100);
    out.hedge_reference = "Logic_None";
    out.hedge_scale = 50;
    return out;
  }

  // Counter Trend (and Engine A POWER): force neutral reverse/hedge state.
  out.reverse_enabled = false;
  out.hedge_enabled = false;
  out.reverse_reference = "Logic_None";
  out.hedge_reference = "Logic_None";
  out.reverse_scale = 100;
  out.hedge_scale = 50;
  return out;
};

const normalizeTrailContract = (row: Record<string, any>): Record<string, any> => {
  const out = { ...row };
  out.trail_method = normalizeTrailMethod(out.trail_method);
  out.trail_step_method = normalizeTrailStepMethod(out.trail_step_method);
  out.trail_step_mode = normalizeTrailStepMode(out.trail_step_mode);
  out.close_partial_mode = normalizePartialMode(out.close_partial_mode);

  for (let level = 2; level <= 7; level += 1) {
    const methodKey = `trail_step_method_${level}`;
    const modeKey = `trail_step_mode_${level}`;
    if (out[methodKey] !== undefined && out[methodKey] !== null && out[methodKey] !== "") {
      out[methodKey] = normalizeTrailStepMethod(out[methodKey]);
    }
    if (out[modeKey] !== undefined && out[modeKey] !== null && out[modeKey] !== "") {
      out[modeKey] = normalizeTrailStepMode(out[modeKey]);
    }
  }

  if (out.close_partial_profit_threshold === undefined) {
    out.close_partial_profit_threshold = 0;
  }
  for (let level = 2; level <= 4; level += 1) {
    const modeKey = `close_partial_mode_${level}`;
    const thresholdKey = `close_partial_profit_threshold_${level}`;
    if (out[modeKey] !== undefined && out[modeKey] !== null && out[modeKey] !== "") {
      out[modeKey] = normalizePartialMode(out[modeKey]);
    }
    if (out[thresholdKey] === undefined) {
      out[thresholdKey] = 0;
    }
  }

  delete out.close_partial_cycle;
  delete out.close_partial_balance;
  delete out.close_partial_trail_step_mode;
  delete out.close_partial_cycle_2;
  delete out.close_partial_balance_2;
  delete out.close_partial_cycle_3;
  delete out.close_partial_balance_3;
  delete out.close_partial_cycle_4;
  delete out.close_partial_balance_4;

  return out;
};

const normalizeLogicName = (raw: unknown): string => {
  const upper = String(raw ?? "").trim().toUpperCase();
  return upper === "SCALP" ? "SCALPER" : upper;
};

const inferLogicDirection = (logic: Record<string, any>): "buy" | "sell" | null => {
  const direction = String(logic?.direction ?? "").trim().toUpperCase();
  if (direction === "B" || direction === "BUY") return "buy";
  if (direction === "S" || direction === "SELL") return "sell";

  const logicId = String(logic?.logic_id ?? "").trim().toUpperCase();
  if (logicId.includes("_B_") || logicId.endsWith("_B")) return "buy";
  if (logicId.includes("_S_") || logicId.endsWith("_S")) return "sell";

  if (logic?.allow_buy === true && logic?.allow_sell !== true) return "buy";
  if (logic?.allow_sell === true && logic?.allow_buy !== true) return "sell";
  return null;
};

const forceDirectionalLogicId = (
  existingId: unknown,
  engineId: string,
  logicName: string,
  groupNumber: number,
  side: "buy" | "sell",
): string => {
  const token = side === "buy" ? "B" : "S";
  const id = String(existingId ?? "").trim();

  if (id) {
    const withToken = id
      .replace(/_B_/gi, `_${token}_`)
      .replace(/_S_/gi, `_${token}_`)
      .replace(/_B$/gi, `_${token}`)
      .replace(/_S$/gi, `_${token}`);
    if (withToken !== id) return withToken;
  }

  const safeLogic = normalizeLogicName(logicName).replace(/[^A-Z0-9]+/g, "_") || "LOGIC";
  return `${engineId}_${safeLogic}_${token}_G${groupNumber}`;
};

const applyDirectionalNumericValues = (
  row: Record<string, any>,
  side: "buy" | "sell",
): Record<string, any> => {
  const suffix = side === "buy" ? "_b" : "_s";
  const out = { ...row };
  for (const field of DIRECTIONAL_NUMERIC_FIELDS) {
    const scoped = out[`${field}${suffix}`];
    if (typeof scoped === "number") out[field] = scoped;
  }
  return out;
};

const normalizeGroupLogics = (
  logics: any[],
  engineId: string,
  groupNumber: number,
): any[] => {
  const rows = (Array.isArray(logics) ? logics : []).map((l: any) => {
    const normalizedName = normalizeLogicName(l?.logic_name);
    const startLevelValue = l?.start_level ?? l?.startLevel;
    const { startLevel, ...rest } = l ?? {};
    return {
      ...rest,
      ...(normalizedName ? { logic_name: normalizedName } : {}),
      ...(typeof startLevelValue === "number" ? { start_level: startLevelValue } : {}),
    };
  });

  // Already directional model: keep values as-is and only ensure direction flags/ids are coherent.
  if (
    rows.length > 0 &&
    rows.every((row: any) => inferLogicDirection(row) !== null)
  ) {
    return rows.map((row: any) => {
      const dir = inferLogicDirection(row);
      const side = dir === "sell" ? "sell" : "buy";
      const withDirectionalNumbers = applyDirectionalNumericValues(row, side);
      return normalizeTrailContract(normalizeModeState({
        ...withDirectionalNumbers,
        allow_buy: side === "buy",
        allow_sell: side === "sell",
        logic_id: forceDirectionalLogicId(
          row.logic_id,
          engineId,
          String(row.logic_name ?? ""),
          groupNumber,
          side,
        ),
      }, engineId));
    });
  }

  // Normalize any non-directional row shape into explicit buy/sell rows.
  const grouped = new Map<string, any[]>();
  for (const row of rows) {
    const key = normalizeLogicName(row?.logic_name);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const materialized: any[] = [];
  for (const [, bucket] of grouped) {
    const base = bucket[0];
    if (!base) continue;
    const buySource = bucket.find((row) => inferLogicDirection(row) === "buy") ?? base;
    const sellSource = bucket.find((row) => inferLogicDirection(row) === "sell") ?? base;

    const buyRow = applyDirectionalNumericValues({ ...buySource }, "buy");
    buyRow.allow_buy = true;
    buyRow.allow_sell = false;
    buyRow.logic_id = forceDirectionalLogicId(
      buySource.logic_id,
      engineId,
      String(buySource.logic_name ?? ""),
      groupNumber,
      "buy",
    );

    const sellRow = applyDirectionalNumericValues({ ...sellSource }, "sell");
    sellRow.allow_buy = false;
    sellRow.allow_sell = true;
    sellRow.logic_id = forceDirectionalLogicId(
      sellSource.logic_id,
      engineId,
      String(sellSource.logic_name ?? ""),
      groupNumber,
      "sell",
    );

    materialized.push(
      normalizeTrailContract(normalizeModeState(buyRow, engineId)),
      normalizeTrailContract(normalizeModeState(sellRow, engineId)),
    );
  }

  return materialized;
};

function normalizeEngines(engines: EngineConfig[] | undefined): EngineConfig[] {
  if (!Array.isArray(engines)) return [];
  return engines.map((e) => ({
    ...e,
    groups: Array.isArray(e.groups)
      ? e.groups.map((g: any) => {
        const baseGroup: any = {
          ...g,
          logics: Array.isArray(g?.logics)
            ? normalizeGroupLogics(g.logics, String(e?.engine_id ?? "A"), Number(g?.group_number ?? 0))
            : [],
        };

        return baseGroup;
      })
      : [],
  }));
}

export function hydrateMTConfigDefaults(config: MTConfig): MTConfig {
  const general = config?.general ?? ({} as Partial<GeneralConfig>);
  const risk = general.risk_management ?? ({} as Partial<RiskManagementConfig>);
  const time = general.time_filters ?? ({} as Partial<TimeFiltersConfig>);
  const news = general.news_filter ?? ({} as Partial<NewsFilterConfig>);
  const riskB = general.risk_management_b;
  const riskS = general.risk_management_s;
  const timeB = general.time_filters_b;
  const timeS = general.time_filters_s;
  const newsB = general.news_filter_b;
  const newsS = general.news_filter_s;

  return {
    ...config,
    version: config?.version ?? "0",
    platform: config?.platform ?? "MT4",
    timestamp: config?.timestamp ?? new Date().toISOString(),
    total_inputs: config?.total_inputs ?? 0,
    general: {
      ...defaultGeneral,
      ...general,
      risk_management: { ...defaultRiskManagement, ...risk },
      risk_management_b: riskB
        ? { ...defaultRiskManagement, ...riskB }
        : undefined,
      risk_management_s: riskS
        ? { ...defaultRiskManagement, ...riskS }
        : undefined,
      time_filters: normalizeTimeFilters(time),
      time_filters_b: timeB ? normalizeTimeFilters(timeB) : undefined,
      time_filters_s: timeS ? normalizeTimeFilters(timeS) : undefined,
      news_filter: { ...defaultNewsFilter, ...news },
      news_filter_b: newsB ? { ...defaultNewsFilter, ...newsB } : undefined,
      news_filter_s: newsS ? { ...defaultNewsFilter, ...newsS } : undefined,
    },
    engines: normalizeEngines(config?.engines),
  };
}

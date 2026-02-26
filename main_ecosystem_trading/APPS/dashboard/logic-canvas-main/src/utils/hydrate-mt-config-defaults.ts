import type {
  MTConfig,
  GeneralConfig,
  RiskManagementConfig,
  TimeFiltersConfig,
  NewsFilterConfig,
  SessionConfig,
  EngineConfig,
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
  group_mode: 1,
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

function normalizeEngines(engines: EngineConfig[] | undefined): EngineConfig[] {
  if (!Array.isArray(engines)) return [];
  return engines.map((e) => ({
    ...e,
    groups: Array.isArray(e.groups)
      ? e.groups.map((g: any) => {
        const baseGroup: any = {
          ...g,
          logics: Array.isArray(g?.logics) ? g.logics : [],
        };

        if (
          e.engine_id === "A" &&
          baseGroup?.group_number > 1 &&
          typeof baseGroup.group_power_start !== "number"
        ) {
          baseGroup.group_power_start = baseGroup.group_number;
        }

        baseGroup.logics = baseGroup.logics.map((l: any) => {
          const isPower =
            String(l?.logic_name || "")
              .trim()
              .toLowerCase() === "power";

          const normalizedStartLevel = isPower ? 0 : 1;

          return {
            ...l,
            enabled: true,
              trigger_type: "Trigger_Immediate",
            trigger_bars: 0,
            trigger_minutes: 0,
            trigger_pips: 0,
            order_count_reference: "Logic_Power",
            start_level: normalizedStartLevel,
          };
        });

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

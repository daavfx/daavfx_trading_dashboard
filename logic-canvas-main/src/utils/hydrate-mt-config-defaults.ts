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
  require_license: true,
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

function normalizeEngines(engines: EngineConfig[] | undefined): EngineConfig[] {
  if (!Array.isArray(engines)) return [];
  return engines.map((e) => ({
    ...e,
    groups: Array.isArray(e.groups) ? e.groups : [],
  }));
}

export function hydrateMTConfigDefaults(config: MTConfig): MTConfig {
  const general = config?.general ?? ({} as Partial<GeneralConfig>);
  const risk = general.risk_management ?? ({} as Partial<RiskManagementConfig>);
  const time = general.time_filters ?? ({} as Partial<TimeFiltersConfig>);
  const news = general.news_filter ?? ({} as Partial<NewsFilterConfig>);

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
      time_filters: {
        ...defaultTimeFilters,
        ...time,
        sessions: normalizeSessions(time.sessions),
      },
      news_filter: { ...defaultNewsFilter, ...news },
    },
    engines: normalizeEngines(config?.engines),
  };
}

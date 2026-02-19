// ARCHIVED 2025-02-18
// This module contains build_complete_config() which is not used.
// The active parsing logic is in mt_bridge.rs (parse_ginput_key, etc.)
// Kept for reference only.
// Archived in: _archive/deprecated_2025-02-18/

// Setfile Parser Module - Properly parses V4 setfiles into MTConfig structure (DEPRECATED)
// Handles 15 groups × 3 engines × 7 logics × 2 directions = 630 logic-directions
// NOTE: This is an older implementation. Current parsing is in mt_bridge.rs

use std::collections::HashMap;

/// Parse a parameter name into its components
/// Supports format: gInput_<Group>_<Engine><Logic>_<Direction>_<Param>
/// Example: gInput_1_AP_Buy_InitialLot -> (InitialLot, A, 1, Power, Buy)
fn parse_parameter_name(name: &str) -> Option<(String, String, u32, String, String)> {
    // Remove gInput_ prefix
    if !name.starts_with("gInput_") {
        return None;
    }

    let rest = &name[7..]; // Skip "gInput_"

    // Split by underscore
    let parts: Vec<&str> = rest.split('_').collect();

    // Expected format: <Group>_<Engine><Logic>_<Direction>_<Param>
    // Minimum parts: Group, EngineLogic, Direction, Param (4 parts)
    // Example: 1_AP_Buy_InitialLot -> ["1", "AP", "Buy", "InitialLot"]
    if parts.len() < 4 {
        return None;
    }

    // Parse group number (first part)
    let group = parts[0].parse::<u32>().ok()?;

    // Parse engine and logic (second part)
    let engine_logic = parts[1];
    let (engine, logic) = parse_engine_logic_code(engine_logic)?;

    // Parse direction (third part)
    let direction = parts[2].to_string();
    if direction != "Buy" && direction != "Sell" {
        return None;
    }

    // Parse parameter name (remaining parts joined)
    let param_name = parts[3..].join("_");

    Some((param_name, engine, group, logic, direction))
}

/// Parse engine+logic code like AP, BP, R, BR into (engine, logic_name)
fn parse_engine_logic_code(code: &str) -> Option<(String, String)> {
    // Logic codes mapping
    let logic_map: HashMap<&str, &str> = [
        ("P", "Power"),
        ("R", "Repower"),
        ("S", "Scalp"),
        ("ST", "Stopper"),
        ("STO", "STO"),
        ("SCA", "SCA"),
        ("RPO", "RPO"),
    ]
    .iter()
    .cloned()
    .collect();

    // Engine prefixes: B=Engine B, C=Engine C, none=Engine A
    let mut engine = "A".to_string();
    let mut remaining = code;

    // Check for Engine B prefix
    if code.starts_with("BP") || code.starts_with("BR") || code.starts_with("BS") {
        engine = "B".to_string();
        remaining = &code[1..]; // Skip 'B'
    } else if code.starts_with("BST") && !code.starts_with("BSTO") {
        engine = "B".to_string();
        remaining = &code[1..]; // Skip 'B'
    } else if code.starts_with("BSTO") || code.starts_with("BSCA") || code.starts_with("BRPO") {
        engine = "B".to_string();
        remaining = &code[1..]; // Skip 'B'
    }
    // Check for Engine C prefix
    else if code.starts_with("CP") || code.starts_with("CR") || code.starts_with("CS") {
        engine = "C".to_string();
        remaining = &code[1..]; // Skip 'C'
    } else if code.starts_with("CST") && !code.starts_with("CSTO") {
        engine = "C".to_string();
        remaining = &code[1..]; // Skip 'C'
    } else if code.starts_with("CSTO") || code.starts_with("CSCA") || code.starts_with("CRPO") {
        engine = "C".to_string();
        remaining = &code[1..]; // Skip 'C'
    }

    // Try longer matches first (STO, SCA, RPO, ST) before shorter (S)
    for (code_part, logic_name) in ["STO", "SCA", "RPO", "ST", "P", "R", "S"].iter() {
        if remaining == *code_part {
            return Some((engine, logic_name.to_string()));
        }
    }

    None
}

/// Parse logic code like P1, BP1, R1, BR1 into (engine, logic_name, group)
fn parse_logic_code(code: &str) -> Option<(String, String, u32)> {
    // Logic codes mapping
    let logic_map: HashMap<&str, &str> = [
        ("P", "Power"),
        ("R", "Repower"),
        ("S", "Scalp"),
        ("ST", "Stopper"),
        ("STO", "STO"),
        ("SCA", "SCA"),
        ("RPO", "RPO"),
    ]
    .iter()
    .cloned()
    .collect();

    // Engine prefixes: B=Engine B, C=Engine C, none=Engine A
    let mut engine = "A".to_string();
    let mut remaining = code;

    if code.starts_with("BP")
        || code.starts_with("BR")
        || code.starts_with("BS")
        || code.starts_with("BST")
        || code.starts_with("BSTO")
        || code.starts_with("BSCA")
        || code.starts_with("BRPO")
    {
        engine = "B".to_string();
        remaining = &code[1..]; // Skip 'B'
    } else if code.starts_with("CP")
        || code.starts_with("CR")
        || code.starts_with("CS")
        || code.starts_with("CST")
        || code.starts_with("CSTO")
        || code.starts_with("CSCA")
        || code.starts_with("CRPO")
    {
        engine = "C".to_string();
        remaining = &code[1..]; // Skip 'C'
    }

    // Extract logic code and group number
    // Try longer matches first (STO, SCA, RPO, ST) before shorter (S)
    for (code_part, logic_name) in ["STO", "SCA", "RPO", "ST", "P", "R", "S"].iter() {
        if remaining.starts_with(code_part) {
            let group_str = &remaining[code_part.len()..];
            if let Ok(group) = group_str.parse::<u32>() {
                return Some((engine, logic_name.to_string(), group));
            }
        }
    }

    None
}

/// Build complete MTConfig from parsed values
pub fn build_complete_config(values: &HashMap<String, String>) -> Result<MTConfig, String> {
    // Structure: Engine -> Group -> Logic -> Direction -> Params
    let mut engines: HashMap<String, EngineData> = HashMap::new();

    // Parse all parameters
    for (key, value) in values {
        if let Some((param_name, engine, group, logic, direction)) = parse_parameter_name(key) {
            let engine_data = engines.entry(engine).or_insert_with(|| EngineData::new());
            let group_data = engine_data
                .groups
                .entry(group)
                .or_insert_with(|| GroupData::new());
            let logic_data = group_data
                .logics
                .entry(logic)
                .or_insert_with(|| LogicData::new());
            let direction_data = logic_data
                .directions
                .entry(direction)
                .or_insert_with(|| DirectionData::new());

            // Store the parameter value
            direction_data.params.insert(param_name, value.clone());
        }
    }

    // Convert to MTConfig structure
    let mut config_engines = Vec::new();

    for (engine_id, engine_data) in engines {
        let mut groups = Vec::new();

        // Sort groups by number
        let mut group_numbers: Vec<u32> = engine_data.groups.keys().cloned().collect();
        group_numbers.sort();

        for group_num in group_numbers {
            if let Some(group_data) = engine_data.groups.get(&group_num) {
                let mut logics = Vec::new();

                // Define logic order
                let logic_order = vec!["Power", "Repower", "Scalp", "Stopper", "STO", "SCA", "RPO"];

                for logic_name in &logic_order {
                    if let Some(logic_data) = group_data.logics.get(*logic_name) {
                        // Convert LogicData directions to HashMap<String, HashMap<String, String>>
                        let directions: std::collections::HashMap<
                            String,
                            std::collections::HashMap<String, String>,
                        > = logic_data
                            .directions
                            .iter()
                            .map(|(dir, dir_data)| (dir.clone(), dir_data.params.clone()))
                            .collect();

                        // Build LogicConfig from parameters
                        let logic_config = build_logic_config(
                            &engine_id,
                            group_num as u8,
                            *logic_name,
                            &directions,
                            values,
                        )?;
                        logics.push(logic_config);
                    }
                }

                groups.push(GroupConfig {
                    group_number: group_num as i32,
                    enabled: true,
                    reverse_mode: false,
                    hedge_mode: false,
                    hedge_reference: "Logic_None".to_string(),
                    entry_delay_bars: 0,
                    logics,
                });
            }
        }

        config_engines.push(EngineConfig {
            engine_id: engine_id.clone(),
            engine_name: format!("Engine {}", engine_id),
            max_power_orders: 10,
            groups,
        });
    }

    // Build general config
    let general = build_general_config(values)?;

    Ok(MTConfig {
        version: "17.06.01".to_string(),
        platform: "MT4".to_string(),
        timestamp: chrono::Local::now().to_rfc3339(),
        total_inputs: values.len(),
        last_saved_at: None,
        last_saved_platform: None,
        current_set_name: None,
        tags: None,
        comments: None,
        general,
        engines: config_engines,
    })
}

// Helper structs for building config
struct EngineData {
    groups: HashMap<u32, GroupData>,
}

impl EngineData {
    fn new() -> Self {
        Self {
            groups: HashMap::new(),
        }
    }
}

struct GroupData {
    logics: HashMap<String, LogicData>,
}

impl GroupData {
    fn new() -> Self {
        Self {
            logics: HashMap::new(),
        }
    }
}

struct LogicData {
    directions: HashMap<String, DirectionData>,
}

impl LogicData {
    fn new() -> Self {
        Self {
            directions: HashMap::new(),
        }
    }
}

struct DirectionData {
    params: HashMap<String, String>,
}

impl DirectionData {
    fn new() -> Self {
        Self {
            params: HashMap::new(),
        }
    }
}

// Build general config from global inputs
fn build_general_config(values: &HashMap<String, String>) -> Result<GeneralConfig, String> {
    let get_global = |key: &str, default: &str| -> String {
        values
            .get(key)
            .cloned()
            .unwrap_or_else(|| default.to_string())
    };

    let get_global_i32 = |key: &str, default: i32| -> i32 {
        get_global(key, &default.to_string())
            .parse()
            .unwrap_or(default)
    };

    let get_global_f64 = |key: &str, default: f64| -> f64 {
        get_global(key, &default.to_string())
            .parse()
            .unwrap_or(default)
    };

    let get_global_bool = |key: &str, default: bool| -> bool {
        get_global(key, if default { "1" } else { "0" }) == "1"
    };

    Ok(GeneralConfig {
        // License
        license_key: get_global("gInput_LicenseKey", ""),
        license_server_url: get_global("gInput_LicenseServer", ""),
        require_license: get_global_bool("gInput_RequireLicense", false),
        license_check_interval: get_global_i32("gInput_LicenseCheckInterval", 60),

        // Config
        config_file_name: get_global("gInput_ConfigFile", ""),
        config_file_is_common: get_global_bool("gInput_ConfigFileIsCommon", false),

        // Trading (GLOBAL)
        allow_buy: get_global_bool("gInput_AllowBuy", true),
        allow_sell: get_global_bool("gInput_AllowSell", true),

        // Logging
        enable_logs: get_global_bool("gInput_EnableLogs", true),

        use_direct_price_grid: get_global_bool("gInput_UseDirectPriceGrid", false),
        group_mode: Some(get_global_i32("gInput_GroupMode", 0)),
        grid_unit: Some(get_global_i32("gInput_GridUnit", 0)),
        pip_factor: Some(get_global_i32("gInput_PipFactor", 0)),

        // Compounding
        compounding_enabled: get_global_bool("gInput_AutoCompounding", false),
        compounding_type: get_global("gInput_CompoundingType", "balance"),
        compounding_target: get_global_f64("gInput_CompoundingTarget", 100.0),
        compounding_increase: get_global_f64("gInput_CompoundingIncrease", 0.01),

        // Restart Policy
        restart_policy_power: get_global("gInput_RestartPolicyPower", "Continue_Cycle"),
        restart_policy_non_power: get_global("gInput_RestartPolicyNonPower", "Stop_Trading"),
        close_non_power_on_power_close: get_global_bool("gInput_CloseNonPowerOnPowerClose", false),
        hold_timeout_bars: get_global_i32("gInput_HoldTimeoutBars", 24),

        // Global System
        magic_number: get_global_i32("gInput_MagicNumber", 777),
        magic_number_buy: get_global_i32("gInput_MagicNumberBuy", 777),
        magic_number_sell: get_global_i32("gInput_MagicNumberSell", 888),
        max_slippage_points: get_global_f64("gInput_MaxSlippage", 3.0),

        // Risk Management
        risk_management: RiskManagementConfig {
            spread_filter_enabled: get_global_bool("gInput_SpreadFilterEnabled", false),
            max_spread_points: get_global_f64("gInput_MaxSpread", 50.0),
            equity_stop_enabled: get_global_bool("gInput_EquityStopEnabled", false),
            equity_stop_value: get_global_f64("gInput_EquityStopValue", 0.0),
            drawdown_stop_enabled: get_global_bool("gInput_DrawdownStopEnabled", false),
            max_drawdown_percent: get_global_f64("gInput_MaxDrawdown", 0.0),
            risk_action: Some(get_global("gInput_RiskAction", "none")),
        },

        // Time Filters (Session)
        time_filters: TimeFiltersConfig {
            priority_settings: TimePrioritySettings {
                news_filter_overrides_session: get_global_bool(
                    "gInput_NewsOverridesSession",
                    false,
                ),
                session_filter_overrides_news: get_global_bool(
                    "gInput_SessionOverridesNews",
                    false,
                ),
            },
            sessions: vec![SessionConfig {
                session_number: 0,
                enabled: get_global_bool("gInput_UseSessionFilter", false),
                day: -1, // Daily session
                start_hour: get_global_i32("gInput_SessionStart", 0),
                start_minute: get_global_i32("gInput_SessionStartMin", 0),
                end_hour: get_global_i32("gInput_SessionEnd", 24),
                end_minute: get_global_i32("gInput_SessionEndMin", 0),
                action: get_global("gInput_SessionAction", "none"),
                auto_restart: get_global_bool("gInput_SessionAutoRestart", false),
                restart_mode: get_global("gInput_SessionRestartMode", "bars"),
                restart_bars: get_global_i32("gInput_SessionRestartBars", 0),
                restart_minutes: get_global_i32("gInput_SessionRestartMinutes", 0),
                restart_pips: get_global_i32("gInput_SessionRestartPips", 0),
            }],
        },

        // News Filter
        news_filter: NewsFilterConfig {
            enabled: get_global_bool("gInput_UseNewsFilter", false),
            api_key: get_global("gInput_NewsApiKey", ""),
            api_url: get_global("gInput_NewsApiUrl", ""),
            countries: get_global("gInput_NewsCountries", "US,EU"),
            impact_level: get_global_i32("gInput_NewsImpact", 3),
            minutes_before: get_global_i32("gInput_NewsMinutesBefore", 30),
            minutes_after: get_global_i32("gInput_NewsMinutesAfter", 30),
            action: get_global("gInput_NewsAction", "none"),
            calendar_file: Some(get_global("gInput_NewsCalendarFile", "")),
        },

        // UI
        show_ui: get_global_bool("gInput_ShowUI", true),
        show_trail_lines: get_global_bool("gInput_ShowTrails", false),
        enable_debug: get_global_bool("gInput_EnableDebug", false),
        log_level: get_global_i32("gInput_LogLevel", 1),

        // Trading Days
        trade_monday: get_global_bool("gInput_TradeMonday", true),
        trade_tuesday: get_global_bool("gInput_TradeTuesday", true),
        trade_wednesday: get_global_bool("gInput_TradeWednesday", true),
        trade_thursday: get_global_bool("gInput_TradeThursday", true),
        trade_friday: get_global_bool("gInput_TradeFriday", true),
        trade_saturday: get_global_bool("gInput_TradeSaturday", false),
        trade_sunday: get_global_bool("gInput_TradeSunday", false),

        // Order Comment
        order_comment: get_global("gInput_OrderComment", "DAAVILEFX"),

        // Time Settings
        start_hour: get_global_i32("gInput_StartHour", 0),
        end_hour: get_global_i32("gInput_EndHour", 24),
    })
}

// Add these imports to the main file:
// use crate::mt_bridge::{MTConfig, EngineConfig, GroupConfig, LogicConfig, GeneralConfig, RiskManagementConfig, SessionFilterConfig, NewsFilterConfig};

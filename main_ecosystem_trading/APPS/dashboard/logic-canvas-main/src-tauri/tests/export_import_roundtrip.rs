use app_lib::{
  export_set_file,
  export_massive_v19_setfile,
  import_set_file,
  validate_v19_setfile,
  MTConfig,
  GeneralConfig,
  RiskManagementConfig,
  TimeFiltersConfig,
  TimePrioritySettings,
  SessionConfig,
  NewsFilterConfig,
  EngineConfig,
  GroupConfig,
  LogicConfig,
};

fn base_config() -> MTConfig {
  MTConfig {
    version: "v17".into(),
    platform: "MT4".into(),
    timestamp: "".into(),
    total_inputs: 0,
    last_saved_at: None,
    last_saved_platform: None,
    current_set_name: None,
    tags: None,
    comments: None,
    general: GeneralConfig {
      license_key: "".into(),
      license_server_url: "https://license.daavfx.com".into(),
      require_license: false,
      license_check_interval: 3600,
      config_file_name: "DAAVFX_Config.json".into(),
      config_file_is_common: true,
      allow_buy: true,
      allow_sell: true,
      enable_logs: true,
      use_direct_price_grid: false,
      group_mode: Some(1),
      grid_unit: Some(0),
      pip_factor: Some(0),
      compounding_enabled: false,
      compounding_type: "Compound_Balance".into(),
      compounding_target: 40.0,
      compounding_increase: 2.0,
      restart_policy_power: "Restart_Default".into(),
      restart_policy_non_power: "Restart_Default".into(),
      close_non_power_on_power_close: false,
      hold_timeout_bars: 10,
      magic_number: 777,
      magic_number_buy: 777,
      magic_number_sell: 8988,
      max_slippage_points: 30.0,
      reverse_magic_base: 20000,
      hedge_magic_base: 30000,
      hedge_magic_independent: false,
      risk_management: RiskManagementConfig {
        spread_filter_enabled: false,
        max_spread_points: 25.0,
        equity_stop_enabled: false,
        equity_stop_value: 35.0,
        drawdown_stop_enabled: false,
        max_drawdown_percent: 35.0,
        risk_action: Some("TriggerAction_StopEA_KeepTrades".into()),
      },
      time_filters: TimeFiltersConfig {
        priority_settings: TimePrioritySettings {
          news_filter_overrides_session: false,
          session_filter_overrides_news: true,
        },
        sessions: vec![SessionConfig {
          session_number: 1,
          enabled: false,
          day: 1,
          start_hour: 9,
          start_minute: 30,
          end_hour: 17,
          end_minute: 0,
          action: "TriggerAction_StopEA_KeepTrades".into(),
          auto_restart: true,
          restart_mode: "Restart_Immediate".into(),
          restart_bars: 0,
          restart_minutes: 0,
          restart_pips: 0,
        }],
      },
      news_filter: NewsFilterConfig {
        enabled: false,
        api_key: "".into(),
        api_url: "https://www.jblanked.com/news/api/calendar/".into(),
        countries: "US,GB,EU".into(),
        impact_level: 3,
        minutes_before: 30,
        minutes_after: 30,
        action: "TriggerAction_StopEA_KeepTrades".into(),
        calendar_file: Some("DAAVFX_NEWS.csv".into()),
      },
    },
    engines: vec![EngineConfig {
      engine_id: "A".into(),
      engine_name: "Engine A".into(),
      max_power_orders: 7,
      groups: vec![GroupConfig {
        group_number: 1,
        enabled: true,
        group_power_start: None,
        reverse_mode: false,
        hedge_mode: false,
        hedge_reference: "Logic_None".into(),
        entry_delay_bars: 0,
        logics: vec![LogicConfig {
          logic_name: "POWER".into(),
          logic_id: "POWER".into(),
          enabled: true,
          initial_lot: 0.23,
          initial_lot_b: None,
          initial_lot_s: None,
          multiplier: 1.55,
          multiplier_b: None,
          multiplier_s: None,
          grid: 10.0,
          grid_b: None,
          grid_s: None,
          trail_method: "Trail".into(),
          trail_value: 20.0,
          trail_value_b: None,
          trail_value_s: None,
          trail_start: 5.0,
          trail_start_b: None,
          trail_start_s: None,
          trail_step: 1.0,
          trail_step_b: None,
          trail_step_s: None,
          trail_step_method: "Step".into(),
          start_level: None,
          last_lot: Some(0.55),
          close_targets: "Targets_Default".into(),
          order_count_reference: "Orders_Default".into(),
          reset_lot_on_restart: false,
          strategy_type: "Trail".into(),
          trading_mode: "Trending".into(),
          allow_buy: true,
          allow_sell: true,
          use_tp: false,
          tp_mode: "None".into(),
          tp_value: 0.0,
          use_sl: false,
          sl_mode: "None".into(),
          sl_value: 0.0,
          reverse_enabled: false,
          hedge_enabled: false,
          reverse_scale: 100.0,
          hedge_scale: 50.0,
          reverse_reference: "Logic_None".into(),
          hedge_reference: "Logic_None".into(),
          trail_step_mode: "TrailStepMode_Auto".into(),
          trail_step_cycle: 1,
          trail_step_balance: 0.0,
          trail_step_2: None,
          trail_step_method_2: None,
          trail_step_cycle_2: None,
          trail_step_balance_2: None,
          trail_step_mode_2: None,
          trail_step_3: None,
          trail_step_method_3: None,
          trail_step_cycle_3: None,
          trail_step_balance_3: None,
          trail_step_mode_3: None,
          trail_step_4: None,
          trail_step_method_4: None,
          trail_step_cycle_4: None,
          trail_step_balance_4: None,
          trail_step_mode_4: None,
          trail_step_5: None,
          trail_step_method_5: None,
          trail_step_cycle_5: None,
          trail_step_balance_5: None,
          trail_step_mode_5: None,
          trail_step_6: None,
          trail_step_method_6: None,
          trail_step_cycle_6: None,
          trail_step_balance_6: None,
          trail_step_mode_6: None,
          trail_step_7: None,
          trail_step_method_7: None,
          trail_step_cycle_7: None,
          trail_step_balance_7: None,
          trail_step_mode_7: None,
          close_partial: false,
          close_partial_cycle: 1,
          close_partial_mode: "None".into(),
          close_partial_balance: "None".into(),
          close_partial_trail_step_mode: "TrailStepMode_Auto".into(),
          close_partial_2: None,
          close_partial_cycle_2: None,
          close_partial_mode_2: None,
          close_partial_balance_2: None,
          close_partial_3: None,
          close_partial_cycle_3: None,
          close_partial_mode_3: None,
          close_partial_balance_3: None,
          close_partial_4: None,
          close_partial_cycle_4: None,
          close_partial_mode_4: None,
          close_partial_balance_4: None,
          trigger_type: None,
          trigger_bars: None,
          trigger_minutes: None,
          trigger_pips: None,
        }],
      }],
    }],
  }
}

#[test]
fn export_contains_edited_values() {
  let cfg = base_config();
  let tmp = std::env::temp_dir().join("daavfx_roundtrip.set");
  let path_str = tmp.to_string_lossy().to_string();
  let r = export_set_file(cfg.clone(), path_str.clone(), "MT4".into(), true, Some("BOTH".into()), Some(vec!["test".into()]), Some("roundtrip".into()));
  assert!(r.is_ok());
  let content = std::fs::read_to_string(&tmp).unwrap();
  assert!(content.contains("gInput_Initial_loT_"));
  assert!(content.contains("0.23"));
  assert!(content.contains("1.55"));
  assert!(content.contains("0.55"));
}

#[test]
fn massive_v19_export_has_expected_structure() {
  let cfg = base_config();
  let tmp = std::env::temp_dir().join("daavfx_massive_v19.set");
  let path_str = tmp.to_string_lossy().to_string();

  export_massive_v19_setfile(cfg.clone(), path_str.clone(), "MT5".into()).expect("export failed");

  let file_content = std::fs::read_to_string(&tmp).expect("read failed");
  let validation = validate_v19_setfile(&file_content);

  assert!(validation.is_valid, "v19 invalid: {:?}", validation.errors);
  assert_eq!(validation.logic_directions, 630);
  assert_eq!(validation.fields_per_logic, 110);
  assert!(validation.total_inputs >= 69300);
}

#[tokio::test]
async fn import_restores_values() {
  let cfg = base_config();
  let tmp = std::env::temp_dir().join("daavfx_roundtrip_import.set");
  let path_str = tmp.to_string_lossy().to_string();
  let r = export_set_file(cfg.clone(), path_str.clone(), "MT4".into(), false, Some("BOTH".into()), None, None);
  assert!(r.is_ok());
  let imported = import_set_file(path_str.clone()).await.unwrap();
  let logic = &imported.engines[0].groups[0].logics[0];
  assert!((logic.initial_lot - 0.23).abs() < 1e-6);
  assert!((logic.multiplier - 1.55).abs() < 1e-6);
  assert!((logic.grid - 10.0).abs() < 1e-6);
  assert_eq!(logic.logic_name, "Power");
}

#[tokio::test]
async fn massive_v19_export_then_import_overrides_values() {
  let mut cfg = base_config();
  cfg.general.magic_number_buy = 111;
  cfg.general.magic_number_sell = 222;

  let tmp = std::env::temp_dir().join("daavfx_massive_v19_roundtrip.set");
  let path_str = tmp.to_string_lossy().to_string();

  export_massive_v19_setfile(cfg.clone(), path_str.clone(), "MT5".into()).expect("export failed");

  let imported = import_set_file(path_str.clone()).await.expect("import failed");

  assert_eq!(imported.general.magic_number_buy, 111);
  assert_eq!(imported.general.magic_number_sell, 222);
  assert_eq!(imported.engines.len(), 3);
  assert_eq!(imported.engines[0].groups.len(), 15);

  let engine_a = imported.engines.iter().find(|e| e.engine_id == "A").unwrap();
  let group1 = engine_a.groups.iter().find(|g| g.group_number == 1).unwrap();
  let power = group1.logics.iter().find(|l| l.logic_name == "POWER").unwrap();

  assert_eq!(power.initial_lot_b.unwrap(), 0.23);
  assert_eq!(power.multiplier_b.unwrap(), 1.55);
  assert_eq!(power.grid_b.unwrap(), 10.0);
  assert_eq!(power.last_lot.unwrap(), 0.55);
}

/**
 * @deprecated ARCHIVED 2025-02-18
 * This file contains old unified-format conversion logic.
 * It is kept for reference but should NOT be used in production.
 * Use export_massive_v19_setfile() instead for the current Buy/Sell split format.
 * Archived in: _archive/deprecated_2025-02-18/
 */

import { MTConfig, EngineConfig, GroupConfig, LogicConfig, DirectionConfig, TradeDirection, createDirectionConfig, getDirectionValue } from "@/types/mt-config";

export interface BuySellSeparatedConfig {
  version: "9.0";
  magic_buy: number;
  magic_sell: number;
  engines: Array<{
    engine_id: string;
    groups: Array<{
      group_number: number;
      logics: Array<{
        logic_name: string;
        buy: DirectionConfig;
        sell: DirectionConfig;
      }>;
    }>;
  }>;
}

export interface UnifiedToSeparatedOptions {
  preserveUnifiedAsBuy?: boolean;
}

export function convertUnifiedToSeparated(config: MTConfig, options: UnifiedToSeparatedOptions = {}): BuySellSeparatedConfig {
  const { preserveUnifiedAsBuy = true } = options;

  return {
    version: "9.0",
    magic_buy: config.general.magic_number_buy,
    magic_sell: config.general.magic_number_sell,
    engines: config.engines.map(engine => ({
      engine_id: engine.engine_id,
      groups: engine.groups.map(group => ({
        group_number: group.group_number,
        logics: group.logics.map(logic => ({
          logic_name: logic.logic_name,
          buy: convertLogicToDirectionConfig(logic, preserveUnifiedAsBuy),
          sell: convertLogicToDirectionConfig(logic, preserveUnifiedAsBuy)
        }))
      }))
    }))
  };
}

function convertLogicToDirectionConfig(logic: LogicConfig, preserveUnifiedAsBuy: boolean): DirectionConfig {
  const unifiedValue = (val: number) => val;

  return {
    unified: unifiedValue(0),
    buy: unifiedValue(0),
    sell: unifiedValue(0)
  };
}

export function convertSeparatedToUnified(config: BuySellSeparatedConfig): MTConfig {
  return {
    version: "1.0.0",
    platform: "MT5",
    timestamp: new Date().toISOString(),
    total_inputs: 0,
    current_set_name: "Converted_Config.set",
    general: {
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
      compounding_enabled: false,
      compounding_type: "Compound_Balance",
      compounding_target: 40.0,
      compounding_increase: 2.0,
      restart_policy_power: "Restart_Default",
      restart_policy_non_power: "Restart_Default",
      close_non_power_on_power_close: false,
      hold_timeout_bars: 10,
      magic_number: config.magic_buy,
      magic_number_buy: config.magic_buy,
      magic_number_sell: config.magic_sell,
      max_slippage_points: 30.0,
      reverse_magic_base: 20000,
      hedge_magic_base: 30000,
      hedge_magic_independent: false,
      risk_management: {
        spread_filter_enabled: false,
        max_spread_points: 25.0,
        equity_stop_enabled: false,
        equity_stop_value: 35.0,
        drawdown_stop_enabled: false,
        max_drawdown_percent: 35.0
      },
      time_filters: {
        priority_settings: {
          news_filter_overrides_session: false,
          session_filter_overrides_news: true
        },
        sessions: []
      },
      news_filter: {
        enabled: false,
        api_key: "",
        api_url: "https://www.jblanked.com/news/api/calendar/",
        countries: "US,GB,EU",
        impact_level: 3,
        minutes_before: 30,
        minutes_after: 30,
        action: "TriggerAction_StopEA_KeepTrades"
      }
    },
    engines: config.engines.map(engine => ({
      engine_id: engine.engine_id as "A" | "B" | "C",
      engine_name: `Engine ${engine.engine_id}`,
      max_power_orders: 5,
      groups: engine.groups.map(group => ({
        group_number: group.group_number,
        enabled: true,
        reverse_mode: false,
        hedge_mode: false,
        hedge_reference: "Logic_None",
        entry_delay_bars: 0,
        logics: group.logics.map(logic => ({
          logic_name: logic.logic_name,
          logic_id: `${engine.engine_id}_${logic.logic_name}_G${group.group_number}`,
          enabled: true,
          initial_lot: 0.01,
          multiplier: 1.5,
          grid: 500,
          trail_method: "Points" as const,
          trail_value: 50,
          trail_start: 20,
          trail_step: 10,
          trail_step_method: "Step_Points" as const,
          close_targets: "",
          order_count_reference: "Logic_Self" as const,
          reset_lot_on_restart: true,
          use_tp: true,
          tp_mode: "TPSL_Points" as const,
          tp_value: 500,
          use_sl: true,
          sl_mode: "TPSL_Points" as const,
          sl_value: 1000,
          reverse_enabled: false,
          hedge_enabled: false,
          reverse_scale: 100.0,
          hedge_scale: 50.0,
          reverse_reference: "Logic_None" as const,
          hedge_reference: "Logic_None" as const,
          trail_step_mode: "TrailStepMode_Auto" as const,
          trail_step_cycle: 1,
          trail_step_balance: 0.0,
          trail_step_2: 0,
          trail_step_method_2: "Step_Points" as const,
          trail_step_cycle_2: 1,
          trail_step_balance_2: 0.0,
          trail_step_mode_2: "TrailStepMode_Auto" as const,
          trail_step_3: 0,
          trail_step_method_3: "Step_Points" as const,
          trail_step_cycle_3: 1,
          trail_step_balance_3: 0.0,
          trail_step_mode_3: "TrailStepMode_Auto" as const,
          trail_step_4: 0,
          trail_step_method_4: "Step_Points" as const,
          trail_step_cycle_4: 1,
          trail_step_balance_4: 0.0,
          trail_step_mode_4: "TrailStepMode_Auto" as const,
          trail_step_5: 0,
          trail_step_method_5: "Step_Points" as const,
          trail_step_cycle_5: 1,
          trail_step_balance_5: 0.0,
          trail_step_mode_5: "TrailStepMode_Auto" as const,
          trail_step_6: 0,
          trail_step_method_6: "Step_Points" as const,
          trail_step_cycle_6: 1,
          trail_step_balance_6: 0.0,
          trail_step_mode_6: "TrailStepMode_Auto" as const,
          trail_step_7: 0,
          trail_step_method_7: "Step_Points" as const,
          trail_step_cycle_7: 1,
          trail_step_balance_7: 0.0,
          trail_step_mode_7: "TrailStepMode_Auto" as const,
          close_partial: false,
          close_partial_cycle: 3,
          close_partial_mode: "PartialMode_Balanced" as const,
          close_partial_balance: "PartialBalance_Balanced" as const,
          close_partial_trail_step_mode: "TrailStepMode_Auto" as const,
          close_partial_2: false,
          close_partial_cycle_2: 3,
          close_partial_mode_2: "PartialMode_Balanced" as const,
          close_partial_balance_2: "PartialBalance_Balanced" as const,
          close_partial_3: false,
          close_partial_cycle_3: 3,
          close_partial_mode_3: "PartialMode_Balanced" as const,
          close_partial_balance_3: "PartialBalance_Balanced" as const,
          close_partial_4: false,
          close_partial_cycle_4: 3,
          close_partial_mode_4: "PartialMode_Balanced" as const,
          close_partial_balance_4: "PartialBalance_Balanced" as const
        }))
      }))
    }))
  };
}

export function getValueForDirection(config: DirectionConfig, direction: TradeDirection): number {
  return getDirectionValue(config, direction);
}

export function createBuySellPair<T>(buyValue: T, sellValue: T): { buy: T; sell: T } {
  return { buy: buyValue, sell: sellValue };
}

export function validateBuySellSeparated(config: BuySellSeparatedConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.version !== "9.0") {
    errors.push(`Invalid version: expected "9.0", got "${config.version}"`);
  }

  if (config.magic_buy <= 0) {
    errors.push("magic_buy must be positive");
  }

  if (config.magic_sell <= 0) {
    errors.push("magic_sell must be positive");
  }

  if (config.magic_buy === config.magic_sell) {
    errors.push("magic_buy and magic_sell should be different");
  }

  if (!config.engines || config.engines.length === 0) {
    errors.push("At least one engine is required");
  }

  config.engines?.forEach((engine, engIndex) => {
    if (!engine.groups || engine.groups.length === 0) {
      errors.push(`Engine ${engine.engine_id} must have at least one group`);
    }

    engine.groups?.forEach((group, grpIndex) => {
      if (!group.logics || group.logics.length === 0) {
        errors.push(`Engine ${engine.engine_id} Group ${group.group_number} must have at least one logic`);
      }

      group.logics?.forEach((logic, logIndex) => {
        if (logic.buy === undefined || logic.buy === null) {
          errors.push(`Engine ${engine.engine_id} Group ${group.group_number} Logic ${logic.logic_name} buy config is required`);
        }
        if (logic.sell === undefined || logic.sell === null) {
          errors.push(`Engine ${engine.engine_id} Group ${group.group_number} Logic ${logic.logic_name} sell config is required`);
        }
      });
    });
  });

  return { valid: errors.length === 0, errors };
}

export function mergeBuySellConfigs(buyConfig: Partial<BuySellSeparatedConfig>, sellConfig: Partial<BuySellSeparatedConfig>): BuySellSeparatedConfig {
  const result: BuySellSeparatedConfig = {
    version: "9.0",
    magic_buy: buyConfig.magic_buy ?? sellConfig.magic_buy ?? 0,
    magic_sell: buyConfig.magic_sell ?? sellConfig.magic_sell ?? 0,
    engines: []
  };

  const allEngines = new Set([
    ...(buyConfig.engines?.map(e => e.engine_id) ?? []),
    ...(sellConfig.engines?.map(e => e.engine_id) ?? [])
  ]);

  result.engines = Array.from(allEngines).map(engineId => {
    const buyEngine = buyConfig.engines?.find(e => e.engine_id === engineId);
    const sellEngine = sellConfig.engines?.find(e => e.engine_id === engineId);

    const allGroups = new Set([
      ...(buyEngine?.groups?.map(g => g.group_number) ?? []),
      ...(sellEngine?.groups?.map(g => g.group_number) ?? [])
    ]);

    return {
      engine_id: engineId,
      groups: Array.from(allGroups).map(groupNum => {
        const buyGroup = buyEngine?.groups?.find(g => g.group_number === groupNum);
        const sellGroup = sellEngine?.groups?.find(g => g.group_number === groupNum);

        const allLogics = new Set([
          ...(buyGroup?.logics?.map(l => l.logic_name) ?? []),
          ...(sellGroup?.logics?.map(l => l.logic_name) ?? [])
        ]);

        return {
          group_number: groupNum,
          logics: Array.from(allLogics).map(logicName => {
            const buyLogic = buyGroup?.logics?.find(l => l.logic_name === logicName);
            const sellLogic = sellGroup?.logics?.find(l => l.logic_name === logicName);

            return {
              logic_name: logicName,
              buy: buyLogic?.buy ?? sellLogic?.buy ?? createDirectionConfig(0),
              sell: buyLogic?.sell ?? sellLogic?.sell ?? createDirectionConfig(0)
            };
          })
        };
      })
    };
  });

  return result;
}

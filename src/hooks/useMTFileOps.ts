
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import type { MTConfig, Platform } from "@/types/mt-config";
import { useMTConfig } from "./useMTConfig";
import { useSettings } from "@/contexts/SettingsContext";
import { withUseDirectPriceGrid } from "@/utils/unit-mode";
import { generateCompleteSetfile } from "@/lib/export/complete-setfile-generator";
import { generateMassiveCompleteConfig, printConfigStats } from "@/lib/setfile/massive-generator";
import { exportToSetFile } from "@/lib/setfile/exporter";
import type { MTConfig as MTConfigComplete } from "@/types/mt-config-complete";

export type ActiveSetStatus = {
  path: string;
  exists: boolean;
  keys_total: number;
  keys_start: number;
  ready: boolean;
  last_modified_ms?: number | null;
};

export function useMTFileOps(platform: Platform, externalConfig?: MTConfig | null) {
  // Ensure platform is uppercase to match backend expectations (MT4/MT5)
  const mtPlatform = platform.toUpperCase() as Platform;
  const { config: internalConfig, loadConfig, saveConfig, setConfigOnly } = useMTConfig(mtPlatform);
  const { settings } = useSettings();
  
  // Use external config if provided, otherwise fall back to internal state
  const config = externalConfig !== undefined ? externalConfig : internalConfig;
  const [activeSetStatus, setActiveSetStatus] = useState<ActiveSetStatus | null>(null);
  const lastAutoSyncedStampRef = useRef<string>("");

  const exportSetFile = useCallback(async () => {
    if (!config) {
      toast.error("No configuration loaded to export");
      return;
    }

    try {
      const filePath = await save({
        filters: [{
          name: 'MT4/MT5 Set File',
          extensions: ['set']
        }],
        defaultPath: `${mtPlatform}_Config.set`
      });

      if (!filePath) return; // User cancelled

      const configToExport = withUseDirectPriceGrid(config, settings);

      await invoke("export_set_file", {
        config: configToExport,
        filePath,
        platform: mtPlatform,
        includeOptimizationHints: true,
        tags: undefined,
        comments: undefined
      });

      toast.success("Successfully exported .set file");
    } catch (err) {
      console.error("Export error:", err);
      toast.error(`Failed to export .set file: ${err}`);
    }
  }, [config, mtPlatform, settings]);

  const refreshActiveSetStatus = useCallback(async () => {
    try {
      const status = await invoke<ActiveSetStatus>("get_active_set_status");
      setActiveSetStatus(status);
      return status;
    } catch {
      return null;
    }
  }, []);

  const syncActiveSetToMTCommonFiles = useCallback(async (silent?: boolean, markStamp?: string) => {
    if (!config) {
      if (!silent) toast.error("No configuration loaded to export");
      return;
    }

    try {
      const configToExport = withUseDirectPriceGrid(config, settings);
      const writtenPath = await invoke<string>("export_active_set_file_to_mt_common_files", {
        config: configToExport,
        platform: mtPlatform,
        includeOptimizationHints: true
      });
      if (markStamp !== undefined) {
        lastAutoSyncedStampRef.current = markStamp;
      }
      await refreshActiveSetStatus();
      if (!silent) toast.success(`Synced ACTIVE.set to MT Common Files:\n${writtenPath}`);
    } catch (err) {
      console.error("Sync ACTIVE.set error:", err);
      if (!silent) toast.error(`Failed to sync ACTIVE.set: ${err}`);
    }
  }, [config, mtPlatform, settings, refreshActiveSetStatus]);

  const exportSetFileToMTCommonFiles = useCallback(async () => {
    await syncActiveSetToMTCommonFiles(false);
  }, [syncActiveSetToMTCommonFiles]);

  const importSetFile = useCallback(async () => {
    try {
      const filePath = await open({
        filters: [{
          name: 'MT4/MT5 Set File',
          extensions: ['set']
        }]
      });

      if (!filePath) return;

      const importedConfig = await invoke<MTConfig>("import_set_file", {
        filePath
      });

      await saveConfig(importedConfig);
      await loadConfig();
      toast.success("Successfully imported .set file");
    } catch (err) {
      console.error("Import error:", err);
      toast.error(`Failed to import .set file: ${err}`);
    }
  }, [saveConfig, loadConfig]);



  const loadConfigOnly = useCallback(async (newConfig: MTConfig) => {
    console.log("[SETFILE] Processing config with", newConfig?.engines?.length, "engines");
    
    // Count total logic-directions
    let totalLogics = 0;
    newConfig?.engines?.forEach(e => {
      e.groups?.forEach(g => {
        totalLogics += g.logics?.length || 0;
      });
    });
    console.log("[SETFILE] Total logic-directions:", totalLogics);
    
    const nowIso = new Date().toISOString();
    const enrichedConfig: MTConfig = {
      ...newConfig,
      last_saved_at: nowIso,
      last_saved_platform: mtPlatform,
      current_set_name: "massive_generated.set",
    };
    setConfigOnly(enrichedConfig);
    console.log("[SETFILE] Config applied to state");
  }, [mtPlatform, setConfigOnly]);

  const generateMassiveSetfile = useCallback(async () => {
    console.log("[GENERATE] Creating massive setfile with 15 groups x 3 engines x 7 logics");
    
    const logicTypes = ["Power", "Repower", "Scalper", "Stopper", "STO", "SCA", "RPO"];
    const engines: Array<"A" | "B" | "C"> = ["A", "B", "C"];
    
    const generatedEngines = engines.map(engineId => {
      const engineName = `Engine ${engineId}`;
      const groups = [];
      
      for (let groupNum = 1; groupNum <= 15; groupNum++) {
        const logics = logicTypes.map((logicType, logicIndex) => {
          const isPower = logicType === "Power";
          
          const baseConfig = {
            // Trail steps (2-7) with variations
            trail_step_2: 150 + (logicIndex * 25),
            trail_step_method_2: logicIndex % 2 === 0 ? "Step_Points" as const : "Step_Percent" as const,
            trail_step_cycle_2: 2 + (logicIndex % 3),
            trail_step_balance_2: 1000 + (groupNum * 100),
            trail_step_mode_2: "TrailStepMode_Auto" as const,

            trail_step_3: 200 + (logicIndex * 30),
            trail_step_method_3: logicIndex % 3 === 0 ? "Step_Points" as const : "Step_Percent" as const,
            trail_step_cycle_3: 3 + (logicIndex % 2),
            trail_step_balance_3: 1500 + (groupNum * 150),
            trail_step_mode_3: "TrailStepMode_Fixed" as const,

            trail_step_4: 250 + (logicIndex * 35),
            trail_step_method_4: "Step_Points" as const,
            trail_step_cycle_4: 4 + (logicIndex % 2),
            trail_step_balance_4: 2000 + (groupNum * 200),
            trail_step_mode_4: "TrailStepMode_PerOrder" as const,

            trail_step_5: 300 + (logicIndex * 40),
            trail_step_method_5: "Step_Percent" as const,
            trail_step_cycle_5: 5,
            trail_step_balance_5: 2500 + (groupNum * 250),
            trail_step_mode_5: "TrailStepMode_Disabled" as const,

            trail_step_6: 350 + (logicIndex * 45),
            trail_step_method_6: "Step_Points" as const,
            trail_step_cycle_6: 6,
            trail_step_balance_6: 3000 + (groupNum * 300),
            trail_step_mode_6: "TrailStepMode_Auto" as const,

            trail_step_7: 400 + (logicIndex * 50),
            trail_step_method_7: "Step_Percent" as const,
            trail_step_cycle_7: 7,
            trail_step_balance_7: 3500 + (groupNum * 350),
            trail_step_mode_7: "TrailStepMode_Fixed" as const,

            // Close partial (2-4) with variations
            close_partial_2: logicIndex % 2 === 0,
            close_partial_cycle_2: 10 + (logicIndex * 5),
            close_partial_mode_2: logicIndex % 3 === 0 ? "PartialMode_Low" as const : 
                               logicIndex % 3 === 1 ? "PartialMode_High" as const : "PartialMode_Balanced" as const,
            close_partial_balance_2: logicIndex % 2 === 0 ? "PartialBalance_Aggressive" as const : "PartialBalance_Conservative" as const,

            close_partial_3: logicIndex % 3 === 0,
            close_partial_cycle_3: 15 + (logicIndex * 7),
            close_partial_mode_3: logicIndex % 2 === 0 ? "PartialMode_High" as const : "PartialMode_Low" as const,
            close_partial_balance_3: "PartialBalance_Balanced" as const,

            close_partial_4: logicIndex % 2 === 0,
            close_partial_cycle_4: 20 + (logicIndex * 10),
            close_partial_mode_4: "PartialMode_Balanced" as const,
            close_partial_balance_4: "PartialBalance_Aggressive" as const,
          };

          const logicConfig: any = {
            // METADATA
            logic_name: logicType,
            logic_id: `${engineId}_${logicType}_G${groupNum}`,
            enabled: true,
            
            // BASE PARAMS
            initial_lot: 0.01 + (logicIndex * 0.01),
            multiplier: 1.5 + (logicIndex * 0.1),
            grid: 50 + (logicIndex * 10) + (groupNum * 5),
            trail_method: logicIndex % 4 === 0 ? "Points" as const : 
                         logicIndex % 4 === 1 ? "AVG_Percent" as const :
                         logicIndex % 4 === 2 ? "AVG_Points" as const : "Percent" as const,
            trail_value: 100 + (logicIndex * 20),
            trail_start: 20 + (logicIndex * 5),
            trail_step: 25 + (logicIndex * 5),
            trail_step_method: logicIndex % 3 === 0 ? "Step_Points" as const : 
                               logicIndex % 3 === 1 ? "Step_Percent" as const : "Step_Pips" as const,
            
            // LOGIC-SPECIFIC (Power has fewer fields)
            ...(isPower ? {} : {
              start_level: 100 + (logicIndex * 50) + (groupNum * 25),
              last_lot: 0.01 + (logicIndex * 0.005),
            }),
            close_targets: `Logic_${engineId}_Power,Logic_${engineId}_Repower`,
            order_count_reference: `Logic_${engineId}_Power` as const,
            reset_lot_on_restart: logicIndex % 2 === 0,
            
            // TPSL
            use_tp: true,
            tp_mode: "TPSL_Points" as const,
            tp_value: 200 + (logicIndex * 50),
            use_sl: true,
            sl_mode: "TPSL_Points" as const,
            sl_value: 100 + (logicIndex * 25),
            
            // REVERSE/HEDGE
            reverse_enabled: logicIndex % 3 === 0,
            hedge_enabled: logicIndex % 3 === 1,
            reverse_scale: 100 + (logicIndex * 10),
            hedge_scale: 50 + (logicIndex * 5),
            reverse_reference: `Logic_${engineId}_Power` as const,
            hedge_reference: `Logic_${engineId}_Repower` as const,
            
            // TRAIL STEP ADVANCED
            trail_step_mode: logicIndex % 4 === 0 ? "TrailStepMode_Auto" as const :
                             logicIndex % 4 === 1 ? "TrailStepMode_Fixed" as const :
                             logicIndex % 4 === 2 ? "TrailStepMode_PerOrder" as const : "TrailStepMode_Disabled" as const,
            trail_step_cycle: 1 + (logicIndex % 5),
            trail_step_balance: 1000 + (groupNum * 100),
            
            // CLOSE PARTIAL
            close_partial: logicIndex % 2 === 0,
            close_partial_cycle: 5 + (logicIndex * 3),
            close_partial_mode: logicIndex % 3 === 0 ? "PartialMode_Low" as const :
                               logicIndex % 3 === 1 ? "PartialMode_High" as const : "PartialMode_Balanced" as const,
            close_partial_balance: logicIndex % 3 === 0 ? "PartialBalance_Aggressive" as const :
                                  logicIndex % 3 === 1 ? "PartialBalance_Conservative" as const : "PartialBalance_Balanced" as const,
            close_partial_trail_step_mode: "TrailStepMode_Auto" as const,
            
            // EXTENDED FIELDS
            ...baseConfig,
            
            // GROUP 1 ONLY fields
            ...(groupNum === 1 ? {
              trigger_type: "Immediate",
              trigger_bars: 10 + (logicIndex * 5),
              trigger_minutes: 30 + (logicIndex * 15),
              trigger_pips: 20 + (logicIndex * 10),
            } : {}),
          };
          
          return logicConfig;
        });
        
        const group = {
          group_number: groupNum,
          enabled: true,
          group_power_start: groupNum === 1 ? undefined : (groupNum - 1) * 3,
          reverse_mode: groupNum % 3 === 0,
          hedge_mode: groupNum % 3 === 1,
          hedge_reference: `Logic_${engineId}_Power` as const,
          entry_delay_bars: groupNum % 5,
          logics,
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
    
    const massiveConfig: MTConfig = {
      version: "17.04",
      platform: mtPlatform,
      timestamp: new Date().toISOString(),
      total_inputs: 15 * 3 * 7 * 88, // Approximate
      general: {
        // License
        license_key: "",
        license_server_url: "",
        require_license: false,
        license_check_interval: 3600,
        
        // Config
        config_file_name: `MASSIVE_${mtPlatform}.set`,
        config_file_is_common: false,
        
        // Trading
        allow_buy: true,
        allow_sell: true,
        
        // Logging
        enable_logs: true,
        use_direct_price_grid: false,
        
        // Clean EA math controls
        group_mode: 0,
        grid_unit: 0,
        pip_factor: 0,
        
        // Compounding
        compounding_enabled: false,
        compounding_type: "Compound_Balance" as const,
        compounding_target: 1000,
        compounding_increase: 10,
        
        // Restart Policy
        restart_policy_power: "Restart_Default" as const,
        restart_policy_non_power: "Restart_Default" as const,
        close_non_power_on_power_close: false,
        hold_timeout_bars: 0,
        
        // Global System Settings
        magic_number: 12345,
        magic_number_buy: 12345,
        magic_number_sell: 12346,
        max_slippage_points: 3,
        
        // Risk Management
        risk_management: {
          spread_filter_enabled: true,
          max_spread_points: 30,
          equity_stop_enabled: false,
          equity_stop_value: 0,
          drawdown_stop_enabled: true,
          max_drawdown_percent: 20,
          risk_action: "CloseAll",
        },
        
        // Time Filters
        time_filters: {
          priority_settings: {
            news_filter_overrides_session: true,
            session_filter_overrides_news: false,
          },
          sessions: [],
        },
        
        // News Filter
        news_filter: {
          enabled: false,
          api_key: "",
          api_url: "",
          countries: "US,GB,EU",
          impact_level: 3,
          minutes_before: 30,
          minutes_after: 30,
          action: "StopTrading",
        },
      },
      engines: generatedEngines,
    };
    
    console.log("[GENERATE] Generated massive config with", massiveConfig.engines.length, "engines");
    console.log("[GENERATE] Total groups:", massiveConfig.engines.reduce((sum, e) => sum + e.groups.length, 0));
    console.log("[GENERATE] Total logics:", massiveConfig.engines.reduce((sum, e) => 
      sum + e.groups.reduce((gSum, g) => gSum + g.logics.length, 0), 0));
    
    await loadConfigOnly(massiveConfig);
    toast.success(`Generated massive setfile: 15 groups × 3 engines × 7 logics = 315 total logics`);
  }, [mtPlatform, loadConfigOnly]);

  const importSetFileLocally = useCallback(async (configToLoad?: MTConfig) => {
    try {
      let importedConfig: MTConfig;
      
      if (configToLoad) {
        importedConfig = configToLoad;
      } else {
        const filePath = await open({
          filters: [{
            name: 'MT4/MT5 Set File',
            extensions: ['set']
          }]
        });

        if (!filePath) return;

        console.log("[SETFILE] Loading setfile:", filePath);
        importedConfig = await invoke<MTConfig>("import_set_file", {
          filePath
        });
      }

      console.log("[SETFILE] Imported config engines:", importedConfig?.engines?.length);
      console.log("[SETFILE] Config loaded successfully");

      await loadConfigOnly(importedConfig);
      toast.success("Loaded .set file locally (not synced to MT)");
    } catch (err) {
      console.error("[SETFILE] Import error:", err);
      toast.error(`Failed to load .set file: ${err}`);
    }
  }, [loadConfigOnly]);

  const exportJsonFile = useCallback(async () => {
    if (!config) {
      toast.error("No configuration loaded to export");
      return;
    }

    try {
      const filePath = await save({
        filters: [{
          name: 'JSON Configuration',
          extensions: ['json']
        }],
        defaultPath: `${mtPlatform}_Config.json`
      });

      if (!filePath) return;

      await invoke("export_json_file", {
        config,
        filePath
      });

      toast.success("Successfully exported JSON file");
    } catch (err) {
      console.error("Export error:", err);
      toast.error(`Failed to export JSON file: ${err}`);
    }
  }, [config, mtPlatform]);

  const exportCompleteV3LegacySetfile = useCallback(async () => {
    try {
      const filePath = await save({
        filters: [{
          name: 'MT4 V3 Legacy Complete Set File',
          extensions: ['set']
        }],
        defaultPath: `xauusd_hardcoded_1.set`
      });

      if (!filePath) return;

      const setfileContent = generateCompleteSetfile(config);

      await invoke("write_text_file", {
        path: filePath,
        content: setfileContent
      });

      toast.success(`Successfully exported complete V3 legacy setfile (${setfileContent.split('\n').length} lines)`);
    } catch (err) {
      console.error("Export complete setfile error:", err);
      toast.error(`Failed to export complete setfile: ${err}`);
    }
  }, [config]);

  const exportMassiveCompleteSetfile = useCallback(async () => {
    try {
      console.log("[EXPORT] Generating massive complete setfile with all 55,500+ inputs...");
      
      // Generate the complete config
      const massiveConfig = generateMassiveCompleteConfig();
      printConfigStats(massiveConfig);
      
      console.log(`[EXPORT] Generated config with ${massiveConfig.total_inputs.toLocaleString()} inputs`);
      
      // Export to setfile format string using TypeScript exporter
      const setfileContent = exportToSetFile(massiveConfig as any);
      const lineCount = setfileContent.split('\n').length;
      
      console.log(`[EXPORT] Generated setfile content with ${lineCount.toLocaleString()} lines`);
      
      // Save to file using dialog
      const filePath = await save({
        filters: [{
          name: 'MT4 Complete Massive Set File',
          extensions: ['set']
        }],
        defaultPath: `DAAVILEFX_MASSIVE_COMPLETE.set`
      });

      if (!filePath) return;

      // Use write_text_file to save the content
      await invoke("write_text_file", {
        filePath,
        content: setfileContent
      });

      toast.success(`Exported massive setfile: ${lineCount.toLocaleString()} lines to ${filePath.split('\\').pop()}`);
      console.log("[EXPORT] Successfully exported to:", filePath);
      
      return massiveConfig;
    } catch (err) {
      console.error("[EXPORT] Error:", err);
      toast.error(`Failed to export massive setfile: ${err}`);
      throw err;
    }
  }, []);

  const importJsonFile = useCallback(async () => {
    try {
      const filePath = await open({
        filters: [{
          name: 'JSON Configuration',
          extensions: ['json']
        }]
      });

      if (!filePath) return; // User cancelled

      const importedConfig = await invoke<MTConfig>("import_json_file", {
        filePath
      });

      await saveConfig(importedConfig);
      await loadConfig(); // Refresh state

      toast.success("Successfully imported JSON file");
    } catch (err) {
      console.error("Import error:", err);
      toast.error(`Failed to import JSON file: ${err}`);
    }
  }, [saveConfig, loadConfig]);

  useEffect(() => {
    const isTauri = typeof window !== "undefined" && (
      (window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__
    );
    if (!isTauri) return;
    refreshActiveSetStatus();
  }, [refreshActiveSetStatus]);

  useEffect(() => {
    if (!config) return;
    if (mtPlatform !== "MT4") return;
    const isTauri = typeof window !== "undefined" && (
      (window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__
    );
    if (!isTauri) return;
    const stamp = (config as any).last_saved_at || "";
    if (!stamp) return;
    if (stamp === lastAutoSyncedStampRef.current) return;
    const t = window.setTimeout(() => {
      syncActiveSetToMTCommonFiles(true, stamp);
    }, 650);
    return () => window.clearTimeout(t);
  }, [config, mtPlatform, syncActiveSetToMTCommonFiles]);

  return {
    exportSetFile,
    exportSetFileToMTCommonFiles,
    importSetFile,
    importSetFileLocally,
    exportJsonFile,
    importJsonFile,
    exportCompleteV3LegacySetfile,
    exportMassiveCompleteSetfile,
    generateMassiveSetfile,
    activeSetStatus,
    refreshActiveSetStatus,
    syncActiveSetToMTCommonFiles
  };
}

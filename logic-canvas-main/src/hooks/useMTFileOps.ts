import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import type { MTConfig } from "@/types/mt-config";
import { useMTConfig } from "./useMTConfig";
import { useSettings } from "@/contexts/SettingsContext";
import { withUseDirectPriceGrid } from "@/utils/unit-mode";
import { generateCompleteSetfile } from "@/lib/export/complete-setfile-generator";
import {
  generateMassiveCompleteConfig,
  printConfigStats,
} from "@/lib/config/generateMassiveConfig";
import {
  exportToSetFile,
  exportToSetFileWithDirections,
} from "@/lib/setfile/exporter";
import type { MTConfig as MTConfigComplete } from "@/types/mt-config-complete";

export type ActiveSetStatus = {
  path: string;
  exists: boolean;
  keys_total: number;
  keys_start: number;
  ready: boolean;
  last_modified_ms?: number | null;
};

export function useMTFileOps(
  platform?: "MT4" | "MT5",
  externalConfig?: MTConfig | null,
  onLoadConfig?: (config: MTConfig) => void,
) {
  const mtPlatform = (platform ?? "MT4") as "MT4" | "MT5";
  const {
    config: internalConfig,
    loadConfig,
    saveConfig,
    setConfigOnly,
  } = useMTConfig(mtPlatform);
  const { settings } = useSettings();
  const tauriAvailable =
    typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
  const downloadTextFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Use external config if provided, otherwise fall back to internal state
  const config = externalConfig !== undefined ? externalConfig : internalConfig;
  const [activeSetStatus, setActiveSetStatus] =
    useState<ActiveSetStatus | null>(null);
  const lastAutoSyncedStampRef = useRef<string>("");

  const loadConfigOnly = useCallback(
    async (newConfig: MTConfig) => {
      console.log(
        "[SETFILE] Processing config with",
        newConfig?.engines?.length,
        "engines",
      );

      let totalLogics = 0;
      newConfig?.engines?.forEach((e) => {
        e.groups?.forEach((g) => {
          totalLogics += g.logics?.length || 0;
        });
      });
      console.log("[SETFILE] Total logic-directions:", totalLogics);

      const nowIso = new Date().toISOString();
      const enrichedConfig: MTConfig = {
        ...newConfig,
        last_saved_at: nowIso,
        last_saved_platform: mtPlatform,
      };
      setConfigOnly(enrichedConfig);

      if (onLoadConfig) {
        onLoadConfig(enrichedConfig);
        console.log("[SETFILE] Notified parent component of config load");
      }

      console.log("[SETFILE] Config applied to state");
    },
    [mtPlatform, setConfigOnly, onLoadConfig],
  );

  const exportSetFile = useCallback(async () => {
    if (!config) {
      toast.error("No configuration loaded to export");
      return;
    }

    try {
      const configToExport = withUseDirectPriceGrid(config, settings);
      if (tauriAvailable) {
        const filePath = await save({
          filters: [
            {
              name: "Set File",
              extensions: ["set"],
            },
          ],
          defaultPath: `Config.set`,
        });

        if (!filePath) return;

        console.log("DEBUG: About to call export_set_file with params:", {
          config: configToExport ? "present" : "null",
          filePath: filePath,
          platform: mtPlatform,
          includeOptimizationHints: true,
          tradeDirection: "BOTH",
          tags: null,
          comments: null,
        });

        await invoke("export_set_file", {
          config: configToExport,
          filePath: filePath,
          platform: mtPlatform,
          includeOptimizationHints: true,
          tradeDirection: "BOTH",
          tags: null,
          comments: null,
        });

        console.log("DEBUG: export_set_file completed successfully");
        toast.success("Successfully exported .set file");
      } else {
        const content = generateCompleteSetfile(configToExport);
        downloadTextFile("Config.set", content);
        toast.success("Downloaded .set file in browser");
      }
    } catch (err) {
      console.error("Export error:", err);
      toast.error(`Failed to export .set file: ${err}`);
    }
  }, [config, mtPlatform, settings, tauriAvailable]);

  const refreshActiveSetStatus = useCallback(async () => {
    return null;
  }, []);

  const importSetFile = useCallback(async () => {
    try {
      if (tauriAvailable) {
        const filePath = await open({
          filters: [
            {
              name: "Set File",
              extensions: ["set"],
            },
          ],
        });

        if (!filePath) return;

        let importedConfig = await invoke<MTConfig>("import_set_file", {
          filePath,
        });

        const name = Array.isArray(filePath)
          ? String(filePath[0]).split(/[/\\\\]/).pop() || String(filePath[0])
          : String(filePath).split(/[/\\\\]/).pop() || String(filePath);
        importedConfig = { ...importedConfig, current_set_name: name };

        await loadConfigOnly(importedConfig);
        toast.success("Loaded .set file locally");
      } else {
        toast.error("Importing .set requires the app backend. Use JSON import in browser mode.");
      }
    } catch (err) {
      console.error("Import error:", err);
      toast.error(`Failed to import .set file: ${err}`);
    }
  }, [loadConfigOnly, tauriAvailable]);

  

  const generateMassiveSetfile = useCallback(async () => {
    console.log(
      "[GENERATE] Creating massive setfile with 630 logic-directions",
    );

    const { config: massiveConfig, stats } =
      generateMassiveCompleteConfig(mtPlatform);

    await loadConfigOnly(massiveConfig);
    toast.success(
      `Generated massive setfile: ${stats.totalLogicDirections} logic-directions, ${stats.totalInputs.toLocaleString()} inputs`,
    );
  }, [mtPlatform, loadConfigOnly]);

  const importSetFileLocally = useCallback(
    async (configToLoad?: MTConfig) => {
      try {
        let importedConfig: MTConfig;

        if (configToLoad) {
          importedConfig = configToLoad;
        } else {
          const filePath = await open({
            filters: [
              {
                name: "Set File",
                extensions: ["set"],
              },
            ],
          });

          if (!filePath) return;

          console.log("[SETFILE] ========== STARTING SETFILE LOAD ==========");
          console.log("[SETFILE] File:", filePath);

          importedConfig = await invoke<MTConfig>("import_set_file", {
            filePath,
          });

          console.log("[SETFILE] ========== BACKEND RESPONSE ==========");
          console.log(
            "[SETFILE] Total engines:",
            importedConfig?.engines?.length,
          );
          console.log("[SETFILE] Total inputs:", importedConfig?.total_inputs);
          console.log("[SETFILE] Platform:", importedConfig?.platform);
          console.log("[SETFILE] Version:", importedConfig?.version);

          // Detailed breakdown
          importedConfig?.engines?.forEach((engine, eIdx) => {
            console.log(
              `[SETFILE] Engine ${engine.engine_id}: ${engine.groups?.length} groups`,
            );
            engine.groups?.forEach((group, gIdx) => {
              console.log(
                `[SETFILE]   Group ${group.group_number}: ${group.logics?.length} logics`,
              );
              group.logics?.forEach((logic, lIdx) => {
                console.log(
                  `[SETFILE]     Logic ${logic.logic_name}: enabled=${logic.enabled}, startLevel=${logic.start_level}, initialLot=${logic.initial_lot}`,
                );
              });
            });
          });
        }

        console.log("[SETFILE] ========== PROCESSING CONFIG ==========");
        await loadConfigOnly(importedConfig);
        console.log("[SETFILE] ========== LOAD COMPLETE ==========");

        toast.success("Loaded .set file locally (not synced to MT)");
      } catch (err) {
        console.error("[SETFILE] ========== IMPORT ERROR ==========");
        console.error("[SETFILE] Error:", err);
        toast.error(`Failed to load .set file: ${err}`);
      }
    },
    [loadConfigOnly],
  );

  const exportJsonFile = useCallback(async () => {
    if (!config) {
      toast.error("No configuration loaded to export");
      return;
    }

    try {
      if (tauriAvailable) {
        const filePath = await save({
          filters: [
            {
              name: "JSON Configuration",
              extensions: ["json"],
            },
          ],
          defaultPath: `Config.json`,
        });

        if (!filePath) return;

        await invoke("export_json_file", {
          config,
          filePath,
        });

        toast.success("Successfully exported JSON file");
      } else {
        const content = JSON.stringify(config, null, 2);
        downloadTextFile("Config.json", content);
        toast.success("Downloaded JSON file in browser");
      }
    } catch (err) {
      console.error("Export error:", err);
      toast.error(`Failed to export JSON file: ${err}`);
    }
  }, [config, tauriAvailable]);

  const exportCompleteV3LegacySetfile = useCallback(async () => {
    try {
      const setfileContent = generateCompleteSetfile(config);
      if (tauriAvailable) {
        const filePath = await save({
          filters: [
            {
              name: "Complete Set File",
              extensions: ["set"],
            },
          ],
          defaultPath: `xauusd_hardcoded_1.set`,
        });

        if (!filePath) return;

        await invoke("write_text_file", {
          filePath,
          content: setfileContent,
        });

        toast.success(
          `Successfully exported complete V3 legacy setfile (${setfileContent.split("\n").length} lines)`,
        );
      } else {
        downloadTextFile("xauusd_hardcoded_1.set", setfileContent);
        toast.success("Downloaded legacy setfile in browser");
      }
    } catch (err) {
      console.error("Export complete setfile error:", err);
      toast.error(`Failed to export complete setfile: ${err}`);
    }
  }, [config, tauriAvailable]);

  const exportMassiveCompleteSetfile = useCallback(async () => {
    try {
      console.log(
        "[EXPORT] Generating massive complete setfile with all 69,000+ inputs...",
      );

      // Generate the complete config
      const generatedResult = generateMassiveCompleteConfig(mtPlatform);
      const massiveConfig = generatedResult.config;
      printConfigStats(massiveConfig);

      console.log(
        `[EXPORT] Generated config with ${massiveConfig.total_inputs.toLocaleString()} inputs`,
      );

      // Export to setfile format string using TypeScript exporter (with directional separation)
      const setfileContent = exportToSetFileWithDirections(massiveConfig);
      const lineCount = setfileContent.split("\n").length;

      if (tauriAvailable) {
        const filePath = await save({
          filters: [
            {
              name: "Complete Massive Set File",
              extensions: ["set"],
            },
          ],
          defaultPath: `DAAVILEFX_MASSIVE_COMPLETE.set`,
        });

        if (!filePath) return;

        await invoke("write_text_file", {
          filePath,
          content: setfileContent,
        });

        toast.success(
          `Exported massive setfile: ${lineCount.toLocaleString()} lines to ${filePath.split("\\").pop()}`,
        );
        console.log("[EXPORT] Successfully exported to:", filePath);
        return massiveConfig;
      } else {
        downloadTextFile("DAAVILEFX_MASSIVE_COMPLETE.set", setfileContent);
        toast.success(
          `Downloaded massive setfile: ${lineCount.toLocaleString()} lines`,
        );
        return massiveConfig;
      }

      return massiveConfig;
    } catch (err) {
      console.error("[EXPORT] Error:", err);
      toast.error(`Failed to export massive setfile: ${err}`);
      throw err;
    }
  }, [mtPlatform, tauriAvailable]);

  const importJsonFile = useCallback(async () => {
    try {
      if (tauriAvailable) {
        const filePath = await open({
          filters: [
            {
              name: "JSON Configuration",
              extensions: ["json"],
            },
          ],
        });

        if (!filePath) return;

        const importedConfig = await invoke<MTConfig>("import_json_file", {
          filePath,
        });

        await saveConfig(importedConfig);
        await loadConfig();
        toast.success("Successfully imported JSON file");
      } else {
        const pickerAvailable = typeof (window as any).showOpenFilePicker === "function";
        if (pickerAvailable) {
          const handles = await (window as any).showOpenFilePicker({
            types: [
              {
                description: "JSON Configuration",
                accept: { "application/json": [".json"] },
              },
            ],
            multiple: false,
          });
          if (!handles || !handles.length) return;
          const file = await handles[0].getFile();
          const text = await file.text();
          const importedConfig = JSON.parse(text) as MTConfig;
          await saveConfig(importedConfig);
          await loadConfig();
          toast.success("Loaded JSON configuration in browser mode");
        } else {
          await new Promise<void>((resolve, reject) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json";
            input.onchange = async () => {
              if (!input.files || input.files.length === 0) {
                resolve();
                return;
              }
              try {
                const file = input.files[0];
                const text = await file.text();
                const importedConfig = JSON.parse(text) as MTConfig;
                await saveConfig(importedConfig);
                await loadConfig();
                toast.success("Loaded JSON configuration in browser mode");
                resolve();
              } catch (e) {
                reject(e);
              }
            };
            input.click();
          });
        }
      }
    } catch (err) {
      console.error("Import error:", err);
      toast.error(`Failed to import JSON file: ${err}`);
    }
  }, [saveConfig, loadConfig, tauriAvailable]);

  useEffect(() => {
    // No MT sync/status
    return;
  }, [refreshActiveSetStatus]);

  // Removed MT common files auto-sync

  return {
    exportSetFile,
    importSetFile,
    importSetFileLocally,
    exportJsonFile,
    importJsonFile,
    exportCompleteV3LegacySetfile,
    exportMassiveCompleteSetfile,
    generateMassiveSetfile,
    activeSetStatus,
    refreshActiveSetStatus,
  };
}

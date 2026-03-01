import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import type { MTConfig } from "@/types/mt-config";
import { useMTConfig } from "./useMTConfig";
import { canonicalizeConfigForBackend, normalizeConfigForExport } from "@/utils/unit-mode";
import {
  generateMassiveCompleteConfig,
} from "@/lib/config/generateMassiveConfig";

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
      const canonicalConfig = canonicalizeConfigForBackend(newConfig);
      const nowIso = new Date().toISOString();
      const enrichedConfig: MTConfig = {
        ...canonicalConfig,
        last_saved_at: nowIso,
        last_saved_platform: mtPlatform,
      };
      setConfigOnly(enrichedConfig);

      if (onLoadConfig) {
        onLoadConfig(enrichedConfig);
      }
    },
    [mtPlatform, setConfigOnly, onLoadConfig],
  );

  const exportSetFile = useCallback(async () => {
    if (!config) {
      toast.error("No configuration loaded to export");
      return;
    }

    try {
      const configToExport = config;

      if (tauriAvailable) {
        const filePath = await save({
          filters: [{ name: "Set File", extensions: ["set"] }],
          defaultPath: "ACTIVE.set",
        });
        if (!filePath) return;

        const configToRust = canonicalizeConfigForBackend(configToExport);

        await invoke("export_massive_v19_setfile", {
          config: normalizeConfigForExport(configToRust),
          filePath,
          platform: mtPlatform,
        });

        toast.success(`Exported .set file: ${filePath}`);
      } else {
        toast.error("Exporting .set requires the app backend (Tauri).");
      }
    } catch (err) {
      toast.error(`Failed to export .set file: ${err}`);
    }
  }, [config, mtPlatform, tauriAvailable]);

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
      toast.error(`Failed to import .set file: ${err}`);
    }
  }, [loadConfigOnly, tauriAvailable]);

  

  const generateMassiveSetfile = useCallback(async () => {
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
    generateMassiveSetfile,
    activeSetStatus,
    refreshActiveSetStatus,
  };
}

// React hooks for MT4/MT5 configuration management
// ACCURATE MAPPING - only real fields from MT4

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import type { MTConfig, Platform, LogicConfig } from "@/types/mt-config";

// Hook for loading/saving config
export function useMTConfig(platform: Platform) {
  const [config, setConfig] = useState<MTConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedConfig = await invoke<MTConfig>("load_mt_config", { platform });
      setConfig(loadedConfig);
      toast.success(`Loaded ${platform} configuration`);
      return loadedConfig;
    } catch (err) {
      const errorMsg = err as string;
      setError(errorMsg);
      // Don't spam errors when path/config isn't set yet; just fall back to mock/default.
      if (!errorMsg.includes("path not set") && !errorMsg.includes("config path not found")) {
        toast.error(`Failed to load ${platform} config: ${errorMsg}`);
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [platform]);

  const setConfigOnly = useCallback((newConfig: MTConfig) => {
    // Update local state WITHOUT syncing to MT (for local-only imports)
    setConfig(newConfig);
  }, []);

  const saveConfig = useCallback(async (newConfig: MTConfig) => {
    try {
      setLoading(true);
      setError(null);
      const nowIso = new Date().toISOString();
      const enrichedConfig: MTConfig = {
        ...newConfig,
        last_saved_at: nowIso,
        last_saved_platform: platform,
      };
      await invoke("save_mt_config", { platform, config: enrichedConfig });
      setConfig(enrichedConfig);
      toast.success(`Saved ${platform} configuration`);
    } catch (err) {
      const errorMsg = err as string;
      setError(errorMsg);
      toast.error(`Failed to save ${platform} config: ${errorMsg}`);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [platform]);

  const setPath = useCallback(async (path: string) => {
    try {
      await invoke("set_mt_path", { platform, path });
      toast.success(`Set ${platform} path`);
    } catch (err) {
      const errorMsg = err as string;
      toast.error(`Failed to set ${platform} path: ${errorMsg}`);
      throw err;
    }
  }, [platform]);

  const startWatcher = useCallback(async () => {
    try {
      await invoke("start_file_watcher", { platform });
      toast.info(`Watching ${platform} config file for changes`);
    } catch (err) {
      const errorMsg = err as string;
      toast.error(`Failed to start file watcher: ${errorMsg}`);
      throw err;
    }
  }, [platform]);

  const getDefaultPath = useCallback(async () => {
    try {
      const command = platform === "MT4" ? "get_default_mt4_path" : "get_default_mt5_path";
      const path = await invoke<string>(command);
      return path;
    } catch (err) {
      return null;
    }
  }, [platform]);

  // Listen for file changes
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const isTauri = typeof window !== "undefined" && (
          (window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__
        );
        if (!isTauri) {
          return;
        }
        unlistenFn = await listen("config-changed", () => {
          loadConfig().catch(console.error);
        });
      } catch (err) {
        console.error("Failed to setup config listener:", err);
      }
    };

    setupListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [loadConfig]);

  return {
    config,
    loading,
    error,
    loadConfig,
    saveConfig,
    setConfigOnly,
    setPath,
    startWatcher,
    getDefaultPath,
  };
}

// Hook for updating config (provides granular update functions)
export function useConfigUpdater(platform: Platform) {
  const { config, saveConfig } = useMTConfig(platform);

  const updateLogic = useCallback(async (
    engineId: "A" | "B" | "C",
    groupNumber: number,
    logicName: string,
    updates: Partial<LogicConfig>
  ) => {
    if (!config) return;

    const newConfig = { ...config };
    const engine = newConfig.engines.find(e => e.engine_id === engineId);
    if (!engine) return;

    const group = engine.groups.find(g => g.group_number === groupNumber);
    if (!group) return;

    const logic = group.logics.find(l => l.logic_name === logicName);
    if (!logic) return;

    Object.assign(logic, updates);
    await saveConfig(newConfig);
  }, [config, saveConfig]);

  const batchUpdateLogics = useCallback(async (
    engineIds: string[],
    groupNumbers: number[],
    logicNames: string[],
    updates: Partial<LogicConfig>
  ) => {
    if (!config) return;

    const newConfig = { ...config };
    let updateCount = 0;

    for (const engine of newConfig.engines) {
      if (!engineIds.includes(`Engine ${engine.engine_id}`)) continue;

      for (const group of engine.groups) {
        if (groupNumbers.length > 0 && !groupNumbers.includes(group.group_number)) continue;

        for (const logic of group.logics) {
          if (logicNames.length > 0 && !logicNames.includes(logic.logic_name)) continue;

          Object.assign(logic, updates);
          updateCount++;
        }
      }
    }

    if (updateCount > 0) {
      await saveConfig(newConfig);
      toast.success(`Updated ${updateCount} logic configurations`);
    }
  }, [config, saveConfig]);

  const updateGeneral = useCallback(async (updates: Partial<MTConfig["general"]>) => {
    if (!config) return;

    const newConfig = { ...config };
    Object.assign(newConfig.general, updates);
    await saveConfig(newConfig);
  }, [config, saveConfig]);

  return {
    updateLogic,
    batchUpdateLogics,
    updateGeneral,
  };
}

// Hook for querying config data
export function useConfigQuery(config: MTConfig | null) {
  const getLogic = useCallback((
    engineId: "A" | "B" | "C",
    groupNumber: number,
    logicName: string
  ): LogicConfig | null => {
    if (!config) return null;

    const engine = config.engines.find(e => e.engine_id === engineId);
    if (!engine) return null;

    const group = engine.groups.find(g => g.group_number === groupNumber);
    if (!group) return null;

    return group.logics.find(l => l.logic_name === logicName) || null;
  }, [config]);

  const getEngine = useCallback((engineId: "A" | "B" | "C") => {
    if (!config) return null;
    return config.engines.find(e => e.engine_id === engineId) || null;
  }, [config]);

  const getGroup = useCallback((engineId: "A" | "B" | "C", groupNumber: number) => {
    const engine = getEngine(engineId);
    if (!engine) return null;
    return engine.groups.find(g => g.group_number === groupNumber) || null;
  }, [getEngine]);

  return {
    getLogic,
    getEngine,
    getGroup,
    general: config?.general || null,
  };
}

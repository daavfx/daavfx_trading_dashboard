// React hooks for MT4/MT5 configuration management
// ACCURATE MAPPING - only real fields from MT4

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
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
      const raw = localStorage.getItem("daavfx-last-config");
      if (raw) {
        const parsed = JSON.parse(raw) as MTConfig;
        setConfig(parsed);
        toast.success("Loaded local configuration");
        return parsed;
      }
      setConfig(null);
      return null;
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      toast.error(`Failed to load config: ${errorMsg}`);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

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
      try {
        localStorage.setItem("daavfx-last-config", JSON.stringify(enrichedConfig));
      } catch (e: any) {
        if (e?.name === 'QuotaExceededError') {
          localStorage.removeItem("daavfx_undo_redo");
          localStorage.setItem("daavfx-last-config", JSON.stringify(enrichedConfig));
        }
      }
      setConfig(enrichedConfig);
      toast.success("Saved local configuration");
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      toast.error(`Failed to save config: ${errorMsg}`);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [platform]);

  

  

  return {
    config,
    loading,
    error,
    loadConfig,
    saveConfig,
    setConfigOnly,
    
  };
}

// Hook for updating config (provides granular update functions)
export function useConfigUpdater(
  config: MTConfig | null,
  saveConfig: (newConfig: MTConfig) => Promise<void>,
) {

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

  const updateGeneral = useCallback(
    async (updates: Partial<MTConfig["general"]>) => {
      if (!config) return;

      const newConfig = { ...config, general: { ...config.general, ...updates } };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

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

// Hook for loading massive v19 setfiles (69,300 inputs)
export function useMassiveSetfile() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMassiveSetfile = useCallback(async (filePath: string) => {
    try {
      setLoading(true);
      setError(null);

      interface ParseResult {
        success: boolean;
        total_inputs_parsed: number;
        logic_directions_found: number;
        groups_found: number[];
        engines_found: string[];
        logics_found: string[];
        errors: string[];
        warnings: string[];
        config: MTConfig | null;
      }

      const result = await invoke<ParseResult>("parse_massive_setfile", { filePath });

      if (!result.success) {
        throw new Error(result.errors.join("; ") || "Failed to parse massive setfile");
      }

      // Show validation results
      if (result.logic_directions_found >= 630) {
        toast.success(`Loaded ${result.total_inputs_parsed} inputs (${result.logic_directions_found} logic-directions)`);
      } else if (result.logic_directions_found > 0) {
        toast.warning(`Loaded ${result.logic_directions_found} logic-directions (expected 630)`);
      }

      // Log warnings
      for (const warning of result.warnings) {
        console.warn("[MassiveSetfile]", warning);
      }

      return result;
    } catch (err) {
      const errorMsg = err as string;
      setError(errorMsg);
      toast.error(`Failed to load massive setfile: ${errorMsg}`);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    loadMassiveSetfile,
  };
}

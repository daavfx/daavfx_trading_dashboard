import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SyncCommand, SyncPaths, SyncState } from "@/types/tactical-sync";

export type MTPlatform = "MT4" | "MT5";

export interface TacticalSyncState {
  paths: SyncPaths | null;
  syncState: SyncState | null;
  isMonitoring: boolean;
  lastUpdatedAt: number | null;
  error: string | null;
}

export interface TacticalSyncActions {
  setMonitoring: (value: boolean) => void;
  refresh: () => Promise<void>;
  sendCommands: (commands: SyncCommand[]) => Promise<void>;
  setGlobalBuySell: (allowBuy: boolean, allowSell: boolean) => Promise<void>;
  setLogicBuySell: (group: number, logic: string, allowBuy: boolean, allowSell: boolean) => Promise<void>;
  reloadConfig: () => Promise<void>;
  exportState: () => Promise<void>;
  resetOverrides: () => Promise<void>;
}

const normalizeError = (err: unknown) => {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
};

export function useTacticalSync(platform: MTPlatform, pollIntervalMs = 1500): [TacticalSyncState, TacticalSyncActions] {
  const [paths, setPaths] = useState<SyncPaths | null>(null);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return inflightRef.current;

    const task = (async () => {
      try {
        setError(null);
        const nextPaths = await invoke<SyncPaths>("get_sync_paths", { platform });
        setPaths(nextPaths);
        const nextState = await invoke<SyncState | null>("read_sync_state", { platform });
        setSyncState(nextState);
        setLastUpdatedAt(Date.now());
      } catch (err) {
        setError(normalizeError(err));
      }
    })();

    inflightRef.current = task.finally(() => {
      inflightRef.current = null;
    });

    return inflightRef.current;
  }, [platform]);

  const sendCommands = useCallback(
    async (commands: SyncCommand[]) => {
      try {
        setError(null);
        await invoke<string>("write_sync_commands", { platform, commands });
        await refresh();
      } catch (err) {
        setError(normalizeError(err));
      }
    },
    [platform, refresh],
  );

  const setGlobalBuySell = useCallback(
    async (allowBuy: boolean, allowSell: boolean) => {
      await sendCommands([
        { command: "set_config_value", param_name: "gInput_allowBuy", param_value: allowBuy ? "true" : "false" },
        { command: "set_config_value", param_name: "gInput_allowSell", param_value: allowSell ? "true" : "false" },
        { command: "apply_override" },
      ]);
    },
    [sendCommands],
  );

  const setLogicBuySell = useCallback(
    async (group: number, logic: string, allowBuy: boolean, allowSell: boolean) => {
      await sendCommands([
        { command: "set_buy_sell", group, logic, allow_buy: allowBuy, allow_sell: allowSell },
      ]);
    },
    [sendCommands],
  );

  const reloadConfig = useCallback(async () => {
    await sendCommands([{ command: "reload_config" }]);
  }, [sendCommands]);

  const exportState = useCallback(async () => {
    await sendCommands([{ command: "export_state" }]);
  }, [sendCommands]);

  const resetOverrides = useCallback(async () => {
    await sendCommands([{ command: "reset_overrides" }]);
  }, [sendCommands]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isMonitoring) return;
    const interval = setInterval(() => {
      refresh();
    }, pollIntervalMs);
    return () => clearInterval(interval);
  }, [isMonitoring, pollIntervalMs, refresh]);

  const state = useMemo<TacticalSyncState>(
    () => ({ paths, syncState, isMonitoring, lastUpdatedAt, error }),
    [paths, syncState, isMonitoring, lastUpdatedAt, error],
  );

  const actions = useMemo<TacticalSyncActions>(
    () => ({
      setMonitoring: setIsMonitoring,
      refresh,
      sendCommands,
      setGlobalBuySell,
      setLogicBuySell,
      reloadConfig,
      exportState,
      resetOverrides,
    }),
    [refresh, sendCommands, setGlobalBuySell, setLogicBuySell, reloadConfig, exportState, resetOverrides],
  );

  return [state, actions];
}


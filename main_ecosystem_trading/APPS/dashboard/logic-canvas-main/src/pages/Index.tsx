import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { type ImperativePanelHandle } from "react-resizable-panels";
import { TopBar, Platform } from "@/components/layout/TopBar";
import { Sidebar, ViewMode } from "@/components/layout/Sidebar";
import { ChatPanel } from "@/components/layout/ChatPanel";
import { QuickActionsPanel } from "@/components/layout/QuickActionsPanel";
import { BatchEditPanel } from "@/components/config/BatchEditPanel";
import { EngineCard } from "@/components/config/EngineCard";
import { GroupCard } from "@/components/config/GroupCard";
import { GeneralCategories } from "@/components/config/GeneralCategories";
import { GroupThresholdsCard } from "@/components/config/GroupThresholdsCard";
import { MultiEditIndicator } from "@/components/config/MultiEditIndicator";
import { SelectionDashboard } from "@/components/config/SelectionDashboard";
import { EmptyState } from "@/components/config/EmptyState";
import { FooterRibbon } from "@/components/config/FooterRibbon";
import {
  VaultSaveModal,
  type VaultSaveData,
} from "@/components/config/VaultSaveModal";
import { VaultSavePage } from "@/components/config/VaultSavePage";
import { ExportOptionsModal } from "@/components/config/ExportOptionsModal";
import { VaultPage } from "@/components/config/VaultPage";
import { SettingsPage } from "@/components/config/SettingsPage";
import { BatchEditTab } from "@/components/config/BatchEditTab";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useMTConfig } from "@/hooks/useMTConfig";
import type {
  Platform as MTPlatform,
  GeneralConfig,
  MTConfig,
  GroupConfig,
  LogicConfig,
} from "@/types/mt-config";
import { mockFullConfig } from "@/data/mock-config";
import {
  validateConfig,
  getWarningSummary,
  type ConfigWarning,
} from "@/utils/config-validation";
import { hydrateMTConfigDefaults } from "@/utils/hydrate-mt-config-defaults";
import { useSettings } from "@/contexts/SettingsContext";
import { ChatStateProvider, useChatState } from "@/contexts/ChatStateContext";
import { withUseDirectPriceGrid, normalizeConfigForExport } from "@/utils/unit-mode";
import type { TransactionPlan, ChangePreview } from "@/lib/chat/types";
import { VersionControlPanel } from "@/components/version-control/VersionControlPanel";
import { AnalyticsPanel } from "@/components/visual-enhancements/AnalyticsPanel";
import { CollaborationPanel } from "@/components/visual-enhancements/CollaborationPanel";
import { UndoRedoPanel } from "@/components/visual-enhancements/UndoRedoPanel";
import { MemorySystemPanel } from "@/components/version-control/MemorySystemPanel";
import { ParameterGroupingPanel } from "@/components/version-control/ParameterGroupingPanel";
import { getUndoRedoManager } from "@/lib/undo-redo/manager";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { getMatchingFieldIds } from "@/utils/input-search";

// Mock data for when config is not loaded
const mockGeneralConfig: GeneralConfig = {
  license_key: "",
  license_server_url: "https://license.daavfx.com",
  require_license: true,
  license_check_interval: 3600,
  config_file_name: "DAAVFX_Config.json",
  config_file_is_common: true,
  allow_buy: true,
  allow_sell: true,
  enable_logs: true,
  use_direct_price_grid: false,
  group_mode: 1,
  grid_unit: 0,
  pip_factor: 0,
  compounding_enabled: false,
  compounding_type: "Compound_Balance",
  compounding_target: 40.0,
  compounding_increase: 2.0,
  restart_policy_power: "Restart_Default",
  restart_policy_non_power: "Restart_Default",
  close_non_power_on_power_close: false,
  hold_timeout_bars: 10,
  magic_number: 777,
  magic_number_buy: 777,
  magic_number_sell: 8988,
  max_slippage_points: 30.0,
  risk_management: {
    spread_filter_enabled: false,
    max_spread_points: 25.0,
    equity_stop_enabled: false,
    equity_stop_value: 35.0,
    drawdown_stop_enabled: false,
    max_drawdown_percent: 35.0,
    risk_action: "TriggerAction_StopEA_KeepTrades",
  },
  time_filters: {
    priority_settings: {
      news_filter_overrides_session: false,
      session_filter_overrides_news: true,
    },
    sessions: Array.from({ length: 7 }, (_, i) => ({
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
    })),
  },
  news_filter: {
    enabled: false,
    api_key: "",
    api_url: "https://www.jblanked.com/news/api/calendar/",
    countries: "US,GB,EU",
    impact_level: 3,
    minutes_before: 30,
    minutes_after: 30,
    action: "TriggerAction_StopEA_KeepTrades",
    calendar_file: "DAAVFX_NEWS.csv",
  },
  reverse_magic_base: 0,
  hedge_magic_base: 0,
  hedge_magic_independent: false,
};

const engineConfigs = [
  { engine: "Engine A", tradingType: "Reverse Trading" },
  { engine: "Engine B", tradingType: "Hedge Trading" },
  { engine: "Engine C", tradingType: "Direct Trading" },
];

const canvasClasses: Record<Platform, string> = {
  mt4: "canvas-mt4",
  mt5: "canvas-mt5",
  python: "canvas-python",
  c: "canvas-c",
  cpp: "canvas-cpp",
  rust: "canvas-rust",
};

// Map UI platform to MT platform type
const platformToMT = (p: Platform): MTPlatform => {
  if (p === "mt4") return "MT4";
  if (p === "mt5") return "MT5";
  return "MT4"; // fallback
};

function Index() {
  const { settings } = useSettings();
  const [selectedEngines, setSelectedEngines] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedLogics, setSelectedLogics] = useState<string[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [platform, setPlatform] = useState<Platform>("mt5");
  const [viewMode, setViewMode] = useState<ViewMode>("logics");
  const [previousViewMode, setPreviousViewMode] = useState<ViewMode>("logics");
  const [selectedGeneralCategory, setSelectedGeneralCategory] =
    useState<string>("risk");
  const [mode, setMode] = useState<1 | 2>(1);

  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [isQuickActionsCollapsed, setIsQuickActionsCollapsed] = useState(false);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const [externalCommand, setExternalCommand] = useState<string | null>(null);
  const [chatPendingPlan, setChatPendingPlan] =
    useState<TransactionPlan | null>(null);
  const [chatLastAppliedPreview, setChatLastAppliedPreview] = useState<
    ChangePreview[] | null
  >(null);

  // HYBRID MODE: Track if selections came from chat (temporary) vs manual UI (persistent)
  const [chatActive, setChatActive] = useState<boolean>(false);
  // Store manual selections to restore when exiting chat mode
  const [manualSelections, setManualSelections] = useState<{
    engines: string[];
    groups: string[];
    logics: string[];
  }>({ engines: [], groups: [], logics: [] });

  // Command history for sidebar-chat integration
  const [commandHistory, setCommandHistory] = useState<Array<{
    id: string;
    command: string;
    timestamp: Date;
    status: 'pending' | 'applied' | 'cancelled' | 'error';
    changesCount?: number;
  }>>([]);

  // Stats for sidebar
  const [chatStats, setChatStats] = useState<{
    totalChangesApplied: number;
    commandsToday: number;
    snapshotsCount: number;
    lastCommandAt: Date | null;
  }>({
    totalChangesApplied: 0,
    commandsToday: 0,
    snapshotsCount: 0,
    lastCommandAt: null,
  });
  const [vaultSaveDraft, setVaultSaveDraft] = useState<{
    name: string;
    category: string;
    tags: string[];
    comments: string;
    saveToVault: boolean;
    format: "set" | "json";
  } | null>(null);
  const externalCommandResetRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (externalCommandResetRef.current) {
        clearTimeout(externalCommandResetRef.current);
        externalCommandResetRef.current = null;
      }
    };
  }, []);

  const filteredFields = useMemo(() => {
    if (!searchQuery.trim()) return selectedFields;
    const matchingIds = getMatchingFieldIds(searchQuery);
    if (selectedFields.length > 0) {
      return selectedFields.filter(f => matchingIds.includes(f));
    }
    return matchingIds;
  }, [searchQuery, selectedFields]);

  const pushChatCommand = (command: string) => {
    setExternalCommand(command);
    if (externalCommandResetRef.current) {
      clearTimeout(externalCommandResetRef.current);
    }
    externalCommandResetRef.current = setTimeout(() => {
      setExternalCommand(null);
      externalCommandResetRef.current = null;
    }, 0);
  };

  const openVaultSave = (draft?: {
    name: string;
    category: string;
    tags: string[];
    comments: string;
    saveToVault: boolean;
    format: "set" | "json";
  }) => {
    setVaultSaveDraft(draft || null);
    setPreviousViewMode(viewMode);
    setViewMode("save_config");
    setHasStarted(true);
  };

  const toggleChat = () => {
    const panel = chatPanelRef.current;
    if (panel) {
      if (isChatCollapsed) {
        panel.expand();
      } else {
        panel.collapse();
      }
    }
  };

  const handleViewModeChange = (mode: ViewMode) => {
    if (mode !== "save_config") {
      setPreviousViewMode(viewMode);
    }
    setViewMode(mode);
    setHasStarted(true);
  };

  const handleGeneralCategoryChange = (category: string) => {
    setSelectedGeneralCategory(category);
    setHasStarted(true);
  };

  // Wire up MT config hooks
  const mtPlatform = platformToMT(platform);
  const {
    config: realConfig,
    loading,
    loadConfig,
    saveConfig: realSaveConfig,
    setConfigOnly,
  } = useMTConfig(mtPlatform);
  const [configWarnings, setConfigWarnings] = useState<ConfigWarning[]>([]);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const config = realConfig;
  const undoRedoManagerRef = useRef(getUndoRedoManager());
  const skipUndoRecordRef = useRef(false);

  const deepEqual = (a: unknown, b: unknown) => {
    if (Object.is(a, b)) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return false;
    if (typeof a !== "object") return false;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  };

  const countConfigChanges = (prev: MTConfig, next: MTConfig) => {
    let changes = 0;

    const prevGeneral = prev.general || ({} as any);
    const nextGeneral = next.general || ({} as any);
    const generalKeys = new Set([...Object.keys(prevGeneral), ...Object.keys(nextGeneral)]);
    for (const key of generalKeys) {
      if (!deepEqual((prevGeneral as any)[key], (nextGeneral as any)[key])) {
        changes++;
      }
    }

    const prevEngines = prev.engines ? new Map(prev.engines.map((e) => [e.engine_id, e] as const)) : new Map();
    const nextEngines = next.engines ? new Map(next.engines.map((e) => [e.engine_id, e] as const)) : new Map();
    const engineIds = new Set([...prevEngines.keys(), ...nextEngines.keys()]);

    for (const engineId of engineIds) {
      const prevEngine = prevEngines.get(engineId);
      const nextEngine = nextEngines.get(engineId);
      if (!prevEngine || !nextEngine) {
        changes++;
        continue;
      }

      const prevGroups = new Map(prevEngine.groups.map((g: GroupConfig) => [g.group_number, g] as const));
      const nextGroups = new Map(nextEngine.groups.map((g: GroupConfig) => [g.group_number, g] as const));
      const groupIds = new Set([...prevGroups.keys(), ...nextGroups.keys()]);

      for (const groupId of groupIds) {
        const prevGroup = prevGroups.get(groupId) as GroupConfig | undefined;
        const nextGroup = nextGroups.get(groupId) as GroupConfig | undefined;
        if (!prevGroup || !nextGroup) {
          changes++;
          continue;
        }

        const prevLogics = new Map(prevGroup.logics.map((l: LogicConfig) => [l.logic_name, l] as const));
        const nextLogics = new Map(nextGroup.logics.map((l: LogicConfig) => [l.logic_name, l] as const));
        const logicNames = new Set([...prevLogics.keys(), ...nextLogics.keys()]);

        for (const logicName of logicNames) {
          const prevLogic = prevLogics.get(logicName);
          const nextLogic = nextLogics.get(logicName);
          if (!prevLogic || !nextLogic) {
            changes++;
            continue;
          }

          const keys = new Set([...Object.keys(prevLogic), ...Object.keys(nextLogic)]);
          keys.delete("logic_name");

          for (const key of keys) {
            if (!deepEqual((prevLogic as any)[key], (nextLogic as any)[key])) {
              changes++;
            }
          }
        }
      }
    }

    return changes;
  };

  const handleGeneralUpdate = async (updates: Partial<GeneralConfig>) => {
    if (!config) return;
    await handleSaveConfig({ ...config, general: { ...config.general, ...updates } });
  };

  const handleSaveConfig = async (newConfig: MTConfig) => {
    const prev = config;
    if (prev && !skipUndoRecordRef.current) {
      const changeCount = countConfigChanges(prev, newConfig);
      if (changeCount > 0) {
        undoRedoManagerRef.current.addOperation({
          type: "GROUP_UPDATE",
          target: { engineId: "CONFIG", parameter: "__CONFIG__" },
          before: JSON.parse(JSON.stringify(prev)),
          after: JSON.parse(JSON.stringify(newConfig)),
          description: `Config update (${changeCount} changes)`,
        });
      }
    }
    await realSaveConfig(newConfig);
  };

  const handleSaveConfigNoUndoRecord = async (newConfig: MTConfig) => {
    skipUndoRecordRef.current = true;
    try {
      await handleSaveConfig(newConfig);
    } finally {
      skipUndoRecordRef.current = false;
    }
  };

  const lastSavedLabel = config?.last_saved_at
    ? `Last saved ${new Date(config.last_saved_at).toLocaleString()}${config.current_set_name ? ` · ${config.current_set_name}` : ""}`
    : undefined;

  // Load config on mount or platform change
  useEffect(() => {
    loadConfig()
      .then((loaded) => {
        if (!loaded) {
          setConfigOnly(hydrateMTConfigDefaults(mockFullConfig));
        }
      })
      .catch(() => {
        setConfigOnly(hydrateMTConfigDefaults(mockFullConfig));
      });
  }, [loadConfig, setConfigOnly]);

  // Validate config on changes (debounced) - only update warnings state, no toasts
  useEffect(() => {
    if (!config) return;
    
    // Use a timeout to debounce validation
    const timeout = setTimeout(() => {
      const warnings = validateConfig(config);
      setConfigWarnings(warnings);
    }, 500);
    
    return () => clearTimeout(timeout);
  }, [config]);

  useEffect(() => {
    if (!config) return;

    const timeout = setTimeout(() => {
      const nowIso = new Date().toISOString();
      const enrichedConfig = {
        ...config,
        last_saved_at: nowIso,
        last_saved_platform: mtPlatform,
      };
      try {
        localStorage.setItem("daavfx-last-config", JSON.stringify(enrichedConfig));
        localStorage.setItem(
          "daavfx-last-config-meta",
          JSON.stringify({
            magic: config.general?.magic_number,
            magicBuy: config.general?.magic_number_buy,
            magicSell: config.general?.magic_number_sell,
            timestamp: Date.now(),
          }),
        );
      } catch (e: any) {
        if (e?.name === 'QuotaExceededError') {
          localStorage.removeItem("daavfx_undo_redo");
          try {
            localStorage.setItem("daavfx-last-config", JSON.stringify(enrichedConfig));
          } catch {}
        }
      }
    }, 750);

    return () => clearTimeout(timeout);
  }, [config, mtPlatform]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!config) return;
      const nowIso = new Date().toISOString();
      const enrichedConfig = {
        ...config,
        last_saved_at: nowIso,
        last_saved_platform: mtPlatform,
      };
      try {
        localStorage.setItem("daavfx-last-config", JSON.stringify(enrichedConfig));
        localStorage.setItem(
          "daavfx-last-config-meta",
          JSON.stringify({
            magic: config.general?.magic_number,
            magicBuy: config.general?.magic_number_buy,
            magicSell: config.general?.magic_number_sell,
            timestamp: Date.now(),
          }),
        );
      } catch (e: any) {
        if (e?.name === 'QuotaExceededError') {
          localStorage.removeItem("daavfx_undo_redo");
          try {
            localStorage.setItem("daavfx-last-config", JSON.stringify(enrichedConfig));
          } catch {}
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleBeforeUnload();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [config, mtPlatform]);

  // Get real engine data from config or use mock
  const realEngineConfigs =
    config?.engines.map((engine) => ({
      engine: `Engine ${engine.engine_id}`,
      tradingType:
        engine.engine_id === "A"
          ? "Multi-Logic System"
          : engine.engine_id === "B"
            ? "Hedge Trading"
            : "Direct Trading",
      engineData: engine,
    })) || engineConfigs.map((e) => ({ ...e, engineData: undefined }));

  const handleSelectionChange = (
    type: "engines" | "groups" | "logics",
    items: string[],
  ) => {
    // HYBRID MODE: If user manually changes selection while in chat mode, exit chat mode
    if (chatActive && items.length > 0) {
      setChatActive(false);
      // Clear any pending chat plan since user is taking manual control
      setChatPendingPlan(null);
      setChatLastAppliedPreview(null);
    }

    if (type === "engines") setSelectedEngines(items);
    if (type === "groups") setSelectedGroups(items);
    if (type === "logics") setSelectedLogics(items);

    // Auto-start when first selection made
    if (!hasStarted && items.length > 0) {
      setHasStarted(true);
    }
  };

  const handleChatNavigation = (target: {
    engines?: string[];
    groups?: number[];
    logics?: string[];
    fields?: string[];
  }) => {
    setHasStarted(true);

    // HYBRID MODE: If entering chat mode for the first time, save current manual selections
    if (!chatActive) {
      setManualSelections({
        engines: selectedEngines,
        groups: selectedGroups,
        logics: selectedLogics,
      });
      setChatActive(true);
    }

    if (target.engines) {
      // Map "A" -> "Engine A"
      const mappedEngines = target.engines.map((e) =>
        e.startsWith("Engine") ? e : `Engine ${e}`,
      );
      setSelectedEngines(mappedEngines);
    }

    if (target.groups) {
      // Map 1 -> "Group 1"
      const mappedGroups = target.groups.map((g) => `Group ${g}`);
      setSelectedGroups(mappedGroups);
    }

    if (target.logics) {
      const mappedLogics = target.logics
        .map((l) => {
          const trimmed = String(l).trim();
          const mColon = trimmed.match(/^([A-Z])\s*[:/\\-]\s*(.+)$/i);
          if (mColon) return String(mColon[2]).trim();
          const mLogicUnderscore = trimmed.match(/^LOGIC[_-]([A-Z])[_-](.+)$/i);
          if (mLogicUnderscore) return String(mLogicUnderscore[2]).trim();
          const mLogicCompact = trimmed.match(/^LOGIC[_-]([A-Z])(.+)$/i);
          if (mLogicCompact) return String(mLogicCompact[2]).trim();
          return trimmed;
        })
        .filter(Boolean)
        .map((l) => l.toUpperCase());
      setSelectedLogics(mappedLogics);
    }

    if (target.fields) {
      setSelectedFields(target.fields);
    } else {
      setSelectedFields([]);
    }

    // DO NOT switch view mode - stay in current view (Chat)
    // This allows users to see changes in the chat interface
    // setViewMode("logics");
  };

  const handleVaultSave = async (data: VaultSaveData) => {
    try {
      if (!config) {
        toast.error("No configuration loaded to save");
        return;
      }

      // Create a copy of config to modify based on strategy type
      const configToSave = JSON.parse(JSON.stringify(config));

      // Update magic number
      if (data.magicNumber !== undefined) {
        configToSave.general.magic_number = data.magicNumber;
      }

      // Apply strategy type logic
      // ALWAYS export BOTH directions - dropdown controls editing mode only
      // Buy = edit Buy values, Sell = edit Sell values, Both = edit both with same values
      if (data.strategyType === "buy") {
        configToSave.general.allow_buy = true;
        configToSave.general.allow_sell = true;
        // Buy mode - sync Buy values to Sell for export
        configToSave.engines?.forEach((engine: any) => {
          engine.groups?.forEach((group: any) => {
            group.logics?.forEach((logic: any) => {
              logic.allow_buy = true;
              logic.allow_sell = true;
              // Copy Buy values to Sell suffix
              if (logic.initial_lot) logic.initial_lot_b = logic.initial_lot;
              if (logic.multiplier) logic.multiplier_b = logic.multiplier;
              if (logic.grid) logic.grid_b = logic.grid;
              if (logic.trail_value) logic.trail_value_b = logic.trail_value;
              if (logic.trail_start) logic.trail_start_b = logic.trail_start;
              if (logic.trail_step) logic.trail_step_b = logic.trail_step;
            });
          });
        });
      } else if (data.strategyType === "sell") {
        configToSave.general.allow_buy = true;
        configToSave.general.allow_sell = true;
        // Sell mode - sync Sell values to Buy for export
        configToSave.engines?.forEach((engine: any) => {
          engine.groups?.forEach((group: any) => {
            group.logics?.forEach((logic: any) => {
              logic.allow_buy = true;
              logic.allow_sell = true;
              // Copy Sell suffix values to base
              if (logic.initial_lot_s) logic.initial_lot = logic.initial_lot_s;
              if (logic.multiplier_s) logic.multiplier = logic.multiplier_s;
              if (logic.grid_s) logic.grid = logic.grid_s;
              if (logic.trail_value_s) logic.trail_value = logic.trail_value_s;
              if (logic.trail_start_s) logic.trail_start = logic.trail_start_s;
              if (logic.trail_step_s) logic.trail_step = logic.trail_step_s;
            });
          });
        });
      } else {
        // Both Sides mode - ensure both directions have values
        configToSave.general.allow_buy = true;
        configToSave.general.allow_sell = true;
        configToSave.engines?.forEach((engine: any) => {
          engine.groups?.forEach((group: any) => {
            group.logics?.forEach((logic: any) => {
              logic.allow_buy = true;
              logic.allow_sell = true;
              // Sync base values to both suffixes for export
              if (logic.initial_lot) {
                logic.initial_lot_b = logic.initial_lot;
                logic.initial_lot_s = logic.initial_lot;
              }
              if (logic.multiplier) {
                logic.multiplier_b = logic.multiplier;
                logic.multiplier_s = logic.multiplier;
              }
              if (logic.grid) {
                logic.grid_b = logic.grid;
                logic.grid_s = logic.grid;
              }
              if (logic.trail_value) {
                logic.trail_value_b = logic.trail_value;
                logic.trail_value_s = logic.trail_value;
              }
              if (logic.trail_start) {
                logic.trail_start_b = logic.trail_start;
                logic.trail_start_s = logic.trail_start;
              }
              if (logic.trail_step) {
                logic.trail_step_b = logic.trail_step;
                logic.trail_step_s = logic.trail_step;
              }
            });
          });
        });
      }

      // 1. Export to file if path provided
      if (data.exportPath) {
        let fileName = data.name;
        const ext = data.format === "json" ? ".json" : ".set";
        if (!fileName.endsWith(ext)) fileName += ext;

        // Simple path concatenation - assuming Windows for now based on env
        const separator = navigator.userAgent.includes("Win") ? "\\" : "/";
        const fullPath = data.exportPath.endsWith(separator)
          ? `${data.exportPath}${fileName}`
          : `${data.exportPath}${separator}${fileName}`;

        const configToExport = withUseDirectPriceGrid(configToSave, settings);

        // ALWAYS export with AllowBuy=1 and AllowSell=1 regardless of strategyType
        // User controls actual trading in MT4/MT5 terminal directly
        if (configToExport.general) {
          configToExport.general.allow_buy = true;
          configToExport.general.allow_sell = true;
        }
        // Also force all logic allow_buy/allow_sell to true
        if (configToExport.engines) {
          configToExport.engines.forEach((engine: any) => {
            engine.groups?.forEach((group: any) => {
              group.logics?.forEach((logic: any) => {
                logic.allow_buy = true;
                logic.allow_sell = true;
              });
            });
          });
        }

        if (data.format === "json") {
          await invoke("export_json_file", {
            config: normalizeConfigForExport(configToExport),
            filePath: fullPath,
            tags: data.tags,
            comments: data.comments,
          });
        } else {
          // Debug: Log grid values before export
          console.log("DEBUG_EXPORT: Config before export:");
          configToExport.engines?.forEach((engine: any, ei: number) => {
            engine.groups?.forEach((group: any, gi: number) => {
              group.logics?.forEach((logic: any, li: number) => {
                if (logic.logic_name === "Power" && gi === 0) {
                  console.log(`DEBUG_EXPORT: Engine ${ei} Group ${gi} Power: grid=${logic.grid}, grid_b=${logic.grid_b}, grid_s=${logic.grid_s}`);
                }
              });
            });
          });
          
          await invoke("export_massive_v19_setfile", {
            config: normalizeConfigForExport(configToExport),
            filePath: fullPath,
            platform: platform === "mt5" ? "MT5" : "MT4",
          });
        }
        toast.success(`Exported to ${fileName}`);
      }

      // 2. Save to Vault if requested
      if (data.saveToVault) {
        const configToVault = withUseDirectPriceGrid(configToSave, settings);
        await invoke("save_to_vault", {
          config: normalizeConfigForExport(configToVault),
          name: data.name,
          category: data.category,
          tags: data.tags.length > 0 ? data.tags : null,
          comments: data.comments || null,
          format: data.format || "set",
          vault_path_override: settings.vaultPath,
        });
        toast.success("Saved to Vault");
      }

      // Restore previous view mode
      setVaultSaveDraft(null);
      setViewMode(previousViewMode);
    } catch (error) {
      console.error("Failed to save:", error);
      toast.error(`Failed to save: ${error}`);
    }
  };

  const clearSelection = () => {
    // HYBRID MODE: If in chat mode, also clear chat state and pending plan
    if (chatActive) {
      setChatActive(false);
      setChatPendingPlan(null);
      setChatLastAppliedPreview(null);
    }

    setSelectedEngines([]);
    setSelectedGroups([]);
    setSelectedLogics([]);
    setSelectedFields([]);
  };

  const isGroup1Mode =
    selectedGroups.includes("Group 1") && selectedGroups.length === 1;
  const isMultiEdit =
    selectedEngines.length > 1 ||
    selectedGroups.length > 1 ||
    selectedLogics.length > 1;

  // Dynamic border color based on Buy/Sell state
  const getBorderColor = () => {
    if (!config) return "border-border";
    if (config.general.allow_buy && config.general.allow_sell)
      return "border-blue-500/30";
    if (config.general.allow_buy) return "border-blue-600";
    if (config.general.allow_sell) return "border-red-600";
    return "border-border";
  };

  return (
    <div
      className={cn(
        "h-screen flex flex-col bg-background border-[3px] transition-colors duration-300",
        getBorderColor(),
      )}
    >
      <TopBar
        onSaveToVault={() => {
          setVaultSaveDraft(null);
          setPreviousViewMode(viewMode);
          setViewMode("save_config");
          setHasStarted(true);
        }}
        onOpenExport={() => setExportModalOpen(true)}
        onOpenVaultManager={() => {
          setViewMode("vault");
          setHasStarted(true);
        }}
        platform={platform}
        onPlatformChange={setPlatform}
        onOpenSettings={() => setSettingsOpen(true)}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        lastSavedLabel={lastSavedLabel}
        currentConfig={config}
        magicNumber={config?.general.magic_number}
        onMagicNumberChange={(val) =>
          handleGeneralUpdate({ magic_number: val })
        }
        mode={mode}
        onModeChange={setMode}
        onLoadConfig={(c) => {
          handleSaveConfig(c);
          setHasStarted(true);
          if (c?.engines?.length) {
            setSelectedEngines(["Engine A"]);
            setSelectedGroups(["Group 1"]);
            setSelectedLogics(["POWER"]);
          }
        }}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSearchSelect={(item) => {
          if (item.type === "field") {
            setSelectedFields([item.id]);
          } else if (item.type === "category") {
            const matchingFields = getMatchingFieldIds(item.id);
            setSelectedFields(matchingFields);
          } else if (item.type === "logic") {
            setSelectedLogics([item.id]);
          } else if (item.type === "engine") {
            setSelectedEngines([`Engine ${item.id}`]);
          } else if (item.type === "group") {
            setSelectedGroups([`Group ${item.id}`]);
          }
          setHasStarted(true);
        }}
      />

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left Navigation Sidebar - ALWAYS visible including Chat view */}
          <ResizablePanel
            id="sidebar"
            order={1}
            defaultSize={16}
            minSize={5}
            maxSize={30}
          >
            <Sidebar
              selectedEngines={selectedEngines}
              selectedGroups={selectedGroups}
              selectedLogics={selectedLogics}
              onSelectionChange={handleSelectionChange}
              platform={platform}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              config={config}
              onConfigChange={handleSaveConfig}
              selectedGeneralCategory={selectedGeneralCategory}
              onSelectGeneralCategory={handleGeneralCategoryChange}
              pendingPlan={chatPendingPlan}
              onConfirmPlan={() => {
                if (chatPendingPlan && config) {
                  const newConfig = JSON.parse(JSON.stringify(config)) as MTConfig;
                  chatPendingPlan.preview.forEach(change => {
                    const engine = newConfig.engines?.find(e => e.engine_name === change.engine);
                    if (engine) {
                      const group = engine.groups?.find(g => g.group_number === change.group);
                      if (group) {
                        const logic = group.logics?.find(l => l.logic_name === change.logic);
                        if (logic && change.field in logic) {
                          (logic as any)[change.field] = change.newValue;
                        }
                      }
                    }
                  });
                  handleSaveConfig(newConfig);
                  setChatLastAppliedPreview(chatPendingPlan.preview);
                  
                  // Update the pending command status to 'applied'
                  setCommandHistory(prev => {
                    const lastPending = prev.findLast(c => c.status === 'pending');
                    if (lastPending) {
                      return prev.map(c => 
                        c.id === lastPending.id 
                          ? { ...c, status: 'applied' as const, changesCount: chatPendingPlan.preview.length }
                          : c
                      );
                    }
                    // If no pending found, add new entry
                    return [...prev, {
                      id: `cmd-${Date.now()}`,
                      command: chatPendingPlan.description || 'Apply changes',
                      timestamp: new Date(),
                      status: 'applied' as const,
                      changesCount: chatPendingPlan.preview.length,
                    }].slice(-50);
                  });
                  
                  // Update stats
                  setChatStats(prev => ({
                    totalChangesApplied: prev.totalChangesApplied + chatPendingPlan.preview.length,
                    commandsToday: prev.commandsToday + 1,
                    snapshotsCount: prev.snapshotsCount,
                    lastCommandAt: new Date(),
                  }));
                  
                  setChatPendingPlan(null);
                  toast.success(`Applied ${chatPendingPlan.preview.length} changes`);
                }
              }}
              onCancelPlan={() => {
                if (chatPendingPlan) {
                  // Update the pending command status to 'cancelled'
                  setCommandHistory(prev => {
                    const lastPending = prev.findLast(c => c.status === 'pending');
                    if (lastPending) {
                      return prev.map(c => 
                        c.id === lastPending.id 
                          ? { ...c, status: 'cancelled' as const }
                          : c
                      );
                    }
                    // If no pending found, add new entry
                    return [...prev, {
                      id: `cmd-${Date.now()}`,
                      command: chatPendingPlan.description || 'Apply changes',
                      timestamp: new Date(),
                      status: 'cancelled' as const,
                    }].slice(-50);
                  });
                }
                setChatPendingPlan(null);
              }}
              commandHistory={commandHistory}
              stats={chatStats}
              onCommandClick={(command) => {
                // Push the command to the chat input
                pushChatCommand(command);
              }}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />

          <ResizablePanel
            id="main-content"
            order={2}
            defaultSize={
              viewMode === "vault" ||
              viewMode === "save_config" ||
              viewMode === "version-control" ||
              viewMode === "analytics" ||
              viewMode === "undo-redo" ||
              viewMode === "memory" ||
              viewMode === "grouping" ||
              viewMode === "collaboration"
                ? 82
                : viewMode === "chat"
                  ? 50
                  : 62
            }
          >
            {hasStarted ? (
              <main
                className={cn(
                  "h-full flex flex-col overflow-hidden transition-colors duration-300",
                  canvasClasses[platform],
                )}
              >
                {viewMode === "vault" ? (
                  <VaultPage
                    onLoadConfig={(config) => {
                      handleSaveConfig(config);
                      setHasStarted(true);
                      setSelectedEngines(["Engine A"]);
                      setSelectedGroups(["Group 1"]);
                      setSelectedLogics(["POWER"]);
                      setViewMode("logics");
                    }}
                  />
                ) : viewMode === "save_config" ? (
                  <VaultSavePage
                    onSave={handleVaultSave}
                    onCancel={() => {
                      setVaultSaveDraft(null);
                      setViewMode(previousViewMode);
                    }}
                    defaultName={
                      vaultSaveDraft?.name ?? (config?.current_set_name || "")
                    }
                    defaultCategory={vaultSaveDraft?.category}
                    defaultTags={vaultSaveDraft?.tags}
                    defaultComments={vaultSaveDraft?.comments}
                    defaultSaveToVault={vaultSaveDraft?.saveToVault}
                    defaultFormat={vaultSaveDraft?.format}
                    defaultMagicNumber={config?.general.magic_number}
                  />
                ) : (
                  <ScrollArea className="flex-1">
                    <div
                      className={cn(
                        "p-5 w-full",
                      )}
                    >
                      {/* Multi-Edit Indicator */}
                      {isMultiEdit && viewMode === "logics" && (
                        <MultiEditIndicator
                          selectedEngines={selectedEngines}
                          selectedGroups={selectedGroups}
                          selectedLogics={selectedLogics}
                          isGroup1Mode={isGroup1Mode}
                          onClearSelection={clearSelection}
                        />
                      )}

                      {viewMode === "logics" && (
                        <div className="space-y-3">
                          <SelectionDashboard
                            config={config}
                            selectedEngines={selectedEngines}
                            selectedGroups={selectedGroups}
                            selectedLogics={selectedLogics}
                            selectedFields={filteredFields || []}
                            isMultiEdit={isMultiEdit}
                            chatActive={chatActive}
                            pendingPlan={chatPendingPlan}
                            lastAppliedPreview={chatLastAppliedPreview}
                            onFocusField={(field) => {
                              setSelectedFields([field]);
                              setHasStarted(true);
                              setViewMode("logics");
                            }}
                            onSendToChat={(cmd) => pushChatCommand(cmd)}
                            onOpenVaultSave={(draft) => openVaultSave(draft)}
                            onClearSelection={clearSelection}
                          />
                        </div>
                      )}

                      {viewMode === "logics" && (
                        <BatchEditPanel
                          selectedCount={{
                            engines: selectedEngines.length,
                            groups: selectedGroups.length,
                            logics: selectedLogics.length,
                          }}
                          platform={platform}
                          onClearEngines={() => setSelectedEngines([])}
                          onClearGroups={() => setSelectedGroups([])}
                          onClearLogics={() => setSelectedLogics([])}
                        />
                      )}

                      {viewMode === "logics" && (
                        <div className="space-y-3 mt-4">
                          {config && selectedGroups.length > 0 && (
                            <GroupThresholdsCard
                              config={config}
                              selectedGroups={selectedGroups}
                              onConfigChange={handleSaveConfig}
                            />
                          )}
                          {loading ? (
                            <div className="text-center py-8 text-muted-foreground">
                              Loading configuration...
                            </div>
                          ) : (
                            selectedGroups.map((group) => (
                              <div key={group} className="space-y-3">
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                                  {group}
                                </div>
                                {realEngineConfigs
                                  .filter((ec) => selectedEngines.includes(ec.engine))
                                  .map((engineConfig, idx) => (
                                    <GroupCard
                                      key={`${group}-${engineConfig.engine}-${idx}`}
                                      group={group}
                                      engine={engineConfig.engine}
                                      engineData={engineConfig.engineData}
                                      selectedLogics={selectedLogics}
                                      selectedFields={filteredFields || []}
                                      mode={mode}
                                      platform={platform}
                                      config={config}
                                      onUpdateLogic={(logic, field, value, groupNum) => {
                                        if (!config) return;
                                        let processedValue = value;
                                        if (
                                          typeof value === "string" &&
                                          (field.includes("enabled") ||
                                            field.includes("allow_") ||
                                            field === "close_partial")
                                        ) {
                                          processedValue =
                                            value === "ON" || value === "true" || value === "1";
                                        } else if (
                                          typeof value === "string" &&
                                          !isNaN(Number(value))
                                        ) {
                                          processedValue = Number(value);
                                        }
                                        const targetEngineId = engineConfig.engineData?.engine_id as
                                          | "A"
                                          | "B"
                                          | "C";
                                        const newConfig: MTConfig = {
                                          ...config,
                                          engines: config.engines.map((e) => {
                                            if (e.engine_id !== targetEngineId) return e;
                                            return {
                                              ...e,
                                              groups: e.groups.map((g) => {
                                                if (g.group_number !== groupNum) return g;
                                                return {
                                                  ...g,
                                                  logics: g.logics.map((l) => {
                                                    if (l.logic_name?.toUpperCase() !== logic.toUpperCase()) return l;
                                                    return {
                                                      ...l,
                                                      [field]: processedValue as any,
                                                    };
                                                  }),
                                                };
                                              }),
                                            };
                                          }),
                                        };
                                        handleSaveConfig(newConfig);
                                      }}
                                    />
                                  ))}
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {viewMode === "general" && (
                        <div className="mt-4">
                          <GeneralCategories
                            platform={platform}
                            generalConfig={config?.general || mockGeneralConfig}
                            mtPlatform={platform}
                            mode={mode}
                            selectedCategory={selectedGeneralCategory}
                            onConfigChange={(newGeneralConfig) => {
                              if (config) {
                                handleSaveConfig({
                                  ...config,
                                  general: newGeneralConfig,
                                });
                              }
                            }}
                          />
                        </div>
                      )}

                      {viewMode === "chat" && (
                        <div className="mt-4">
                          <BatchEditTab
                            platform={platform}
                            config={config}
                            onConfigChange={handleSaveConfig}
                            onNavigate={handleChatNavigation}
                            onCommandSent={(command, hasPlan, changesCount) => {
                              // Add to command history when a command creates a plan
                              if (hasPlan) {
                                const newHistoryItem = {
                                  id: `cmd-${Date.now()}`,
                                  command: command,
                                  timestamp: new Date(),
                                  status: 'pending' as const,
                                  changesCount,
                                };
                                setCommandHistory(prev => [...prev, newHistoryItem].slice(-50));
                              }
                            }}
                            onPlanSnapshot={({ pendingPlan, lastAppliedPreview }) => {
                              setChatPendingPlan(pendingPlan);
                              setChatLastAppliedPreview(lastAppliedPreview);
                            }}
                          />
                        </div>
                      )}

                      {viewMode === "version-control" && (
                        <div className="mt-4">
                          <VersionControlPanel
                            config={config}
                            onConfigChange={handleSaveConfig}
                          />
                        </div>
                      )}

                      {viewMode === "analytics" && (
                        <div className="mt-4">
                          <AnalyticsPanel config={config} />
                        </div>
                      )}

                      {viewMode === "undo-redo" && (
                        <div className="mt-4">
                          <UndoRedoPanel
                            config={config}
                            onConfigChange={handleSaveConfigNoUndoRecord}
                          />
                        </div>
                      )}

                      {viewMode === "memory" && (
                        <div className="mt-4">
                          <MemorySystemPanel
                            config={config}
                            userId="current-user"
                          />
                        </div>
                      )}

                      {viewMode === "grouping" && (
                        <div className="mt-4">
                          <ParameterGroupingPanel config={config} />
                        </div>
                      )}

                      {viewMode === "collaboration" && (
                        <div className="mt-4">
                          <CollaborationPanel
                            config={config}
                            userId="current-user"
                          />
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </main>
            ) : (
              <EmptyState
                onLoadSetfile={(loadedConfig) => {
                  setHasStarted(true);
                  if (loadedConfig) {
                    handleSaveConfig(hydrateMTConfigDefaults(loadedConfig));
                    setSelectedEngines(["Engine A"]);
                    setSelectedGroups(["Group 1"]);
                    setSelectedLogics(["POWER"]);
                    setViewMode("logics");
                  }
                }}
                onChooseEngine={() => {
                  setHasStarted(true);
                  // Set default selections when starting fresh
                  setSelectedEngines(["Engine A"]);
                  setSelectedGroups(["Group 1"]);
                  setSelectedLogics(["POWER"]);
                  setViewMode("logics");
                }}
              />
            )}
          </ResizablePanel>

          {viewMode !== "chat" &&
            viewMode !== "save_config" &&
            viewMode !== "vault" &&
            viewMode !== "version-control" &&
            viewMode !== "analytics" &&
            viewMode !== "undo-redo" &&
            viewMode !== "memory" &&
            viewMode !== "grouping" &&
            viewMode !== "collaboration" && viewMode !== "chat" && (
              <>
                <ResizableHandle withHandle />

                <ResizablePanel
                  id="quick-actions-panel"
                  order={3}
                  defaultSize={18}
                  minSize={12}
                  maxSize={30}
                  collapsible={true}
                  collapsedSize={4}
                >
                  <QuickActionsPanel
                    config={config}
                    onConfigChange={handleSaveConfig}
                    onViewModeChange={handleViewModeChange}
                    isCollapsed={isQuickActionsCollapsed}
                    onToggleCollapse={() => setIsQuickActionsCollapsed(!isQuickActionsCollapsed)}
                    onOpenVaultSave={(draft) => {
                      setVaultSaveDraft(draft || null);
                      setPreviousViewMode(viewMode);
                      setViewMode("save_config");
                      setHasStarted(true);
                    }}
                  />
                </ResizablePanel>
              </>
            )}

          {/* Quick Changes Sidebar for Chat mode - Advanced change review UI */}
          {viewMode === "chat" && (
            <>
              <ResizableHandle withHandle />
              
              <ResizablePanel
                id="quick-changes-panel"
                order={3}
                defaultSize={28}
                minSize={20}
                maxSize={40}
                collapsible={true}
                collapsedSize={4}
              >
                <QuickActionsPanel
                  config={config}
                  onConfigChange={handleSaveConfig}
                  onViewModeChange={handleViewModeChange}
                  isCollapsed={isQuickActionsCollapsed}
                  onToggleCollapse={() => setIsQuickActionsCollapsed(!isQuickActionsCollapsed)}
                  onOpenVaultSave={(draft) => {
                    setVaultSaveDraft(draft || null);
                    setPreviousViewMode(viewMode);
                    setViewMode("save_config");
                    setHasStarted(true);
                  }}
                  viewMode={viewMode}
                  pendingPlan={chatPendingPlan}
                  recentChanges={chatLastAppliedPreview?.map(p => ({
                    engine: p.engine,
                    group: p.group,
                    logic: p.logic,
                    field: p.field,
                    oldValue: p.currentValue,
                    newValue: p.newValue
                  })) || []}
                  onConfirmPlan={() => {
                    if (chatPendingPlan && config) {
                      const newConfig = JSON.parse(JSON.stringify(config)) as MTConfig;
                      chatPendingPlan.preview.forEach(change => {
                        const engine = newConfig.engines?.find(e => e.engine_name === change.engine);
                        if (engine) {
                          const group = engine.groups?.find(g => g.group_number === change.group);
                          if (group) {
                            const logic = group.logics?.find(l => l.logic_name === change.logic);
                            if (logic && change.field in logic) {
                              (logic as any)[change.field] = change.newValue;
                            }
                          }
                        }
                      });
                      handleSaveConfig(newConfig);
                      setChatLastAppliedPreview(chatPendingPlan.preview);
                      setChatPendingPlan(null);
                      toast.success(`Applied ${chatPendingPlan.preview.length} changes`);
                    }
                  }}
                  onCancelPlan={() => {
                    setChatPendingPlan(null);
                    toast.info("Changes cancelled");
                  }}
                  onUndoChanges={() => {
                    setChatLastAppliedPreview(null);
                    toast.info("Undo not yet implemented - use version control");
                  }}
                />
              </ResizablePanel>
            </>
          )}


        </ResizablePanelGroup>
      </div>

      <FooterRibbon platform={platform} config={config} />
      <ExportOptionsModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        config={config}
        platform={platform}
      />
      {settingsOpen && (
        <SettingsPage
          onClose={() => setSettingsOpen(false)}
          onNavigateToHome={() => {
            setSettingsOpen(false);
            setHasStarted(false);
          }}
          onNavigateToEngines={() => {
            setSettingsOpen(false);
            setViewMode("logics");
            setHasStarted(true);
          }}
          onNavigateToChat={() => {
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

// Wrap Index with ChatStateProvider for persistent chat state
export default function IndexWithChatState() {
  return (
    <ChatStateProvider>
      <Index />
    </ChatStateProvider>
  );
}

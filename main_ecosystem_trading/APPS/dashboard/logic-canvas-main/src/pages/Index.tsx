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

import { MultiEditIndicator } from "@/components/config/MultiEditIndicator";
import { CLITerminal } from "@/components/config/CLITerminal";
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
  MTConfig,
} from "@/types/mt-config";
import { validateConfig } from "@/utils/config-validation";
import { useSettings } from "@/contexts/SettingsContext";
import { ChatStateProvider, useChatState } from "@/contexts/ChatStateContext";
import { canonicalizeConfigForBackend, normalizeConfigForExport } from "@/utils/unit-mode";
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

const SIDE_SCOPED_BASE_FIELDS = new Set([
  "initial_lot",
  "multiplier",
  "grid",
  "trail_value",
  "trail_start",
  "trail_step",
]);

// Map UI platform to MT platform type
const platformToMT = (p: Platform): MTPlatform => {
  if (p === "mt4") return "MT4";
  if (p === "mt5") return "MT5";
  return "MT4"; // fallback
};

function Index() {
  const { settings, updateSetting, saveSettings } = useSettings();
  const [selectedEngines, setSelectedEngines] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedLogics, setSelectedLogics] = useState<string[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [checkedFavorites, setCheckedFavorites] = useState<string[]>([]);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [platform, setPlatform] = useState<Platform>("mt5");
  const [viewMode, setViewMode] = useState<ViewMode>("logics");
  const [previousViewMode, setPreviousViewMode] = useState<ViewMode>("logics");
  const [selectedGeneralCategory, setSelectedGeneralCategory] =
    useState<string>("risk");

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
    let fields = selectedFields;

    // Apply search filter
    if (searchQuery.trim()) {
      const matchingIds = getMatchingFieldIds(searchQuery);
      if (fields.length > 0) {
        fields = fields.filter(f => matchingIds.includes(f));
      } else {
        fields = matchingIds;
      }
    }

    // Apply favorites filter - use checked favorites
    if (favoritesOnly && checkedFavorites.length > 0) {
      fields = fields.filter(f => checkedFavorites.includes(f));
    } else if (favoritesOnly && checkedFavorites.length === 0 && settings.favoriteFields.length > 0) {
      // If favoritesOnly is true but no checked favorites, show nothing
      fields = [];
    }

    return fields;
  }, [searchQuery, selectedFields, favoritesOnly, checkedFavorites, settings.favoriteFields]);

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
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const config = realConfig;
  // Always-current config ref so onUpdateLogic closures never use stale state.
  // Without this, rapid edits across different groups overwrite each other.
  const configRef = useRef(config);
  configRef.current = config;
  const undoRedoManagerRef = useRef(getUndoRedoManager());

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

  const cloneHistoryValue = <T,>(value: T): T => {
    if (value === undefined || value === null) return value;
    if (typeof value !== "object") return value;
    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  };

  const formatHistoryValue = (value: unknown) => {
    if (value === undefined) return "unset";
    if (value === null) return "null";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return "[object]";
      }
    }
    return String(value);
  };

  const resolveLogicRowDirection = (row: Record<string, any>): "buy" | "sell" | null => {
    const dirRaw = String(row.direction || "").toUpperCase();
    if (dirRaw === "B" || dirRaw === "BUY") return "buy";
    if (dirRaw === "S" || dirRaw === "SELL") return "sell";

    const rowLogicId = String(row.logic_id || "").toUpperCase();
    if (rowLogicId.includes("_B_") || rowLogicId.endsWith("_B")) return "buy";
    if (rowLogicId.includes("_S_") || rowLogicId.endsWith("_S")) return "sell";
    if (row.allow_buy === true && row.allow_sell !== true) return "buy";
    if (row.allow_sell === true && row.allow_buy !== true) return "sell";
    return null;
  };

  const buildPatchedLogicRow = (
    row: Record<string, any>,
    field: string,
    value: any,
  ) => {
    const nextRow: Record<string, any> = {
      ...row,
      [field]: value,
    };

    if (SIDE_SCOPED_BASE_FIELDS.has(field)) {
      const rowDirection = resolveLogicRowDirection(row);
      if (rowDirection) {
        nextRow[`${field}_${rowDirection === "buy" ? "b" : "s"}`] = value;
      }
    }

    return nextRow;
  };

  const recordGeneralHistory = (
    previousGeneral: MTConfig["general"],
    nextGeneral: MTConfig["general"],
  ) => {
    const generalKeys = new Set([
      ...Object.keys(previousGeneral || {}),
      ...Object.keys(nextGeneral || {}),
    ]);

    generalKeys.forEach((key) => {
      const before = (previousGeneral as any)?.[key];
      const after = (nextGeneral as any)?.[key];

      if (deepEqual(before, after)) {
        return;
      }

      undoRedoManagerRef.current.addOperation({
        type: "UPDATE",
        target: { engineId: "GENERAL", parameter: key },
        before: cloneHistoryValue(before),
        after: cloneHistoryValue(after),
        description: `General ${key}: ${formatHistoryValue(before)} -> ${formatHistoryValue(after)}`,
      });
    });
  };

  const handleToggleFavorite = (fieldId: string) => {
    const currentFavorites = settings.favoriteFields || [];
    const newFavorites = currentFavorites.includes(fieldId)
      ? currentFavorites.filter(f => f !== fieldId)
      : [...currentFavorites, fieldId];
    updateSetting("favoriteFields", newFavorites);

    // Also remove from checkedFavorites if un-favorited
    if (currentFavorites.includes(fieldId)) {
      setCheckedFavorites(prev => prev.filter(f => f !== fieldId));
    }

    saveSettings();
  };

  const handleGeneralUpdate = async (updates: Partial<MTConfig["general"]>) => {
    const latestConfig = configRef.current;
    if (!latestConfig) return;

    const nextGeneral = { ...latestConfig.general, ...updates };
    recordGeneralHistory(latestConfig.general, nextGeneral);
    await handleSaveConfig({ ...latestConfig, general: nextGeneral });
  };

  const handleSaveConfig = async (newConfig: MTConfig) => {
    console.log("[Index] SAVE_CONFIG", {
      totalInputs: newConfig.total_inputs,
      currentSetName: newConfig.current_set_name || null,
      engines: newConfig.engines?.length || 0,
    });

    // Promote the latest config immediately so back-to-back edits across groups
    // cannot rebuild from the previous render's state.
    configRef.current = newConfig;
    setConfigOnly(newConfig);
    await realSaveConfig(newConfig);
  };

  const lastSavedLabel = config?.last_saved_at
    ? `Last saved ${new Date(config.last_saved_at).toLocaleString()}${config.current_set_name ? ` · ${config.current_set_name}` : ""}`
    : undefined;

  // Load config on mount or platform change
  useEffect(() => {
    loadConfig()
      .catch(() => {
        // Leave the editor empty if nothing valid is available locally.
      });
  }, [loadConfig]);

  // Validate config on changes (debounced) - only update warnings state, no toasts
  useEffect(() => {
    if (!config) return;

    // Use a timeout to debounce validation
    const timeout = setTimeout(() => {
      validateConfig(config);
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
      console.log("[Index] AUTOSAVE_LOCAL", {
        totalInputs: enrichedConfig.total_inputs,
        currentSetName: enrichedConfig.current_set_name || null,
        engines: enrichedConfig.engines?.length || 0,
      });
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
          } catch { }
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
      console.log("[Index] FLUSH_LOCAL", {
        totalInputs: enrichedConfig.total_inputs,
        currentSetName: enrichedConfig.current_set_name || null,
        engines: enrichedConfig.engines?.length || 0,
      });
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
          } catch { }
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
    console.log(
      `[Index] SELECTION_CHANGE type=${type} next=${JSON.stringify(items)} current=${JSON.stringify({
        engines: selectedEngines,
        groups: selectedGroups,
        logics: selectedLogics,
      })}`,
    );
    console.log("[Index] SELECTION_CHANGE", {
      type,
      items,
      current: {
        engines: selectedEngines,
        groups: selectedGroups,
        logics: selectedLogics,
      },
    });

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

      // Single source of truth: do not rewrite allow_buy / allow_sell on save/export.

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

        const configToExport = configToSave;
        const backendConfig = canonicalizeConfigForBackend(configToExport);

        if (data.format === "json") {
          await invoke("export_json_file", {
            config: normalizeConfigForExport(backendConfig),
            filePath: fullPath,
            tags: data.tags,
            comments: data.comments,
          });
        } else {
          await invoke("export_massive_v19_setfile", {
            config: normalizeConfigForExport(backendConfig),
            filePath: fullPath,
            platform: platform === "mt5" ? "MT5" : "MT4",
          });
        }
        toast.success(`Exported to ${fileName}`);
      }

      // 2. Save to Vault if requested
      if (data.saveToVault) {
        const configToVault = configToSave;
        const backendConfig = canonicalizeConfigForBackend(configToVault);
        await invoke("save_to_vault", {
          config: normalizeConfigForExport(backendConfig),
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
        favoritesOnly={favoritesOnly}
        onFavoritesOnlyChange={setFavoritesOnly}
        favoriteFields={settings.favoriteFields || []}
        onToggleFavorite={handleToggleFavorite}
        checkedFavorites={checkedFavorites}
        onCheckedFavoritesChange={setCheckedFavorites}
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
                          Object.assign(
                            logic as any,
                            buildPatchedLogicRow(
                              logic as any,
                              change.field,
                              change.newValue,
                            ),
                          );
                        }
                      }
                    }
                  });
                  handleSaveConfig(newConfig);
                  setChatLastAppliedPreview(chatPendingPlan.preview);

                  // Update the pending command status to 'applied'
                  setCommandHistory(prev => {
                    const lastPending = (prev as any[]).findLast(c => c.status === 'pending');
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
                    const lastPending = (prev as any[]).findLast(c => c.status === 'pending');
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
                          <CLITerminal
                            onExecuteCommand={(cmd) => pushChatCommand(cmd)}
                            placeholder="Type: set grid power a 600, set lot 0.02, enable reverse..."
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
                                      mode={1}
                                      platform={platform}
                                      config={config}
                                      onUpdateLogic={(logic, field, value, groupNum, direction, targetLogicId) => {
                                        const latestConfig = configRef.current;
                                        if (!latestConfig) return;

                                        console.log(
                                          `[Index] LOGIC_UPDATE_REQUEST engine=${engineConfig.engine} group=${groupNum} logic=${logic} field=${field} value=${JSON.stringify(value)} direction=${direction || "none"} targetLogicId=${targetLogicId || "none"}`,
                                        );
                                        console.log("[Index] LOGIC_UPDATE_REQUEST", {
                                          engine: engineConfig.engine,
                                          groupNum,
                                          logic,
                                          field,
                                          value,
                                          direction: direction || null,
                                          targetLogicId: targetLogicId || null,
                                        });

                                        let processedValue = value;
                                        const trimmedValue =
                                          typeof value === "string" ? value.trim() : value;
                                        if (
                                          typeof value === "string" &&
                                          (field.includes("enabled") ||
                                            field.includes("allow") ||
                                            field === "close_partial")
                                        ) {
                                          processedValue =
                                            trimmedValue === "ON" ||
                                            trimmedValue === "true" ||
                                            trimmedValue === "1";
                                        } else if (
                                          typeof value === "string" &&
                                          trimmedValue === ""
                                        ) {
                                          processedValue = undefined;
                                        } else if (
                                          typeof value === "string" &&
                                          !isNaN(Number(trimmedValue))
                                        ) {
                                          processedValue = Number(trimmedValue);
                                        }
                                        const targetEngineId = engineConfig.engineData?.engine_id as
                                          | "A"
                                          | "B"
                                          | "C";
                                        const isGroupField =
                                          field === "group_power_start" ||
                                          field === "group_power_start_b" ||
                                          field === "group_power_start_s";
                                        const targetEngine = latestConfig.engines.find(
                                          (engine) => engine.engine_id === targetEngineId,
                                        );
                                        if (!targetEngine) return;

                                        const targetGroup = targetEngine.groups.find(
                                          (candidateGroup) => candidateGroup.group_number === groupNum,
                                        );
                                        if (!targetGroup) return;

                                        const normalizedTargetLogicId = String(
                                          targetLogicId || "",
                                        )
                                          .trim()
                                          .toUpperCase();

                                        const normalizeLogicName = (raw: string) => {
                                          const upper = String(raw || "").toUpperCase();
                                          return upper === "SCALP" ? "SCALPER" : upper;
                                        };

                                        const targetLogicRow = isGroupField
                                          ? null
                                          : targetGroup.logics.find((row) => {
                                              const rowLogicId = String((row as any).logic_id || "").toUpperCase();

                                              if (normalizedTargetLogicId) {
                                                return rowLogicId === normalizedTargetLogicId;
                                              }

                                              const logicBaseName = logic.replace(/^(B|C)/i, "");
                                              if (
                                                normalizeLogicName(row.logic_name || "") !==
                                                normalizeLogicName(logicBaseName)
                                              ) {
                                                return false;
                                              }

                                              const wantsDirection =
                                                direction === "buy" || direction === "sell";
                                              if (!wantsDirection) {
                                                return true;
                                              }

                                              return resolveLogicRowDirection(row as any) === direction;
                                            }) || null;

                                        if (!isGroupField && !targetLogicRow) {
                                          console.warn("[Index] LOGIC_UPDATE_MISS", {
                                            engine: engineConfig.engine,
                                            groupNum,
                                            logic,
                                            field,
                                            direction: direction || null,
                                            targetLogicId: normalizedTargetLogicId || null,
                                          });
                                          return;
                                        }

                                        const resolvedLogicId =
                                          normalizedTargetLogicId ||
                                          String((targetLogicRow as any)?.logic_id || "")
                                            .trim()
                                            .toUpperCase();
                                        const previousValue = isGroupField
                                          ? (targetGroup as any)[field]
                                          : (targetLogicRow as any)?.[field];

                                        if (deepEqual(previousValue, processedValue)) {
                                          console.log("[Index] LOGIC_UPDATE_NOOP", {
                                            engine: engineConfig.engine,
                                            groupNum,
                                            logic,
                                            field,
                                            previousValue,
                                            processedValue,
                                            direction: direction || null,
                                            targetLogicId: resolvedLogicId || null,
                                          });
                                          return;
                                        }

                                        console.log(
                                          `[Index] LOGIC_UPDATE_RESOLVED engine=${engineConfig.engine} group=${groupNum} logic=${logic} field=${field} prev=${JSON.stringify(previousValue)} next=${JSON.stringify(processedValue)} direction=${direction || "none"} targetLogicId=${resolvedLogicId || "none"}`,
                                        );
                                        console.log("[Index] LOGIC_UPDATE_RESOLVED", {
                                          engine: engineConfig.engine,
                                          groupNum,
                                          logic,
                                          field,
                                          previousValue,
                                          nextValue: processedValue,
                                          direction: direction || null,
                                          targetLogicId: resolvedLogicId || null,
                                          targetRowLogicName: targetLogicRow?.logic_name || null,
                                        });

                                        undoRedoManagerRef.current.addOperation({
                                          type: "UPDATE",
                                          target: isGroupField
                                            ? {
                                                engineId: targetEngineId,
                                                groupId: groupNum,
                                                parameter: field,
                                              }
                                            : {
                                                engineId: targetEngineId,
                                                groupId: groupNum,
                                                logicName:
                                                  targetLogicRow?.logic_name || logic,
                                                logicId: resolvedLogicId || undefined,
                                                parameter: field,
                                              },
                                          before: cloneHistoryValue(previousValue),
                                          after: cloneHistoryValue(processedValue),
                                          description: isGroupField
                                            ? `${field}: ${formatHistoryValue(previousValue)} -> ${formatHistoryValue(processedValue)} (Engine ${targetEngineId} G${groupNum})`
                                            : `${field}: ${formatHistoryValue(previousValue)} -> ${formatHistoryValue(processedValue)} (${targetLogicRow?.logic_name || logic} G${groupNum}${direction ? ` ${direction.toUpperCase()}` : ""})`,
                                        });

                                        const newConfig: MTConfig = {
                                          ...latestConfig,
                                          engines: latestConfig.engines.map((e) => {
                                            if (e.engine_id !== targetEngineId) return e;
                                            return {
                                              ...e,
                                              groups: e.groups.map((g) => {
                                                if (g.group_number !== groupNum) return g;
                                                if (isGroupField) {
                                                  return {
                                                    ...g,
                                                    [field]: processedValue,
                                                  };
                                                }
                                                return {
                                                  ...g,
                                                  logics: g.logics.map((l) => {
                                                    const rowLogicId = String((l as any).logic_id || "");

                                                    if (resolvedLogicId) {
                                                      if (
                                                        rowLogicId.toUpperCase() !==
                                                        resolvedLogicId
                                                      ) {
                                                        return l;
                                                      }

                                                      return buildPatchedLogicRow(
                                                        l as any,
                                                        field,
                                                        processedValue,
                                                      );
                                                    }

                                                    // Strip engine prefix (B or C) from UI logic name to match config
                                                    // "BPOWER" -> "Power", "BREPOWER" -> "Repower", etc.
                                                    const logicBaseName = logic.replace(/^(B|C)/i, '');
                                                    if (
                                                      normalizeLogicName(l.logic_name || "") !==
                                                      normalizeLogicName(logicBaseName)
                                                    ) return l;

                                                    const wantsDirection = direction === "buy" || direction === "sell";

                                                    if (wantsDirection) {
                                                      const rowDirection = resolveLogicRowDirection(l as any);
                                                      if (!rowDirection || rowDirection !== direction) {
                                                        return l;
                                                      }
                                                    }

                                                    return buildPatchedLogicRow(
                                                      l as any,
                                                      field,
                                                      processedValue,
                                                    );
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
                            generalConfig={config?.general}
                            mtPlatform={platform}
                            mode={1}
                            selectedCategory={selectedGeneralCategory}
                            onConfigChange={(newGeneralConfig) => {
                              const latestConfig = configRef.current;
                              if (latestConfig) {
                                recordGeneralHistory(
                                  latestConfig.general,
                                  newGeneralConfig,
                                );
                                handleSaveConfig({
                                  ...latestConfig,
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
                            onConfigChange={handleSaveConfig}
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
                    handleSaveConfig(canonicalizeConfigForBackend(loadedConfig));
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
                  commandHistory={commandHistory}
                  stats={chatStats}
                  onCommandClick={(command) => pushChatCommand(command)}
                  favoritesOnly={favoritesOnly}
                  onFavoritesOnlyChange={setFavoritesOnly}
                  favoriteFields={settings.favoriteFields || []}
                  onToggleFavorite={handleToggleFavorite}
                  checkedFavorites={checkedFavorites}
                  onCheckedFavoritesChange={setCheckedFavorites}
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
                              Object.assign(
                                logic as any,
                                buildPatchedLogicRow(
                                  logic as any,
                                  change.field,
                                  change.newValue,
                                ),
                              );
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

          {viewMode !== "chat" && (
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
                  favoritesOnly={favoritesOnly}
                  onFavoritesOnlyChange={setFavoritesOnly}
                  favoriteFields={settings.favoriteFields || []}
                  onToggleFavorite={handleToggleFavorite}
                  checkedFavorites={checkedFavorites}
                  onCheckedFavoritesChange={setCheckedFavorites}
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

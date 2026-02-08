import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { type ImperativePanelHandle } from "react-resizable-panels";
import { TopBar, Platform } from "@/components/layout/TopBar";
import { Sidebar, ViewMode } from "@/components/layout/Sidebar";
import { ChatPanel } from "@/components/layout/ChatPanel";
import { BatchEditPanel } from "@/components/config/BatchEditPanel";
import { EngineCard } from "@/components/config/EngineCard";
import { GeneralCategories } from "@/components/config/GeneralCategories";
import { MultiEditIndicator } from "@/components/config/MultiEditIndicator";
import { SelectionDashboard } from "@/components/config/SelectionDashboard";
import { EmptyState } from "@/components/config/EmptyState";
import { FooterRibbon } from "@/components/config/FooterRibbon";
import { VaultSaveModal, type VaultSaveData } from "@/components/config/VaultSaveModal";
import { VaultSavePage } from "@/components/config/VaultSavePage";
import { ExportOptionsModal } from "@/components/config/ExportOptionsModal";
import { VaultPage } from "@/components/config/VaultPage";
import { SettingsPage } from "@/components/config/SettingsPage";
import { BatchEditTab } from "@/components/config/BatchEditTab";
import TacticalView from "@/pages/TacticalView";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useMTConfig, useConfigUpdater } from "@/hooks/useMTConfig";
import { useMTFileOps } from "@/hooks/useMTFileOps";
import type { Platform as MTPlatform, GeneralConfig, MTConfig } from "@/types/mt-config";
import { mockFullConfig } from "@/data/mock-config";
import { validateConfig, getWarningSummary, type ConfigWarning } from "@/utils/config-validation";
import { hydrateMTConfigDefaults } from "@/utils/hydrate-mt-config-defaults";
import { useSettings } from "@/contexts/SettingsContext";
import { withUseDirectPriceGrid } from "@/utils/unit-mode";
import type { TransactionPlan, ChangePreview } from "@/lib/chat/types";
import { VersionControlPanel } from "@/components/version-control/VersionControlPanel";
import { AnalyticsPanel } from "@/components/visual-enhancements/AnalyticsPanel";
import { CollaborationPanel } from "@/components/visual-enhancements/CollaborationPanel";
import { UndoRedoPanel } from "@/components/visual-enhancements/UndoRedoPanel";
import { MemorySystemPanel } from "@/components/version-control/MemorySystemPanel";
import { ParameterGroupingPanel } from "@/components/version-control/ParameterGroupingPanel";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { SingleEditContext } from "@/components/config/SingleEditContext";

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
      session_filter_overrides_news: true
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
      restart_pips: 0
    }))
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
  }
};

const engineConfigs = [
  { engine: "Engine A", tradingType: "Reverse Trading" },
  { engine: "Engine B", tradingType: "Hedge Trading" },
  { engine: "Engine C", tradingType: "Direct Trading" },
];

const canvasClasses: Record<Platform, string> = {
  mt4: "canvas-mt4", mt5: "canvas-mt5", python: "canvas-python",
  c: "canvas-c", cpp: "canvas-cpp", rust: "canvas-rust",
};

// Map UI platform to MT platform type
const platformToMT = (p: Platform): MTPlatform => {
  if (p === "mt4") return "MT4";
  if (p === "mt5") return "MT5";
  return "MT4"; // fallback
};

export default function Index() {
  const { settings } = useSettings();
  const [selectedEngines, setSelectedEngines] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedLogics, setSelectedLogics] = useState<string[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [platform, setPlatform] = useState<Platform>("mt5");
  const [viewMode, setViewMode] = useState<ViewMode>("logics");
  const [previousViewMode, setPreviousViewMode] = useState<ViewMode>("logics");
  const [selectedGeneralCategory, setSelectedGeneralCategory] = useState<string>("risk");

  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const [externalCommand, setExternalCommand] = useState<string | null>(null);
  const [chatPendingPlan, setChatPendingPlan] = useState<TransactionPlan | null>(null);
  const [chatLastAppliedPreview, setChatLastAppliedPreview] = useState<ChangePreview[] | null>(null);
  
  // HYBRID MODE: Track if selections came from chat (temporary) vs manual UI (persistent)
  const [chatActive, setChatActive] = useState<boolean>(false);
  // Store manual selections to restore when exiting chat mode
  const [manualSelections, setManualSelections] = useState<{
    engines: string[];
    groups: string[];
    logics: string[];
  }>({ engines: [], groups: [], logics: [] });
  const [vaultSaveDraft, setVaultSaveDraft] = useState<{
    name: string;
    category: string;
    tags: string[];
    comments: string;
    saveToVault: boolean;
    format: "set" | "json";
  } | null>(null);

  const pushChatCommand = (command: string) => {
    setExternalCommand(command);
    setTimeout(() => setExternalCommand(null), 0);
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
  const { config: realConfig, loading, loadConfig, saveConfig: realSaveConfig } = useMTConfig(mtPlatform);
  const { batchUpdateLogics, updateGeneral } = useConfigUpdater(mtPlatform);
  const { exportCompleteV3LegacySetfile } = useMTFileOps(mtPlatform, realConfig);

  const [mockConfig, setMockConfig] = useState<MTConfig | null>(null);
  const [configWarnings, setConfigWarnings] = useState<ConfigWarning[]>([]);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const config = realConfig || mockConfig;

  const handleGeneralUpdate = async (updates: Partial<GeneralConfig>) => {
    if (realConfig) {
      await updateGeneral(updates);
    } else {
      // For mock config or fallback
      if (mockConfig) {
        setMockConfig({
          ...mockConfig,
          general: { ...mockConfig.general, ...updates }
        });
      }
    }
  };

  const handleSaveConfig = async (newConfig: MTConfig) => {
    if (realConfig) {
      await realSaveConfig(newConfig);
    } else {
      setMockConfig(newConfig);
      toast.info("Updated mock configuration (not saved to disk)");
    }
  };

  const lastSavedLabel = config?.last_saved_at
    ? `Last saved ${new Date(config.last_saved_at).toLocaleString()}${config.current_set_name ? ` · ${config.current_set_name}` : ""}`
    : undefined;

  // Load config on mount or platform change
  useEffect(() => {
    loadConfig().then((loaded) => {
      if (!loaded) {
        // console.log("Using mock data - config not loaded");
        setMockConfig(hydrateMTConfigDefaults(mockFullConfig));
      } else {
        setMockConfig(null);
      }
    }).catch(() => {
      // console.log("Using mock data - config load failed");
      setMockConfig(hydrateMTConfigDefaults(mockFullConfig));
    });
  }, [loadConfig]);

  // Validate config on changes and show warnings
  useEffect(() => {
    if (config) {
      const warnings = validateConfig(config);
      setConfigWarnings(warnings);

      const summary = getWarningSummary(warnings);
      if (summary.warnings > 0 || summary.errors > 0) {
        // Show a one-time toast summarizing issues
        const totalIssues = summary.warnings + summary.errors;
        toast.warning(`Configuration has ${totalIssues} issue(s)`, {
          description: warnings[0]?.message,
          duration: 5000,
        });
      }
    }
  }, [config]);

  // Auto-save config on app close (like MT4 terminal)
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Save current config to localStorage for persistence
      if (config) {
        try {
          localStorage.setItem('daavfx-last-config', JSON.stringify(config));
        } catch (e) {
          console.warn('[AutoSave] Failed to save config on close:', e);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Also save on visibility change (app switching)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && config) {
        try {
          localStorage.setItem('daavfx-last-config', JSON.stringify(config));
        } catch (e) {
          console.warn('[AutoSave] Failed to save config on hide:', e);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [config]);

  // Load last config on startup (if available)
  useEffect(() => {
    const lastConfig = localStorage.getItem('daavfx-last-config');
    if (lastConfig && !config) {
      try {
        const parsed = JSON.parse(lastConfig);
        setMockConfig(parsed);
        toast.success("Restored last configuration");
      } catch (e) {
        console.warn('[AutoSave] Failed to restore last config:', e);
      }
    }
  }, []);

  // Get real engine data from config or use mock
  const realEngineConfigs = config?.engines.map(engine => ({
    engine: `Engine ${engine.engine_id}`,
    tradingType: engine.engine_id === "A" ? "Multi-Logic System" :
      engine.engine_id === "B" ? "Hedge Trading" : "Direct Trading",
    engineData: engine
  })) || engineConfigs.map(e => ({ ...e, engineData: null }));

  const handleSelectionChange = (type: "engines" | "groups" | "logics", items: string[]) => {
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

  const handleChatNavigation = (target: { engines?: string[]; groups?: number[]; logics?: string[]; fields?: string[] }) => {
    setHasStarted(true);
    
    // HYBRID MODE: If entering chat mode for the first time, save current manual selections
    if (!chatActive) {
      setManualSelections({
        engines: selectedEngines,
        groups: selectedGroups,
        logics: selectedLogics
      });
      setChatActive(true);
    }

    if (target.engines) {
      // Map "A" -> "Engine A"
      const mappedEngines = target.engines.map(e => e.startsWith("Engine") ? e : `Engine ${e}`);
      setSelectedEngines(mappedEngines);
    }

    if (target.groups) {
      // Map 1 -> "Group 1"
      const mappedGroups = target.groups.map(g => `Group ${g}`);
      setSelectedGroups(mappedGroups);
    }

    if (target.logics) {
      // Map "Power" -> "POWER"
      const mappedLogics = target.logics.map(l => l.toUpperCase());
      setSelectedLogics(mappedLogics);
    }

    if (target.fields) {
      setSelectedFields(target.fields);
    } else {
      setSelectedFields([]);
    }

    // Switch to logics view to see the result
    setViewMode("logics");
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
      if (data.strategyType === "buy") {
        configToSave.general.allow_buy = true;
        configToSave.general.allow_sell = false;
        // Update all logics
        if (configToSave.logics) {
          configToSave.logics.forEach((logic: any) => {
            logic.allow_buy = true;
            logic.allow_sell = false;
          });
        }
      } else if (data.strategyType === "sell") {
        configToSave.general.allow_buy = false;
        configToSave.general.allow_sell = true;
        // Update all logics
        if (configToSave.logics) {
          configToSave.logics.forEach((logic: any) => {
            logic.allow_buy = false;
            logic.allow_sell = true;
          });
        }
      } else {
        configToSave.general.allow_buy = true;
        configToSave.general.allow_sell = true;
        // Update all logics
        if (configToSave.logics) {
          configToSave.logics.forEach((logic: any) => {
            logic.allow_buy = true;
            logic.allow_sell = true;
          });
        }
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

        if (data.format === "json") {
          await invoke("export_json_file", {
            config: configToExport,
            file_path: fullPath,
            tags: data.tags,
            comments: data.comments
          });
        } else {
          await invoke("export_set_file", {
            config: configToExport,
            file_path: fullPath,
            platform: platform === "mt5" ? "MT5" : "MT4",
            include_optimization_hints: true,
            tags: data.tags,
            comments: data.comments
          });
        }
        toast.success(`Exported to ${fileName}`);
      }

      // 2. Save to Vault if requested
      if (data.saveToVault) {
        const configToVault = withUseDirectPriceGrid(configToSave, settings);
        await invoke("save_to_vault", {
          config: configToVault,
          name: data.name,
          category: data.category,
          tags: data.tags.length > 0 ? data.tags : null,
          comments: data.comments || null,
          format: data.format || "set",
          vault_path_override: settings.vaultPath
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

  const isGroup1Mode = selectedGroups.includes("Group 1") && selectedGroups.length === 1;
  const isMultiEdit = selectedEngines.length > 1 || selectedGroups.length > 1 || selectedLogics.length > 1;

  // Dynamic border color based on Buy/Sell state
  const getBorderColor = () => {
    if (!config) return "border-border";
    if (config.general.allow_buy && config.general.allow_sell) return "border-blue-500/30";
    if (config.general.allow_buy) return "border-blue-600";
    if (config.general.allow_sell) return "border-red-600";
    return "border-border";
  };

  return (
    <div className={cn("h-screen flex flex-col bg-background border-[3px] transition-colors duration-300", getBorderColor())}>
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
        magicNumberBuy={config?.general.magic_number_buy}
        magicNumberSell={config?.general.magic_number_sell}
        onMagicNumberChange={(val) => handleGeneralUpdate({ magic_number: val })}
        onMagicNumberBuyChange={(val) => handleGeneralUpdate({ magic_number_buy: val })}
        onMagicNumberSellChange={(val) => handleGeneralUpdate({ magic_number_sell: val })}
        allowBuy={config?.general.allow_buy}
        onAllowBuyChange={(val) => handleGeneralUpdate({ allow_buy: val })}
        allowSell={config?.general.allow_sell}
        onAllowSellChange={(val) => handleGeneralUpdate({ allow_sell: val })}
      />

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
            <ResizablePanel id="sidebar" order={1} defaultSize={18} minSize={5} maxSize={30}>
              <Sidebar
                selectedEngines={selectedEngines}
                selectedGroups={selectedGroups}
                selectedLogics={selectedLogics}
                onSelectionChange={handleSelectionChange}
                platform={platform}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                selectedGeneralCategory={selectedGeneralCategory}
                onSelectGeneralCategory={handleGeneralCategoryChange}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />

            <ResizablePanel id="main-content" order={2} defaultSize={(viewMode === "tactical" || viewMode === "vault" || viewMode === "save_config" || viewMode === "version-control" || viewMode === "analytics" || viewMode === "undo-redo" || viewMode === "memory" || viewMode === "grouping" || viewMode === "collaboration") ? 82 : (viewMode === "batch" ? 82 : 62)}>
            {hasStarted ? (
              <main className={cn("h-full flex flex-col overflow-hidden transition-colors duration-300", canvasClasses[platform])}>
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
                        defaultName={vaultSaveDraft?.name ?? (config?.current_set_name || "")}
                        defaultCategory={vaultSaveDraft?.category}
                        defaultTags={vaultSaveDraft?.tags}
                        defaultComments={vaultSaveDraft?.comments}
                        defaultSaveToVault={vaultSaveDraft?.saveToVault}
                        defaultFormat={vaultSaveDraft?.format}
                        defaultMagicNumber={config?.general.magic_number}
                    />
                ) : (
                  <ScrollArea className="flex-1">
                    <div className={cn("p-5 w-full", viewMode === "tactical" && "p-0")}>
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
                          selectedFields={selectedFields || []}
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
                          onExportCompleteV3Legacy={exportCompleteV3LegacySetfile}
                        />
                      </div>
                    )}

                    {viewMode === "logics" && (
                      <BatchEditPanel
                        selectedCount={{
                          engines: selectedEngines.length,
                          groups: selectedGroups.length,
                          logics: selectedLogics.length
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
                          realEngineConfigs
                            .filter(ec => selectedEngines.includes(ec.engine))
                            .map((engineConfig, idx) => (
                              <EngineCard
                                key={`${engineConfig.engine}-${idx}`}
                                engine={engineConfig.engine}
                                tradingType={engineConfig.tradingType}
                                groups={selectedGroups}
                                platform={platform}
                                engineData={engineConfig.engineData}
                                mtConfig={config}
                                selectedLogics={selectedLogics}
                                selectedFields={selectedFields || []}
                                onUpdateLogic={(logic, field, value) => {
                                  if (config && selectedGroups.length > 0) {
                                    const updatedConfig = { ...config };
                                    // Find the engine config
                                    const engineIndex = updatedConfig.engines.findIndex(e => e.engine_id === engineConfig.engineData?.engine_id);

                                    if (engineIndex !== -1) {
                                      // Find the group
                                      const groupNum = parseInt(selectedGroups[0].replace("Group ", ""));
                                      const groupIndex = updatedConfig.engines[engineIndex].groups.findIndex(g => g.group_number === groupNum);

                                      if (groupIndex !== -1) {
                                        // Find the logic
                                        const logicIndex = updatedConfig.engines[engineIndex].groups[groupIndex].logics.findIndex(l => l.logic_name.toUpperCase() === logic);

                                        if (logicIndex !== -1) {
                                          if (field === "group_power_start") {
                                            (updatedConfig.engines[engineIndex].groups[groupIndex] as any).group_power_start = value;
                                          } else {
                                            (updatedConfig.engines[engineIndex].groups[groupIndex].logics[logicIndex] as any)[field] = value;
                                          }
                                          handleSaveConfig(updatedConfig);
                                        }
                                      }
                                    }
                                  }
                                }}
                              />
                            ))
                        )}
                      </div>
                    )}

                    {viewMode === "general" && (
                      <div className="mt-4">
                        <GeneralCategories
                          platform={platform}
                          generalConfig={config?.general || mockGeneralConfig}
                          mtPlatform={mtPlatform}
                          selectedCategory={selectedGeneralCategory}
                          onConfigChange={(newGeneralConfig) => {
                            if (config) {
                              handleSaveConfig({ ...config, general: newGeneralConfig });
                            }
                          }}
                        />
                      </div>
                    )}

                    {viewMode === "batch" && (
                      <div className="mt-4">
                        <BatchEditTab
                          platform={platform}
                          config={config}
                          onConfigChange={handleSaveConfig}
                          onNavigate={handleChatNavigation}
                        />
                      </div>
                    )}

                    {viewMode === "tactical" && (
                      <div className="mt-0 h-full">
                        <TacticalView mtPlatform={mtPlatform} />
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
                    // Set default selections after loading config
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

          {viewMode !== "batch" && viewMode !== "tactical" && viewMode !== "save_config" && viewMode !== "vault" && viewMode !== "version-control" && viewMode !== "analytics" && viewMode !== "undo-redo" && viewMode !== "memory" && viewMode !== "grouping" && viewMode !== "collaboration" && (
            <>
              <ResizableHandle withHandle />

              <ResizablePanel 
                id="chat-panel" 
                order={3} 
                defaultSize={20} 
                minSize={15} 
                maxSize={40}
                ref={chatPanelRef}
                collapsible={true}
                collapsedSize={4}
                onCollapse={() => setIsChatCollapsed(true)}
                onExpand={() => setIsChatCollapsed(false)}
              >
                <ChatPanel
                  config={config}
                  onConfigChange={handleSaveConfig}
                  onNavigate={handleChatNavigation}
                  onPlanSnapshot={({ pendingPlan, lastAppliedPreview }) => {
                    setChatPendingPlan(pendingPlan);
                    setChatLastAppliedPreview(lastAppliedPreview);
                  }}
                  externalCommand={externalCommand}
                  selectedEngines={selectedEngines}
                  selectedGroups={selectedGroups}
                  selectedLogics={selectedLogics}
                  isCollapsed={isChatCollapsed}
                  onToggleCollapse={toggleChat}
                  onClearSelection={clearSelection}
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

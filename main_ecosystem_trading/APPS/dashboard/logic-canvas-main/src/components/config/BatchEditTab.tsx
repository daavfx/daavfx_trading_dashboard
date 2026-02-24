import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { 
  Sparkles, 
  Zap, 
  Copy, 
  RefreshCcw, 
  Wand2,
  TrendingUp,
  Percent,
  Sliders,
  ShieldCheck,
  BrainCircuit,
  Activity,
  Check,
  ChevronDown
} from "lucide-react";
import { ChatPanel } from "@/components/layout/ChatPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MTConfig } from "@/types/mt-config";
import type { TransactionPlan, ChangePreview } from "@/lib/chat/types";
import { useVersionControl } from "@/hooks/useVersionControl";
import { VaultSaveModal, VaultSaveData } from "@/components/config/VaultSaveModal";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useSettings } from "@/contexts/SettingsContext";
import type { Snapshot } from "@/hooks/types";
import type { DiffResult } from "@/lib/version-control/types";
import type { Platform } from "@/components/layout/TopBar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface BatchEditTabProps {
  config: MTConfig | null;
  onConfigChange: (config: MTConfig) => void;
  onNavigate: (target: { engines?: string[]; groups?: number[]; logics?: string[]; fields?: string[] }) => void;
  platform?: Platform;
}

export function BatchEditTab({ config, onConfigChange, onNavigate, platform }: BatchEditTabProps) {
  const [showTools, setShowTools] = useState(true);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<TransactionPlan | null>(null);
  const [lastAppliedPreview, setLastAppliedPreview] = useState<ChangePreview[] | null>(null);
  const activeCommandResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (activeCommandResetRef.current) {
        clearTimeout(activeCommandResetRef.current);
        activeCommandResetRef.current = null;
      }
    };
  }, []);

  const engineOptions = useMemo(() => {
    const fromConfig = (config?.engines || []).map((e) => `Engine ${e.engine_id}`);
    return fromConfig.length ? fromConfig : ["Engine A", "Engine B", "Engine C"];
  }, [config]);

  const groupOptions = useMemo(() => {
    const maxGroup = config
      ? Math.max(
          20,
          ...config.engines.flatMap((e) => e.groups.map((g) => g.group_number)),
        )
      : 20;
    return Array.from({ length: maxGroup }, (_, i) => `Group ${i + 1}`);
  }, [config]);

  const logicOptions = useMemo(() => {
    const base = ["POWER", "REPOWER", "SCALPER", "STOPPER", "STO", "SCA", "RPO"];
    return base.map((id) => ({ id, label: id }));
  }, []);

  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeEngines, setScopeEngines] = useState<string[]>(["Engine A", "Engine B", "Engine C"]);
  const [scopeGroups, setScopeGroups] = useState<string[]>(Array.from({ length: 20 }, (_, i) => `Group ${i + 1}`));
  const [scopeLogics, setScopeLogics] = useState<string[]>(["POWER", "REPOWER", "SCALPER", "STOPPER", "STO", "SCA", "RPO"]);

  useEffect(() => {
    setScopeEngines((prev) => {
      const next = prev.filter((e) => engineOptions.includes(e));
      return next.length ? next : engineOptions;
    });
  }, [engineOptions]);

  useEffect(() => {
    setScopeGroups((prev) => {
      const next = prev.filter((g) => groupOptions.includes(g));
      return next.length ? next : groupOptions;
    });
  }, [groupOptions]);

  useEffect(() => {
    const ids = logicOptions.map((l) => l.id);
    setScopeLogics((prev) => {
      const next = prev.filter((l) => ids.includes(l));
      return next.length ? next : ids;
    });
  }, [logicOptions]);

  const toggleScopeItem = useCallback(
    (kind: "engines" | "groups" | "logics", value: string) => {
      const setter =
        kind === "engines"
          ? setScopeEngines
          : kind === "groups"
            ? setScopeGroups
            : setScopeLogics;

      setter((prev) => {
        const exists = prev.includes(value);
        const next = exists ? prev.filter((v) => v !== value) : [...prev, value];
        return next.length ? next : prev;
      });
    },
    [],
  );

  const selectAllScope = useCallback(
    (kind: "engines" | "groups" | "logics") => {
      if (kind === "engines") setScopeEngines(engineOptions);
      if (kind === "groups") setScopeGroups(groupOptions);
      if (kind === "logics") setScopeLogics(logicOptions.map((l) => l.id));
    },
    [engineOptions, groupOptions, logicOptions],
  );

  const vc = useVersionControl(config || undefined);
  const [vaultOpen, setVaultOpen] = useState(false);
  const { settings } = useSettings();
  const [snapName, setSnapName] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [diffFrom, setDiffFrom] = useState<string>("");
  const [diffTo, setDiffTo] = useState<string>("");
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [vaultFiles, setVaultFiles] = useState<Array<{ name: string; path: string; last_modified: string }>>([]);
  const [tauriAvailable, setTauriAvailable] = useState(false);

  const handleVaultSave = async (data: VaultSaveData) => {
    try {
      if (!config) {
        toast.error("No configuration loaded to save");
        return;
      }
      await invoke("save_to_vault", {
        config,
        name: data.name,
        category: data.category,
      });
      toast.success("Configuration saved to vault");
    } catch (error) {
      console.error("Failed to save to vault:", error);
      toast.error(`Failed to save to vault: ${error}`);
    }
  };

  const handleToolClick = (command: string) => {
    setActiveCommand(command);
    // Reset after a brief delay so it can be triggered again
    if (activeCommandResetRef.current) {
      clearTimeout(activeCommandResetRef.current);
    }
    activeCommandResetRef.current = setTimeout(() => {
      setActiveCommand(null);
      activeCommandResetRef.current = null;
    }, 100);
  };

  const refreshSnapshots = useCallback(() => {
    setSnapshots(vc.getSnapshots());
  }, [vc]);

  useEffect(() => {
    refreshSnapshots();
  }, [refreshSnapshots]);

  useEffect(() => {
    setTauriAvailable(typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__));
  }, []);

  const refreshVaultFiles = useCallback(async () => {
    try {
      if (!tauriAvailable) {
        setVaultFiles([]);
        return;
      }
      const result = await invoke<{ vault_path: string; files: Array<{ name: string; path: string; last_modified: string }> }>("list_vault_files", {
        vault_path_override: settings.vaultPath,
      });
      const sorted = result.files.sort((a, b) => new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime());
      setVaultFiles(sorted.slice(0, 6));
    } catch (error) {
      console.error(error);
    }
  }, [settings.vaultPath, tauriAvailable]);

  useEffect(() => {
    refreshVaultFiles();
  }, [refreshVaultFiles]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<any>;
      const payload = ce?.detail;
      if (!payload) return;
      if (typeof payload === "string") {
        setActiveCommand(payload);
        if (activeCommandResetRef.current) {
          clearTimeout(activeCommandResetRef.current);
        }
        activeCommandResetRef.current = setTimeout(() => {
          setActiveCommand(null);
          activeCommandResetRef.current = null;
        }, 100);
        return;
      }
      if (typeof payload === "object") {
        const { action, engines, groups, logics, fields } = payload as {
          action: string;
          engines?: string[];
          groups?: number[];
          logics?: string[];
          fields?: string[];
        };
        if (action) {
          setActiveCommand(action);
          if (activeCommandResetRef.current) {
            clearTimeout(activeCommandResetRef.current);
          }
          activeCommandResetRef.current = setTimeout(() => {
            setActiveCommand(null);
            activeCommandResetRef.current = null;
          }, 100);
        }
        onNavigate({ engines, groups, logics, fields });
      }
    };
    window.addEventListener("batch-sidebar-command", handler as EventListener);
    return () => window.removeEventListener("batch-sidebar-command", handler as EventListener);
  }, [onNavigate]);

  return (
    <div className="h-[calc(100vh-180px)] flex bg-background/50 rounded-xl border border-border/40 overflow-hidden shadow-sm">
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/30 bg-muted/10 backdrop-blur-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 shadow-[0_0_15px_-3px_rgba(59,130,246,0.15)]">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
                AI Batch Generator
                <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-[9px] font-medium text-primary border border-primary/20">
                  v2.0
                </span>
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <BrainCircuit className="w-3 h-3" />
                Context-aware generation & modification system
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Popover open={scopeOpen} onOpenChange={setScopeOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs text-muted-foreground hover:text-foreground">
                  <Sliders className="w-3.5 h-3.5" />
                  Scope
                  <span className="text-[10px] text-muted-foreground">
                    E{scopeEngines.length} · G{scopeGroups.length} · L{scopeLogics.length}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[340px] p-3 bg-popover/95 backdrop-blur-xl border-white/10">
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Chat Scope (limits what chat can change)
                  </div>

                  <Collapsible defaultOpen>
                    <CollapsibleTrigger className="w-full flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/40">
                      <div className="text-xs font-medium">Engines</div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{scopeEngines.length}/{engineOptions.length}</span>
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-1">
                      <div className="flex items-center justify-between px-2 pb-1">
                        <button className="text-[10px] text-primary" onClick={() => selectAllScope("engines")}>
                          All
                        </button>
                      </div>
                      <div className="space-y-1">
                        {engineOptions.map((e) => {
                          const checked = scopeEngines.includes(e);
                          return (
                            <button
                              key={e}
                              className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40 text-xs"
                              onClick={() => toggleScopeItem("engines", e)}
                            >
                              <div
                                className={cn(
                                  "flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                  checked
                                    ? "bg-primary text-primary-foreground"
                                    : "opacity-50 [&_svg]:invisible",
                                )}
                              >
                                <Check className="h-3 w-3" />
                              </div>
                              {e}
                            </button>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  <Collapsible>
                    <CollapsibleTrigger className="w-full flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/40">
                      <div className="text-xs font-medium">Groups</div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{scopeGroups.length}/{groupOptions.length}</span>
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-1">
                      <div className="flex items-center justify-between px-2 pb-1">
                        <button className="text-[10px] text-primary" onClick={() => selectAllScope("groups")}>
                          All
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {groupOptions.map((g) => {
                          const checked = scopeGroups.includes(g);
                          return (
                            <button
                              key={g}
                              className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/40 text-[11px]"
                              onClick={() => toggleScopeItem("groups", g)}
                            >
                              <div
                                className={cn(
                                  "flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-primary",
                                  checked
                                    ? "bg-primary text-primary-foreground"
                                    : "opacity-50 [&_svg]:invisible",
                                )}
                              >
                                <Check className="h-3 w-3" />
                              </div>
                              {g.replace("Group ", "G")}
                            </button>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  <Collapsible>
                    <CollapsibleTrigger className="w-full flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/40">
                      <div className="text-xs font-medium">Logics</div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{scopeLogics.length}/{logicOptions.length}</span>
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-1">
                      <div className="flex items-center justify-between px-2 pb-1">
                        <button className="text-[10px] text-primary" onClick={() => selectAllScope("logics")}>
                          All
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {logicOptions.map((l) => {
                          const checked = scopeLogics.includes(l.id);
                          return (
                            <button
                              key={l.id}
                              className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/40 text-[11px]"
                              onClick={() => toggleScopeItem("logics", l.id)}
                            >
                              <div
                                className={cn(
                                  "flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-primary",
                                  checked
                                    ? "bg-primary text-primary-foreground"
                                    : "opacity-50 [&_svg]:invisible",
                                )}
                              >
                                <Check className="h-3 w-3" />
                              </div>
                              {l.label}
                            </button>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </PopoverContent>
            </Popover>

            <Button 
              variant="ghost" 
              size="sm" 
              className={cn(
                "h-8 gap-2 text-xs transition-all", 
                showTools ? "bg-primary/10 text-primary hover:bg-primary/20" : "text-muted-foreground"
              )}
              onClick={() => setShowTools(!showTools)}
            >
              <Wand2 className="w-3.5 h-3.5" />
              {showTools ? "Hide Gadgets" : "Show Gadgets"}
            </Button>
          </div>
        </div>

        {/* Chat Interface */}
        <div className="flex-1 overflow-hidden relative bg-background">
          <div className="absolute inset-0">
            <ChatPanel 
              config={config} 
              onConfigChange={onConfigChange} 
              onNavigate={onNavigate}
              externalCommand={activeCommand}
              selectedEngines={scopeEngines}
              selectedGroups={scopeGroups}
              selectedLogics={scopeLogics}
              onPlanSnapshot={({ pendingPlan, lastAppliedPreview }) => {
                setPendingPlan(pendingPlan);
                setLastAppliedPreview(lastAppliedPreview);
              }}
            />
          </div>
        </div>
      </div>

      {/* Tools Sidebar (Gadgets) */}
      {showTools && (
        <div className="w-80 border-l border-border/40 bg-muted/5 flex flex-col overflow-y-auto backdrop-blur-sm">
          <div className="p-4 space-y-6">
            
            {/* Quick Presets */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Zap className="w-3 h-3" /> Quick Actions
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <ToolButton 
                  icon={<RefreshCcw className="w-3.5 h-3.5" />} 
                  label="Reset All" 
                  onClick={() => handleToolClick("reset all groups to default")}
                  variant="outline"
                />
                <ToolButton 
                  icon={<Copy className="w-3.5 h-3.5" />} 
                  label="Clone G1" 
                  onClick={() => handleToolClick("copy settings from group 1 to all groups")}
                  variant="outline"
                />
              </div>
            </div>

            {/* Progression Tools */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" /> Progression
              </h3>
              <div className="space-y-1.5">
                <ToolButton 
                  icon={<span className="text-[10px] font-mono font-bold">Fib</span>} 
                  label="Fibonacci Grid" 
                  onClick={() => handleToolClick("create fibonacci progression for grid from 100 to 2000 for all groups")}
                />
                <ToolButton 
                  icon={<span className="text-[10px] font-mono font-bold">Lin</span>} 
                  label="Linear Lots" 
                  onClick={() => handleToolClick("create linear progression for initial_lot from 0.01 to 0.1 for all groups")}
                />
                <ToolButton 
                  icon={<span className="text-[10px] font-mono font-bold">Exp</span>} 
                  label="Exp Multiplier" 
                  onClick={() => handleToolClick("create exponential progression for multiplier from 1.1 factor 1.1 for all groups")}
                />
              </div>
            </div>

            {/* Bulk Modifiers */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sliders className="w-3 h-3" /> Bulk Adjust
              </h3>
              <div className="space-y-1.5">
                <ToolButton 
                  icon={<Percent className="w-3.5 h-3.5" />} 
                  label="Increase Risk 10%" 
                  onClick={() => handleToolClick("increase initial_lot by 10% for all groups")}
                />
                <ToolButton 
                  icon={<Percent className="w-3.5 h-3.5" />} 
                  label="Decrease Risk 10%" 
                  onClick={() => handleToolClick("decrease initial_lot by 10% for all groups")}
                />
              </div>
            </div>

             {/* Safety & Magic */}
             <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Wand2 className="w-3 h-3" /> Magic Tools
              </h3>
              <div className="space-y-1.5">
                <ToolButton 
                  icon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />} 
                  label="Optimize Grid" 
                  onClick={() => handleToolClick("analyze and optimize grid settings for current volatility")}
                  className="border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                />
                <ToolButton 
                  icon={<ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />} 
                  label="Safety Check" 
                  onClick={() => handleToolClick("check for dangerous settings and fix risks")}
                  className="border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                />
                <ToolButton 
                  icon={<Activity className="w-3.5 h-3.5 text-blue-500" />} 
                  label="Smart Hedge" 
                  onClick={() => handleToolClick("setup hedge mode for high volatility markets")}
                  className="border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                />
              </div>
            </div>

            {/* Plan Preview & Approvals */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Plan Preview</h3>
              <div className="p-3 rounded-md border border-border/40 bg-card/60">
                {lastAppliedPreview && lastAppliedPreview.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-[11px] text-muted-foreground">Last applied preview ({lastAppliedPreview.length})</div>
                    <div className="max-h-40 overflow-y-auto space-y-1.5">
                      {lastAppliedPreview.slice(0, 12).map((c, idx) => (
                        <div key={idx} className="text-[10px] font-mono text-muted-foreground">
                          {c.engine}-{c.logic} G{c.group}: {c.field} {String(c.currentValue)} → {String(c.newValue)}
                        </div>
                      ))}
                      {lastAppliedPreview.length > 12 && (
                        <div className="text-[10px] text-muted-foreground">+{lastAppliedPreview.length - 12} more…</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">No preview available yet</div>
                )}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <ToolButton label="Approve" icon={<span className="text-[10px]">✔</span>} onClick={() => handleToolClick("apply")} />
                  <ToolButton label="Cancel" icon={<span className="text-[10px]">✖</span>} onClick={() => handleToolClick("cancel")} />
                  <ToolButton label="Undo" icon={<span className="text-[10px]">↶</span>} onClick={() => handleToolClick("undo")} />
                  <ToolButton label="Redo" icon={<span className="text-[10px]">↷</span>} onClick={() => handleToolClick("redo")} />
                </div>
              </div>
            </div>

            {/* History */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">History</h3>
              <div className="p-3 rounded-md border border-border/40 bg-card/60">
                <div className="text-[11px] text-muted-foreground mb-2">Recent plans</div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {snapshots.slice(-6).reverse().map(s => (
                    <div key={s.id} className="text-[10px] flex items-center justify-between gap-2">
                      <span className="truncate">{s.metadata.message} ({new Date(s.metadata.timestamp).toLocaleTimeString()})</span>
                      <div className="flex gap-1">
                        <ToolButton label="Restore" icon={<span className="text-[10px]">⟲</span>} onClick={() => vc.restoreFromSnapshot(s.id)} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <ToolButton label="Apply All" icon={<span className="text-[10px]">✔</span>} onClick={() => handleToolClick("apply")} />
                  <ToolButton label="Apply 1-5" icon={<span className="text-[10px]">5</span>} onClick={() => handleToolClick("apply 1-5")} />
                  <ToolButton label="Apply Remaining" icon={<span className="text-[10px]">…</span>} onClick={() => handleToolClick("apply remaining")} />
                </div>
              </div>
            </div>

            {/* Source Control */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Source Control</h3>
              <div className="p-3 rounded-md border border-border/40 bg-card/60 space-y-2">
                <div className="text-[11px] text-muted-foreground">Snapshots: {vc.getSnapshots().length}</div>
                <div className="flex gap-2">
                  <ToolButton label="Create Snapshot" icon={<span className="text-[10px]">⎙</span>} onClick={() => {
                    if (config) {
                      vc.createSnapshot(config, snapName || "Batch snapshot");
                      setSnapName("");
                      refreshSnapshots();
                    }
                  }} />
                  <ToolButton label="Restore Last" icon={<span className="text-[10px]">⟲</span>} onClick={() => {
                    const snaps = vc.getSnapshots();
                    if (snaps.length) {
                      vc.restoreFromSnapshot(snaps[snaps.length - 1].id);
                    }
                  }} />
                  <ToolButton label="Save to Vault" icon={<span className="text-[10px]">🔐</span>} onClick={() => setVaultOpen(true)} />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input value={snapName} onChange={(e) => setSnapName(e.target.value)} placeholder="Snapshot name" className="w-full h-8 px-2 text-[11px] bg-background border border-border/40 rounded" />
                </div>
                <div className="mt-3">
                  <div className="text-[11px] text-muted-foreground mb-2">Compare Snapshots</div>
                  <div className="grid grid-cols-2 gap-2">
                    <select className="h-8 text-[11px] bg-background border border-border/40 rounded" value={diffFrom} onChange={e => setDiffFrom(e.target.value)}>
                      <option value="">From…</option>
                      {snapshots.map(s => (
                        <option key={s.id} value={s.id}>{s.metadata.message}</option>
                      ))}
                    </select>
                    <select className="h-8 text-[11px] bg-background border border-border/40 rounded" value={diffTo} onChange={e => setDiffTo(e.target.value)}>
                      <option value="">To…</option>
                      {snapshots.map(s => (
                        <option key={s.id} value={s.id}>{s.metadata.message}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <ToolButton label="Diff" icon={<span className="text-[10px]">≠</span>} onClick={() => {
                      if (diffFrom && diffTo) {
                        const res = vc.compareSnapshots(diffFrom, diffTo);
                        setDiffResult(res);
                      }
                    }} />
                    <ToolButton label="Refresh" icon={<span className="text-[10px]">↻</span>} onClick={refreshSnapshots} />
                  </div>
                  {diffResult && (
                    <div className="mt-2 p-2 border border-border/40 rounded bg-muted/30">
                      <div className="text-[11px]">Added: {diffResult.added.length} · Modified: {diffResult.modified.length} · Removed: {diffResult.removed.length}</div>
                      <div className="max-h-32 overflow-y-auto mt-1 space-y-1">
                        {diffResult.modified.slice(0, 10).map((c, i) => (
                          <div key={i} className="text-[10px] font-mono text-muted-foreground">
                            {c.engineId}-{c.logicName} G{c.groupId}: {c.field} {String(c.oldValue)} → {String(c.newValue)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Vault Quick Access */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vault</h3>
              <div className="p-3 rounded-md border border-border/40 bg-card/60 space-y-2">
                <div className="text-[11px] text-muted-foreground">Recent files</div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {vaultFiles.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground">No files or Tauri unavailable</div>
                  ) : (
                    vaultFiles.map(f => (
                      <div key={f.path} className="text-[10px] flex items-center justify-between">
                        <span className="truncate">{f.name}</span>
                        <div className="flex gap-1">
                          <ToolButton label="Load" icon={<span className="text-[10px]">⬇</span>} onClick={async () => {
                            try {
                              let loaded: MTConfig;
                              if (f.name.endsWith('.json')) {
                                loaded = await invoke<MTConfig>('import_json_file', { filePath: f.path });
                              } else {
                                loaded = await invoke<MTConfig>('import_set_file', { filePath: f.path });
                              }
                              onConfigChange(loaded);
                              toast.success(`Loaded ${f.name}`);
                            } catch (err) {
                              toast.error(String(err));
                            }
                          }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <ToolButton label="Open Vault" icon={<span className="text-[10px]">📂</span>} onClick={refreshVaultFiles} />
                  <ToolButton label="Save to Vault" icon={<span className="text-[10px]">🔐</span>} onClick={() => setVaultOpen(true)} />
                </div>
              </div>
            </div>

            

          </div>
        </div>
      )}

      {/* Vault Modal */}
      <VaultSaveModal open={vaultOpen} onClose={() => setVaultOpen(false)} onSave={handleVaultSave} defaultName="Batch Snapshot" />
    </div>
  );
}

function ToolButton({ 
  icon, 
  label, 
  onClick, 
  variant = "ghost",
  className
}: { 
  icon: React.ReactNode; 
  label: string; 
  onClick: () => void; 
  variant?: "ghost" | "outline";
  className?: string;
}) {
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={onClick}
      className={cn(
        "w-full justify-start h-8 text-xs font-normal transition-all duration-200",
        variant === "ghost" && "bg-background/50 hover:bg-background border border-transparent hover:border-border/50 hover:shadow-sm",
        className
      )}
    >
      <div className="mr-2 shrink-0 opacity-70">{icon}</div>
      <span className="truncate">{label}</span>
    </Button>
  );
}

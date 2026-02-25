import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { 
  Sparkles, 
  BrainCircuit,
  Sliders,
  Check,
  ChevronDown
} from "lucide-react";
import { ChatPanel } from "@/components/layout/ChatPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MTConfig } from "@/types/mt-config";
import { VaultSaveModal, VaultSaveData } from "@/components/config/VaultSaveModal";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
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
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
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

  const [vaultOpen, setVaultOpen] = useState(false);

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
            />
          </div>
        </div>
      </div>

      {/* Vault Modal */}
      <VaultSaveModal open={vaultOpen} onClose={() => setVaultOpen(false)} onSave={handleVaultSave} defaultName="Batch Snapshot" />
    </div>
  );
}

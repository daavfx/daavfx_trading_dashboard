import { useState } from "react";
import {
  GitBranch,
  Save,
  History,
  RotateCcw,
  Archive,
  Clock,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  FolderOpen,
  Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { MTConfig } from "@/types/mt-config";
import { useVersionControl } from "@/hooks/useVersionControl";

interface QuickActionsPanelProps {
  config?: MTConfig | null;
  onConfigChange?: (config: MTConfig) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onViewModeChange?: (mode: string) => void;
  onOpenVaultSave?: (draft?: { name: string; category: string; tags: string[]; comments: string; saveToVault: boolean; format: "set" | "json" }) => void;
}

export function QuickActionsPanel({
  config,
  onConfigChange,
  isCollapsed = false,
  onToggleCollapse,
  onViewModeChange,
  onOpenVaultSave,
}: QuickActionsPanelProps) {
  const { state, createSnapshot, restoreFromSnapshot } = useVersionControl(config || undefined);
  const snapshots = state.snapshots;
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateSnapshot = async () => {
    if (!config) return;
    setIsCreating(true);
    try {
      await createSnapshot(config, `Snapshot ${new Date().toLocaleString()}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestore = async (snapshotId: string) => {
    const restored = await restoreFromSnapshot(snapshotId);
    if (restored && onConfigChange) {
      onConfigChange(restored);
    }
  };

  if (isCollapsed) {
    return (
      <div className="h-full flex flex-col items-center py-3 gap-2 bg-background/50 border-l border-border/50">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 flex flex-col items-center gap-2 py-2">
          <button
            onClick={handleCreateSnapshot}
            disabled={!config || isCreating}
            className="p-2 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Create Snapshot"
          >
            <Save className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange?.("version-control")}
            className="p-2 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            title="Version Control"
          >
            <GitBranch className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange?.("vault")}
            className="p-2 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            title="Vault"
          >
            <Archive className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background/50 border-l border-border/50">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium">Quick Actions</span>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <GitBranch className="w-3 h-3" />
                <span>Version Control</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewModeChange?.("version-control")}
                className="h-6 px-2 text-[10px]"
              >
                Open
              </Button>
            </div>
            
            <Button
              onClick={handleCreateSnapshot}
              disabled={!config || isCreating}
              className="w-full h-8 text-xs gap-2"
              variant="outline"
            >
              <Save className="w-3.5 h-3.5" />
              {isCreating ? "Saving..." : "Create Snapshot"}
            </Button>

            <div className="space-y-1">
              <div className="text-[10px] text-muted-foreground font-medium">Recent Snapshots</div>
              {snapshots.length === 0 ? (
                <div className="text-[11px] text-muted-foreground/60 px-2 py-1">No snapshots yet</div>
              ) : (
                [...snapshots].slice(-4).reverse().map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleRestore(s.id)}
                    className="w-full flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded hover:bg-muted/30 transition-colors group"
                  >
                    <Clock className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{s.metadata.message}</div>
                      <div className="text-[9px] text-muted-foreground">
                        {new Date(s.metadata.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <Archive className="w-3 h-3" />
                <span>Vault</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewModeChange?.("vault")}
                className="h-6 px-2 text-[10px]"
              >
                Open
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenVaultSave?.()}
                className="h-8 text-[10px] gap-1.5"
              >
                <Save className="w-3 h-3" />
                Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewModeChange?.("vault")}
                className="h-8 text-[10px] gap-1.5"
              >
                <FolderOpen className="w-3 h-3" />
                Load
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              <History className="w-3 h-3" />
              <span>History</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewModeChange?.("undo-redo")}
                className="h-8 text-[10px] gap-1.5"
              >
                <RotateCcw className="w-3 h-3" />
                Undo/Redo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewModeChange?.("analytics")}
                className="h-8 text-[10px] gap-1.5"
              >
                <Layers className="w-3 h-3" />
                Analytics
              </Button>
            </div>
          </div>

          {config && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <Layers className="w-3 h-3" />
                <span>Config Stats</span>
              </div>
              <div className="text-xs space-y-1 px-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Engines:</span>
                  <span>{config.engines?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Groups:</span>
                  <span>{config.engines?.[0]?.groups?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Logics:</span>
                  <span>{config.engines?.[0]?.groups?.[0]?.logics?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Snapshots:</span>
                  <span>{snapshots.length}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

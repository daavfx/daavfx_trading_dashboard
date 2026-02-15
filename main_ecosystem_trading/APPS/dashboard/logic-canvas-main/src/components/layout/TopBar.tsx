
import { Search, Download, Upload, FileDown, Save, Undo, Redo, Settings, HelpCircle, Hash, FolderOpen, GitBranch, BarChart3, Users, RotateCcw, Brain, Tags, MoreHorizontal, Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useMTFileOps } from "@/hooks/useMTFileOps";
import { useNavigate } from "react-router-dom";
import type { MTConfig } from "@/types/mt-config";

export type Platform = "mt4" | "mt5" | "python" | "c" | "cpp" | "rust";

interface TopBarProps {
  onSaveToVault: () => void;
  onOpenVaultManager: () => void;
  onOpenExport?: () => void;
  onOpenSettings: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  lastSavedLabel?: string;
  currentConfig: any;
  magicNumber?: number;
  onMagicNumberChange?: (value: number) => void;
  mode?: 1 | 2;
  onModeChange?: (mode: 1 | 2) => void;
  platform?: Platform;
  onPlatformChange?: (p: Platform) => void;
  onLoadConfig?: (config: MTConfig) => void;
}

 

export function TopBar({
  onSaveToVault,
  onOpenVaultManager,
  onOpenExport,
  onOpenSettings,
  viewMode,
  onViewModeChange,
  lastSavedLabel,
  currentConfig,
  magicNumber,
  onMagicNumberChange,
  mode = 1,
  onModeChange,
  platform,
  onPlatformChange,
  onLoadConfig,
}: TopBarProps) {
  const mtPlatform = platform === "mt5" ? "MT5" : "MT4";
  const { exportSetFile, importSetFile, exportJsonFile, importJsonFile } = useMTFileOps(mtPlatform, currentConfig, onLoadConfig);
  const navigate = useNavigate();

  return (
    <header className="h-14 border-b border-border bg-background-elevated flex items-center justify-between px-4 gap-4">
      {/* Logo */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-primary/15 flex items-center justify-center border border-primary/20">
            <span className="text-primary font-semibold text-sm">D</span>
          </div>
          <div>
            <span className="font-semibold text-sm tracking-tight text-foreground">DAAVFX</span>
            <span className="text-[10px] text-muted-foreground ml-2">Config Studio</span>
          </div>
        </div>

        

        

        {/* Tools Dropdown - Consolidated extra features */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium text-orange-500 hover:text-orange-600 hover:bg-orange-500/10 border border-orange-500/20 rounded-md gap-1.5 transition-all">
              <Sparkles className="w-3.5 h-3.5" />
              Tools
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52 bg-background-elevated border-border/60 shadow-lg">
            <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50 mb-1">
              Advanced Features
            </div>
            <DropdownMenuItem className="text-xs flex items-center gap-2.5 py-2 px-2 rounded-md hover:bg-muted/50" onClick={() => onViewModeChange("version-control")}>
              <div className="w-6 h-6 rounded-md bg-purple-500/15 flex items-center justify-center border border-purple-500/20">
                <GitBranch className="w-3.5 h-3.5 text-purple-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Version Control</span>
                <span className="text-[9px] text-muted-foreground">Track changes & history</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs flex items-center gap-2.5 py-2 px-2 rounded-md hover:bg-muted/50" onClick={() => onViewModeChange("analytics")}>
              <div className="w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center border border-blue-500/20">
                <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Analytics</span>
                <span className="text-[9px] text-muted-foreground">Performance insights</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs flex items-center gap-2.5 py-2 px-2 rounded-md hover:bg-muted/50" onClick={() => onViewModeChange("undo-redo")}>
              <div className="w-6 h-6 rounded-md bg-green-500/15 flex items-center justify-center border border-green-500/20">
                <RotateCcw className="w-3.5 h-3.5 text-green-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium">History</span>
                <span className="text-[9px] text-muted-foreground">Undo & redo actions</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs flex items-center gap-2.5 py-2 px-2 rounded-md hover:bg-muted/50" onClick={() => onViewModeChange("grouping")}>
              <div className="w-6 h-6 rounded-md bg-pink-500/15 flex items-center justify-center border border-pink-500/20">
                <Tags className="w-3.5 h-3.5 text-pink-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Parameter Groups</span>
                <span className="text-[9px] text-muted-foreground">Organize & batch edits</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs flex items-center gap-2.5 py-2 px-2 rounded-md hover:bg-muted/50" onClick={() => onViewModeChange("memory")}>
              <div className="w-6 h-6 rounded-md bg-cyan-500/15 flex items-center justify-center border border-cyan-500/20">
                <Brain className="w-3.5 h-3.5 text-cyan-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Memory System</span>
                <span className="text-[9px] text-muted-foreground">AI-powered optimization</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs flex items-center gap-2.5 py-2 px-2 rounded-md hover:bg-muted/50" onClick={() => onViewModeChange("collaboration")}>
              <div className="w-6 h-6 rounded-md bg-orange-500/15 flex items-center justify-center border border-orange-500/20">
                <Users className="w-3.5 h-3.5 text-orange-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Team Collaboration</span>
                <span className="text-[9px] text-muted-foreground">Share & sync configs</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Global Controls: Magic Number & Mode Selector */}
      <div className="flex items-center gap-4">
        {/* Mode Selector */}
        <div className="flex items-center bg-background rounded border border-border/60">
          <button
            onClick={() => onModeChange?.(1)}
            className={cn(
              "px-3 py-1.5 text-[10px] font-medium transition-colors rounded-l",
              mode === 1
                ? "bg-primary/15 text-primary border-r border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            Mode 1
          </button>
          <button
            onClick={() => onModeChange?.(2)}
            className={cn(
              "px-3 py-1.5 text-[10px] font-medium transition-colors rounded-r",
              mode === 2
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            Mode 2
          </button>
        </div>

        {/* Magic Number */}
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border-[0.5px] bg-background/30 border-border/30">
          <div className="flex items-center gap-1.5 text-primary">
            <Hash className="w-3.5 h-3.5" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Magic</span>
          </div>
          <Input
            type="number"
            value={magicNumber ?? ""}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 0;
              onMagicNumberChange?.(val);
            }}
            className="h-7 w-20 text-xs font-mono bg-background border-border/60 focus:border-primary/50"
            placeholder="777"
          />
        </div>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-xs">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search inputs..."
            className="pl-9 h-8 text-sm input-refined"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {lastSavedLabel && (
          <div className="hidden md:flex flex-col items-end mr-3 text-[9px] text-muted-foreground">
            <span>{lastSavedLabel}</span>
          </div>
        )}
        
        {/* Import Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground">
              <FileDown className="w-3.5 h-3.5 mr-1.5" />
              Load
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-xs" onClick={importSetFile}>
              <FolderOpen className="w-3.5 h-3.5 mr-2" />
              Load .set file
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs" onClick={importJsonFile}>
              <FolderOpen className="w-3.5 h-3.5 mr-2" />
              Load .json file
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Export Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-xs font-medium" onClick={onOpenExport}>
              Export Configuration...
            </DropdownMenuItem>
            <div className="h-px bg-border my-1" />
            <DropdownMenuItem className="text-xs" onClick={exportSetFile}>
              Quick Export (.set)
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs" onClick={exportJsonFile}>
              Quick Export (.json)
            </DropdownMenuItem>
            
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-5 bg-border mx-1" />

        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <Undo className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <Redo className="w-3.5 h-3.5" />
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        <Button 
          onClick={onSaveToVault}
          size="sm"
          className="h-8 px-3 text-xs bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25"
        >
          <Save className="w-3.5 h-3.5 mr-1.5" />
          Save to Vault
        </Button>

        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onOpenSettings}
          className="h-8 w-8 text-muted-foreground hover:text-foreground ml-1"
        >
          <Settings className="w-4 h-4" />
        </Button>

        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate("/help")}
          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="w-3.5 h-3.5 mr-1" />
          Help
        </Button>
      </div>
    </header>
  );
}

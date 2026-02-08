
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
import { MemoryWidget } from "@/components/debug/MemoryWidget";

export type Platform = "mt4" | "mt5" | "python" | "c" | "cpp" | "rust";

interface TopBarProps {
  onSaveToVault: () => void;
  onOpenVaultManager: () => void;
  onOpenExport?: () => void;
  platform: Platform;
  onPlatformChange: (platform: Platform) => void;
  onOpenSettings: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  lastSavedLabel?: string;
  currentConfig: any;
  magicNumber?: number;
  magicNumberBuy?: number;
  magicNumberSell?: number;
  onMagicNumberChange?: (value: number) => void;
  onMagicNumberBuyChange?: (value: number) => void;
  onMagicNumberSellChange?: (value: number) => void;
  allowBuy?: boolean;
  onAllowBuyChange?: (value: boolean) => void;
  allowSell?: boolean;
  onAllowSellChange?: (value: boolean) => void;
}

const platforms: { id: Platform; label: string }[] = [
  { id: "mt4", label: "MT4" },
  { id: "mt5", label: "MT5" },
  { id: "python", label: "PY" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "rust", label: "RS" },
];

const platformColors: Record<Platform, { active: string; inactive: string }> = {
  mt4: { active: "bg-platform-mt4 text-background", inactive: "text-platform-mt4" },
  mt5: { active: "bg-platform-mt5 text-background", inactive: "text-platform-mt5" },
  python: { active: "bg-platform-python text-background", inactive: "text-platform-python" },
  c: { active: "bg-platform-c text-background", inactive: "text-platform-c" },
  cpp: { active: "bg-platform-cpp text-background", inactive: "text-platform-cpp" },
  rust: { active: "bg-platform-rust text-background", inactive: "text-platform-rust" },
};

export function TopBar({ 
  onSaveToVault, 
  onOpenVaultManager,
  onOpenExport, 
  platform, 
  onPlatformChange, 
  onOpenSettings, 
  viewMode,
  onViewModeChange,
  lastSavedLabel, 
  currentConfig,
  magicNumber,
  magicNumberBuy,
  magicNumberSell,
  onMagicNumberChange,
  onMagicNumberBuyChange,
  onMagicNumberSellChange,
  allowBuy,
  onAllowBuyChange,
  allowSell,
  onAllowSellChange
}: TopBarProps) {
  // Map UI platform (lowercase) to Hook platform (uppercase)
  const mtPlatform = (platform === "mt5" ? "MT5" : "MT4");
  const { exportSetFile, exportSetFileToMTCommonFiles, importSetFile, importSetFileLocally, exportJsonFile, importJsonFile, generateMassiveSetfile, exportMassiveCompleteSetfile, activeSetStatus } = useMTFileOps(mtPlatform, currentConfig);
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

        {/* Platform Selector */}
        <div className="flex items-center bg-background rounded border border-border/60">
          {platforms.map((p) => (
            <button
              key={p.id}
              onClick={() => onPlatformChange(p.id)}
              className={cn(
                "px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                platform === p.id
                  ? platformColors[p.id].active
                  : cn("text-muted-foreground hover:text-foreground", "hover:bg-muted/50")
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {platform === "mt4" && activeSetStatus && (
          <div
            className={cn(
              "px-2 py-1 rounded text-[10px] font-medium border",
              activeSetStatus.ready
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                : "bg-red-500/10 text-red-600 border-red-500/20"
            )}
            title={`${activeSetStatus.path}\nexists=${activeSetStatus.exists}\nkeys=${activeSetStatus.keys_total}\nstartKeys=${activeSetStatus.keys_start}`}
          >
            {activeSetStatus.ready ? "READY" : "NOT READY"}
          </div>
        )}

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

      {/* Global Controls: Magic Numbers & Buy/Sell */}
      <div className={cn(
        "flex items-center gap-4 px-4 py-1.5 rounded-full border-[0.5px] transition-all duration-300",
        allowBuy && !allowSell ? "border-blue-500/15 bg-blue-500/[0.01] shadow-[0_0_10px_-4px_rgba(59,130,246,0.1)]" : 
        !allowBuy && allowSell ? "border-red-500/15 bg-red-500/[0.01] shadow-[0_0_10px_-4px_rgba(239,68,68,0.1)]" : 
        "bg-background/30 border-border/30"
      )}>
        {/* Magic Number - Buy */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-blue-500">
            <Hash className="w-3.5 h-3.5" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Buy</span>
          </div>
          <Input
            type="number"
            value={magicNumberBuy ?? magicNumber ?? ""}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 0;
              onMagicNumberBuyChange?.(val);
              onMagicNumberChange?.(val); // Update base too
            }}
            className="h-7 w-16 text-xs font-mono bg-background border-border/60 focus:border-blue-500/50"
            placeholder="777"
          />
        </div>

        <div className="h-4 w-px bg-border/60" />

        {/* Magic Number - Sell */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-red-500">
            <Hash className="w-3.5 h-3.5" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Sell</span>
          </div>
          <Input
            type="number"
            value={magicNumberSell ?? ""}
            onChange={(e) => onMagicNumberSellChange?.(parseInt(e.target.value) || 0)}
            className="h-7 w-16 text-xs font-mono bg-background border-border/60 focus:border-red-500/50"
            placeholder="8988"
          />
        </div>

        <div className="h-4 w-px bg-border/60" />

        {/* Buy Switch */}
        <div className="flex items-center gap-2">
          <Switch 
            checked={!!allowBuy} 
            onCheckedChange={onAllowBuyChange}
            className={cn(
              "data-[state=checked]:bg-blue-600",
              "h-4 w-8"
            )}
          />
          <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Buy</Label>
        </div>

        {/* Sell Switch */}
        <div className="flex items-center gap-2">
          <Switch 
            checked={!!allowSell} 
            onCheckedChange={onAllowSellChange}
            className={cn(
              "data-[state=checked]:bg-red-600",
              "h-4 w-8"
            )}
          />
          <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sell</Label>
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
              Load .set file (sync to MT)
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs" onClick={() => importSetFileLocally()}>
              <FolderOpen className="w-3.5 h-3.5 mr-2" />
              Load .set file (local only)
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs font-bold text-green-600" onClick={generateMassiveSetfile}>
              <Plus className="w-3.5 h-3.5 mr-2" />
              Generate MASSIVE Setfile (15×3×7)
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
            <DropdownMenuItem className="text-xs" onClick={exportSetFileToMTCommonFiles}>
              Sync ACTIVE.set to MT Common
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs" onClick={exportJsonFile}>
              Quick Export (.json)
            </DropdownMenuItem>
            <div className="h-px bg-border my-1" />
            <DropdownMenuItem className="text-xs font-bold text-green-600 bg-green-500/10" onClick={exportMassiveCompleteSetfile}>
              <Plus className="w-3.5 h-3.5 mr-2" />
              Export MASSIVE Complete (55,500+ inputs)
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

        {/* Memory Monitor - For debugging memory leaks */}
        <MemoryWidget />
        
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

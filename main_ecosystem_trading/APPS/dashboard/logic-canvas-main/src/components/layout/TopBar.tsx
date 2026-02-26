
import { Search, Download, Upload, FileDown, Save, Undo, Redo, Settings, HelpCircle, Hash, FolderOpen, GitBranch, BarChart3, Users, RotateCcw, Brain, Tags, MoreHorizontal, Sparkles, Plus, X, Settings2, Layers, Box, Circle, Filter, Star } from "lucide-react";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useMTFileOps } from "@/hooks/useMTFileOps";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { searchInputs, type SearchableItem } from "@/utils/input-search";
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
  platform?: Platform;
  onPlatformChange?: (p: Platform) => void;
  onLoadConfig?: (config: MTConfig) => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onSearchSelect?: (item: SearchableItem) => void;
  favoritesOnly?: boolean;
  onFavoritesOnlyChange?: (value: boolean) => void;
  favoriteFields?: string[];
  onToggleFavorite?: (fieldId: string) => void;
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
  platform,
  onPlatformChange,
  onLoadConfig,
  searchQuery = "",
  onSearchQueryChange,
  onSearchSelect,
  favoritesOnly = false,
  onFavoritesOnlyChange,
  favoriteFields = [],
  onToggleFavorite,
}: TopBarProps) {
  const mtPlatform = platform === "mt5" ? "MT5" : "MT4";
  const { exportSetFile, importSetFile, exportJsonFile, importJsonFile } = useMTFileOps(mtPlatform, currentConfig, onLoadConfig);
  const navigate = useNavigate();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchableItem[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape" && searchQuery) {
        handleSearchClear();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const results = searchInputs(searchQuery);
      setSearchResults(results);
      setSearchOpen(results.length > 0);
    } else {
      setSearchResults([]);
      setSearchOpen(false);
    }
  }, [searchQuery]);

  const handleSearchSelect = (item: SearchableItem) => {
    onSearchQueryChange?.(item.id);
    onSearchSelect?.(item);
    setSearchOpen(false);
  };

  const handleSearchClear = () => {
    onSearchQueryChange?.("");
    setSearchResults([]);
    setSearchOpen(false);
    searchInputRef.current?.focus();
  };

  const getTypeIcon = (type: SearchableItem["type"]) => {
    switch (type) {
      case "field": return <Settings2 className="w-3.5 h-3.5 text-blue-400" />;
      case "logic": return <BarChart3 className="w-3.5 h-3.5 text-green-400" />;
      case "category": return <Layers className="w-3.5 h-3.5 text-purple-400" />;
      case "engine": return <Box className="w-3.5 h-3.5 text-orange-400" />;
      case "group": return <Circle className="w-3.5 h-3.5 text-cyan-400" />;
      default: return <Filter className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

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

      {/* Global Controls: Magic Number */}
      <div className="flex items-center gap-4">
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
      <div className="flex-1 max-w-xs relative">
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              placeholder="Search inputs..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange?.(e.target.value)}
              onFocus={() => {
                if (searchQuery.trim() && searchResults.length > 0) {
                  setSearchOpen(true);
                }
              }}
              className="pl-9 pr-8 h-8 text-sm input-refined"
            />
            {searchQuery && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSearchClear();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          
          {/* Favorites Toggle */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={favoritesOnly ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 px-2.5 shrink-0 transition-colors",
                  favoritesOnly 
                    ? "bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30 border border-yellow-500/30" 
                    : "text-muted-foreground hover:text-foreground"
                )}
                title={favoritesOnly ? "Show all inputs" : "Show favorites only"}
              >
                <Star className={cn("w-3.5 h-3.5", favoritesOnly && "fill-yellow-500 text-yellow-500")} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="favorites-only"
                    checked={favoritesOnly}
                    onCheckedChange={(checked) => onFavoritesOnlyChange?.(checked === true)}
                  />
                  <label 
                    htmlFor="favorites-only" 
                    className="text-xs font-medium cursor-pointer"
                  >
                    Show favorites only
                  </label>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {favoriteFields.length} favorite{favoriteFields.length !== 1 ? 's' : ''} saved
                </div>
                {favoriteFields.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {favoriteFields.slice(0, 5).map(fieldId => (
                      <button
                        key={fieldId}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onSearchQueryChange?.(fieldId);
                          setSearchOpen(true);
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 transition-colors"
                      >
                        {fieldId}
                      </button>
                    ))}
                    {favoriteFields.length > 5 && (
                      <span className="text-[10px] text-muted-foreground self-center">
                        +{favoriteFields.length - 5} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        
        {searchOpen && searchResults.length > 0 && (
          <div 
            className="absolute top-full left-0 right-0 mt-1 z-50 bg-background-elevated border border-border/60 rounded-md shadow-lg overflow-hidden"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="max-h-64 overflow-y-auto p-1">
              {searchResults.slice(0, 12).map((item, idx) => (
                <button
                  key={`${item.type}-${item.id}-${idx}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSearchSelect(item);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 cursor-pointer rounded hover:bg-muted/50 transition-colors text-left"
                >
                  {getTypeIcon(item.type)}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{item.label}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <span className="uppercase tracking-wide">{item.type}</span>
                      {item.category && (
                        <>
                          <span>·</span>
                          <span>{item.category}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {item.type === "field" && (
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleFavorite?.(item.id);
                      }}
                      className="p-1 hover:bg-muted rounded transition-colors"
                    >
                      <Star 
                        className={cn(
                          "w-3.5 h-3.5",
                          favoriteFields.includes(item.id)
                            ? "fill-yellow-500 text-yellow-500"
                            : "text-muted-foreground hover:text-yellow-500"
                        )} 
                      />
                    </button>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
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

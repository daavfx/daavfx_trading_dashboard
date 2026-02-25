import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ChevronRight,
  ChevronDown,
  Layers,
  FolderOpen,
  Zap,
  Grid3X3,
  Check,
  AlertCircle,
  Settings2,
  TableProperties,
  X,
  Sparkles,
  MoreHorizontal,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Hash,
  Target,
  CheckCheck,
  XOctagon
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { generalCategoriesList } from "@/components/config/GeneralCategories";
import { useVersionControl } from "@/hooks/useVersionControl";
import type { MTConfig } from "@/types/mt-config";
import type { Platform } from "@/components/layout/TopBar";
import type { TransactionPlan, ChangePreview } from "@/lib/chat/types";

const engines = ["Engine A", "Engine B", "Engine C"] as const;
const groups = Array.from({ length: 20 }, (_, i) => `Group ${i + 1}`);
const logics = ["POWER", "REPOWER", "SCALPER", "STOPPER", "STO", "SCA", "RPO"] as const;

export type ViewMode = "logics" | "general" | "batch" | "vault" | "version-control" | "analytics" | "undo-redo" | "memory" | "grouping" | "collaboration" | "save_config";

interface SidebarProps {
  selectedEngines: string[];
  selectedGroups: string[];
  selectedLogics: string[];
  onSelectionChange: (type: "engines" | "groups" | "logics", items: string[]) => void;
  config?: MTConfig | null;
  onConfigChange?: (config: MTConfig) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectedGeneralCategory?: string;
  onSelectGeneralCategory?: (category: string) => void;
  platform?: Platform;
  // Change review props for batch mode
  pendingPlan?: TransactionPlan | null;
  onConfirmPlan?: () => void;
  onCancelPlan?: () => void;
}

const sidebarBorderClass = "border-l-platform-mt4/50";

const logicColors: Record<string, string> = {
  POWER: "bg-[hsl(43_80%_50%)]",
  REPOWER: "bg-[hsl(210_60%_52%)]",
  SCALPER: "bg-[hsl(152_55%_48%)]",
  STOPPER: "bg-[hsl(0_55%_52%)]",
  STO: "bg-[hsl(38_70%_52%)]",
  SCA: "bg-[hsl(270_50%_58%)]",
  RPO: "bg-[hsl(175_55%_48%)]",
};

export function Sidebar({
  selectedEngines,
  selectedGroups,
  selectedLogics,
  onSelectionChange,
  config,
  onConfigChange,
  viewMode,
  onViewModeChange,
  selectedGeneralCategory,
  onSelectGeneralCategory,
  platform,
  pendingPlan,
  onConfirmPlan,
  onCancelPlan,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const sidebarRef = useRef<HTMLElement>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    if (!sidebarRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompact(entry.contentRect.width < 160);
      }
    });

    observer.observe(sidebarRef.current);
    return () => observer.disconnect();
  }, []);

  const [expandedSections, setExpandedSections] = useState({
    engines: true,
    groups: true,
    logics: true,
    vault: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const collapseAll = () => {
    setExpandedSections({ engines: false, groups: false, logics: false, vault: false });
  };

  const expandAll = () => {
    setExpandedSections({ engines: true, groups: true, logics: true, vault: true });
  };

  const { state, createSnapshot, restoreFromSnapshot, getSnapshots } = useVersionControl(config || undefined);
  const snapshots = state.snapshots;

  // Group 1 unique selection logic
  const hasGroup1Selected = selectedGroups.includes("Group 1");
  const hasOtherGroupsSelected = selectedGroups.some((g) => g !== "Group 1");

  const toggleItem = (type: "engines" | "groups" | "logics", item: string) => {
    if (type === "groups") {
      const isGroup1 = item === "Group 1";
      const current = selectedGroups;

      if (isGroup1) {
        if (current.includes("Group 1")) {
          onSelectionChange("groups", []);
        } else {
          onSelectionChange("groups", ["Group 1"]);
        }
      } else {
        const withoutGroup1 = current.filter((g) => g !== "Group 1");
        const updated = withoutGroup1.includes(item)
          ? withoutGroup1.filter((g) => g !== item)
          : [...withoutGroup1, item];
        onSelectionChange("groups", updated);
      }
      return;
    }

    const current = type === "engines" ? selectedEngines : selectedLogics;
    const updated = current.includes(item)
      ? current.filter((i) => i !== item)
      : [...current, item];
    onSelectionChange(type, updated);
  };

  const selectAll = (type: "engines" | "groups" | "logics") => {
    if (type === "groups") {
      onSelectionChange("groups", groups.filter((g) => g !== "Group 1"));
      return;
    }
    const items = type === "engines" ? [...engines] : [...logics];
    onSelectionChange(type, items);
  };

  // Filter items based on search
  const filteredEngines = useMemo(() => {
    if (!searchQuery) return [...engines];
    return engines.filter((e) => e.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;
    return groups.filter((g) => g.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery]);

  const filteredLogics = useMemo(() => {
    if (!searchQuery) return [...logics];
    return logics.filter((l) => l.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery]);

  const hasSearchResults = filteredEngines.length > 0 || filteredGroups.length > 0 || filteredLogics.length > 0;

  return (
    <aside ref={sidebarRef} className={cn(
      "h-full border-r border-border bg-sidebar flex flex-col border-l-2 transition-all duration-200",
      sidebarBorderClass
    )}>
      {/* View Mode Toggle */}
      <div className={cn("p-3 border-b border-border", isCompact && "p-2")}>
        <div className={cn("grid grid-cols-5 gap-1 rounded-lg bg-muted/40 p-1", isCompact && "grid-cols-5")}>
          <button
            onClick={() => onViewModeChange("logics")}
            title="Logics"
            className={cn(
              "min-w-0 w-full flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-md transition-all",
              viewMode === "logics"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap className="w-4 h-4" />
            {!isCompact && <span className="w-full truncate text-[9px] font-medium leading-none text-center">Logics</span>}
          </button>
          <button
            onClick={() => onViewModeChange("general")}
            title="General"
            className={cn(
              "min-w-0 w-full flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-md transition-all",
              viewMode === "general"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Settings2 className="w-4 h-4" />
            {!isCompact && <span className="w-full truncate text-[9px] font-medium leading-none text-center">General</span>}
          </button>
          <button
            onClick={() => onViewModeChange("batch")}
            title="Chat"
            className={cn(
              "min-w-0 w-full flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-md transition-all",
              viewMode === "batch"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <TableProperties className="w-4 h-4" />
            {!isCompact && <span className="w-full truncate text-[9px] font-medium leading-none text-center">Chat</span>}
          </button>
          <button
            onClick={() => onViewModeChange("vault")}
            title="Vault"
            className={cn(
              "min-w-0 w-full flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-md transition-all",
              viewMode === "vault"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Layers className="w-4 h-4" />
            {!isCompact && <span className="w-full truncate text-[9px] font-medium leading-none text-center">Vault</span>}
          </button>
        </div>
      </div>

      {/* Search */}
      {!isCompact && (
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="pl-9 pr-8 h-9 text-xs input-refined"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="mt-2 text-[10px] text-muted-foreground">
            {hasSearchResults ? (
              <span>{filteredEngines.length + filteredGroups.length + filteredLogics.length} results</span>
            ) : (
              <span className="text-destructive">No results found</span>
            )}
          </div>
        )}
      </div>
      )}

      {/* Collapse/Expand All */}
      {!isCompact && (
      <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Navigation</span>
        <div className="flex gap-1">
          <button
            onClick={expandAll}
            className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/40 transition-colors"
          >
            Expand
          </button>
          <button
            onClick={collapseAll}
            className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/40 transition-colors"
          >
            Collapse
          </button>
        </div>
      </div>
      )}

      <ScrollArea className="flex-1">
        <div className={cn("p-3 space-y-1", isCompact && "p-2")}>
          {viewMode === "general" ? (
            <div className="space-y-1">
              {generalCategoriesList.map((category) => (
                <CategoryItem
                  key={category.id}
                  label={category.label}
                  icon={<category.icon className="w-4 h-4" />}
                  selected={selectedGeneralCategory === category.id}
                  onSelect={() => onSelectGeneralCategory?.(category.id)}
                  color={category.color}
                  compact={isCompact}
                />
              ))}
            </div>
          ) : viewMode === "batch" ? (
            <>
              {/* Change Review UI - Show when there's a pending plan */}
              {pendingPlan ? (
                <VisualChangeReviewInline
                  plan={pendingPlan}
                  onConfirm={onConfirmPlan}
                  onCancel={onCancelPlan}
                />
              ) : (
                <>
                  {/* Fallback when no pending plan */}
                  <Section
                    title="Batch Workspace"
                    icon={<TableProperties className="w-3.5 h-3.5" />}
                    expanded={true}
                    onToggle={() => {}}
                    compact={isCompact}
                  >
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        onClick={() => onViewModeChange("version-control")}
                        className="text-xs px-2 py-1 rounded-md border border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        Version Control
                      </button>
                      <button
                        onClick={() => onViewModeChange("vault")}
                        className="text-xs px-2 py-1 rounded-md border border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        Vault
                      </button>
                    </div>
                  </Section>

                  <Section
                    title="Recent Snapshots"
                    icon={<Sparkles className="w-3.5 h-3.5" />}
                    expanded={true}
                    onToggle={() => {}}
                    compact={isCompact}
                  >
                    <div className="space-y-0.5">
                      {snapshots.length === 0 ? (
                        <div className="text-[11px] text-muted-foreground px-2 py-1">No snapshots yet</div>
                      ) : (
                        [...snapshots].slice(-6).reverse().map((s) => (
                          <button
                            key={s.id}
                            onClick={() => onViewModeChange("version-control")}
                            className="w-full text-left text-xs px-2 py-1 rounded-md hover:bg-muted/30 transition-colors"
                            title={new Date(s.metadata.timestamp).toLocaleString()}
                          >
                            {s.metadata.message || "Snapshot"}
                          </button>
                        ))
                      )}
                    </div>
                  </Section>

                  <Section
                    title="Source Control"
                    icon={<Sparkles className="w-3.5 h-3.5" />}
                    expanded={true}
                    onToggle={() => {}}
                    compact={isCompact}
                  >
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (!config) return;
                          await createSnapshot(config, "Batch snapshot");
                        }}
                        className="text-xs px-2 py-1 rounded-md border border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        Create Snapshot
                      </button>
                      <button
                        onClick={async () => {
                          const snaps = getSnapshots();
                          if (snaps.length) {
                            const lastId = snaps[snaps.length - 1].id;
                            const ok = await restoreFromSnapshot(lastId);
                            if (ok) {
                              const last = getSnapshots().find(s => s.id === lastId);
                              if (last) onConfigChange?.(last.config);
                            }
                          }
                        }}
                        className="text-xs px-2 py-1 rounded-md border border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        Restore Last
                      </button>
                    </div>
                  </Section>
                </>
              )}
            </>
          ) : (
            <>
              <Section
                title="Engines"
                icon={<Grid3X3 className="w-3.5 h-3.5" />}
                expanded={expandedSections.engines}
                onToggle={() => toggleSection("engines")}
                onSelectAll={() => selectAll("engines")}
                count={`${selectedEngines.length}/${engines.length}`}
                compact={isCompact}
              >
                {filteredEngines.map((engine) => (
                  <TreeItem
                    key={engine}
                    label={engine}
                    selected={selectedEngines.includes(engine)}
                    onToggle={() => toggleItem("engines", engine)}
                    highlight={searchQuery}
                    compact={isCompact}
                  />
                ))}
              </Section>

              <Section
                title="Groups"
                icon={<FolderOpen className="w-3.5 h-3.5" />}
                expanded={expandedSections.groups}
                onToggle={() => toggleSection("groups")}
                onSelectAll={() => selectAll("groups")}
                count={`${selectedGroups.length}/${groups.length}`}
                warning={hasGroup1Selected && hasOtherGroupsSelected ? "Invalid selection" : undefined}
                compact={isCompact}
              >
                <div className={cn("max-h-56 overflow-y-auto space-y-0.5", isCompact && "overflow-visible max-h-none")}>
                  {/* Group 1 - Special */}
                  {filteredGroups.includes("Group 1") && (
                    <TreeItem
                      label="Group 1"
                      selected={selectedGroups.includes("Group 1")}
                      onToggle={() => toggleItem("groups", "Group 1")}
                      badge="main"
                      disabled={hasOtherGroupsSelected}
                      highlight={searchQuery}
                      badgeColor="bg-primary/20 text-primary"
                      compact={isCompact}
                    />
                  )}

                  {/* Separator */}
                  {filteredGroups.includes("Group 1") && filteredGroups.length > 1 && !isCompact && (
                    <div className="flex items-center gap-2 py-2 px-2">
                      <div className="flex-1 h-px bg-border/50" />
                      <span className="text-[9px] text-muted-foreground/60 font-medium">GROUPS 2-20</span>
                      <div className="flex-1 h-px bg-border/50" />
                    </div>
                  )}

                  {/* Groups 2-20 */}
                  {filteredGroups.filter(g => g !== "Group 1").map((group) => (
                    <TreeItem
                      key={group}
                      label={group}
                      selected={selectedGroups.includes(group)}
                      onToggle={() => toggleItem("groups", group)}
                      disabled={hasGroup1Selected}
                      highlight={searchQuery}
                      compact={isCompact}
                    />
                  ))}
                </div>
              </Section>

              {viewMode === "logics" && (
                <Section
                  title="Logics"
                  icon={<Zap className="w-3.5 h-3.5" />}
                  expanded={expandedSections.logics}
                  onToggle={() => toggleSection("logics")}
                  onSelectAll={() => selectAll("logics")}
                  count={`${selectedLogics.length}/${logics.length}`}
                  compact={isCompact}
                >
                  {filteredLogics.map((logic) => (
                    <TreeItem
                      key={logic}
                      label={logic}
                      selected={selectedLogics.includes(logic)}
                      onToggle={() => toggleItem("logics", logic)}
                      mono
                      highlight={searchQuery}
                      indicator={logicColors[logic]}
                      badge={logic === "POWER" ? "main" : undefined}
                      badgeColor={logic === "POWER" ? "bg-primary/20 text-primary" : undefined}
                      compact={isCompact}
                    />
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      </ScrollArea>


      {/* Selection Summary */}
      {(selectedEngines.length > 1 || selectedGroups.length > 1 || selectedLogics.length > 1) && (
        <div className="p-3 border-t border-border bg-muted/20">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3 h-3 text-primary" />
            <span className="text-[10px] text-foreground font-medium">Multi-Edit Mode</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedEngines.length > 1 && (
              <span className="px-2 py-1 rounded-md bg-accent/15 text-accent text-[10px] font-medium">
                {selectedEngines.length} engines
              </span>
            )}
            {selectedGroups.length > 1 && (
              <span className="px-2 py-1 rounded-md bg-success/15 text-success text-[10px] font-medium">
                {selectedGroups.length} groups
              </span>
            )}
            {selectedLogics.length > 1 && (
              <span className="px-2 py-1 rounded-md bg-primary/15 text-primary text-[10px] font-medium">
                {selectedLogics.length} logics
              </span>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  onSelectAll?: () => void;
  count?: string;
  muted?: boolean;
  warning?: string;
  children: React.ReactNode;
  compact?: boolean;
}

function Section({ title, icon, expanded, onToggle, onSelectAll, count, muted, warning, children, compact }: SectionProps) {
  if (compact) {
    return (
      <div className="rounded-lg overflow-hidden space-y-1">
        <div
          onClick={onToggle}
          className={cn(
            "w-full flex items-center justify-center py-2 transition-colors rounded-lg cursor-pointer",
            expanded ? "bg-muted/40" : "hover:bg-muted/30",
            muted && "text-muted-foreground"
          )}
          title={title}
        >
          <span className="text-muted-foreground">{icon}</span>
        </div>
        {expanded && (
           <div className="py-1 flex flex-col items-center gap-1">{children}</div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden">
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium transition-colors rounded-lg cursor-pointer select-none",
          expanded ? "bg-muted/40" : "hover:bg-muted/30",
          muted && "text-muted-foreground"
        )}
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <span className="text-muted-foreground">{icon}</span>
        <span>{title}</span>
        {warning && <AlertCircle className="w-3 h-3 text-warning ml-1" />}
        {count && <span className="ml-auto text-[10px] text-muted-foreground font-mono">{count}</span>}
        {onSelectAll && (
          <button
            onClick={(e) => { e.stopPropagation(); onSelectAll(); }}
            className="text-[10px] text-muted-foreground hover:text-primary ml-1 px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors"
          >
            all
          </button>
        )}
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-3 py-1.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface TreeItemProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  mono?: boolean;
  badge?: string;
  badgeColor?: string;
  disabled?: boolean;
  highlight?: string;
  indicator?: string;
  compact?: boolean;
}

function TreeItem({ label, selected, onToggle, mono, badge, badgeColor, disabled, highlight, indicator, compact }: TreeItemProps) {
  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <span key={i} className="search-match">{part}</span>
        : part
    );
  };

  if (compact) {
    return (
      <button
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        title={label}
        className={cn(
          "w-8 h-8 flex items-center justify-center rounded-md transition-all",
          disabled && "opacity-40 cursor-not-allowed",
          !disabled && selected && "bg-primary/10 text-foreground border border-primary/20",
          !disabled && !selected && "text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-transparent"
        )}
      >
        {selected ? <Check className="w-4 h-4 text-primary" /> : <div className="w-3 h-3 rounded border border-border" />}
      </button>
    );
  }

  return (
    <button
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-2.5 py-2 px-2.5 text-xs rounded-md transition-all",
        disabled && "opacity-40 cursor-not-allowed",
        !disabled && selected && "bg-primary/10 text-foreground border border-primary/20",
        !disabled && !selected && "text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-transparent"
      )}
    >
      {indicator && <div className={cn("w-1 h-4 rounded-full", indicator)} />}
      <div className={cn(
        "w-4 h-4 rounded border flex items-center justify-center transition-all",
        selected ? "bg-primary border-primary" : "border-border hover:border-muted-foreground/50"
      )}>
        {selected && <Check className="w-3 h-3 text-primary-foreground" />}
      </div>
      <span className={cn(mono && "font-mono")}>{highlightText(label, highlight || "")}</span>
      {badge && (
        <span className={cn(
          "ml-auto text-[9px] px-1.5 py-0.5 rounded-md font-medium",
          badgeColor || "bg-muted text-muted-foreground"
        )}>
          {badge}
        </span>
      )}
    </button>
  );
}

interface CategoryItemProps {
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
  color?: string;
  compact?: boolean;
}

function CategoryItem({ label, icon, selected, onSelect, color, compact }: CategoryItemProps) {
  if (compact) {
    return (
      <button
        onClick={onSelect}
        title={label}
        className={cn(
          "w-full flex items-center justify-center py-2 rounded-md transition-all",
          selected
            ? "bg-primary/10 text-foreground border border-primary/20"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-transparent"
        )}
      >
        <div className={cn(selected ? "text-primary" : "text-muted-foreground", color)}>
          {icon}
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 py-2 px-3 text-xs rounded-md transition-all",
        selected
          ? "bg-primary/10 text-foreground border border-primary/20"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-transparent"
      )}
    >
      <div className={cn(selected ? "text-primary" : "text-muted-foreground", color)}>
        {icon}
      </div>
      <span className="font-medium">{label}</span>
      {selected && <ChevronRight className="ml-auto w-3 h-3 text-primary" />}
    </button>
  );
}

// Visual Change Review Inline Component - Advanced UI for reviewing changes
function VisualChangeReviewInline({
  plan,
  onConfirm,
  onCancel
}: {
  plan: TransactionPlan;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  const [approvedIndices, setApprovedIndices] = useState<Set<number>>(() => new Set(plan.preview.map((_, i) => i)));
  const [rejectedIndices, setRejectedIndices] = useState<Set<number>>(new Set());
  const [showRiskDetails, setShowRiskDetails] = useState(false);

  const totalChanges = plan.preview.length;
  const approvedCount = approvedIndices.size;
  const rejectedCount = rejectedIndices.size;
  const pendingCount = totalChanges - approvedCount - rejectedCount;

  const handleApprove = (index: number) => {
    setApprovedIndices(prev => new Set([...prev, index]));
    setRejectedIndices(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const handleReject = (index: number) => {
    setRejectedIndices(prev => new Set([...prev, index]));
    setApprovedIndices(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const handleApproveAll = () => {
    setApprovedIndices(new Set(plan.preview.map((_, i) => i)));
    setRejectedIndices(new Set());
  };

  const handleRejectAll = () => {
    setRejectedIndices(new Set(plan.preview.map((_, i) => i)));
    setApprovedIndices(new Set());
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "critical": return "text-red-500 bg-red-500/10 border-red-500/20";
      case "high": return "text-orange-500 bg-orange-500/10 border-orange-500/20";
      case "medium": return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
      case "low": return "text-green-500 bg-green-500/10 border-green-500/20";
      default: return "text-muted-foreground bg-muted border-border";
    }
  };

  return (
    <div className="space-y-3">
      {/* Header with Stats */}
      <div className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-card/50">
        <div className="flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <div>
            <div className="text-xs font-semibold">Review Changes</div>
            <div className="text-[10px] text-muted-foreground">
              {approvedCount} accepted · {rejectedCount} rejected · {pendingCount} pending
            </div>
          </div>
        </div>
        
        {/* Risk Badge */}
        <button
          onClick={() => setShowRiskDetails(!showRiskDetails)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-medium transition-colors",
            getRiskColor(plan.risk.level)
          )}
        >
          <AlertTriangle className="w-3 h-3" />
          {plan.risk.level.toUpperCase()} RISK
        </button>
      </div>

      {/* Risk Details */}
      <AnimatePresence>
        {showRiskDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className={cn(
              "p-3 rounded-lg border space-y-2",
              getRiskColor(plan.risk.level)
            )}>
              <div className="text-[10px] font-medium">Risk Score: {plan.risk.score}/100</div>
              {plan.risk.reasons.length > 0 && (
                <ul className="text-[10px] space-y-1 list-disc list-inside">
                  {plan.risk.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-[10px] gap-1.5"
          onClick={handleApproveAll}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          Accept All
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-[10px] gap-1.5"
          onClick={handleRejectAll}
        >
          <XOctagon className="w-3.5 h-3.5" />
          Reject All
        </Button>
      </div>

      {/* Change Cards */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        <AnimatePresence mode="popLayout">
          {plan.preview.map((change, index) => (
            <VisualChangeCard
              key={`${change.engine}-${change.group}-${change.field}-${index}`}
              change={change}
              index={index}
              isApproved={approvedIndices.has(index) ? true : rejectedIndices.has(index) ? false : null}
              onApprove={() => handleApprove(index)}
              onReject={() => handleReject(index)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-border/60">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-[10px]"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8 text-[10px] gap-1.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-400 hover:to-emerald-400"
          onClick={onConfirm}
          disabled={approvedCount === 0}
        >
          <Check className="w-3.5 h-3.5" />
          Apply {approvedCount} Changes
        </Button>
      </div>
    </div>
  );
}

// Visual Change Card Component
function VisualChangeCard({
  change,
  index,
  isApproved,
  onApprove,
  onReject
}: {
  change: ChangePreview;
  index: number;
  isApproved: boolean | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  const delta = change.delta || 0;
  const deltaPercent = change.deltaPercent || 0;
  const isIncrease = delta > 0;
  const isDecrease = delta < 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        "relative rounded-lg border p-3 transition-all",
        isApproved === true && "border-green-500/50 bg-green-500/5",
        isApproved === false && "border-red-500/50 bg-red-500/5 opacity-60",
        isApproved === null && "border-border/60 bg-card/40 hover:border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            <Hash className="w-3 h-3" />
            {index + 1}
          </span>
          <div className="flex items-center gap-1.5">
            <Target className="w-3 h-3 text-primary" />
            <span className="text-xs font-medium">{change.logic}</span>
            <span className="text-[10px] text-muted-foreground">G{change.group}</span>
          </div>
        </div>
        
        {/* Status Badge */}
        {isApproved === true && (
          <span className="flex items-center gap-1 text-[10px] text-green-500 font-medium">
            <Check className="w-3 h-3" /> Accepted
          </span>
        )}
        {isApproved === false && (
          <span className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
            <X className="w-3 h-3" /> Rejected
          </span>
        )}
      </div>

      {/* Change Display */}
      <div className="flex items-center gap-3 py-2">
        {/* Old Value */}
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Current</div>
          <div className="text-sm font-mono text-muted-foreground line-through decoration-red-400/50">
            {change.currentValue}
          </div>
        </div>

        {/* Arrow & Delta */}
        <div className="flex flex-col items-center">
          <ArrowRightLeft className="w-4 h-4 text-muted-foreground/50" />
          {(isIncrease || isDecrease) && (
            <div className={cn(
              "flex items-center gap-0.5 text-[9px] font-medium mt-1",
              isIncrease ? "text-green-500" : "text-red-500"
            )}>
              {isIncrease ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(deltaPercent).toFixed(1)}%
            </div>
          )}
        </div>

        {/* New Value */}
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-primary uppercase tracking-wide mb-1">New</div>
          <div className="text-sm font-mono text-foreground">
            {change.newValue}
          </div>
        </div>
      </div>

      {/* Field Label */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-medium bg-muted/30 px-2 py-0.5 rounded">
          {change.field}
        </span>
        
        {/* Action Buttons */}
        {isApproved === null && (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-green-500/10 hover:text-green-500"
              onClick={onApprove}
            >
              <Check className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-red-500/10 hover:text-red-500"
              onClick={onReject}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
        
        {isApproved !== null && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px]"
            onClick={() => isApproved === true ? onReject() : onApprove()}
          >
            {isApproved === true ? "Undo Accept" : "Undo Reject"}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

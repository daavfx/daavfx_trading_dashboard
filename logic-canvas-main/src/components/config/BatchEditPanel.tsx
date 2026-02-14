import { useState } from "react";
import { 
  Layers, 
  X, 
  Search, 
  SlidersHorizontal, 
  ArrowUpDown,
  Tag,
  Filter,
  ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Platform } from "@/components/layout/TopBar";

interface BatchEditPanelProps {
  selectedCount: { engines: number; groups: number; logics: number };
  onClearEngines?: () => void;
  onClearGroups?: () => void;
  onClearLogics?: () => void;
  platform?: Platform;
}

const filterTags = ["trading", "risk", "lot", "trail", "grid", "hedge", "tp", "sl"];
const sortOptions = ["Name", "Type", "Category", "Modified"];

export function BatchEditPanel({ 
  selectedCount, 
  onClearEngines,
  onClearGroups,
  onClearLogics,
  platform,
}: BatchEditPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("Name");
  const [showFilters, setShowFilters] = useState(false);
  
  const total = selectedCount.engines + selectedCount.groups + selectedCount.logics;
  const isMultiEdit = selectedCount.engines > 1 || selectedCount.groups > 1 || selectedCount.logics > 1;
  
  if (!isMultiEdit) return null;

  const toggleFilter = (tag: string) => {
    setActiveFilters((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="card-elevated rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-primary/10">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <div>
            <span className="text-sm font-medium">Batch Edit</span>
            <span className="text-[10px] text-muted-foreground ml-2">
              ({total} selected)
            </span>
          </div>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
            showFilters ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Filter className="w-3 h-3" />
          Filters
          <ChevronDown className={cn("w-3 h-3 transition-transform", showFilters && "rotate-180")} />
        </button>
      </div>

      {/* Selection Pills */}
      <div className="px-4 py-2 border-b border-border/20 flex flex-wrap gap-1.5">
        {selectedCount.engines > 0 && (
          <Pill 
            label={`${selectedCount.engines} Engine${selectedCount.engines > 1 ? "s" : ""}`} 
            color="blue"
            onRemove={onClearEngines}
          />
        )}
        {selectedCount.groups > 0 && (
          <Pill 
            label={`${selectedCount.groups} Group${selectedCount.groups > 1 ? "s" : ""}`} 
            color="emerald"
            onRemove={onClearGroups}
          />
        )}
        {selectedCount.logics > 0 && (
          <Pill 
            label={`${selectedCount.logics} Logic${selectedCount.logics > 1 ? "s" : ""}`} 
            color="purple"
            onRemove={onClearLogics}
          />
        )}
      </div>

      {/* Search & Filters */}
      {showFilters && (
        <div className="px-4 py-3 border-b border-border/20 bg-muted/10 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search parameters, keywords, tags..."
              className="pl-8 h-8 text-xs"
            />
          </div>

          {/* Filter Tags */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Quick Filters
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {filterTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleFilter(tag)}
                  className={cn(
                    "px-2 py-1 rounded text-[10px] transition-colors border",
                    activeFilters.includes(tag)
                      ? "bg-primary/20 text-primary border-primary/40"
                      : "bg-muted/30 text-muted-foreground border-transparent hover:border-border/50"
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Sort */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Sort by
              </span>
            </div>
            <div className="flex gap-1">
              {sortOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => setSortBy(option)}
                  className={cn(
                    "px-2 py-1 rounded text-[10px] transition-colors",
                    sortBy === option
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-4 gap-2">
          <ActionBtn label="Scale" icon={<SlidersHorizontal className="w-3 h-3" />} />
          <ActionBtn label="Copy" />
          <ActionBtn label="Reset" />
          <ActionBtn label="Apply Preset" />
        </div>
      </div>
    </div>
  );
}

function Pill({ label, color, onRemove }: { label: string; color: "blue" | "emerald" | "purple"; onRemove?: () => void }) {
  const colors = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  };

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border",
      colors[color]
    )}>
      {label}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70 transition-opacity">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

function ActionBtn({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <button className="flex items-center justify-center gap-1.5 p-2 rounded text-[10px] bg-background border border-border/40 hover:border-border text-muted-foreground hover:text-foreground transition-colors">
      {icon}
      {label}
    </button>
  );
}

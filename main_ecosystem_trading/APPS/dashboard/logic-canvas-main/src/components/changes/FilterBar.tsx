/**
 * FilterBar Component
 * 
 * Provides filtering and search functionality for change review.
 */

import { useState } from "react";
import {
  Search,
  X,
  Filter,
  ChevronDown,
  AlertTriangle,
  FolderOpen,
  Zap,
  Grid3X3,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { AggregationType } from "@/lib/chat/aggregation";

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  riskFilter: string[];
  onRiskFilterChange: (risks: string[]) => void;
  aggregationType: AggregationType;
  onAggregationTypeChange: (type: AggregationType) => void;
  totalChanges: number;
  filteredCount: number;
  compact?: boolean;
}

const riskLevels = [
  { value: "critical", label: "Critical", color: "text-red-500" },
  { value: "high", label: "High", color: "text-orange-500" },
  { value: "medium", label: "Medium", color: "text-yellow-500" },
  { value: "low", label: "Low", color: "text-green-500" },
];

const aggregationTypes: { value: AggregationType; label: string; icon: React.ReactNode }[] = [
  { value: "group", label: "By Group", icon: <FolderOpen className="w-3.5 h-3.5" /> },
  { value: "logic", label: "By Logic", icon: <Zap className="w-3.5 h-3.5" /> },
  { value: "field", label: "By Field", icon: <Grid3X3 className="w-3.5 h-3.5" /> },
];

export function FilterBar({
  searchQuery,
  onSearchChange,
  riskFilter,
  onRiskFilterChange,
  aggregationType,
  onAggregationTypeChange,
  totalChanges,
  filteredCount,
  compact = false,
}: FilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);

  const handleRiskToggle = (risk: string) => {
    if (riskFilter.includes(risk)) {
      onRiskFilterChange(riskFilter.filter(r => r !== risk));
    } else {
      onRiskFilterChange([...riskFilter, risk]);
    }
  };

  const clearFilters = () => {
    onSearchChange("");
    onRiskFilterChange([]);
  };

  const hasActiveFilters = searchQuery !== "" || riskFilter.length > 0;

  return (
    <div className="space-y-2">
      {/* Search Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search changes..."
            className="pl-9 pr-8 h-9 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 gap-1.5",
                riskFilter.length > 0 && "border-primary/50 bg-primary/5"
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              {!compact && (
                <>
                  Filter
                  {riskFilter.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px]">
                      {riskFilter.length}
                    </span>
                  )}
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs">Risk Level</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {riskLevels.map((risk) => (
              <DropdownMenuCheckboxItem
                key={risk.value}
                checked={riskFilter.includes(risk.value)}
                onCheckedChange={() => handleRiskToggle(risk.value)}
                className="text-xs"
              >
                <span className={cn("flex items-center gap-2", risk.color)}>
                  <AlertTriangle className="w-3 h-3" />
                  {risk.label}
                </span>
              </DropdownMenuCheckboxItem>
            ))}
            {riskFilter.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onRiskFilterChange([])}
                  className="text-xs text-muted-foreground"
                >
                  Clear risk filter
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Aggregation Type & Count Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {aggregationTypes.map((type) => (
            <Button
              key={type.value}
              variant={aggregationType === type.value ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-7 text-[10px] gap-1",
                aggregationType === type.value && "bg-primary/10 text-primary"
              )}
              onClick={() => onAggregationTypeChange(type.value)}
            >
              {type.icon}
              {!compact && type.label}
            </Button>
          ))}
        </div>

        {/* Count */}
        <div className="text-[10px] text-muted-foreground">
          {hasActiveFilters ? (
            <span>
              <span className="text-foreground font-medium">{filteredCount}</span>
              {" "}of {totalChanges} groups
            </span>
          ) : (
            <span>{totalChanges} groups</span>
          )}
        </div>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          {searchQuery && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/40 text-[10px]">
              Search: "{searchQuery}"
              <button
                onClick={() => onSearchChange("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {riskFilter.map((risk) => (
            <span
              key={risk}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-[10px]",
                riskColors[risk] || "bg-muted/40"
              )}
            >
              {risk.charAt(0).toUpperCase() + risk.slice(1)} risk
              <button
                onClick={() => handleRiskToggle(risk)}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            onClick={clearFilters}
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

const riskColors: Record<string, string> = {
  critical: "bg-red-500/10 text-red-500",
  high: "bg-orange-500/10 text-orange-500",
  medium: "bg-yellow-500/10 text-yellow-500",
  low: "bg-green-500/10 text-green-500",
};

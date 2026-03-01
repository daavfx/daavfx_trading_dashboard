import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Info,
  Star,
  ArrowLeftRight,
  Shield,
  Layers,
  Zap,
  Settings2,
  RefreshCw,
  Box,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfigField } from "./ConfigField";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import type { LogicConfig, EngineConfig } from "@/types/mt-config";
import {
  logicInputs,
  ENGINE_LOGICS,
  LOGIC_DISPLAY_NAMES,
} from "@/data/logic-inputs";
import { useSettings } from "@/contexts/SettingsContext";
import LogicConfigPanel from "@/components/LogicConfigPanel";

interface LogicModuleProps {
  name: string;
  engine: string;
  expanded: boolean;
  onToggle: () => void;
  logicConfig?: LogicConfig;
  group?: string;
  groups?: string[];
  engineData?: EngineConfig | null;
  selectedFields?: string[];
  onUpdate?: (
    field: string,
    value: any,
    direction: "buy" | "sell",
    targetLogicId?: string,
  ) => void;
  mode?: 1 | 2;
}

const logicMeta: Record<
  string,
  { color: string; description: string; cssClass: string }
> = {
  // Engine A logics
  POWER: {
    color: "bg-[hsl(43_80%_50%)]",
    description:
      "Main trading logic - core position management and entry signals",
    cssClass: "logic-power",
  },
  REPOWER: {
    color: "bg-[hsl(210_60%_52%)]",
    description: "Grid recovery system with dynamic lot sizing",
    cssClass: "logic-repower",
  },
  SCALPER: {
    color: "bg-[hsl(152_55%_48%)]",
    description: "Fast scalping entries with tight stops",
    cssClass: "logic-scalper",
  },
  STOPPER: {
    color: "bg-[hsl(0_55%_52%)]",
    description: "Risk management and position limiting",
    cssClass: "logic-stopper",
  },
  STO: {
    color: "bg-[hsl(38_70%_52%)]",
    description: "Stochastic oscillator signals",
    cssClass: "logic-sto",
  },
  SCA: {
    color: "bg-[hsl(270_50%_58%)]",
    description: "Scale-in position management",
    cssClass: "logic-sca",
  },
  RPO: {
    color: "bg-[hsl(175_55%_48%)]",
    description: "Recovery position optimization",
    cssClass: "logic-rpo",
  },
  // Engine B logics (same colors, different prefix)
  BPOWER: {
    color: "bg-[hsl(43_80%_50%)]",
    description: "Engine B - Main trading logic",
    cssClass: "logic-power",
  },
  BREPOWER: {
    color: "bg-[hsl(210_60%_52%)]",
    description: "Engine B - Grid recovery",
    cssClass: "logic-repower",
  },
  BSCALPER: {
    color: "bg-[hsl(152_55%_48%)]",
    description: "Engine B - Fast scalping",
    cssClass: "logic-scalper",
  },
  BSTOPPER: {
    color: "bg-[hsl(0_55%_52%)]",
    description: "Engine B - Risk management",
    cssClass: "logic-stopper",
  },
  BSTO: {
    color: "bg-[hsl(38_70%_52%)]",
    description: "Engine B - Stochastic",
    cssClass: "logic-sto",
  },
  BSCA: {
    color: "bg-[hsl(270_50%_58%)]",
    description: "Engine B - Scale-in",
    cssClass: "logic-sca",
  },
  BRPO: {
    color: "bg-[hsl(175_55%_48%)]",
    description: "Engine B - Recovery",
    cssClass: "logic-rpo",
  },
  // Engine C logics
  CPOWER: {
    color: "bg-[hsl(43_80%_50%)]",
    description: "Engine C - Main trading logic",
    cssClass: "logic-power",
  },
  CREPOWER: {
    color: "bg-[hsl(210_60%_52%)]",
    description: "Engine C - Grid recovery",
    cssClass: "logic-repower",
  },
  CSCALPER: {
    color: "bg-[hsl(152_55%_48%)]",
    description: "Engine C - Fast scalping",
    cssClass: "logic-scalper",
  },
  CSTOPPER: {
    color: "bg-[hsl(0_55%_52%)]",
    description: "Engine C - Risk management",
    cssClass: "logic-stopper",
  },
  CSTO: {
    color: "bg-[hsl(38_70%_52%)]",
    description: "Engine C - Stochastic",
    cssClass: "logic-sto",
  },
  CSCA: {
    color: "bg-[hsl(270_50%_58%)]",
    description: "Engine C - Scale-in",
    cssClass: "logic-sca",
  },
  CRPO: {
    color: "bg-[hsl(175_55%_48%)]",
    description: "Engine C - Recovery",
    cssClass: "logic-rpo",
  },
};

// Category display order and icons
const CATEGORY_ORDER = [
  "Mode Selectors",
  "Core",
  "Triggers",
  "Logic",
  "Lots",
  "Grid",
  "Trail",
  "Trail Advanced",
  "Close Partial",
  "Reverse/Hedge",
  "TPSL",
  "Safety",
  "Restart",
];

const categoryStyles: Record<
  string,
  { color: string; bg: string; border: string; icon: any }
> = {
  "Mode Selectors": {
    color: "text-sky-500",
    bg: "bg-sky-500/5",
    border: "border-sky-500/10",
    icon: Settings2,
  },
  Core: {
    color: "text-blue-500",
    bg: "bg-blue-500/5",
    border: "border-blue-500/10",
    icon: Layers,
  },
  Lots: {
    color: "text-blue-400",
    bg: "bg-blue-400/5",
    border: "border-blue-400/10",
    icon: Box,
  },
  Grid: {
    color: "text-indigo-500",
    bg: "bg-indigo-500/5",
    border: "border-indigo-500/10",
    icon: ArrowLeftRight,
  },
  Trail: {
    color: "text-purple-500",
    bg: "bg-purple-500/5",
    border: "border-purple-500/10",
    icon: ChevronRight,
  },
  "Trail Advanced": {
    color: "text-fuchsia-500",
    bg: "bg-fuchsia-500/5",
    border: "border-fuchsia-500/10",
    icon: Settings2,
  },
  Logic: {
    color: "text-emerald-500",
    bg: "bg-emerald-500/5",
    border: "border-emerald-500/10",
    icon: Zap,
  },
  TPSL: {
    color: "text-amber-500",
    bg: "bg-amber-500/5",
    border: "border-amber-500/10",
    icon: Shield,
  },
  "Reverse/Hedge": {
    color: "text-orange-500",
    bg: "bg-orange-500/5",
    border: "border-orange-500/10",
    icon: ArrowLeftRight,
  },
  "Close Partial": {
    color: "text-cyan-500",
    bg: "bg-cyan-500/5",
    border: "border-cyan-500/10",
    icon: RefreshCw,
  },
  Triggers: {
    color: "text-rose-500",
    bg: "bg-rose-500/5",
    border: "border-rose-500/10",
    icon: Shield,
  },
  Safety: {
    color: "text-red-500",
    bg: "bg-red-500/5",
    border: "border-red-500/10",
    icon: Shield,
  },
  Restart: {
    color: "text-slate-500",
    bg: "bg-slate-500/5",
    border: "border-slate-500/10",
    icon: RefreshCw,
  },
};

const normalizeTradingModeValue = (raw: unknown): "Counter Trend" | "Hedge" | "Reverse" => {
  const mode = String(raw ?? "").trim().toLowerCase();
  if (mode === "hedge") return "Hedge";
  if (mode === "reverse") return "Reverse";
  if (
    mode === "counter trend" ||
    mode === "countertrend" ||
    mode === "counter_trend" ||
    mode === "counter-trend" ||
    mode === "trending" ||
    mode === "trend following" ||
    mode === "trend_following" ||
    mode === ""
  ) {
    return "Counter Trend";
  }
  return "Counter Trend";
};

const getCategoryIcon = (category: string) => {
  if (category === "Reverse/Hedge")
    return <ArrowLeftRight className="w-3 h-3" />;
  if (category === "Safety") return <Shield className="w-3 h-3" />;
  return null;
};

export function LogicModule({
  name,
  engine,
  expanded,
  onToggle,
  logicConfig,
  group,
  groups,
  engineData,
  selectedFields = [],
  onUpdate,
  mode = 1,
}: LogicModuleProps) {
  const engineSafe = engine || "";
  const nameSafe = name || "";
  const isEngineAPower =
    engineSafe.includes("Engine A") && nameSafe.toUpperCase() === "POWER";

  const [trailLevelsVisible, setTrailLevelsVisible] = useState(1);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [partialLevelsVisible, setPartialLevelsVisible] = useState(1);
  const { settings } = useSettings() || {};
  const unitSymbol = (settings?.unitSymbol || "").trim().toUpperCase();
  const unitMode =
    settings?.unitModeBySymbol?.[unitSymbol] ||
    settings?.unitModeDefault ||
    "points";

  // Calculate current logic ID for Close Targets
  const engineLetter = engineSafe.includes("Engine B")
    ? "B"
    : engineSafe.includes("Engine C")
      ? "C"
      : "A";

  // Handle Logic Name Mapping (stripping Engine prefix for B/C to match suffix map)
  let baseName = nameSafe;
  if (
    engineLetter !== "A" &&
    nameSafe.startsWith(engineLetter) &&
    nameSafe.length > 1
  ) {
    baseName = nameSafe.substring(1);
  }

  const suffixMap: Record<string, string> = {
    POWER: "Power",
    REPOWER: "Repower",
    SCALPER: "Scalp",
    STOPPER: "Stopper",
    STO: "STO",
    SCA: "SCA",
    RPO: "RPO",
  };
  const logicSuffix = suffixMap[baseName] || baseName || "";
  const currentLogicId = `Logic_${engineLetter}_${logicSuffix}`;

  type SideValues = Record<string, any>;
  const [fieldValuesBySide, setFieldValuesBySide] = useState<{
    buy: SideValues;
    sell: SideValues;
  }>({ buy: {}, sell: {} });
  
  // Active edit direction (single-side editing only)
  const [activeDirection, setActiveDirection] = useState<"buy" | "sell">("buy");
  const fieldValues = fieldValuesBySide[activeDirection] || {};
  // Initialize field values only once using useRef to store initial values
  const initialFieldsRef = useRef<any[]>([]);

const logicConfigKey = logicConfig?.logic_id || 'no-config';
  const initializedRef = useRef<string | null>(null);

  const updateSideValues = (
    side: "buy" | "sell",
    updater: SideValues | ((prev: SideValues) => SideValues),
  ) => {
    setFieldValuesBySide((prev) => {
      const prevSide = prev[side] || {};
      const nextSide =
        typeof updater === "function"
          ? (updater as (prev: SideValues) => SideValues)(prevSide)
          : { ...prevSide, ...updater };
      return { ...prev, [side]: nextSide };
    });
  };

  const updateActiveSideValues = (
    updater: SideValues | ((prev: SideValues) => SideValues),
  ) => {
    updateSideValues(activeDirection, updater);
  };

  const normalizeModeState = (
    source: SideValues,
  ): SideValues => {
    const mode = isEngineAPower
      ? "Counter Trend"
      : normalizeTradingModeValue(source["trading_mode"]);
    const next = { ...source, trading_mode: mode };

    if (mode === "Hedge") {
      next["hedge_enabled"] = "ON";
      next["reverse_enabled"] = "OFF";
      next["hedge_reference"] = next["hedge_reference"] || "Logic_None";
      next["hedge_scale"] = next["hedge_scale"] ?? 50;
      next["reverse_reference"] = "Logic_None";
      next["reverse_scale"] = 100;
      return next;
    }

    if (mode === "Reverse") {
      next["reverse_enabled"] = "ON";
      next["hedge_enabled"] = "OFF";
      next["reverse_reference"] = next["reverse_reference"] || "Logic_None";
      next["reverse_scale"] = next["reverse_scale"] ?? 100;
      next["hedge_reference"] = "Logic_None";
      next["hedge_scale"] = 50;
      return next;
    }

    next["reverse_enabled"] = "OFF";
    next["hedge_enabled"] = "OFF";
    next["reverse_reference"] = "Logic_None";
    next["hedge_reference"] = "Logic_None";
    next["reverse_scale"] = 100;
    next["hedge_scale"] = 50;
    return next;
  };

  const resolveLogicDirection = (logic: any): "buy" | "sell" | null => {
    const dir = String(logic?.direction || "").toUpperCase();
    if (dir === "B" || dir === "BUY") return "buy";
    if (dir === "S" || dir === "SELL") return "sell";

    const logicId = String(logic?.logic_id || "").toUpperCase();
    if (logicId.includes("_B_") || logicId.endsWith("_B")) return "buy";
    if (logicId.includes("_S_") || logicId.endsWith("_S")) return "sell";

    if (logic?.allow_buy === true && logic?.allow_sell !== true) return "buy";
    if (logic?.allow_sell === true && logic?.allow_buy !== true) return "sell";
    return null;
  };

  const findDirectionalLogic = (targetDirection: "buy" | "sell") => {
    const groupNum = group
      ? parseInt(String(group).replace("Group ", ""), 10)
      : groups && groups.length > 0
        ? parseInt(String(groups[0]).replace("Group ", ""), 10)
        : NaN;
    if (!Number.isFinite(groupNum)) return null;

    const groupData = engineData?.groups?.find(
      (g: any) => g.group_number === groupNum,
    );
    if (!groupData?.logics) return null;

    const desiredNames = new Set<string>([
      String(baseName || nameSafe).toUpperCase(),
      String(logicSuffix || "").toUpperCase(),
    ]);
    if (desiredNames.has("SCALPER")) desiredNames.add("SCALP");
    if (desiredNames.has("SCALP")) desiredNames.add("SCALPER");

    const candidatesAll = groupData.logics.filter((l: any) => {
      const candidateName = String(l?.logic_name || "").toUpperCase();
      return desiredNames.has(candidateName);
    });
    const primaryName = String(baseName || nameSafe).toUpperCase();
    const candidatesPrimary = candidatesAll.filter(
      (l: any) => String(l?.logic_name || "").toUpperCase() === primaryName,
    );
    const candidates =
      candidatesPrimary.length > 0 ? candidatesPrimary : candidatesAll;

    return (
      candidates.find((l: any) => resolveLogicDirection(l) === targetDirection) ||
      null
    );
  };

  const getTargetLogicId = (side: "buy" | "sell") => {
    const row = findDirectionalLogic(side);
    const logicId =
      String((row as any)?.logic_id || "") ||
      String((logicConfig as any)?.logic_id || "");
    if (logicId) return logicId;
    return `${engineLetter}_${logicSuffix}_${side}`.toUpperCase();
  };
  
  useEffect(() => {
    // Skip if already initialized with same config (prevents reset on field changes)
    if (
      initializedRef.current === logicConfigKey &&
      (Object.keys(fieldValuesBySide.buy || {}).length > 0 ||
        Object.keys(fieldValuesBySide.sell || {}).length > 0)
    ) {
      return;
    }

    // Re-initialize when logicConfig changes (e.g., when loading a new setfile)
    initializedRef.current = logicConfigKey;

    const isGroup1 =
      group === "Group 1" ||
      (groups && groups.length > 0 && groups.some((g) => g === "Group 1")) ||
      logicConfig?.logic_id?.includes("_G1");
    const config = logicConfig || ({} as Partial<LogicConfig>);
    const logicInputConfig = logicInputs[nameSafe];
    if (!logicInputConfig) return;

    const templateFields = isGroup1
      ? logicInputConfig.group_1
      : logicInputConfig.standard;

    const newInitialFields = templateFields.map((field) => {
      const configKey = field.id as keyof LogicConfig;
      let val = config[configKey];

      if (field.type === "toggle" && typeof val === "boolean")
        val = val ? "ON" : "OFF";
      if (val === undefined) {
        val = field.default;
        if (field.type === "toggle" && typeof val === "boolean")
          val = val ? "ON" : "OFF";
      }

      return { ...field, value: val };
    });

    initialFieldsRef.current = newInitialFields;

    const hasBuyRow = Boolean(findDirectionalLogic("buy"));
    const hasSellRow = Boolean(findDirectionalLogic("sell"));
    const defaultDirection: "buy" | "sell" = hasBuyRow
      ? "buy"
      : hasSellRow
        ? "sell"
        : "buy";
    const buildSideValues = (side: "buy" | "sell") => {
      const directionalRow = findDirectionalLogic(side);
      const sourceLogic = directionalRow || logicConfig || null;
      const values: Record<string, any> = {};

      newInitialFields.forEach((f) => {
        values[f.id] = f.value;
      });

      values["allow_buy"] = side === "buy" ? "ON" : "OFF";
      values["allow_sell"] = side === "sell" ? "ON" : "OFF";

      if (!sourceLogic) return values;

      newInitialFields.forEach((field) => {
        const source = sourceLogic as Record<string, any>;
        let rawValue: any;
        rawValue = source[field.id];
        if (rawValue === undefined) return;
        values[field.id] =
          field.type === "toggle" && typeof rawValue === "boolean"
            ? rawValue
              ? "ON"
              : "OFF"
            : rawValue;
      });

      return values;
    };

    const buyValues = normalizeModeState(buildSideValues("buy"));
    const sellValues = normalizeModeState(buildSideValues("sell"));

    setActiveDirection(defaultDirection);
    setFieldValuesBySide({ buy: buyValues, sell: sellValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicConfig, logicConfigKey, groups, nameSafe]);

  if (!engineSafe || !nameSafe) {
    return null;
  }

  const handleFieldChange = (id: string, value: any) => {
    const updates: Record<string, any> = { [id]: value };

    // Side effects for Trading Mode
    if (id === "trading_mode") {
      const mode = isEngineAPower
        ? "Counter Trend"
        : normalizeTradingModeValue(value);
      updates["trading_mode"] = mode;
      if (mode === "Counter Trend") {
        updates["reverse_enabled"] = "OFF";
        updates["hedge_enabled"] = "OFF";
        updates["reverse_reference"] = "Logic_None";
        updates["hedge_reference"] = "Logic_None";
        updates["reverse_scale"] = 100;
        updates["hedge_scale"] = 50;
      } else if (mode === "Hedge") {
        updates["hedge_enabled"] = "ON";
        updates["reverse_enabled"] = "OFF";
        updates["reverse_reference"] = "Logic_None";
        updates["reverse_scale"] = 100;
      } else if (mode === "Reverse") {
        updates["reverse_enabled"] = "ON";
        updates["hedge_enabled"] = "OFF";
        updates["hedge_reference"] = "Logic_None";
        updates["hedge_scale"] = 50;
      }
    }

    // Always update local UI state for the visible field
    updateActiveSideValues((prev) => ({ ...prev, ...updates }));

    // Apply edit only to currently selected side.
    const editDirection: "buy" | "sell" = activeDirection;
    const targetLogicId = getTargetLogicId(editDirection);

    // Propagate only the base field ID upward and let parent
    // handle mapping to buy/sell specific storage using direction hint
    Object.entries(updates).forEach(([fieldId, fieldValue]) => {
      onUpdate?.(fieldId, fieldValue, editDirection, targetLogicId);
    });
  };

  // Current Mode - Trail Only
  const tradingMode = isEngineAPower
    ? "Counter Trend"
    : normalizeTradingModeValue(fieldValues["trading_mode"]);

  // Filter and Construct Fields
  let displayFields = initialFieldsRef.current.map((f) => ({
    ...f,
    value: fieldValues[f.id] ?? f.value,
  }));

  displayFields = displayFields.filter((f) => {
    // Always hide the legacy toggle fields (controlled by Trading Mode selector)
    if (f.id === "reverse_enabled" || f.id === "hedge_enabled") return false;

    // Trading Mode Filtering
    if (f.category === "Reverse/Hedge") {
      if (tradingMode === "Counter Trend") return false;

      // In Hedge mode, hide Reverse fields (except common ones if any)
      if (tradingMode === "Hedge" && f.id.includes("reverse")) return false;
      if (tradingMode === "Reverse" && f.id.includes("hedge")) return false;
    }

    // Show all fields including TPSL (dummy/backup)
    return true;
  });

  const finalFields = displayFields;

  const getUnitHint = (
    fieldId: string,
    fieldValue: any,
  ): string | undefined => {
    const ids = ["grid", "trail_value", "trail_start", "trail_step"];
    if (!ids.includes(fieldId)) return;
    const n =
      typeof fieldValue === "number"
        ? fieldValue
        : parseFloat(String(fieldValue));
    if (!Number.isFinite(n)) return;

    if (unitMode === "direct_price") {
      const move = n * 0.01;
      return `${unitSymbol || "Direct"}: ${n} → ${move.toFixed(2)} price`;
    }

    return `${unitSymbol || "FX"}: ${n} pips`;
  };

  const localSelectedFields = selectedFields || [];
  const filteredFields =
    localSelectedFields.length > 0
      ? finalFields.filter(
          (f) => localSelectedFields.includes(f.id) || (f as any).isVirtual,
        )
      : finalFields;

  const meta = logicMeta[name] || {
    color: "bg-muted",
    description: "",
    cssClass: "",
  };
  const prefix = engine.replace("Engine ", "").toLowerCase();
  const filledCount = filteredFields.filter(
    (f) => f.value !== "-" && f.value !== "" && !(f as any).isVirtual,
  ).length;
  const isPowerLogic = name === "POWER";

  const categoriesSet = new Set(
    filteredFields.map((f) => f.category || "General"),
  );
  const categories = CATEGORY_ORDER.filter((cat) =>
    categoriesSet.has(cat as any),
  );
  categoriesSet.forEach((cat) => {
    if (!categories.includes(cat as any)) categories.push(cat as any);
  });

  return (
    <div
      className={cn(
        "rounded-lg border bg-background/40 overflow-hidden transition-all",
        expanded ? "border-border shadow-soft" : "border-border/50",
        isPowerLogic && expanded && "ring-1 ring-primary/20",
      )}
    >
      <button
        onClick={onToggle}
        className={cn(
          "w-full px-4 py-3 flex items-center justify-between transition-colors",
          expanded ? "bg-card/60" : "hover:bg-card/40",
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn("w-1 h-6 rounded-full", meta.color)} />
          <motion.div
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.1 }}
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </motion.div>
          <span className="text-xs font-mono text-foreground flex items-center gap-2">
            <span className="text-muted-foreground">{prefix}/</span>
            <span className="font-semibold">{name}</span>
            {group && (
              <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                {group.replace("Group ", "G")}
              </span>
            )}
            {isPowerLogic && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-medium">
                <Star className="w-2.5 h-2.5" />
                MAIN
              </span>
            )}
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground/50 cursor-help hover:text-muted-foreground transition-colors" />
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="max-w-xs text-xs bg-popover border-border"
              >
                {meta.description}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", meta.color)}
                style={{
                  width: `${filteredFields.length > 0 ? (filledCount / filteredFields.length) * 100 : 0}%`,
                  opacity: 0.8,
                }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground font-mono w-12 text-right">
              {filledCount}/{filteredFields.length}
            </span>
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.12 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 space-y-4">
              {/* Show LogicConfigPanel for Hedge mode only */}
              {tradingMode === "Hedge" && (
                <LogicConfigPanel
                  mode="hedge"
                  engine={engine}
                  config={{
                    enabled:
                      fieldValues["enabled"] === "ON" ||
                      fieldValues["enabled"] === true,
                    logic_name: name,
                    initial_lot: parseFloat(fieldValues["initial_lot"]) || 0.01,
                    multiplier: parseFloat(fieldValues["multiplier"]) || 2.0,
                    grid: parseFloat(fieldValues["grid"]) || 10.0,
                    trail_method: fieldValues["trail_method"] || "Points",
                    trail_value: parseFloat(fieldValues["trail_value"]) || 15.0,
                    trail_step: parseFloat(fieldValues["trail_step"]) || 10.0,
                    use_tp:
                      fieldValues["use_tp"] === "ON" ||
                      fieldValues["use_tp"] === true,
                    tp_mode: fieldValues["tp_mode"] || "TPSL_Points",
                    tp_value: parseFloat(fieldValues["tp_value"]) || 0.0,
                    use_sl:
                      fieldValues["use_sl"] === "ON" ||
                      fieldValues["use_sl"] === true,
                    sl_mode: fieldValues["sl_mode"] || "TPSL_Points",
                    sl_value: parseFloat(fieldValues["sl_value"]) || 0.0,
                    trigger_type:
                      fieldValues["trigger_type"] || "0 Trigger_Immediate",
                    trigger_bars: parseInt(fieldValues["trigger_bars"]) || 0,
                    trigger_seconds:
                      parseInt(fieldValues["trigger_minutes"]) || 0,
                    trigger_pips:
                      parseFloat(fieldValues["trigger_pips"]) || 0.0,
                    grid_behavior:
                      fieldValues["grid_behavior"] || "Counter Trend",
                    trading_mode: tradingMode,
                    hedge_enabled: tradingMode === "Hedge",
                    hedge_reference:
                      fieldValues["hedge_reference"] || "Logic_None",
                    hedge_scale: parseFloat(fieldValues["hedge_scale"]) || 50.0,
                    reverse_enabled:
                      fieldValues["reverse_enabled"] === "ON" ||
                      fieldValues["reverse_enabled"] === true,
                    reverse_reference:
                      fieldValues["reverse_reference"] || "Logic_None",
                    partial_close:
                      fieldValues["close_partial"] === "ON" ||
                      fieldValues["close_partial"] === true ||
                      fieldValues["partial_close"] === "ON" ||
                      fieldValues["partial_close"] === true,
                    partial_mode:
                      fieldValues["close_partial_mode"] ||
                      fieldValues["partial_mode"] ||
                      "PartialMode_Mid",
                    partial_profit_threshold:
                      parseFloat(
                        fieldValues["close_partial_profit_threshold"] ??
                          fieldValues["partial_profit_threshold"] ??
                          0,
                      ) || 0,
                    start_level: parseInt(fieldValues["start_level"]) || 0,
                  }}
                  onChange={(field, value) => {
                    // Map LogicConfigPanel fields to canonical MT config keys.
                    const fieldMapping: Record<string, string> = {
                      hedge_reference: "hedge_reference",
                      hedge_scale: "hedge_scale",
                      reverse_reference: "reverse_reference",
                      initial_lot: "initial_lot",
                      enabled: "enabled",
                      multiplier: "multiplier",
                      grid: "grid",
                      trail_method: "trail_method",
                      trail_value: "trail_value",
                      trail_step: "trail_step",
                      use_tp: "use_tp",
                      tp_mode: "tp_mode",
                      tp_value: "tp_value",
                      use_sl: "use_sl",
                      sl_mode: "sl_mode",
                      sl_value: "sl_value",
                      trigger_type: "trigger_type",
                      trigger_bars: "trigger_bars",
                      trigger_seconds: "trigger_minutes",
                      trigger_pips: "trigger_pips",
                      grid_behavior: "grid_behavior",
                      partial_close: "close_partial",
                      partial_mode: "close_partial_mode",
                      partial_profit_threshold: "close_partial_profit_threshold",
                      start_level: "start_level",
                    };

                    const mappedField = fieldMapping[field] || field;

                    // Handle boolean conversions
                    let processedValue = value;
                    if (
                      field === "enabled" ||
                      field === "use_tp" ||
                      field === "use_sl" ||
                      field === "partial_close"
                    ) {
                      processedValue = value ? "ON" : "OFF";
                    }

                    updateActiveSideValues((prev) => ({
                      ...prev,
                      [mappedField]: processedValue,
                    }));
                    if (onUpdate) {
                      onUpdate(
                        mappedField,
                        processedValue,
                        activeDirection,
                        getTargetLogicId(activeDirection),
                      );
                    }
                  }}
                  onChangeMode={(newMode) => {
                    // Update trading_mode field
                    const modeValue =
                      newMode === "hedge"
                        ? "Hedge"
                        : newMode === "reverse"
                          ? "Reverse"
                            : "Counter Trend";
                    handleFieldChange("trading_mode", modeValue);
                  }}
                  onDuplicate={() => {
                    // Duplicate current logic config to clipboard or create copy
                    const currentConfig = { ...fieldValues };
                    navigator.clipboard.writeText(
                      JSON.stringify(currentConfig, null, 2),
                    );
                    alert("Logic configuration copied to clipboard!");
                  }}
                  onReset={() => {
                    // Reset to defaults
                    if (confirm("Reset all fields to defaults?")) {
                      const defaults: Record<string, any> = {
                        initial_lot: "0.01",
                        multiplier: "2.0",
                        grid: "600",
                        trail_method: "Points",
                        trail_value: "300",
                        trail_step: "150",
                        use_tp: "OFF",
                        tp_mode: "TPSL_Points",
                        tp_value: "500",
                        use_sl: "OFF",
                        sl_mode: "TPSL_Points",
                        sl_value: "200",
                        trigger_type: "0 Trigger_Immediate",
                        trigger_bars: "0",
                        trigger_minutes: "0",
                        trigger_pips: "0",
                        grid_behavior: "CounterTrend",
                        hedge_reference: "Logic_None",
                        hedge_scale: "50",
                        reverse_reference: "Logic_None",
                        partial_close: "OFF",
                        close_partial_mode: "PartialMode_Mid",
                        close_partial_profit_threshold: "0",
                        enabled: "ON",
                      };
                      updateActiveSideValues((prev) => ({ ...prev, ...defaults }));
                      Object.entries(defaults).forEach(([key, value]) => {
                        if (onUpdate) {
                          onUpdate(
                            key,
                            value,
                            activeDirection,
                            getTargetLogicId(activeDirection),
                          );
                        }
                      });
                    }
                  }}
                  logicType={name}
                  group={
                    groups && groups.length > 0
                      ? parseInt(groups[0].replace("Group ", ""))
                      : 1
                  }
                />
              )}

              {/* Show standard category-based UI for Counter Trend and Reverse */}
              {tradingMode !== "Hedge" &&
                categories.map((category) => {
                  const categoryFields = filteredFields.filter(
                    (f) => (f.category || "General") === category,
                  );
                  const style = categoryStyles[category] || {
                    color: "text-muted-foreground",
                    bg: "bg-muted/5",
                    border: "border-border/50",
                    icon: ChevronRight,
                  };
                  const Icon = style.icon;

                  const isClosePartial = category === "Close Partial";
                  const isTriggers = category === "Triggers";
                  const isLogic = category === "Logic";

                  // Trail Advanced: Filter by level and advancedOnly
                  const isTrailAdvanced = category === "Trail Advanced";
                  const displayFields = isTrailAdvanced
                    ? categoryFields.filter((f) => {
                        const fieldLevel = (f as any).level || 1;
                        const isAdvanced = (f as any).advancedOnly || false;
                        // Show field if: within visible levels AND (not advancedOnly OR advancedOnly is shown)
                        return (
                          fieldLevel <= trailLevelsVisible &&
                          (!isAdvanced || showAdvancedFields)
                        );
                      })
                    : isClosePartial
                      ? categoryFields.filter((f) => {
                          const m = String(f.id).match(/_(\d+)$/);
                          const level = m ? parseInt(m[1], 10) : 1;
                          if (partialLevelsVisible <= 0) {
                            return level === 1;
                          }
                          return level <= partialLevelsVisible;
                        })
                      : categoryFields;

                  // Skip if no fields to display
                  if (displayFields.length === 0) return null;

                  return (
                    <div
                      key={category}
                      className={cn(
                        "rounded-xl border p-3.5 shadow-sm relative overflow-hidden group transition-all duration-300",
                        "hover:shadow-lg hover:-translate-y-0.5",
                        style.bg,
                        style.border,
                        `border-l-[3px] ${style.color.replace("text-", "border-")}`,
                      )}
                    >
                      {/* Glassmorphism gradient overlay - animated on hover */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                      <div className="flex items-center gap-2.5 mb-3.5 relative z-10">
                        <div
                          className={cn(
                            "p-1.5 rounded-lg border shadow-sm backdrop-blur-md transition-all duration-300 group-hover:scale-110",
                            style.bg.replace("/5", "/20"),
                            style.border,
                            style.color,
                          )}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div
                          className={cn(
                            "text-[11px] uppercase tracking-wider font-bold text-foreground/80 group-hover:text-foreground transition-colors",
                            style.color,
                          )}
                        >
                          {category}
                        </div>

                        {/* Trail Advanced: Level selector */}
                        {isTrailAdvanced && (
                          <div className="flex items-center gap-2 ml-auto">
                            <span className="text-[9px] text-muted-foreground">
                              Levels:
                            </span>
                            <select
                              className="text-[10px] bg-background/80 border border-border/50 rounded px-1.5 py-0.5 cursor-pointer hover:border-primary/50 transition-colors"
                              value={trailLevelsVisible}
                              onChange={(e) =>
                                setTrailLevelsVisible(parseInt(e.target.value))
                              }
                              onClick={(e) => e.stopPropagation()}
                            >
                              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowAdvancedFields(!showAdvancedFields);
                              }}
                              className={cn(
                                "text-[9px] flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors",
                                showAdvancedFields
                                  ? "bg-primary/10 border-primary/30 text-primary"
                                  : "bg-muted/50 border-border/50 text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {showAdvancedFields ? (
                                <Eye className="w-3 h-3" />
                              ) : (
                                <EyeOff className="w-3 h-3" />
                              )}
                              Balance
                            </button>
                          </div>
                        )}

                        {isClosePartial && (
                          <div className="flex items-center gap-2 ml-auto">
                            <span className="text-[9px] text-muted-foreground">
                              Partials:
                            </span>
                            <select
                              className="text-[10px] bg-background/80 border border-border/50 rounded px-1.5 py-0.5 cursor-pointer hover:border-primary/50 transition-colors"
                              value={partialLevelsVisible}
                              onChange={(e) =>
                                setPartialLevelsVisible(
                                  parseInt(e.target.value),
                                )
                              }
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value={0}>Off</option>
                              {[1, 2, 3, 4].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {!isTrailAdvanced && (
                          <div
                            className={cn(
                              "flex-1 h-px opacity-20 group-hover:opacity-40 transition-opacity",
                              style.color.replace("text-", "bg-"),
                            )}
                          />
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-x-4 gap-y-3 relative z-10">
                        {/* Custom Trading Direction Control for Mode Selectors */}
{category === "Mode Selectors" && (
                          <div className="col-span-3 mb-2 p-3 bg-muted/30 rounded-lg border border-border/50">
                            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                              <ArrowLeftRight className="w-3 h-3" />
                              Trading Direction
                            </div>
                            <div className="flex flex-row gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  updateSideValues("buy", (prev) => ({
                                    ...prev,
                                    allow_buy: "ON",
                                    allow_sell: "OFF",
                                  }));
                                  setActiveDirection("buy");
                                }}
                                className={cn(
                                  "flex-1 h-8 px-3 text-xs rounded-md border transition-colors",
                                  activeDirection === "buy"
                                    ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30"
                                    : "bg-background border-border hover:bg-accent"
                                )}
                              >
                                Buy
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  updateSideValues("sell", (prev) => ({
                                    ...prev,
                                    allow_buy: "OFF",
                                    allow_sell: "ON",
                                  }));
                                  setActiveDirection("sell");
                                }}
                                className={cn(
                                  "flex-1 h-8 px-3 text-xs rounded-md border transition-colors",
                                  activeDirection === "sell"
                                    ? "bg-rose-500/20 text-rose-500 border-rose-500/30"
                                    : "bg-background border-border hover:bg-accent"
                                )}
                              >
                                Sell
                              </button>
                            </div>
                          </div>
                        )}

                        {displayFields
                          .filter(
                            (f) => {
                              if (f.id === "allow_buy" || f.id === "allow_sell") return false;
                              if (isEngineAPower && f.id === "trading_mode") return false;
                              return true;
                            },
                          )
                          .map((field) => (
                            <ConfigField
                              key={field.id}
                              label={field.label}
                              value={field.value}
                              type={field.type}
                              unit={field.unit}
                              description={field.description}
                              fieldId={field.id}
                              hint={getUnitHint(field.id, field.value)}
                              options={(field as any).options}
                              currentLogicId={currentLogicId}
                              onChange={(val) => {
                                if ((field as any).onChange) {
                                  (field as any).onChange(val);
                                } else {
                                  handleFieldChange(field.id, val);
                                }
                              }}
                            />
                          ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

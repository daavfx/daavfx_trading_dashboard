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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  groups?: string[];
  engineData?: EngineConfig | null;
  selectedFields?: string[];
  onUpdate?: (field: string, value: any) => void;
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
  groups,
  engineData,
  selectedFields = [],
  onUpdate,
  mode = 1,
}: LogicModuleProps) {
  const engineSafe = engine || "";
  const nameSafe = name || "";

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

  // State for field values to handle UI interactions
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});

  // Initialize field values only once using useRef to store initial values
  const initialFieldsRef = useRef<any[]>([]);
  const hasInitializedRef = useRef(false);

  // Compute initial fields and set them only once
  useEffect(() => {
    const isGroup1 =
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

    // Only initialize field values if they haven't been initialized yet
    if (!hasInitializedRef.current) {
      const initialValues: Record<string, any> = {};
      newInitialFields.forEach((f) => {
        initialValues[f.id] = f.value;
      });

      // Enforce mode constraints during initialization
      if (mode === 1) {
        // Mode 1: Default to "buy" if both are enabled
        if (
          (initialValues["allow_buy"] === "ON" ||
            initialValues["allow_buy"] === true) &&
          (initialValues["allow_sell"] === "ON" ||
            initialValues["allow_sell"] === true)
        ) {
          initialValues["allow_buy"] = "ON";
          initialValues["allow_sell"] = "OFF";
        }
      } else if (mode === 2) {
        // Mode 2: Force both to be enabled
        initialValues["allow_buy"] = "ON";
        initialValues["allow_sell"] = "ON";
      }

      setFieldValues(initialValues);
      hasInitializedRef.current = true;
    }
  }, [logicConfig, groups, nameSafe, mode]); // This runs when the config changes to update the reference

  // Enforce mode constraints on initialization and mode change
  useEffect(() => {
    if (hasInitializedRef.current) {
      if (mode === 1) {
        // Mode 1: Cannot have "both" selected
        if (
          (fieldValues["allow_buy"] === "ON" ||
            fieldValues["allow_buy"] === true) &&
          (fieldValues["allow_sell"] === "ON" ||
            fieldValues["allow_sell"] === true)
        ) {
          // Default to "buy" in Mode 1 if both are selected
          const updates = { allow_buy: "ON", allow_sell: "OFF" };
          setFieldValues((prev) => ({ ...prev, ...updates }));
          Object.entries(updates).forEach(([key, v]) => onUpdate?.(key, v));
        }
      } else if (mode === 2) {
        // Mode 2: Must have "both" selected
        if (
          !(
            (fieldValues["allow_buy"] === "ON" ||
              fieldValues["allow_buy"] === true) &&
            (fieldValues["allow_sell"] === "ON" ||
              fieldValues["allow_sell"] === true)
          )
        ) {
          // Force both in Mode 2
          const updates = { allow_buy: "ON", allow_sell: "ON" };
          setFieldValues((prev) => ({ ...prev, ...updates }));
          Object.entries(updates).forEach(([key, v]) => onUpdate?.(key, v));
        }
      }
    }
  }, [mode, fieldValues, onUpdate]); // This runs when mode changes

  if (!engineSafe || !nameSafe) {
    return null;
  }

  const handleFieldChange = (id: string, value: any) => {
    const updates: Record<string, any> = { [id]: value };

    // Side effects for Trading Mode
    if (id === "trading_mode") {
      if (value === "Counter Trend") {
        updates["reverse_enabled"] = "OFF";
        updates["hedge_enabled"] = "OFF";
      } else if (value === "Hedge") {
        updates["hedge_enabled"] = "ON";
        updates["reverse_enabled"] = "OFF";
      } else if (value === "Reverse") {
        updates["reverse_enabled"] = "ON";
        updates["hedge_enabled"] = "OFF";
      }
    }

    setFieldValues((prev) => ({ ...prev, ...updates }));

    // Propagate changes to parent component
    Object.entries(updates).forEach(([fieldId, fieldValue]) => {
      onUpdate?.(fieldId, fieldValue);
    });
  };

  // Current Mode - Trail Only
  const tradingMode = fieldValues["trading_mode"] || "Counter Trend";

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
                    tp_value: parseFloat(fieldValues["tp_value"]) || 0.0,
                    use_sl:
                      fieldValues["use_sl"] === "ON" ||
                      fieldValues["use_sl"] === true,
                    sl_value: parseFloat(fieldValues["sl_value"]) || 0.0,
                    trigger_type: fieldValues["trigger_type"] || "Immediate",
                    trigger_bars: parseInt(fieldValues["trigger_bars"]) || 0,
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
                      fieldValues["partial_close"] === "ON" ||
                      fieldValues["partial_close"] === true,
                  }}
                  onChange={(field, value) => {
                    // Map LogicConfigPanel field names to LogicModule field names
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
                      tp_value: "tp_value",
                      use_sl: "use_sl",
                      sl_value: "sl_value",
                      trigger_type: "trigger_type",
                      trigger_bars: "trigger_bars",
                      trigger_pips: "trigger_pips",
                      grid_behavior: "grid_behavior",
                      partial_close: "partial_close",
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

                    setFieldValues((prev) => ({
                      ...prev,
                      [mappedField]: processedValue,
                    }));
                    if (onUpdate) {
                      onUpdate(mappedField, processedValue);
                    }
                  }}
                  onChangeMode={(newMode) => {
                    // Update trading_mode field
                    const modeValue =
                      newMode === "hedge"
                        ? "Hedge"
                        : newMode === "reverse"
                          ? "Reverse"
                          : newMode === "trend_following"
                            ? "Trend Following"
                            : "Counter Trend";
                    setFieldValues((prev) => ({
                      ...prev,
                      trading_mode: modeValue,
                    }));
                    if (onUpdate) {
                      onUpdate("trading_mode", modeValue);
                    }
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
                        tp_value: "500",
                        use_sl: "OFF",
                        sl_value: "200",
                        trigger_type: "Immediate",
                        trigger_bars: "0",
                        trigger_pips: "0",
                        grid_behavior: "CounterTrend",
                        hedge_reference: "Logic_None",
                        hedge_scale: "50",
                        reverse_reference: "Logic_None",
                        partial_close: "OFF",
                        enabled: "ON",
                      };
                      setFieldValues((prev) => ({ ...prev, ...defaults }));
                      Object.entries(defaults).forEach(([key, value]) => {
                        if (onUpdate) onUpdate(key, value);
                      });
                    }
                  }}
                  logicType={name}
                  engine={engineLetter}
                  group={
                    groups && groups.length > 0
                      ? parseInt(groups[0].replace("Group ", ""))
                      : 1
                  }
                />
              )}

              {/* Show standard category-based UI for Counter Trend, Trend Following, and Reverse */}
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

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-3 relative z-10">
                        {/* Custom Trading Direction Control for Mode Selectors */}
                        {category === "Mode Selectors" && (
                          <div className="col-span-2 mb-2 p-3 bg-muted/30 rounded-lg border border-border/50">
                            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                              <ArrowLeftRight className="w-3 h-3" />
                              Trading Direction
                            </div>
                            <ToggleGroup
                              type="single"
                              value={
                                mode === 2
                                  ? "both"
                                  : (fieldValues["allow_buy"] === "ON" ||
                                        fieldValues["allow_buy"] === true) &&
                                      (fieldValues["allow_sell"] === "ON" ||
                                        fieldValues["allow_sell"] === true)
                                    ? "both"
                                    : fieldValues["allow_buy"] === "ON" ||
                                        fieldValues["allow_buy"] === true
                                      ? "buy"
                                      : fieldValues["allow_sell"] === "ON" ||
                                          fieldValues["allow_sell"] === true
                                        ? "sell"
                                        : mode === 1
                                          ? "buy"
                                          : "both"
                              }
                              onValueChange={(val) => {
                                if (!val) return;
                                // Mode 2: Only allow "both"
                                if (mode === 2 && val !== "both") return;
                                // Mode 1: Only allow "buy" or "sell"
                                if (mode === 1 && val === "both") return;

                                const updates: Record<string, any> = {};
                                if (val === "both") {
                                  updates["allow_buy"] = "ON";
                                  updates["allow_sell"] = "ON";
                                } else if (val === "buy") {
                                  updates["allow_buy"] = "ON";
                                  updates["allow_sell"] = "OFF";
                                } else if (val === "sell") {
                                  updates["allow_buy"] = "OFF";
                                  updates["allow_sell"] = "ON";
                                }
                                setFieldValues((prev) => ({
                                  ...prev,
                                  ...updates,
                                }));

                                if (onUpdate) {
                                  Object.entries(updates).forEach(([key, v]) =>
                                    onUpdate(key, v),
                                  );
                                }
                              }}
                              className="flex flex-col sm:flex-row justify-start gap-2 w-full"
                            >
                              <ToggleGroupItem
                                value="buy"
                                disabled={mode === 2}
                                className={cn(
                                  "flex-1 h-8 px-3 text-xs",
                                  mode === 2 && "opacity-40 cursor-not-allowed",
                                  "data-[state=on]:bg-emerald-500/20 data-[state=on]:text-emerald-500 border border-border/50 data-[state=on]:border-emerald-500/30",
                                )}
                              >
                                Buy
                              </ToggleGroupItem>
                              <ToggleGroupItem
                                value="sell"
                                disabled={mode === 2}
                                className={cn(
                                  "flex-1 h-8 px-3 text-xs",
                                  mode === 2 && "opacity-40 cursor-not-allowed",
                                  "data-[state=on]:bg-rose-500/20 data-[state=on]:text-rose-500 border border-border/50 data-[state=on]:border-rose-500/30",
                                )}
                              >
                                Sell
                              </ToggleGroupItem>
                              <ToggleGroupItem
                                value="both"
                                disabled={mode === 1}
                                className={cn(
                                  "flex-1 h-8 px-3 text-xs",
                                  mode === 1 && "opacity-40 cursor-not-allowed",
                                  "data-[state=on]:bg-blue-500/20 data-[state=on]:text-blue-500 border border-border/50 data-[state=on]:border-blue-500/30",
                                )}
                              >
                                Both Sides
                              </ToggleGroupItem>
                            </ToggleGroup>
                          </div>
                        )}

                        {displayFields
                          .filter(
                            (f) =>
                              f.id !== "allow_buy" && f.id !== "allow_sell",
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

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
import { logicMeta, categoryStyles } from "@/data/logic-ui-meta";
import { useSettings } from "@/contexts/SettingsContext";
import LogicConfigPanel from "@/components/LogicConfigPanel";
import React from "react";

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

const normalizeTradingModeValue = (raw: unknown): "Counter Trend" | "Hedge" | "Reverse" => {
  const mode = String(raw ?? "").trim().toLowerCase();
  if (mode === "hedge") return "Hedge";
  if (mode === "reverse") return "Reverse";
  if (
    mode === "counter trend" ||
    mode === "countertrend" ||
    mode === "counter_trend" ||
    mode === "counter-trend" ||
    mode === ""
  ) {
    return "Counter Trend";
  }
  return "Counter Trend";
};

const readNumberValue = (raw: unknown): number | undefined => {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const parsed =
    typeof raw === "number" ? raw : Number.parseFloat(String(raw));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readIntegerValue = (raw: unknown): number | undefined => {
  const parsed = readNumberValue(raw);
  return parsed === undefined ? undefined : Math.trunc(parsed);
};

const readStringValue = (raw: unknown): string | undefined => {
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw).trim();
  return text === "" ? undefined : text;
};

const readToggleValue = (raw: unknown): boolean | undefined => {
  if (raw === true || raw === "ON") return true;
  if (raw === false || raw === "OFF") return false;
  return undefined;
};

const getCategoryIcon = (category: string) => {
  if (category === "Reverse/Hedge")
    return <ArrowLeftRight className="w-3 h-3" />;
  if (category === "Safety") return <Shield className="w-3 h-3" />;
  return null;
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
  "Safety",
  "Restart",
];

export const LogicModule = React.memo(function LogicModule({
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
    SCALP: "Scalper",
    STOPPER: "Stopper",
    STO: "STO",
    SCA: "SCA",
    RPO: "RPO",
  };
  const logicSuffix = suffixMap[baseName] || baseName || "";

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

  const hasConfigValue = (value: unknown) =>
    value !== undefined && value !== null && value !== "";

  const isDirectionalFallbackValue = (value: unknown) =>
    typeof value === "number" && value === -1;

  const readPersistedFieldValue = (
    source: Record<string, any> | null | undefined,
    fieldId: string,
    side: "buy" | "sell",
  ) => {
    if (!source) return undefined;

    if (/_(b|s)$/i.test(fieldId)) {
      return source[fieldId];
    }

    const directionalKey = `${fieldId}_${side === "buy" ? "b" : "s"}`;
    const directionalValue = source[directionalKey];
    const baseValue = source[fieldId];
    if (hasConfigValue(baseValue)) {
      if (
        hasConfigValue(directionalValue) &&
        !isDirectionalFallbackValue(directionalValue) &&
        directionalValue !== baseValue
      ) {
        console.warn(
          `[LogicModule] LEGACY_OVERRIDE_MISMATCH logic=${source.logic_id || logicConfigKey} side=${side} field=${fieldId} base=${JSON.stringify(baseValue)} overrideKey=${directionalKey} override=${JSON.stringify(directionalValue)}`,
        );
        console.warn("[LogicModule] LEGACY_OVERRIDE_MISMATCH", {
          engine: engineSafe,
          logic: nameSafe,
          group: group || groups?.[0] || null,
          side,
          fieldId,
          baseValue,
          directionalKey,
          directionalValue,
          logicId: source.logic_id || null,
        });
      }
      return baseValue;
    }

    if (
      hasConfigValue(directionalValue) &&
      !isDirectionalFallbackValue(directionalValue)
    ) {
      return directionalValue;
    }

    return undefined;
  };

  const parseTriggerTypeCode = (raw: unknown): number | null => {
    if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
    const text = String(raw ?? "").trim();
    if (text === "") return null;
    const match = text.match(/^(\d+)/);
    if (match) return parseInt(match[1], 10);
    if (text.toLowerCase().includes("immediate")) return 0;
    return null;
  };

  const buildInactiveTriggerResets = (
    triggerTypeRaw: unknown,
    source: SideValues,
  ): SideValues => {
    const code = parseTriggerTypeCode(triggerTypeRaw);
    const updates: SideValues = {};

    if (code !== 1) updates["trigger_bars"] = undefined;
    if (code !== 2) updates["trigger_seconds"] = undefined;
    if (code !== 3) updates["trigger_pips"] = undefined;

    if (code !== 0) {
      updates["trigger_mode"] = undefined;
    }
    return updates;
  };

  const resolveLogicDirection = (logic: any): "buy" | "sell" | null => {
    const dir = String(logic?.direction || "").toUpperCase();
    if (dir === "B" || dir === "BUY") return "buy";
    if (dir === "S" || dir === "SELL") return "sell";

    const logicId = String(logic?.logic_id || "").toUpperCase();
    if (logicId.includes("_BUY_") || logicId.endsWith("_BUY")) return "buy";
    if (logicId.includes("_SELL_") || logicId.endsWith("_SELL")) return "sell";
    if (logicId.includes("_B_") || logicId.endsWith("_B")) return "buy";
    if (logicId.includes("_S_") || logicId.endsWith("_S")) return "sell";

    const allowBuy = (logic?.allow_buy ?? logic?.allowBuy) === true;
    const allowSell = (logic?.allow_sell ?? logic?.allowSell) === true;
    if (allowBuy && !allowSell) return "buy";
    if (allowSell && !allowBuy) return "sell";
    return null;
  };

  const getCurrentGroupData = () => {
    const groupNum = group
      ? parseInt(String(group).replace("Group ", ""), 10)
      : groups && groups.length > 0
        ? parseInt(String(groups[0]).replace("Group ", ""), 10)
        : NaN;
    if (!Number.isFinite(groupNum)) return null;

    return (
      engineData?.groups?.find((g: any) => g.group_number === groupNum) || null
    );
  };

  const getGroupPowerStartValue = (
    side: "buy" | "sell",
    groupData: any,
  ) => {
    if (!groupData) return undefined;
    return side === "buy"
      ? (groupData as any)?.group_power_start_b ?? (groupData as any)?.group_power_start
      : (groupData as any)?.group_power_start_s ?? (groupData as any)?.group_power_start;
  };

  const findDirectionalLogic = (targetDirection: "buy" | "sell") => {
    const groupData = getCurrentGroupData();
    if (!groupData?.logics) return null;

    const desiredNames = new Set<string>([
      String(baseName || nameSafe).toUpperCase(),
      String(logicSuffix || "").toUpperCase(),
    ]);

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

  const getTargetLogicId = (side: "buy" | "sell"): string => {
    const row = findDirectionalLogic(side);
    const logicId = String((row as any)?.logic_id || "").trim();
    if (logicId) return logicId;
    const sideToken = side === "buy" ? "B" : "S";
    const groupNum = group
      ? parseInt(String(group).replace("Group ", ""), 10)
      : groups && groups.length > 0
        ? parseInt(String(groups[0]).replace("Group ", ""), 10)
        : 1;
    const normalizedGroup = Number.isFinite(groupNum) && groupNum > 0 ? groupNum : 1;
    const normalizedLogicName = String(baseName || nameSafe || logicSuffix || "POWER").toUpperCase();
    return `${engineLetter}_${normalizedLogicName}_${sideToken}_G${normalizedGroup}`;
  };

  useEffect(() => {
    if (initializedRef.current === logicConfigKey) {
      console.log("[LogicModule] INIT_SKIP", {
        engine: engineSafe,
        logic: nameSafe,
        group: group || groups?.[0] || null,
        logicConfigKey,
      });
      return;
    }

    console.log(
      `[LogicModule] INIT_START logic=${logicConfigKey} engine=${engineSafe} group=${group || groups?.[0] || "none"} name=${nameSafe} incoming=${logicConfig?.logic_id || "none"}`,
    );
    console.log("[LogicModule] INIT_START", {
      engine: engineSafe,
      logic: nameSafe,
      group: group || groups?.[0] || null,
      logicConfigKey,
      incomingLogicId: logicConfig?.logic_id || null,
    });

    initializedRef.current = logicConfigKey;

    const logicIdGroupMatch = logicConfig?.logic_id?.match(/_G(\d+)(?:$|_)/);
    const logicIdGroup = logicIdGroupMatch ? Number(logicIdGroupMatch[1]) : NaN;
    const isGroup1 =
      group === "Group 1" ||
      (groups && groups.length > 0 && groups.some((g) => g === "Group 1")) ||
      logicIdGroup === 1;
    const logicInputConfig = logicInputs[nameSafe];
    if (!logicInputConfig) return;
    const currentGroupData = getCurrentGroupData();

    const templateFields = isGroup1
      ? logicInputConfig.group_1
      : logicInputConfig.standard;

    const newInitialFields = templateFields.map((field) => {
      let val: unknown;

      if (field.id === "group_power_start") {
        val = getGroupPowerStartValue(activeDirection, currentGroupData);
      }

      return { ...field, value: val };
    });

    initialFieldsRef.current = newInitialFields;

    const hasBuyRow = Boolean(findDirectionalLogic("buy"));
    const hasSellRow = Boolean(findDirectionalLogic("sell"));
    const initialDirection: "buy" | "sell" = hasBuyRow
      ? "buy"
      : hasSellRow
        ? "sell"
        : "buy";

    const buildSideValues = (side: "buy" | "sell") => {
      const sideRow = findDirectionalLogic(side) as Record<string, any> | null;
      const values: Record<string, any> = {};

      newInitialFields.forEach((f) => {
        let nextValue: any;

        if (f.id === "group_power_start") {
          nextValue = getGroupPowerStartValue(side, currentGroupData);
        }

        if (nextValue === undefined) {
          nextValue = readPersistedFieldValue(sideRow, f.id, side);
        }

        values[f.id] =
          f.type === "toggle" && typeof nextValue === "boolean"
            ? nextValue
              ? "ON"
              : "OFF"
            : nextValue;
      });

      values["allow_buy"] = side === "buy" ? "ON" : "OFF";
      values["allow_sell"] = side === "sell" ? "ON" : "OFF";

      return values;
    };

    const buyValues = buildSideValues("buy");
    const sellValues = buildSideValues("sell");

    console.log(
      `[LogicModule] INIT_VALUES logic=${logicConfigKey} buyLogic=${findDirectionalLogic("buy")?.logic_id || "none"} sellLogic=${findDirectionalLogic("sell")?.logic_id || "none"}`,
    );
    console.log("[LogicModule] INIT_VALUES", {
      engine: engineSafe,
      logic: nameSafe,
      group: group || groups?.[0] || null,
      logicConfigKey,
      activeDirection: initialDirection,
      buyLogicId: findDirectionalLogic("buy")?.logic_id || null,
      sellLogicId: findDirectionalLogic("sell")?.logic_id || null,
      buyValues,
      sellValues,
    });

    setActiveDirection(initialDirection);
    setFieldValuesBySide({ buy: buyValues, sell: sellValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicConfig, logicConfigKey]);

  if (!engineSafe || !nameSafe) {
    return null;
  }

  const handleFieldChange = (id: string, value: any) => {
    console.log(
      `[LogicModule] FIELD_EDIT logic=${logicConfigKey} side=${activeDirection} field=${id} prev=${JSON.stringify(fieldValues[id])} next=${JSON.stringify(value)}`,
    );
    console.log("[LogicModule] FIELD_EDIT", {
      engine: engineSafe,
      logic: nameSafe,
      group: group || groups?.[0] || null,
      logicConfigKey,
      activeDirection,
      fieldId: id,
      incomingValue: value,
      currentValue: fieldValues[id],
    });

    const updates: Record<string, any> = { [id]: value };

    if (id === "trigger_type") {
      Object.assign(
        updates,
        buildInactiveTriggerResets(value, fieldValues),
      );
    }

    // Side effects for Trading Mode
    if (id === "trading_mode") {
      const mode = isEngineAPower
        ? "Counter Trend"
        : normalizeTradingModeValue(value);
      updates["trading_mode"] = mode;
      if (mode === "Counter Trend") {
        updates["reverse_enabled"] = "OFF";
        updates["hedge_enabled"] = "OFF";
      } else if (mode === "Hedge") {
        updates["hedge_enabled"] = "ON";
        updates["reverse_enabled"] = "OFF";
      } else if (mode === "Reverse") {
        updates["reverse_enabled"] = "ON";
        updates["hedge_enabled"] = "OFF";
      }
    }

    // Always update local UI state for the visible side only.
    updateActiveSideValues((prev) => ({ ...prev, ...updates }));

    // Apply edit only to currently selected side.
    const editDirection: "buy" | "sell" = activeDirection;
    const targetLogicId = getTargetLogicId(editDirection);

    console.log(
      `[LogicModule] FIELD_COMMIT logic=${logicConfigKey} side=${editDirection} target=${targetLogicId} updates=${JSON.stringify(updates)}`,
    );
    console.log("[LogicModule] FIELD_COMMIT", {
      engine: engineSafe,
      logic: nameSafe,
      group: group || groups?.[0] || null,
      logicConfigKey,
      activeDirection: editDirection,
      targetLogicId,
      updates,
    });

    // Propagate only the base field ID upward and let parent
    // handle mapping to buy/sell specific storage using direction hint
    Object.entries(updates).forEach(([fieldId, fieldValue]) => {
      const persistedFieldId =
        fieldId === "group_power_start"
          ? editDirection === "buy"
            ? "group_power_start_b"
            : "group_power_start_s"
          : fieldId;
      onUpdate?.(persistedFieldId, fieldValue, editDirection, targetLogicId);
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
    if (/_(b|s)$/i.test(f.id)) return false;

    if (f.id === "close_targets") {
      return String(fieldValues["trail_method"] || "Points") === "AVG_Percent";
    }

    // Always hide the legacy toggle fields (controlled by Trading Mode selector)
    if (f.id === "reverse_enabled" || f.id === "hedge_enabled") return false;

    // Trading Mode Filtering
    if (f.category === "Reverse/Hedge") {
      if (tradingMode === "Counter Trend") return false;

      // In Hedge mode, hide Reverse fields (except common ones if any)
      if (tradingMode === "Hedge" && f.id.includes("reverse")) return false;
      if (tradingMode === "Reverse" && f.id.includes("hedge")) return false;
    }

    // Show all fields
    return true;
  });

  const finalFields = displayFields;

  const getUnitHint = (
    fieldId: string,
    fieldValue: any,
  ): string | undefined => {
    const trailIds = ["trail_value", "trail_start", "trail_step"];
    const gridIds = ["grid"];
    if (!trailIds.includes(fieldId) && !gridIds.includes(fieldId)) return;
    
    const n =
      typeof fieldValue === "number"
        ? fieldValue
        : parseFloat(String(fieldValue));
    if (!Number.isFinite(n)) return;

    // Check if this is a percent-based trail mode
    const trailMethod = fieldValues["trail_method"];
    const isPercentTrail = trailMethod && (
      trailMethod === "AVG_Percent" || 
      trailMethod === "Percent" || 
      String(trailMethod).includes("Percent")
    );

    if (unitMode === "direct_price") {
      const move = n * 0.01;
      return `${unitSymbol || "Direct"}: ${n} → ${move.toFixed(2)} price`;
    }

    // For trail fields: Points mode = "pts", Percent mode = "%"
    if (trailIds.includes(fieldId)) {
      if (isPercentTrail) {
        return `${unitSymbol || "FX"}: ${n}%`;
      }
      // Points mode - show "pts" not "pips"
      return `${unitSymbol || "FX"}: ${n} pts`;
    }

    // Grid always shows "pips"
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
                    enabled: readToggleValue(fieldValues["enabled"]) ?? false,
                    logic_name: name,
                    initial_lot: readNumberValue(fieldValues["initial_lot"]),
                    multiplier: readNumberValue(fieldValues["multiplier"]),
                    grid: readNumberValue(fieldValues["grid"]),
                    trail_method: readStringValue(fieldValues["trail_method"]),
                    trail_value: readNumberValue(fieldValues["trail_value"]),
                    trail_start: readNumberValue(fieldValues["trail_start"]),
                    trail_step: readNumberValue(fieldValues["trail_step"]),
                    close_targets: readStringValue(fieldValues["close_targets"]),
                    order_count_reference: readStringValue(
                      fieldValues["order_count_reference"],
                    ),
                    group_order_count_reference: readStringValue(
                      fieldValues["group_order_count_reference"],
                    ),
                    grid_behavior: readStringValue(fieldValues["grid_behavior"]),
                    trading_mode: tradingMode,
                    trigger_type: readStringValue(fieldValues["trigger_type"]),
                    trigger_mode: readStringValue(fieldValues["trigger_mode"]),
                    trigger_bars: readIntegerValue(fieldValues["trigger_bars"]),
                    trigger_seconds: readIntegerValue(
                      fieldValues["trigger_seconds"],
                    ),
                    trigger_pips: readNumberValue(fieldValues["trigger_pips"]),
                    hedge_enabled: tradingMode === "Hedge",
                    hedge_reference: readStringValue(
                      fieldValues["hedge_reference"],
                    ),
                    hedge_scale: readNumberValue(fieldValues["hedge_scale"]),
                    reverse_enabled:
                      readToggleValue(fieldValues["reverse_enabled"]) ?? false,
                    reverse_reference: readStringValue(
                      fieldValues["reverse_reference"],
                    ),
                    partial_close:
                      readToggleValue(fieldValues["close_partial"]) ??
                      readToggleValue(fieldValues["partial_close"]) ??
                      false,
                    partial_mode:
                      readStringValue(fieldValues["close_partial_mode"]) ??
                      readStringValue(fieldValues["partial_mode"]),
                    partial_profit_threshold:
                      readNumberValue(
                        fieldValues["close_partial_profit_threshold"] ??
                        fieldValues["partial_profit_threshold"],
                      ),
                    start_level: readIntegerValue(fieldValues["start_level"]),
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
                      trigger_type: "trigger_type",
                      trigger_mode: "trigger_mode",
                      trigger_bars: "trigger_bars",
                      trigger_seconds: "trigger_seconds",
                      trigger_pips: "trigger_pips",
                      grid_behavior: "grid_behavior",
                      partial_close: "close_partial",
                      partial_mode: "close_partial_mode",
                      partial_profit_threshold: "close_partial_profit_threshold",
                      start_level: "start_level",
                      order_count_reference: "order_count_reference",
                      group_order_count_reference: "group_order_count_reference",
                      close_targets: "close_targets",
                    };

                    const mappedField = fieldMapping[field] || field;

                    // Handle boolean conversions
                    let processedValue = value;
                    if (
                      field === "enabled" ||
                      field === "partial_close"
                    ) {
                      processedValue = value ? "ON" : "OFF";
                    }

                    const updates: Record<string, any> = {
                      [mappedField]: processedValue,
                    };
                    if (mappedField === "trigger_type") {
                      Object.assign(
                        updates,
                        buildInactiveTriggerResets(processedValue, fieldValues),
                      );
                    }

                    updateActiveSideValues((prev) => ({
                      ...prev,
                      ...updates,
                    }));
                    if (onUpdate) {
                      Object.entries(updates).forEach(([fieldId, fieldValue]) => {
                        onUpdate(
                          fieldId,
                          fieldValue,
                          activeDirection,
                          getTargetLogicId(activeDirection),
                        );
                      });
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
                    if (confirm("Clear all editable values for this logic side?")) {
                      const clearedValues: Record<string, any> = {
                        initial_lot: undefined,
                        multiplier: undefined,
                        grid: undefined,
                        trail_method: undefined,
                        trail_value: undefined,
                        trail_step: undefined,
                        trigger_type: undefined,
                        trigger_mode: undefined,
                        trigger_bars: undefined,
                        trigger_seconds: undefined,
                        trigger_pips: undefined,
                        grid_behavior: undefined,
                        hedge_reference: undefined,
                        hedge_scale: undefined,
                        reverse_reference: undefined,
                        partial_close: undefined,
                        close_partial_mode: undefined,
                        close_partial_profit_threshold: undefined,
                        enabled: undefined,
                      };
                      updateActiveSideValues((prev) => ({
                        ...prev,
                        ...clearedValues,
                      }));
                      Object.entries(clearedValues).forEach(([key, value]) => {
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
                  const triggerTypeCode = parseTriggerTypeCode(
                    fieldValues["trigger_type"],
                  );
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
                      : isTriggers
                        ? categoryFields.filter((f) => {
                          if (f.id === "trigger_type") return true;
                          if (f.id === "trigger_mode") return triggerTypeCode === 0;
                          if (f.id === "trigger_bars") return triggerTypeCode === 1;
                          if (f.id === "trigger_seconds") return triggerTypeCode === 2;
                          if (f.id === "trigger_pips") return triggerTypeCode === 3;
                          return false;
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
                          .map((field) => {
                            // Calculate dynamic unit for trail fields based on trail method
                            let dynamicUnit = field.unit;
                            const trailMethod = fieldValues["trail_method"];
                            const isPercentTrail = trailMethod && (
                              trailMethod === "AVG_Percent" || 
                              trailMethod === "Percent" || 
                              String(trailMethod).includes("Percent")
                            );
                            const isTrailField = ["trail_value", "trail_start", "trail_step"].includes(field.id);
                            if (isTrailField) {
                              dynamicUnit = isPercentTrail ? "%" : (field.unit || "pts");
                            }
                            
                            return (
                            <ConfigField
                              key={field.id}
                              label={field.label}
                              value={field.value}
                              type={field.type}
                              unit={dynamicUnit}
                              description={field.description}
                              fieldId={field.id}
                              hint={getUnitHint(field.id, field.value)}
                              options={(field as any).options}
                              currentLogicId={`${logicConfigKey}:${activeDirection}`}
                              onChange={(val) => {
                                if ((field as any).onChange) {
                                  (field as any).onChange(val);
                                } else {
                                  handleFieldChange(field.id, val);
                                }
                              }}
                            />
                          )})}
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
});

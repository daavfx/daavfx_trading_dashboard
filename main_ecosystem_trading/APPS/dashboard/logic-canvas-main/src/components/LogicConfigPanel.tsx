// LogicConfigPanel.tsx - Dynamic UI based on Trading Mode
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Copy,
  RotateCcw,
  Settings2,
  Layers,
  ArrowLeftRight,
  ChevronRight,
  Zap,
  RefreshCw,
  Eye,
  EyeOff,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface LogicConfig {
  enabled: boolean;
  logic_name: string;
  initial_lot: number;
  last_lot?: number;
  start_level?: number;
  multiplier: number;
  grid: number;
  trail_method?: string;
  trail_value?: number;
  trail_start?: number;
  trail_step?: number;
  trail_step_method?: string;
  trigger_type?: string;
  trigger_bars?: number;
  trigger_seconds?: number;
  trigger_pips?: number;
  partial_close?: boolean;
  partial_mode?: string;
  partial_profit_threshold?: number;
  allow_buy?: boolean;
  allow_sell?: boolean;
  trading_mode?: "Counter Trend" | "Hedge" | "Reverse";
  reset_lot_on_restart?: boolean;
  order_count_reference?: string;
  close_targets?: string;
  // Trail Advanced
  trail_levels?: number;
  trail_step_mode?: string;
  trail_step_cycle?: number;
  // TPSL
  use_tp?: boolean;
  tp_mode?: string;
  tp_value?: number;
  use_sl?: boolean;
  sl_mode?: string;
  sl_value?: number;
  // Reverse Reference - ONLY FIELD ADDED FOR REVERSE
  reverse_reference?: string;
  // Grid behavior
  grid_behavior?: string;
  // Hedge
  hedge_enabled?: boolean;
  hedge_reference?: string;
  hedge_scale?: number;
  // Reverse
  reverse_enabled?: boolean;
  reverse_scale?: number;
}

interface LogicConfigPanelProps {
  mode: "counter_trend" | "hedge" | "reverse";
  config: LogicConfig;
  onChange: (field: string, value: any) => void;
  onChangeMode?: (newMode: string) => void;
  onDuplicate?: () => void;
  onReset?: () => void;
  logicType?: string;
  engine?: string;
  group?: number;
}

// Helper component for labeled inputs
const LabeledField = ({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) => (
  <div className={cn("space-y-1.5", className)}>
    <Label className="text-[11px] font-medium text-muted-foreground">
      {label}
    </Label>
    {children}
    {hint && <p className="text-[10px] text-muted-foreground/60">{hint}</p>}
  </div>
);

// Category card component
const CategoryCard = ({
  title,
  icon: Icon,
  color,
  children,
  rightContent,
}: {
  title: string;
  icon: any;
  color: string;
  children: React.ReactNode;
  rightContent?: React.ReactNode;
}) => {
  const colorClasses: Record<
    string,
    { text: string; bg: string; border: string }
  > = {
    sky: {
      text: "text-sky-500",
      bg: "bg-sky-500/5",
      border: "border-sky-500/10",
    },
    blue: {
      text: "text-blue-500",
      bg: "bg-blue-500/5",
      border: "border-blue-500/10",
    },
    indigo: {
      text: "text-indigo-500",
      bg: "bg-indigo-500/5",
      border: "border-indigo-500/10",
    },
    purple: {
      text: "text-purple-500",
      bg: "bg-purple-500/5",
      border: "border-purple-500/10",
    },
    fuchsia: {
      text: "text-fuchsia-500",
      bg: "bg-fuchsia-500/5",
      border: "border-fuchsia-500/10",
    },
    cyan: {
      text: "text-cyan-500",
      bg: "bg-cyan-500/5",
      border: "border-cyan-500/10",
    },
    rose: {
      text: "text-rose-500",
      bg: "bg-rose-500/5",
      border: "border-rose-500/10",
    },
  };

  const colors = colorClasses[color] || colorClasses.blue;

  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 shadow-sm relative overflow-hidden group transition-all duration-300",
        "hover:shadow-lg hover:-translate-y-0.5",
        colors.bg,
        colors.border,
        `border-l-[3px] ${colors.text.replace("text-", "border-")}`,
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="flex items-center gap-2.5 mb-3.5 relative z-10">
        <div
          className={cn(
            "p-1.5 rounded-lg border shadow-sm backdrop-blur-md transition-all duration-300 group-hover:scale-110",
            colors.bg.replace("/5", "/20"),
            colors.border,
            colors.text,
          )}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div
          className={cn(
            "text-[11px] uppercase tracking-wider font-bold text-foreground/80 group-hover:text-foreground transition-colors",
            colors.text,
          )}
        >
          {title}
        </div>
        {rightContent && <div className="ml-auto">{rightContent}</div>}
      </div>

      <div className="relative z-10">{children}</div>
    </div>
  );
};

// Logic reference options for Reverse
const logicOptions = [
  { value: "Logic_None", label: "Select Reference Logic..." },
  { value: "Logic_Self", label: "Logic Self" },
  { value: "Logic_Power", label: "Power A (Engine A)" },
  { value: "Logic_Repower", label: "Repower (Engine A)" },
  { value: "Logic_Scalp", label: "Scalp (Engine A)" },
  { value: "Logic_Stopper", label: "Stopper (Engine A)" },
  { value: "Logic_STO", label: "STO (Engine A)" },
  { value: "Logic_SCA", label: "SCA (Engine A)" },
  { value: "Logic_RPO", label: "RPO (Engine A)" },
  { value: "Logic_BPower", label: "Power B (Engine B)" },
  { value: "Logic_BRepower", label: "Repower B (Engine B)" },
  { value: "Logic_BScalp", label: "Scalp B (Engine B)" },
  { value: "Logic_BStopper", label: "Stopper B (Engine B)" },
  { value: "Logic_BSTO", label: "STO B (Engine B)" },
  { value: "Logic_BSCA", label: "SCA B (Engine B)" },
  { value: "Logic_BRPO", label: "RPO B (Engine B)" },
  { value: "Logic_CPower", label: "Power C (Engine C)" },
  { value: "Logic_CRepower", label: "Repower C (Engine C)" },
  { value: "Logic_CScalp", label: "Scalp C (Engine C)" },
  { value: "Logic_CStopper", label: "Stopper C (Engine C)" },
  { value: "Logic_CSTO", label: "STO C (Engine C)" },
  { value: "Logic_CSCA", label: "SCA C (Engine C)" },
  { value: "Logic_CRPO", label: "RPO C (Engine C)" },
];

// Close targets options
const closeTargetOptions = [
  { value: "Logic_A_Power", label: "A-Power" },
  { value: "Logic_A_Repower", label: "A-Repower" },
  { value: "Logic_A_Scalp", label: "A-Scalp" },
  { value: "Logic_A_Stopper", label: "A-Stopper" },
];

const TRADING_MODES = ["Counter Trend", "Hedge", "Reverse"];
const TRAIL_METHODS = ["Points", "AVG_Percent"];
const TRAIL_STEP_METHODS = ["Step_Points", "Step_Percent"];
const TRAIL_STEP_MODES = [
  "TrailStepMode_Auto",
  "TrailStepMode_Fixed",
  "TrailStepMode_PerOrder",
];
const PARTIAL_MODES = [
  "PartialMode_Low",
  "PartialMode_Mid",
  "PartialMode_Aggressive",
];
const TRIGGER_TYPES = [
  "0 Trigger_Immediate",
  "1 Trigger_AfterBars",
  "2 Trigger_AfterSeconds",
  "3 Trigger_AfterPips",
  "4 Trigger_TimeFilter",
  "5 Trigger_NewsFilter",
];
const ORDER_COUNT_REFS = [
  "Logic_Self",
  "Logic_Power",
  "Logic_Repower",
  "Logic_Scalp",
  "Logic_Stopper",
  "Logic_STO",
  "Logic_SCA",
  "Logic_RPO",
];

// EXACT SAME UI FOR COUNTER TREND AND REVERSE - only difference is Reverse adds 1 field
const CounterTrendAndReverseUI = ({
  localConfig,
  handleChange,
  onChangeMode,
  onDuplicate,
  onReset,
  isReverse,
}: {
  localConfig: LogicConfig;
  handleChange: (field: string, value: any) => void;
  onChangeMode?: (newMode: string) => void;
  onDuplicate?: () => void;
  onReset?: () => void;
  isReverse: boolean;
}) => {
  const [trailLevelsVisible, setTrailLevelsVisible] = useState(
    localConfig.trail_levels || 1,
  );
  const [partialLevelsVisible, setPartialLevelsVisible] = useState(1);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header with Duplicate/Reset */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-white">
          Logic Configuration
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDuplicate}
            disabled={!onDuplicate}
            className="text-xs"
          >
            <Copy className="w-3 h-3 mr-1" />
            Duplicate
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={!onReset}
            className="text-xs"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset
          </Button>
        </div>
      </div>

      {/* Mode Selectors Category */}
      <CategoryCard title="Mode Selectors" icon={Settings2} color="sky">
        {/* Trading Direction */}
        <div className="mb-4 p-3 bg-muted/30 rounded-lg border border-border/50">
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <ArrowLeftRight className="w-3 h-3" />
            Trading Direction
          </div>
          <ToggleGroup
            type="single"
            value={
              localConfig.allow_buy && localConfig.allow_sell
                ? "both"
                : localConfig.allow_buy
                  ? "buy"
                  : localConfig.allow_sell
                    ? "sell"
                    : "buy"
            }
            onValueChange={(val) => {
              if (!val) return;
              if (val === "both") {
                handleChange("allow_buy", true);
                handleChange("allow_sell", true);
              } else if (val === "buy") {
                handleChange("allow_buy", true);
                handleChange("allow_sell", false);
              } else if (val === "sell") {
                handleChange("allow_buy", false);
                handleChange("allow_sell", true);
              }
            }}
            className="flex flex-col sm:flex-row justify-start gap-2 w-full"
          >
            <ToggleGroupItem
              value="buy"
              className="flex-1 h-8 px-3 text-xs data-[state=on]:bg-emerald-500/20 data-[state=on]:text-emerald-500 border border-border/50 data-[state=on]:border-emerald-500/30"
            >
              Buy
            </ToggleGroupItem>
            <ToggleGroupItem
              value="sell"
              className="flex-1 h-8 px-3 text-xs data-[state=on]:bg-rose-500/20 data-[state=on]:text-rose-500 border border-border/50 data-[state=on]:border-rose-500/30"
            >
              Sell
            </ToggleGroupItem>
            <ToggleGroupItem
              value="both"
              className="flex-1 h-8 px-3 text-xs data-[state=on]:bg-blue-500/20 data-[state=on]:text-blue-500 border border-border/50 data-[state=on]:border-blue-500/30"
            >
              Both Sides
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Trading Mode Removed - Parent controls mode. UI is identical. */}
      </CategoryCard>

      {/* Core Category */}
      <CategoryCard title="Core" icon={Layers} color="blue">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <LabeledField label="Initial Lot" hint="lots">
            <Input
              type="number"
              value={localConfig.initial_lot || 0.01}
              onChange={(e) =>
                handleChange("initial_lot", parseFloat(e.target.value))
              }
              step={0.01}
              min={0.01}
              className="bg-background/50"
            />
          </LabeledField>
          <LabeledField label="Last Lot" hint="lots">
            <Input
              type="number"
              value={localConfig.last_lot || 0.12}
              onChange={(e) =>
                handleChange("last_lot", parseFloat(e.target.value))
              }
              step={0.01}
              min={0.01}
              className="bg-background/50"
            />
          </LabeledField>
          {localConfig.logic_name && !localConfig.logic_name.toUpperCase().includes("POWER") && (
            <LabeledField label="Start Level" hint="Order count to start">
              <Input
                type="number"
                value={localConfig.start_level || 0}
                onChange={(e) =>
                  handleChange("start_level", parseInt(e.target.value) || 0)
                }
                step={1}
                min={0}
                max={20}
                className="bg-background/50"
              />
            </LabeledField>
          )}
          {(localConfig.logic_name && localConfig.logic_name.toUpperCase().includes("POWER") && localConfig.engine && localConfig.engine.toUpperCase() !== "A") && (
            <LabeledField label="Start Level" hint="Order count to start">
              <Input
                type="number"
                value={localConfig.start_level || 0}
                onChange={(e) =>
                  handleChange("start_level", parseInt(e.target.value) || 0)
                }
                step={1}
                min={0}
                max={20}
                className="bg-background/50"
              />
            </LabeledField>
          )}
          <LabeledField label="Multiplier">
            <Input
              type="number"
              value={localConfig.multiplier || 1.5}
              onChange={(e) =>
                handleChange("multiplier", parseFloat(e.target.value))
              }
              step={0.1}
              min={1.0}
              className="bg-background/50"
            />
          </LabeledField>
          <div className="flex items-center justify-between pt-5">
            <Label className="text-[11px] font-medium text-muted-foreground">
              Reset Lot
            </Label>
            <Switch
              checked={localConfig.reset_lot_on_restart ?? true}
              onCheckedChange={(checked) =>
                handleChange("reset_lot_on_restart", checked)
              }
            />
          </div>
        </div>
      </CategoryCard>

      {/* Triggers Category */}
      <CategoryCard title="Triggers" icon={Settings2} color="rose">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <LabeledField label="Trigger Type">
            <Select
              value={localConfig.trigger_type || "0 Trigger_Immediate"}
              onValueChange={(val) => handleChange("trigger_type", val)}
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField label="Trigger Bars">
            <Input
              type="number"
              value={localConfig.trigger_bars || 0}
              onChange={(e) =>
                handleChange("trigger_bars", parseInt(e.target.value))
              }
              className="bg-background/50"
            />
          </LabeledField>
          <LabeledField label="Trigger Seconds" hint="sec">
            <Input
              type="number"
              value={localConfig.trigger_seconds || 0}
              onChange={(e) =>
                handleChange("trigger_seconds", parseInt(e.target.value))
              }
              className="bg-background/50"
            />
          </LabeledField>
          <LabeledField label="Trigger Pips" hint="pips">
            <Input
              type="number"
              value={localConfig.trigger_pips || 0}
              onChange={(e) =>
                handleChange("trigger_pips", parseFloat(e.target.value))
              }
              className="bg-background/50"
            />
          </LabeledField>
        </div>
      </CategoryCard>

      {/* Logic Category */}
      <CategoryCard title="Logic" icon={Zap} color="emerald">
        <div className="grid grid-cols-2 gap-4">
          <LabeledField label="Order Count Ref" hint="Reference logic used by Start Level">
            <Select
              value={localConfig.order_count_reference || "Logic_Self"}
              onValueChange={(val) =>
                handleChange("order_count_reference", val)
              }
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_COUNT_REFS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField
            label="Close Targets"
            hint="A-Power, A-Repower, A-Scalp, A-Stopper"
          >
            <Select
              value={localConfig.close_targets || "Logic_A_Power"}
              onValueChange={(val) => handleChange("close_targets", val)}
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {closeTargetOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
        </div>

        {/* REVERSE REFERENCE - ONLY ADDED FIELD FOR REVERSE MODE */}
        {isReverse && (
          <div className="mt-3">
            <LabeledField
              label="Reverse Reference"
              hint="Watch this logic - reverse when it's losing"
            >
              <Select
                value={localConfig.reverse_reference || "Logic_None"}
                onValueChange={(val) => handleChange("reverse_reference", val)}
              >
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Select Reference Logic..." />
                </SelectTrigger>
                <SelectContent>
                  {logicOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabeledField>
          </div>
        )}
      </CategoryCard>

      {/* Grid Category */}
      <CategoryCard title="Grid" icon={ArrowLeftRight} color="indigo">
        <LabeledField label="Grid Spacing" hint="FX: 320 pips">
          <Input
            type="number"
            value={localConfig.grid || 320}
            onChange={(e) => handleChange("grid", parseInt(e.target.value))}
            step={10}
            min={10}
            className="bg-background/50"
          />
        </LabeledField>
      </CategoryCard>

      {/* Trail Category */}
      <CategoryCard title="Trail" icon={ChevronRight} color="purple">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <LabeledField label="Trail Value" hint="FX: 50 pips">
            <Input
              type="number"
              value={localConfig.trail_value || 50}
              onChange={(e) =>
                handleChange("trail_value", parseInt(e.target.value))
              }
              className="bg-background/50"
            />
          </LabeledField>
          <LabeledField label="Trail Start" hint="FX: 20 pips">
            <Input
              type="number"
              value={localConfig.trail_start || 20}
              onChange={(e) =>
                handleChange("trail_start", parseInt(e.target.value))
              }
              className="bg-background/50"
            />
          </LabeledField>
          <LabeledField label="Trail Step" hint="FX: 10 pips">
            <Input
              type="number"
              value={localConfig.trail_step || 10}
              onChange={(e) =>
                handleChange("trail_step", parseInt(e.target.value))
              }
              className="bg-background/50"
            />
          </LabeledField>
          <LabeledField label="Trail Method">
            <Select
              value={localConfig.trail_method || "Points"}
              onValueChange={(val) => handleChange("trail_method", val)}
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRAIL_METHODS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
        </div>
        <div className="grid grid-cols-1 gap-4 mt-4">
          <LabeledField label="Trail Step Method">
            <Select
              value={localConfig.trail_step_method || "Step_Points"}
              onValueChange={(val) => handleChange("trail_step_method", val)}
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRAIL_STEP_METHODS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
        </div>
      </CategoryCard>

      {/* Trail Advanced Category */}
      <CategoryCard
        title="Trail Advanced"
        icon={Settings2}
        color="fuchsia"
        rightContent={
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground">Levels:</span>
            <select
              className="text-[10px] bg-background/80 border border-border/50 rounded px-1.5 py-0.5 cursor-pointer hover:border-primary/50 transition-colors"
              value={trailLevelsVisible}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setTrailLevelsVisible(val);
                handleChange("trail_levels", val);
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowAdvancedFields(!showAdvancedFields)}
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
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <LabeledField label="Trail Step Mode">
            <Select
              value={localConfig.trail_step_mode || "TrailStepMode_Auto"}
              onValueChange={(val) => handleChange("trail_step_mode", val)}
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRAIL_STEP_MODES.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField label="Trail Step Cycle">
            <Input
              type="number"
              value={localConfig.trail_step_cycle || 1}
              onChange={(e) =>
                handleChange("trail_step_cycle", parseInt(e.target.value))
              }
              className="bg-background/50"
            />
          </LabeledField>
        </div>
      </CategoryCard>

      {/* Close Partial Category */}
      <CategoryCard
        title="Close Partial"
        icon={RefreshCw}
        color="cyan"
        rightContent={
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground">Partials:</span>
            <select
              className="text-[10px] bg-background/80 border border-border/50 rounded px-1.5 py-0.5 cursor-pointer hover:border-primary/50 transition-colors"
              value={partialLevelsVisible}
              onChange={(e) =>
                setPartialLevelsVisible(parseInt(e.target.value))
              }
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-medium text-muted-foreground">
              Close Partial
            </Label>
            <Switch
              checked={localConfig.partial_close || false}
              onCheckedChange={(checked) =>
                handleChange("partial_close", checked)
              }
            />
          </div>
          <LabeledField label="Partial Mode">
            <Select
              value={localConfig.partial_mode || "PartialMode_Mid"}
              onValueChange={(val) => handleChange("partial_mode", val)}
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTIAL_MODES.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField label="Partial Profit Threshold">
            <Input
              type="number"
              value={localConfig.partial_profit_threshold || 0}
              onChange={(e) =>
                handleChange(
                  "partial_profit_threshold",
                  parseFloat(e.target.value) || 0,
                )
              }
              className="bg-background/50"
            />
          </LabeledField>
        </div>
      </CategoryCard>

      {/* TPSL Category */}
      <CategoryCard title="TPSL" icon={Shield} color="amber">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="flex items-center justify-between pt-5">
            <Label className="text-[11px] font-medium text-muted-foreground">
              Use TP
            </Label>
            <Switch
              checked={localConfig.use_tp ?? false}
              onCheckedChange={(checked) => handleChange("use_tp", checked)}
            />
          </div>
          <LabeledField label="TP Mode">
            <Select
              value={localConfig.tp_mode || "TPSL_Points"}
              onValueChange={(val) => handleChange("tp_mode", val)}
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TPSL_Points">Points</SelectItem>
                <SelectItem value="TPSL_Percent">Percent</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField label="TP Value">
            <Input
              type="number"
              value={localConfig.tp_value || 0}
              onChange={(e) =>
                handleChange("tp_value", parseFloat(e.target.value))
              }
              className="bg-background/50"
            />
          </LabeledField>
          <div className="flex items-center justify-between pt-5">
            <Label className="text-[11px] font-medium text-muted-foreground">
              Use SL
            </Label>
            <Switch
              checked={localConfig.use_sl ?? false}
              onCheckedChange={(checked) => handleChange("use_sl", checked)}
            />
          </div>
          <LabeledField label="SL Mode">
            <Select
              value={localConfig.sl_mode || "TPSL_Points"}
              onValueChange={(val) => handleChange("sl_mode", val)}
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TPSL_Points">Points</SelectItem>
                <SelectItem value="TPSL_Percent">Percent</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField label="SL Value">
            <Input
              type="number"
              value={localConfig.sl_value || 0}
              onChange={(e) =>
                handleChange("sl_value", parseFloat(e.target.value))
              }
              className="bg-background/50"
            />
          </LabeledField>
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground/80">
          Trail and TP/SL can run together. The first trigger hit closes.
          For dummy broker protection, keep TP/SL ON with far values.
        </p>
      </CategoryCard>
    </div>
  );
};

export const LogicConfigPanel = ({
  mode,
  config,
  onChange,
  onChangeMode,
  onDuplicate,
  onReset,
  logicType,
  engine,
  group,
}: LogicConfigPanelProps) => {
  const [localConfig, setLocalConfig] = useState(config);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleChange = (field: string, value: any) => {
    const newConfig = { ...localConfig, [field]: value };
    setLocalConfig(newConfig);
    onChange(field, value);
  };

  // HEDGE MODE - Minimal UI
  if (mode === "hedge") {
    return (
      <div className="space-y-6 p-6 bg-slate-900/50 rounded-xl border border-blue-500/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">Hedge</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Cancel Hedge and revert to Counter Trend
              handleChange("trading_mode", "Counter Trend");
              handleChange("hedge_enabled", false);
              if (onChangeMode) {
                onChangeMode("counter_trend");
              }
            }}
            className="text-slate-400 hover:text-white hover:bg-slate-800"
          >
            Cancel
          </Button>
        </div>

        <div className="space-y-4">
          <LabeledField
            label="Hedge Reference"
            hint="The logic to hedge against"
          >
            <Select
              value={localConfig.hedge_reference || "Logic_None"}
              onValueChange={(val) => handleChange("hedge_reference", val)}
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Select reference logic..." />
              </SelectTrigger>
              <SelectContent>
                {logicOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>

          <LabeledField label="Hedge Scale" hint="Lot size as % of reference">
            <div className="flex items-center gap-3">
              <Input
                type="number"
                value={localConfig.hedge_scale || 50}
                onChange={(e) =>
                  handleChange("hedge_scale", parseFloat(e.target.value))
                }
                className="bg-background/50"
              />
              <span className="text-sm text-muted-foreground w-12 text-right">
                %
              </span>
            </div>
          </LabeledField>

        </div>
      </div>
    );
  }

  // COUNTER TREND MODE - Standard UI
  if (mode === "counter_trend") {
    return (
      <CounterTrendAndReverseUI
        localConfig={localConfig}
        handleChange={handleChange}
        onChangeMode={onChangeMode}
        onDuplicate={onDuplicate}
        onReset={onReset}
        isReverse={false}
      />
    );
  }

  // REVERSE MODE - COPY OF COUNTER TREND WITH NAME CHANGE + Reverse Reference
  if (mode === "reverse") {
    return (
      <CounterTrendAndReverseUI
        localConfig={localConfig}
        handleChange={handleChange}
        onChangeMode={onChangeMode}
        onDuplicate={onDuplicate}
        onReset={onReset}
        isReverse={true}
      />
    );
  }

  // Default fallback
  return (
    <CounterTrendAndReverseUI
      localConfig={localConfig}
      handleChange={handleChange}
      onChangeMode={onChangeMode}
      onDuplicate={onDuplicate}
      onReset={onReset}
      isReverse={false}
    />
  );
};

export default LogicConfigPanel;

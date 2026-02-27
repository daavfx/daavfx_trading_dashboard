import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Grid3X3,
  ChevronDown,
  ChevronRight,
  Calculator,
  Copy,
  ArrowDown,
  ArrowRight,
  Wand2,
  Table,
  RotateCcw,
  Play,
  X,
  Check,
  Info,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useMTConfig } from "@/hooks/useMTConfig";
import type { MTConfig } from "@/types/mt-config";
import { toast } from "sonner";

interface GridBatchEditorProps {
  selectedEngines: string[];
  selectedGroups: string[];
  selectedLogics: string[];
}

const availableInputs = [
  { id: "grid_level", label: "Grid Level", type: "number", category: "Grid" },
  { id: "lot_size", label: "Lot Size", type: "number", category: "Lots" },
  { id: "take_profit", label: "Take Profit", type: "number", category: "TP/SL" },
  { id: "stop_loss", label: "Stop Loss", type: "number", category: "TP/SL" },
  { id: "multiplier", label: "Multiplier", type: "number", category: "Grid" },
  { id: "trail_start", label: "Trail Start", type: "number", category: "Trail" },
  { id: "trail_step", label: "Trail Step", type: "number", category: "Trail" },
  { id: "max_orders", label: "Max Orders", type: "number", category: "Orders" },
  { id: "distance", label: "Distance", type: "number", category: "Grid" },
  { id: "pip_step", label: "Pip Step", type: "number", category: "Grid" },
];

const FORMULA_PRESETS = [
  { id: "linear", label: "Linear +N", formula: "start + (row * step)", example: "600, 700, 800..." },
  { id: "exponential", label: "Exponential", formula: "start * (multiplier ^ row)", example: "100, 120, 144..." },
  { id: "fibonacci", label: "Fibonacci", formula: "fib(row) * base", example: "1, 1, 2, 3, 5..." },
  { id: "percentage", label: "Percentage", formula: "base + (base * rate * row)", example: "+10% each" },
  { id: "custom", label: "Custom Formula", formula: "", example: "Your formula" },
];

const mtPlatformFixed = "MT4" as const;

export function GridBatchEditor({
  selectedEngines,
  selectedGroups,
  selectedLogics,
}: GridBatchEditorProps) {
  const [selectedInput, setSelectedInput] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [activeFormula, setActiveFormula] = useState("linear");
  const [formulaParams, setFormulaParams] = useState({
    start: 600,
    step: 100,
    multiplier: 1.2,
    base: 100,
    rate: 0.1,
    custom: "(row + 1) * 100",
  });
  const [gridValues, setGridValues] = useState<Record<string, Record<string, number>>>({});
  const [previewMode, setPreviewMode] = useState(false);

  // Get config and save function
  const { config, saveConfig } = useMTConfig(mtPlatformFixed);

  const filteredInputs = useMemo(() => {
    return availableInputs.filter(
      (input) =>
        input.label.toLowerCase().includes(searchInput.toLowerCase()) ||
        input.category.toLowerCase().includes(searchInput.toLowerCase())
    );
  }, [searchInput]);

  const groupedInputs = useMemo(() => {
    return filteredInputs.reduce((acc, input) => {
      if (!acc[input.category]) acc[input.category] = [];
      acc[input.category].push(input);
      return acc;
    }, {} as Record<string, typeof availableInputs>);
  }, [filteredInputs]);

  const rows = useMemo(() => {
    const items: { type: string; engine: string; group: string; logic: string; label: string }[] = [];
    selectedEngines.forEach((engine) => {
      selectedGroups.forEach((group) => {
        selectedLogics.forEach((logic) => {
          items.push({
            type: "cell",
            engine,
            group,
            logic,
            label: `${engine} / ${group} / ${logic}`,
          });
        });
      });
    });
    return items;
  }, [selectedEngines, selectedGroups, selectedLogics]);

  const safeEvalCustomFormula = (expr: string, rowIndex: number): number => {
    const SAFE_FUNCS: Record<string, (...args: number[]) => number> = {
      abs: Math.abs,
      max: Math.max,
      min: Math.min,
      round: Math.round,
      floor: Math.floor,
      ceil: Math.ceil,
      pow: Math.pow,
      sqrt: Math.sqrt,
      log: Math.log,
      exp: Math.exp,
    };

    const sanitized = expr.replace(/[^-+/*%^()0-9., a-zA-Z_]/g, "");
    const tokens = sanitized.split(/([^a-zA-Z0-9_]+)/).filter(Boolean);

    const rebuilt = tokens
      .map((t) => {
        if (t === "row") return String(rowIndex);
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) {
          if (t in SAFE_FUNCS) return `__f.${t}`;
          if (t === "Math") return "";
          return "";
        }
        return t;
      })
      .join("");

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function("__row", "__f", `return (${rebuilt});`);
      const result = fn(rowIndex, SAFE_FUNCS);
      return typeof result === "number" && isFinite(result) ? result : 0;
    } catch {
      return 0;
    }
  };

  const calculatePreview = () => {
    const preset = FORMULA_PRESETS.find((p) => p.id === activeFormula);
    const newValues: Record<string, number> = {};

    rows.forEach((row, index) => {
      const key = row.label;
      let value = 0;

      switch (activeFormula) {
        case "linear":
          value = formulaParams.start + index * formulaParams.step;
          break;
        case "exponential":
          value = Math.round(formulaParams.base * Math.pow(formulaParams.multiplier, index));
          break;
        case "fibonacci":
          const fib = (n: number): number => (n <= 1 ? 1 : fib(n - 1) + fib(n - 2));
          value = fib(index) * formulaParams.base;
          break;
        case "percentage":
          value = Math.round(formulaParams.base * (1 + formulaParams.rate * index));
          break;
        case "custom":
          value = safeEvalCustomFormula(formulaParams.custom, index);
          break;
      }
      // Ensure we don't get NaN or Infinity
      if (!isFinite(value)) value = 0;
      // Round to 2 decimal places max for cleanliness
      value = Math.round(value * 100) / 100;
      
      newValues[key] = value;
    });

    if (selectedInput) {
      setGridValues((prev) => ({
        ...prev,
        [selectedInput]: newValues,
      }));
    }
    setPreviewMode(true);
  };

  const applyChanges = async () => {
    if (!config || !selectedInput) {
      toast.error("Configuration not loaded or no input selected");
      return;
    }

    const currentValues = gridValues[selectedInput];
    if (!currentValues) {
      toast.error("No values calculated to apply");
      return;
    }

    try {
      // Deep clone config to avoid mutation issues
      const newConfig = JSON.parse(JSON.stringify(config)) as MTConfig;
      let updateCount = 0;

      rows.forEach((row) => {
        const newValue = currentValues[row.label];
        if (newValue === undefined) return;

        // Parse IDs
        // engine: "Engine A" -> "A"
        const engineId = row.engine.replace("Engine ", "") as "A" | "B" | "C";
        // group: "Group 1" -> 1
        const groupNum = parseInt(row.group.replace("Group ", ""));
        // logic: "POWER" -> "POWER"
        const logicName = row.logic;

        const engine = newConfig.engines.find(e => e.engine_id === engineId);
        if (engine) {
          const group = engine.groups.find(g => g.group_number === groupNum);
          if (group) {
            const logic = group.logics.find(l => l.logic_name === logicName);
            if (logic) {
              // Update the specific field
              // We need to cast to any because logic config keys are dynamic strings
              (logic as any)[selectedInput] = newValue;
              updateCount++;
            }
          }
        }
      });

      if (updateCount > 0) {
        await saveConfig(newConfig);
        toast.success(`Updated ${selectedInput} for ${updateCount} logics`);
        setPreviewMode(false);
      } else {
        toast.warning("No matching logics found to update");
      }
    } catch (error) {
      console.error("Failed to apply batch updates:", error);
      toast.error("Failed to apply updates");
    }
  };

  const resetGrid = () => {
    if (selectedInput) {
      setGridValues((prev) => {
        const newValues = { ...prev };
        delete newValues[selectedInput];
        return newValues;
      });
    }
    setPreviewMode(false);
  };

  const copyDown = (fromIndex: number) => {
    if (!selectedInput || !gridValues[selectedInput]) return;
    const sourceValue = gridValues[selectedInput][rows[fromIndex].label];
    const newValues = { ...gridValues[selectedInput] };
    rows.slice(fromIndex + 1).forEach((row) => {
      newValues[row.label] = sourceValue;
    });
    setGridValues((prev) => ({ ...prev, [selectedInput]: newValues }));
  };

  const copyRight = () => {
    // Copy current input values to next input
    // console.log("Copy to next input");
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Grid3X3 className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">Select engines, groups, and logics to start batch editing</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-primary/10">
            <Grid3X3 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-medium">Grid Batch Editor</h3>
            <p className="text-[10px] text-muted-foreground">
              {rows.length} combinations selected
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {previewMode && (
            <span className="text-[10px] px-2 py-1 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20">
              Preview Mode
            </span>
          )}
        </div>
      </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left: Input Selector */}
        <div className="col-span-4 space-y-3">
          <div className="text-xs text-muted-foreground mb-2">1. Select Input</div>
          
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search inputs..."
            className="h-8 text-xs"
          />

          <div className="border border-border/40 rounded bg-card/20 max-h-[300px] overflow-y-auto">
            {Object.entries(groupedInputs).map(([category, inputs]) => (
              <div key={category}>
                <div className="px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wide bg-muted/20 sticky top-0">
                  {category}
                </div>
                {inputs.map((input) => (
                  <button
                    key={input.id}
                    onClick={() => setSelectedInput(input.id)}
                    className={cn(
                      "w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-muted/30 transition-colors",
                      selectedInput === input.id && "bg-primary/10 text-primary"
                    )}
                  >
                    {input.label}
                    {selectedInput === input.id && <Check className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Formula & Grid */}
        <div className="col-span-8 space-y-4">
          {selectedInput ? (
            <>
              {/* Formula Selector */}
              <div>
                <div className="text-xs text-muted-foreground mb-2">2. Choose Formula</div>
                <Tabs value={activeFormula} onValueChange={setActiveFormula}>
                  <TabsList className="grid grid-cols-5 h-8">
                    {FORMULA_PRESETS.map((preset) => (
                      <TabsTrigger key={preset.id} value={preset.id} className="text-[10px]">
                        {preset.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <div className="mt-3 p-3 border border-border/40 rounded bg-card/20">
                    {activeFormula === "linear" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-muted-foreground">Start Value</label>
                          <Input
                            type="number"
                            value={formulaParams.start}
                            onChange={(e) => setFormulaParams({ ...formulaParams, start: Number(e.target.value) })}
                            className="h-8 text-xs mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Step (+)</label>
                          <Input
                            type="number"
                            value={formulaParams.step}
                            onChange={(e) => setFormulaParams({ ...formulaParams, step: Number(e.target.value) })}
                            className="h-8 text-xs mt-1"
                          />
                        </div>
                      </div>
                    )}

                    {activeFormula === "exponential" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-muted-foreground">Base Value</label>
                          <Input
                            type="number"
                            value={formulaParams.base}
                            onChange={(e) => setFormulaParams({ ...formulaParams, base: Number(e.target.value) })}
                            className="h-8 text-xs mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Multiplier (×)</label>
                          <Input
                            type="number"
                            step="0.1"
                            value={formulaParams.multiplier}
                            onChange={(e) => setFormulaParams({ ...formulaParams, multiplier: Number(e.target.value) })}
                            className="h-8 text-xs mt-1"
                          />
                        </div>
                      </div>
                    )}

                    {activeFormula === "fibonacci" && (
                      <div>
                        <label className="text-[10px] text-muted-foreground">Base Multiplier</label>
                        <Input
                          type="number"
                          value={formulaParams.base}
                          onChange={(e) => setFormulaParams({ ...formulaParams, base: Number(e.target.value) })}
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                    )}

                    {activeFormula === "percentage" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-muted-foreground">Base Value</label>
                          <Input
                            type="number"
                            value={formulaParams.base}
                            onChange={(e) => setFormulaParams({ ...formulaParams, base: Number(e.target.value) })}
                            className="h-8 text-xs mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Rate (%)</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={formulaParams.rate}
                            onChange={(e) => setFormulaParams({ ...formulaParams, rate: Number(e.target.value) })}
                            className="h-8 text-xs mt-1"
                          />
                        </div>
                      </div>
                    )}

                    {activeFormula === "custom" && (
                      <div>
                        <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                          Formula (use "row" for index)
                          <Info className="w-3 h-3" />
                        </label>
                        <Input
                          value={formulaParams.custom}
                          onChange={(e) => setFormulaParams({ ...formulaParams, custom: e.target.value })}
                          placeholder="(row + 1) * 100"
                          className="h-8 text-xs mt-1 font-mono"
                        />
                        <p className="text-[9px] text-muted-foreground mt-1">
                          Examples: row * 50, (row + 1) * 100, Math.pow(2, row)
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
                      <Button size="sm" variant="outline" onClick={calculatePreview} className="h-7 text-xs gap-1">
                        <Wand2 className="w-3 h-3" />
                        Preview
                      </Button>
                      <Button size="sm" variant="outline" onClick={resetGrid} className="h-7 text-xs gap-1">
                        <RotateCcw className="w-3 h-3" />
                        Reset
                      </Button>
                    </div>
                  </div>
                </Tabs>
              </div>

              {/* Grid Preview */}
              <div>
                <div className="text-xs text-muted-foreground mb-2">3. Review & Apply</div>
                <div className="border border-border/40 rounded overflow-hidden">
                  {/* Grid Header */}
                  <div className="grid grid-cols-12 bg-muted/30 text-[10px] text-muted-foreground">
                    <div className="col-span-1 p-2 border-r border-border/30">#</div>
                    <div className="col-span-7 p-2 border-r border-border/30">Location</div>
                    <div className="col-span-3 p-2 border-r border-border/30">Value</div>
                    <div className="col-span-1 p-2"></div>
                  </div>

                  {/* Grid Rows */}
                  <div className="max-h-[200px] overflow-y-auto">
                    {rows.map((row, idx) => {
                      const value = gridValues[selectedInput]?.[row.label] ?? "-";
                      return (
                        <div
                          key={row.label}
                          className="grid grid-cols-12 text-xs border-b border-border/20 hover:bg-muted/10"
                        >
                          <div className="col-span-1 p-2 text-muted-foreground border-r border-border/20">
                            {idx + 1}
                          </div>
                          <div className="col-span-7 p-2 border-r border-border/20 truncate">
                            {row.label}
                          </div>
                          <div className="col-span-3 p-2 border-r border-border/20">
                            {previewMode ? (
                              <Input
                                type="number"
                                value={value}
                                onChange={(e) => {
                                  const newValues = { ...gridValues[selectedInput] };
                                  newValues[row.label] = Number(e.target.value);
                                  setGridValues((prev) => ({ ...prev, [selectedInput]: newValues }));
                                }}
                                className="h-6 text-xs px-1"
                              />
                            ) : (
                              <span className="font-mono">{value}</span>
                            )}
                          </div>
                          <div className="col-span-1 p-2 flex items-center justify-center">
                            <button
                              onClick={() => copyDown(idx)}
                              className="text-muted-foreground hover:text-foreground"
                              title="Copy down"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Apply Actions */}
                {previewMode && (
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => setPreviewMode(false)} className="h-7 text-xs">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={applyChanges} className="h-7 text-xs gap-1">
                      <Check className="w-3 h-3" />
                      Apply Changes
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border/40 rounded">
              <Table className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">Select an input from the left to start editing</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

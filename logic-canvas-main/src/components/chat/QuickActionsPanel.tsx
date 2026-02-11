// Ryiuk 2.0 - Quick Actions Panel
// Visual toolbar with one-click operations, stress tests, and batch variations

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Zap, FlaskConical, Layers, Copy, Settings2, AlertTriangle,
  ChevronDown, ChevronUp, Play, Download, RefreshCw, 
  TrendingUp, TrendingDown, Shuffle, Target, Shield, Calculator, Wand2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  QUICK_ACTIONS,
  STRESS_TEST_PRESETS,
  FORMULA_PRESETS,
  applyStressTest,
  applyFormula,
  generateVariations,
  validateConfig,
  extractParameterMatrix,
  savePreset,
  loadAllPresets,
  deletePreset,
  type QuickAction,
  type StressTestPreset,
  type GeneratedVariation,
  type ValidationWarning,
  type ParameterMatrixRow,
  type ConfigPreset
} from "@/lib/chat/ryiuk-engine";
import type { MTConfig } from "@/types/mt-config";

interface QuickActionsProps {
  config: MTConfig | null;
  onConfigChange: (config: MTConfig) => void;
  onMessage?: (message: string) => void;
}

type ActiveTab = "actions" | "stress" | "variations" | "presets" | "matrix" | "formulas";

const RISK_COLORS = {
  low: "bg-green-500/20 text-green-400 border-green-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  extreme: "bg-red-500/20 text-red-400 border-red-500/30"
};

export function QuickActionsPanel({ config, onConfigChange, onMessage }: QuickActionsProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("actions");
  const [expanded, setExpanded] = useState(true);
  const [selectedGroups, setSelectedGroups] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8]);
  const [variations, setVariations] = useState<GeneratedVariation[]>([]);
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);
  const [presets, setPresets] = useState<ConfigPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState("");
  
  // Formula state
  const [activeFormula, setActiveFormula] = useState("linear");
  const [formulaField, setFormulaField] = useState("grid");
  const [formulaParams, setFormulaParams] = useState({
    start: 500,
    step: 100,
    multiplier: 1.2,
    base: 100,
    rate: 0.1,
    custom: "(row + 1) * 100",
  });

  // Load presets on mount
  useEffect(() => {
    setPresets(loadAllPresets());
  }, []);
  
  // Variation generator state
  const [varField, setVarField] = useState("grid");
  const [varMin, setVarMin] = useState(200);
  const [varMax, setVarMax] = useState(1000);
  const [varCount, setVarCount] = useState(5);

  const tabs = [
    { id: "actions" as const, label: "Quick", icon: Zap },
    { id: "stress" as const, label: "Stress", icon: FlaskConical },
    { id: "formulas" as const, label: "Formulas", icon: Calculator },
    { id: "variations" as const, label: "Batch", icon: Layers },
    { id: "presets" as const, label: "Presets", icon: Copy },
    { id: "matrix" as const, label: "Matrix", icon: Settings2 }
  ];

  const handleQuickAction = (action: QuickAction) => {
    if (!config) return;
    
    const result = action.execute(config, { 
      groups: selectedGroups,
      value: action.params?.[0]?.default
    });
    
    if (result.success && result.newConfig) {
      onConfigChange(result.newConfig);
      onMessage?.(`✅ ${result.message}`);
      
      // Update warnings
      setWarnings(validateConfig(result.newConfig));
    }
  };

  const handleStressTest = (preset: StressTestPreset) => {
    if (!config) return;
    
    const result = applyStressTest(config, preset);
    
    if (result.success && result.newConfig) {
      onConfigChange(result.newConfig);
      onMessage?.(`⚡ ${result.message}`);
      setWarnings(validateConfig(result.newConfig));
    }
  };

  const handleGenerateVariations = () => {
    if (!config) return;
    
    const generated = generateVariations(config, [{
      field: varField,
      min: varMin,
      max: varMax,
      distribution: "linear",
      groups: selectedGroups
    }], varCount);
    
    setVariations(generated);
    onMessage?.(`📦 Generated ${generated.length} variations for ${varField}`);
  };

  const handleApplyVariation = (variation: GeneratedVariation) => {
    onConfigChange(variation.config);
    onMessage?.(`✅ Applied ${variation.name}`);
    setWarnings(validateConfig(variation.config));
  };

  const handleApplyFormula = () => {
    if (!config) return;
    const result = applyFormula(config, activeFormula, formulaParams, formulaField, selectedGroups);
    if (result.success && result.newConfig) {
      onConfigChange(result.newConfig);
      
      let msg = `✨ ${result.message}`;
      if (result.changes && result.changes.length > 0) {
        const preview = result.changes.slice(0, 5).map(c => `G${c.group}=${c.newValue}`).join(", ");
        const more = result.changes.length > 5 ? `... (+${result.changes.length - 5} more)` : "";
        msg += `\nValues: ${preview}${more}`;
      }
      
      onMessage?.(msg);
      setWarnings(validateConfig(result.newConfig));
    }
  };

  const handleSavePreset = () => {
    if (!config || !newPresetName.trim()) return;
    
    const preset = savePreset(config, newPresetName.trim(), `Saved on ${new Date().toLocaleDateString()}`);
    setPresets(loadAllPresets());
    setNewPresetName("");
    onMessage?.(`💾 Saved preset: ${preset.name}`);
  };

  const handleLoadPreset = (preset: ConfigPreset) => {
    onConfigChange(preset.config);
    onMessage?.(`📂 Loaded preset: ${preset.name}`);
    setWarnings(validateConfig(preset.config));
  };

  const handleDeletePreset = (id: string) => {
    deletePreset(id);
    setPresets(loadAllPresets());
    onMessage?.(`🗑️ Deleted preset`);
  };

  const toggleGroup = (group: number) => {
    setSelectedGroups(prev => 
      prev.includes(group) 
        ? prev.filter(g => g !== group)
        : [...prev, group].sort((a, b) => a - b)
    );
  };

  const renderFormulaContent = () => (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-muted/20 border border-border/40 space-y-3">
        <div className="text-xs font-medium">Formula Settings</div>
        
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Type</label>
            <Select value={activeFormula} onValueChange={setActiveFormula}>
              <SelectTrigger className="h-7 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMULA_PRESETS.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground">Target Field</label>
            <Select value={formulaField} onValueChange={setFormulaField}>
              <SelectTrigger className="h-7 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grid">Grid Distance</SelectItem>
                <SelectItem value="initial_lot">Lot Size</SelectItem>
                <SelectItem value="multiplier">Multiplier</SelectItem>
                <SelectItem value="trail_value">Trail Value</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {activeFormula === "custom" && (
           <div>
            <label className="text-[10px] text-muted-foreground">Expression</label>
            <Input 
              value={formulaParams.custom}
              onChange={(e) => setFormulaParams({...formulaParams, custom: e.target.value})}
              className="h-7 text-xs mt-1 font-mono"
              placeholder="(row + 1) * 100"
            />
          </div>
        )}
        
        <Button 
          onClick={handleApplyFormula} 
          disabled={!config}
          className="w-full h-7 text-xs mt-2"
        >
          <Wand2 className="w-3.5 h-3.5 mr-1.5" />
          Apply Formula
        </Button>
      </div>
    </div>
  );

  const matrix = config ? extractParameterMatrix(config) : [];

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 p-3 bg-primary/20 border border-primary/30 rounded-lg hover:bg-primary/30 transition-colors z-50"
      >
        <Zap className="w-5 h-5 text-primary" />
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-lg shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold">Ryiuk Quick Actions</span>
          {warnings.length > 0 && (
            <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-400 border-orange-500/30">
              {warnings.length} warnings
            </Badge>
          )}
        </div>
        <button 
          onClick={() => setExpanded(false)}
          className="p-1 hover:bg-muted rounded"
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
              activeTab === tab.id 
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Group Selector */}
      <div className="px-3 py-2 border-b border-border/50">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Target Groups</div>
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: 10 }, (_, i) => i + 1).map(g => (
            <button
              key={g}
              onClick={() => toggleGroup(g)}
              className={cn(
                "w-6 h-6 text-[10px] font-medium rounded transition-colors",
                selectedGroups.includes(g)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              )}
            >
              {g}
            </button>
          ))}
          <button
            onClick={() => setSelectedGroups([1,2,3,4,5,6,7,8,9,10])}
            className="px-2 h-6 text-[10px] font-medium rounded bg-muted/30 text-muted-foreground hover:bg-muted/50"
          >
            All
          </button>
          <button
            onClick={() => setSelectedGroups([])}
            className="px-2 h-6 text-[10px] font-medium rounded bg-muted/30 text-muted-foreground hover:bg-muted/50"
          >
            None
          </button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="h-[35vh] min-h-[200px] max-h-[500px]">
        <div className="p-3">
          {/* Quick Actions Tab */}
          {activeTab === "actions" && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action)}
                  disabled={!config}
                  className="flex flex-col items-start p-2.5 rounded-lg bg-muted/20 border border-border/40 hover:border-primary/40 hover:bg-muted/40 transition-colors text-left disabled:opacity-50"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{action.icon}</span>
                    <span className="text-xs font-medium">{action.label}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground line-clamp-2">
                    {action.description}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Stress Tests Tab */}
          {activeTab === "stress" && (
            <div className="space-y-2">
              {STRESS_TEST_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => handleStressTest(preset)}
                  disabled={!config}
                  className="w-full flex items-start gap-3 p-2.5 rounded-lg bg-muted/20 border border-border/40 hover:border-primary/40 hover:bg-muted/40 transition-colors text-left disabled:opacity-50"
                >
                  <span className="text-xl mt-0.5">{preset.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium">{preset.name}</span>
                      <Badge 
                        variant="outline" 
                        className={cn("text-[9px] px-1.5 py-0", RISK_COLORS[preset.riskLevel])}
                      >
                        {preset.riskLevel}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground line-clamp-1">
                      {preset.description}
                    </span>
                  </div>
                  <Play className="w-3.5 h-3.5 text-muted-foreground mt-1" />
                </button>
              ))}
            </div>
          )}

          {activeTab === "formulas" && renderFormulaContent()}

          {/* Batch Variations Tab */}
          {activeTab === "variations" && (
            <div className="space-y-3">
              {/* Generator Controls */}
              <div className="p-3 rounded-lg bg-muted/20 border border-border/40 space-y-3">
                <div className="text-xs font-medium">Generate Variations</div>
                
                <div className="grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Field</label>
                    <select 
                      value={varField}
                      onChange={(e) => setVarField(e.target.value)}
                      className="w-full mt-1 h-7 text-xs bg-background border border-border rounded px-2"
                    >
                      <option value="grid">Grid</option>
                      <option value="initial_lot">Lot Size</option>
                      <option value="multiplier">Multiplier</option>
                      <option value="trail_value">Trail Value</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Count</label>
                    <Input
                      type="number"
                      value={varCount}
                      onChange={(e) => setVarCount(parseInt(e.target.value) || 5)}
                      min={2}
                      max={20}
                      className="mt-1 h-7 text-xs"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Min</label>
                    <Input
                      type="number"
                      value={varMin}
                      onChange={(e) => setVarMin(parseFloat(e.target.value) || 0)}
                      className="mt-1 h-7 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Max</label>
                    <Input
                      type="number"
                      value={varMax}
                      onChange={(e) => setVarMax(parseFloat(e.target.value) || 0)}
                      className="mt-1 h-7 text-xs"
                    />
                  </div>
                </div>
                
                <Button
                  onClick={handleGenerateVariations}
                  disabled={!config}
                  size="sm"
                  className="w-full h-7 text-xs"
                >
                  <Shuffle className="w-3.5 h-3.5 mr-1.5" />
                  Generate {varCount} Variations
                </Button>
              </div>

              {/* Generated Variations */}
              {variations.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Generated Sets</span>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]">
                      <Download className="w-3 h-3 mr-1" />
                      Export All
                    </Button>
                  </div>
                  {variations.map(v => (
                    <div 
                      key={v.id}
                      className="flex items-center justify-between p-2 rounded bg-muted/20 border border-border/40"
                    >
                      <div>
                        <div className="text-xs font-medium">{v.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {varField}: {v.parameterValues[varField]}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => handleApplyVariation(v)}
                        >
                          Apply
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Presets Tab */}
          {activeTab === "presets" && (
            <div className="space-y-3">
              {/* Save New Preset */}
              <div className="p-3 rounded-lg bg-muted/20 border border-border/40 space-y-2">
                <div className="text-xs font-medium">Save Current Config</div>
                <div className="flex gap-2">
                  <Input
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Preset name..."
                    className="h-7 text-xs flex-1"
                  />
                  <Button
                    onClick={handleSavePreset}
                    disabled={!config || !newPresetName.trim()}
                    size="sm"
                    className="h-7 text-xs px-3"
                  >
                    Save
                  </Button>
                </div>
              </div>

              {/* Saved Presets */}
              {presets.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No saved presets yet
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium">Saved Presets ({presets.length})</div>
                  {presets.map(preset => (
                    <div 
                      key={preset.id}
                      className="flex items-center justify-between p-2 rounded bg-muted/20 border border-border/40 group hover:border-primary/30"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{preset.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(preset.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => handleLoadPreset(preset)}
                        >
                          Load
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] hover:text-red-400"
                          onClick={() => handleDeletePreset(preset.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Parameter Matrix Tab */}
          {activeTab === "matrix" && (
            <div className="space-y-2">
              {matrix.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Load a config to see parameter matrix
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-1.5 px-2 text-left font-medium text-muted-foreground">G#</th>
                        <th className="py-1.5 px-2 text-center font-medium text-muted-foreground" colSpan={2}>Power</th>
                        <th className="py-1.5 px-2 text-center font-medium text-muted-foreground" colSpan={2}>Repower</th>
                        <th className="py-1.5 px-2 text-center font-medium text-muted-foreground" colSpan={2}>Scalper</th>
                      </tr>
                      <tr className="border-b border-border/50">
                        <th></th>
                        <th className="py-1 px-1 text-[9px] text-muted-foreground/60">Grid</th>
                        <th className="py-1 px-1 text-[9px] text-muted-foreground/60">Lot</th>
                        <th className="py-1 px-1 text-[9px] text-muted-foreground/60">Grid</th>
                        <th className="py-1 px-1 text-[9px] text-muted-foreground/60">Lot</th>
                        <th className="py-1 px-1 text-[9px] text-muted-foreground/60">Grid</th>
                        <th className="py-1 px-1 text-[9px] text-muted-foreground/60">Lot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.map(row => (
                        <tr key={row.group} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="py-1.5 px-2 font-medium">{row.group}</td>
                          <td className="py-1.5 px-1 text-center font-mono">{row.power.grid}</td>
                          <td className="py-1.5 px-1 text-center font-mono text-green-400">{row.power.lot}</td>
                          <td className="py-1.5 px-1 text-center font-mono">{row.repower.grid}</td>
                          <td className="py-1.5 px-1 text-center font-mono text-green-400">{row.repower.lot}</td>
                          <td className="py-1.5 px-1 text-center font-mono">{row.scalper.grid}</td>
                          <td className="py-1.5 px-1 text-center font-mono text-green-400">{row.scalper.lot}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Warnings Footer */}
      {warnings.length > 0 && (
        <div className="px-3 py-2 border-t border-border bg-orange-500/5">
          <div className="flex items-center gap-1.5 text-[10px] text-orange-400">
            <AlertTriangle className="w-3 h-3" />
            <span>{warnings.length} validation warnings - check settings</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default QuickActionsPanel;

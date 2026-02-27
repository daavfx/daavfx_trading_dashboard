import { useState, useEffect } from "react";
import { Save, Tag, FolderOpen, FileText, MessageSquare, Database, Check, Hash } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { open as dialogOpen } from '@tauri-apps/plugin-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface VaultSaveData {
  name: string;
  category: string;
  strategyType: "buy" | "sell";
  magicNumber: number;
  tags: string[];
  comments: string;
  exportPath?: string;
  saveToVault: boolean;
  format?: "set" | "json";
}

interface VaultSavePageProps {
  onSave: (data: VaultSaveData) => void;
  onCancel: () => void;
  defaultName?: string;
  defaultCategory?: string;
  defaultMagicNumber?: number;
  defaultTags?: string[];
  defaultComments?: string;
  defaultSaveToVault?: boolean;
  defaultFormat?: "set" | "json";
}

export function VaultSavePage({
  onSave,
  onCancel,
  defaultName = "",
  defaultCategory = "General",
  defaultMagicNumber = 777,
  defaultTags = [],
  defaultComments = "",
  defaultSaveToVault = true,
  defaultFormat = "set",
}: VaultSavePageProps) {
  const [name, setName] = useState(defaultName);
  const [category, setCategory] = useState(defaultCategory);
  const [strategyType, setStrategyType] = useState<"buy" | "sell">("buy");
  const [magicNumber, setMagicNumber] = useState(defaultMagicNumber);
  const [tags, setTags] = useState(defaultTags.join(", "));
  const [comments, setComments] = useState(defaultComments);
  const [exportPath, setExportPath] = useState("");
  const [saveToVault, setSaveToVault] = useState(defaultSaveToVault);
  const [format, setFormat] = useState<"set" | "json">(defaultFormat);
  const [nameRecipe, setNameRecipe] = useState<string>("custom");
  const [nameBusy, setNameBusy] = useState(false);

  const tauriAvailable = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);

  const recipes = [
    { id: "scalp", label: "Scalper Premium", code: "SCALP", category: "Scalping" },
    { id: "grid", label: "Grid Builder", code: "GRID", category: "Grid" },
    { id: "recovery", label: "Recovery Shield", code: "RECOVERY", category: "Recovery" },
    { id: "safe", label: "Conservative Safe", code: "SAFE", category: "Conservative" },
    { id: "aggro", label: "Aggressive Turbo", code: "AGGRO", category: "Aggressive" },
    { id: "test", label: "Testing Lab", code: "TEST", category: "Testing" },
    { id: "custom", label: "Custom", code: "CUSTOM", category: category || "General" },
  ] as const;

  const getRecipe = (id: string) => recipes.find((r) => r.id === id) || recipes[recipes.length - 1];

  const splitExt = (raw: string) => {
    const m = raw.match(/^(.*)\.(set|json)$/i);
    if (!m) return { base: raw.trim(), ext: "" };
    return { base: m[1].trim(), ext: m[2].toLowerCase() };
  };

  const stripVersion = (base: string) => {
    const m = base.match(/^(.*)_v(\d+)$/i);
    if (!m) return { base: base.trim(), v: null as number | null };
    return { base: m[1].trim(), v: parseInt(m[2], 10) };
  };

  const inferTokens = () => {
    const rawTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const engineLetters = rawTags
      .filter((t) => /^Engine[A-C]$/i.test(t))
      .map((t) => t.replace(/^Engine/i, "").toUpperCase());
    const engines = engineLetters.length ? `E${engineLetters.join("")}` : "E";
    const groups = rawTags.filter((t) => /^G\d+$/i.test(t)).map((t) => t.toUpperCase());
    const groupToken = groups.length ? groups.join("-") : "G";
    const logicCandidates = rawTags.filter(
      (t) => /^[A-Z]{2,8}$/.test(t) && !/^G\d+$/.test(t)
    );
    const logicToken = logicCandidates.length ? logicCandidates.slice(0, 3).join("-") : "LOGIC";
    return { engines, groups: groupToken, logics: logicToken };
  };

  const generateName = (nextRecipeId?: string) => {
    const recipe = getRecipe(nextRecipeId || nameRecipe);
    const { engines, groups, logics } = inferTokens();
    const base = `${recipe.code}_${engines}_${groups}_${logics}`;
    return `${base}_v1`;
  };

  const bumpVersion = async () => {
    const { base: rawBase } = splitExt(name);
    const stripped = stripVersion(rawBase);
    const baseNoVersion = stripped.base;

    setNameBusy(true);
    try {
      let maxV = 0;
      if (tauriAvailable) {
        const result = await invoke<{ files: Array<{ name: string }> }>("list_vault_files");
        for (const f of result.files || []) {
          const { base: fileBase } = splitExt(String(f.name || ""));
          const parsed = stripVersion(fileBase);
          if (parsed.base === baseNoVersion && parsed.v && parsed.v > maxV) {
            maxV = parsed.v;
          }
        }
      }

      const nextV = Math.max(maxV + 1, (stripped.v || 0) + 1, 1);
      setName(`${baseNoVersion}_v${nextV}`);
      toast.success(`Name bumped to v${nextV}`);
    } catch (e) {
      const fallbackV = (stripped.v || 0) + 1;
      setName(`${baseNoVersion}_v${fallbackV}`);
      toast.error(`Vault check unavailable, bumped locally to v${fallbackV}`);
    } finally {
      setNameBusy(false);
    }
  };

  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);

  useEffect(() => {
    setCategory(defaultCategory);
  }, [defaultCategory]);

  useEffect(() => {
    setMagicNumber(defaultMagicNumber);
  }, [defaultMagicNumber]);

  useEffect(() => {
    setTags(defaultTags.join(", "));
  }, [defaultTags]);

  useEffect(() => {
    setComments(defaultComments);
  }, [defaultComments]);

  useEffect(() => {
    setSaveToVault(defaultSaveToVault);
  }, [defaultSaveToVault]);

  useEffect(() => {
    setFormat(defaultFormat);
  }, [defaultFormat]);

  const handleBrowse = async () => {
    try {
      const selected = await dialogOpen({
        directory: true,
        multiple: false,
        defaultPath: exportPath || undefined,
      });
      
      if (selected) {
        setExportPath(selected as string);
      }
    } catch (err) {
      console.error("Failed to open dialog:", err);
    }
  };

  const handleSave = () => {
    onSave({
      name,
      category,
      strategyType,
      magicNumber,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      comments,
      exportPath,
      saveToVault,
      format
    });
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 bg-background/50 animate-in fade-in duration-300">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold flex items-center justify-center gap-3 text-foreground">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Save className="h-6 w-6 text-primary" />
              </div>
              Save Configuration
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Export your current settings to a file or save to the internal Vault
            </p>
        </div>

        <div className="card-gradient-border rounded-xl shadow-elevated bg-card">
          <div className="p-8 space-y-6">
            
            {/* Strategy Type Toggle */}
            <div className="p-4 bg-muted/30 rounded-lg border border-border/40">
              <Label className="text-xs text-muted-foreground mb-3 block font-medium uppercase tracking-wider">Strategy Direction</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setStrategyType("buy")}
                  className={cn(
                    "px-4 py-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2",
                    strategyType === "buy" 
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-sm" 
                      : "bg-background hover:bg-muted text-muted-foreground border border-transparent"
                  )}
                >
                  Buy
                  {strategyType === "buy" && <Check className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setStrategyType("sell")}
                  className={cn(
                    "px-4 py-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2",
                    strategyType === "sell" 
                      ? "bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-sm" 
                      : "bg-background hover:bg-muted text-muted-foreground border border-transparent"
                  )}
                >
                  Sell
                  {strategyType === "sell" && <Check className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
                    {/* Name */}
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Configuration Name
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. SCALP_EA_G1_POWER_v1"
                          className="bg-background border-border-subtle h-10"
                          autoFocus
                        />
                        <Button
                          variant="outline"
                          className="shrink-0 h-10"
                          disabled={nameBusy}
                          onClick={() => setName(generateName())}
                        >
                          Generate
                        </Button>
                        <Button
                          variant="outline"
                          className="shrink-0 h-10"
                          disabled={nameBusy}
                          onClick={bumpVersion}
                        >
                          Next v
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        Name Recipe
                      </Label>
                      <Select
                        value={nameRecipe}
                        onValueChange={(v) => {
                          setNameRecipe(v);
                          const recipe = getRecipe(v);
                          if (recipe.category && recipe.category !== "General") setCategory(recipe.category);
                          setName(generateName(v));
                        }}
                      >
                        <SelectTrigger className="bg-background border-border-subtle h-10">
                          <SelectValue placeholder="Select naming recipe" />
                        </SelectTrigger>
                        <SelectContent>
                          {recipes.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Category */}
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground flex items-center gap-2">
                        <FolderOpen className="w-4 h-4" />
                        Category
                      </Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="bg-background border-border-subtle h-10">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="General">General</SelectItem>
                          <SelectItem value="Scalping">Scalping</SelectItem>
                          <SelectItem value="Grid">Grid</SelectItem>
                          <SelectItem value="Recovery">Recovery</SelectItem>
                          <SelectItem value="Conservative">Conservative</SelectItem>
                          <SelectItem value="Aggressive">Aggressive</SelectItem>
                          <SelectItem value="Testing">Testing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                     {/* Magic Number */}
                     <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                          <Hash className="w-3.5 h-3.5" />
                          Magic Number
                      </Label>
                      <Input 
                        type="number"
                        value={magicNumber} 
                        onChange={(e) => setMagicNumber(parseInt(e.target.value) || 0)}
                        className="bg-background/50 border-border/50 font-mono h-10"
                      />
                    </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                     {/* Vault Toggle */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/40 h-[74px]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                          <Database className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <Label className="text-sm font-medium cursor-pointer" htmlFor="save-vault">Save to Vault</Label>
                          <p className="text-xs text-muted-foreground">Store in internal library</p>
                        </div>
                      </div>
                      <Switch
                        id="save-vault"
                        checked={saveToVault}
                        onCheckedChange={setSaveToVault}
                      />
                    </div>

                     {/* Format Selection */}
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Format
                      </Label>
                      <Select value={format} onValueChange={(v: "set" | "json") => setFormat(v)}>
                        <SelectTrigger className="bg-background border-border-subtle h-10">
                          <SelectValue placeholder="Select format" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="set">Set File (.set)</SelectItem>
                          <SelectItem value="json">JSON Template (.json)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Tags */}
                    {saveToVault ? (
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground flex items-center gap-2">
                          <Tag className="w-4 h-4" />
                          Tags (comma separated)
                        </Label>
                        <Input
                          value={tags}
                          onChange={(e) => setTags(e.target.value)}
                          placeholder="scalping, aggressive, xauusd..."
                          className="bg-background border-border-subtle h-10"
                        />
                      </div>
                    ) : (
                        <div className="space-y-2 opacity-50 pointer-events-none">
                            <Label className="text-sm text-muted-foreground flex items-center gap-2">
                            <Tag className="w-4 h-4" />
                            Tags
                            </Label>
                            <Input disabled placeholder="Enable Vault to add tags" className="bg-muted h-10" />
                        </div>
                    )}
                </div>
            </div>

            {/* Export Path - Full Width */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                Export Location (Optional)
              </Label>
              <div className="flex gap-2">
                <Input
                  value={exportPath}
                  onChange={(e) => setExportPath(e.target.value)}
                  placeholder="Select folder to export .set file..."
                  className="bg-background border-border-subtle font-mono text-xs h-10"
                />
                <Button variant="outline" onClick={handleBrowse} className="shrink-0 h-10">
                  Browse
                </Button>
              </div>
            </div>

            {/* Comments - Full Width */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Comments
              </Label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Add notes about this configuration..."
                className="bg-background border-border-subtle min-h-[80px]"
              />
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border/30">
              <Button variant="ghost" onClick={onCancel} size="lg">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!name} size="lg" className="px-8">
                Save Configuration
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, Tag, FolderOpen, FileText, MessageSquare, Database, Check, Hash } from "lucide-react";
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

interface VaultSaveModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: VaultSaveData) => void;
  defaultName?: string;
  defaultMagicNumber?: number;
}

export interface VaultSaveData {
  name: string;
  category: string;
  strategyType: "buy" | "sell" | "both";
  magicNumber: number;
  tags: string[];
  comments: string;
  exportPath?: string;
  saveToVault: boolean;
  format?: "set" | "json";
}

export function VaultSaveModal({ open, onClose, onSave, defaultName = "", defaultMagicNumber = 777 }: VaultSaveModalProps) {
  const [name, setName] = useState(defaultName);
  const [category, setCategory] = useState("General");
  const [strategyType, setStrategyType] = useState<"buy" | "sell" | "both">("both");
  const [magicNumber, setMagicNumber] = useState(defaultMagicNumber);
  const [tags, setTags] = useState("");
  const [comments, setComments] = useState("");
  const [exportPath, setExportPath] = useState("");
  const [saveToVault, setSaveToVault] = useState(true);
  const [format, setFormat] = useState<"set" | "json">("set");

  useEffect(() => {
    setMagicNumber(defaultMagicNumber);
  }, [defaultMagicNumber]);

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
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50"
          >
            <div className="card-gradient-border rounded-xl shadow-elevated">
              <div className="bg-card rounded-xl p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Save className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Save Configuration</h2>
                      <p className="text-sm text-muted-foreground">Export to file or save to Vault</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={onClose} className="text-muted-foreground">
                    <X className="w-5 h-5" />
                  </Button>
                </div>

                {/* Form */}
                <div className="space-y-5">
                  
                  {/* Strategy Type Toggle */}
                  <div className="p-3 bg-muted/30 rounded-lg border border-border/40">
                    <Label className="text-xs text-muted-foreground mb-2 block">Strategy Direction</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setStrategyType("buy")}
                        className={cn(
                          "px-3 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2",
                          strategyType === "buy" 
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-sm" 
                            : "bg-background hover:bg-muted text-muted-foreground border border-transparent"
                        )}
                      >
                        Buy
                        {strategyType === "buy" && <Check className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => setStrategyType("sell")}
                        className={cn(
                          "px-3 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2",
                          strategyType === "sell" 
                            ? "bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-sm" 
                            : "bg-background hover:bg-muted text-muted-foreground border border-transparent"
                        )}
                      >
                        Sell
                        {strategyType === "sell" && <Check className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => setStrategyType("both")}
                        className={cn(
                          "px-3 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2",
                          strategyType === "both" 
                            ? "bg-blue-500/10 text-blue-500 border border-blue-500/20 shadow-sm" 
                            : "bg-background hover:bg-muted text-muted-foreground border border-transparent"
                        )}
                      >
                        Both
                        {strategyType === "both" && <Check className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  {/* Name */}
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Configuration Name
                    </Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. XAUUSD_Scalper_v1"
                      className="bg-background border-border-subtle"
                    />
                  </div>

                  {/* Category */}
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground flex items-center gap-2">
                      <FolderOpen className="w-4 h-4" />
                      Category
                    </Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="bg-background border-border-subtle">
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

                  {/* Export Path */}
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
                        className="bg-background border-border-subtle font-mono text-xs"
                      />
                      <Button variant="outline" onClick={handleBrowse} className="shrink-0">
                        Browse
                      </Button>
                    </div>
                  </div>

                  {/* Vault Toggle */}
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/40">
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
                      <SelectTrigger className="bg-background border-border-subtle">
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="set">Set File (.set)</SelectItem>
                        <SelectItem value="json">JSON Template (.json)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Magic Number */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Magic Number</Label>
                    <div className="relative">
                      <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input 
                        type="number"
                        value={magicNumber} 
                        onChange={(e) => setMagicNumber(parseInt(e.target.value) || 0)}
                        className="pl-8 bg-background/50 border-border/50 font-mono"
                      />
                    </div>
                  </div>

                  {/* Tags */}
                  {saveToVault && (
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        Tags (comma separated)
                      </Label>
                      <Input
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="scalping, aggressive, xauusd..."
                        className="bg-background border-border-subtle"
                      />
                    </div>
                  )}

                  {/* Comments */}
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
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-border/30">
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={!name}>
                    Save Configuration
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

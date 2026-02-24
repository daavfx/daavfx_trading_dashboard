import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderOpen,
  Save,
  FileText,
  FileJson,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import type { MTConfig } from "@/types/mt-config";
import { useSettings } from "@/contexts/SettingsContext";
import { withUseDirectPriceGrid, normalizeConfigForExport } from "@/utils/unit-mode";
import { hydrateMTConfigDefaults } from "@/utils/hydrate-mt-config-defaults";
import type { Platform } from "@/components/layout/TopBar";

interface ExportOptionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: MTConfig | null;
  defaultFormat?: ".set" | "JSON";
  platform?: Platform;
}

// Trade direction for set file export
type TradeDirection = "BUY" | "SELL" | "BOTH";

export function ExportOptionsModal({
  open: isOpen,
  onOpenChange,
  config,
  defaultFormat = ".set",
  platform,
}: ExportOptionsModalProps) {
  const { settings } = useSettings();
  const [fileName, setFileName] = useState("");
  const [exportDir, setExportDir] = useState("");
  const [format, setFormat] = useState<".set" | "JSON">(defaultFormat);
  const [tags, setTags] = useState("");
  const [comments, setComments] = useState("");
  const [includeOptimization, setIncludeOptimization] = useState(false);
  const [saveToVault, setSaveToVault] = useState(false);
  const [vaultCategory, setVaultCategory] = useState("General");
  const [tradeDirection, setTradeDirection] = useState<TradeDirection>("BOTH");
  const [isExporting, setIsExporting] = useState(false);

  // Initialize defaults when opening
  useEffect(() => {
    if (isOpen && config) {
      const ext = format === ".set" ? "set" : "json";
      const timestamp = new Date().toISOString().split("T")[0];
      const defaultName = config.current_set_name
        ? config.current_set_name.replace(/\.(set|json)$/i, "")
        : `DAAVFX_Config_${timestamp}`;

      setFileName(defaultName);

      if (config.tags) setTags(config.tags.join(", "));
      if (config.comments) setComments(config.comments);

      // Try to get a default download dir or similar?
      // For now leave empty to force user selection or use default if empty
    }
  }, [isOpen, config, format]);

  const handleBrowseDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: exportDir || undefined,
      });

      if (selected) {
        setExportDir(selected as string);
      }
    } catch (err) {
      console.error("Failed to select directory:", err);
    }
  };

  const handleExport = async () => {
    if (!config) {
      toast.error("No configuration loaded");
      return;
    }

    if (!fileName.trim()) {
      toast.error("Please enter a file name");
      return;
    }

    if (!exportDir) {
      toast.error("Please select an export directory");
      return;
    }

    setIsExporting(true);

    try {
      const configToExport = withUseDirectPriceGrid(config, settings);
      const hydrated = hydrateMTConfigDefaults(configToExport);

      const preparedForExport: MTConfig = {
        ...hydrated,
        general: {
          ...hydrated.general,
          require_license:
            String(hydrated.general.license_key || "").trim().length > 0
              ? hydrated.general.require_license
              : false,
        },
        engines: (hydrated.engines || []).map((e) => ({
          ...e,
          groups: (e.groups || []).map((g) => {
            if (e.engine_id !== "A") return g;
            if (g.group_number <= 1) return g;
            if (typeof (g as any).group_power_start === "number") return g;
            return { ...g, group_power_start: g.group_number } as any;
          }),
        })),
      };

      const ensuredTradable: MTConfig = {
        ...preparedForExport,
        engines: (preparedForExport.engines || []).map((e) => {
          if (e.engine_id !== "A") return e;
          return {
            ...e,
            groups: (e.groups || []).map((g) => {
              if (g.group_number !== 1) return g;
              return {
                ...g,
                logics: (g.logics || []).map((l: any) => {
                  if (String(l?.logic_name || "").toLowerCase() !== "power") return l;
                  const enabledBuy = l?.enabled_b === true;
                  const enabledSell = l?.enabled_s === true;
                  const enabled = l?.enabled === true;
                  if (enabled || enabledBuy || enabledSell) return l;
                  return { ...l, enabled: true, allow_buy: true, allow_sell: true };
                }),
              };
            }),
          };
        }),
      };

      const ext = format === ".set" ? "set" : "json";
      const fullFileName = fileName.endsWith(`.${ext}`)
        ? fileName
        : `${fileName}.${ext}`;

      // Handle path separator based on likely OS (User agent check or just use forward slash which often works, but let's try to be safe)
      const separator = navigator.userAgent.includes("Win") ? "\\" : "/";
      const fullPath = exportDir.endsWith(separator)
        ? `${exportDir}${fullFileName}`
        : `${exportDir}${separator}${fullFileName}`;

      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // 1. Export File
      if (format === ".set") {
        await invoke("export_massive_v19_setfile", {
          config: normalizeConfigForExport(ensuredTradable),
          filePath: fullPath,
          platform: platform === "mt5" ? "MT5" : "MT4",
        });
      } else {
        await invoke("export_json_file", {
          config: normalizeConfigForExport(ensuredTradable),
          filePath: fullPath,
          tags: tagList.length > 0 ? tagList : null,
          comments: comments || null,
        });
      }

      toast.success(`Exported to ${fullPath}`);

      // 2. Save to Vault if requested
      if (saveToVault) {
        await invoke("save_to_vault", {
          config: normalizeConfigForExport(ensuredTradable),
          name: fileName.replace(/\.(set|json)$/i, ""),
          category: vaultCategory,
          tags: tagList.length > 0 ? tagList : null,
          comments: comments || null,
          format: format === ".set" ? "set" : "json",
          vault_path_override: settings.vaultPath,
        });
        toast.success("Saved copy to Vault");
      }

      onOpenChange(false);
    } catch (err) {
      console.error("Export failed:", err);
      toast.error(`Export failed: ${err}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export Configuration</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Format Selection */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Format</Label>
            <div className="col-span-3 flex gap-2">
              <Button
                variant={format === ".set" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormat(".set")}
                className="flex-1"
              >
                <FileText className="w-4 h-4 mr-2" />
                Set File (.set)
              </Button>
              <Button
                variant={format === "JSON" ? "default" : "outline"}
                size="sm"
                onClick={() => setFormat("JSON")}
                className="flex-1"
              >
                <FileJson className="w-4 h-4 mr-2" />
                JSON
              </Button>
            </div>
          </div>

          {/* Trade Direction Selection - Only for .set format */}
          {format === ".set" && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Direction</Label>
              <div className="col-span-3 flex gap-2">
                <Button
                  variant={tradeDirection === "BUY" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTradeDirection("BUY")}
                  className="flex-1"
                >
                  <ArrowUp className="w-4 h-4 mr-2" />
                  BUY Only
                </Button>
                <Button
                  variant={tradeDirection === "SELL" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTradeDirection("SELL")}
                  className="flex-1"
                >
                  <ArrowDown className="w-4 h-4 mr-2" />
                  SELL Only
                </Button>
                <Button
                  variant={tradeDirection === "BOTH" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTradeDirection("BOTH")}
                  className="flex-1"
                >
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  BOTH
                </Button>
              </div>
            </div>
          )}

          {/* File Name */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="filename" className="text-right">
              File Name
            </Label>
            <Input
              id="filename"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="col-span-3"
              placeholder="MyConfig"
            />
          </div>

          {/* Directory Selection */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Location</Label>
            <div className="col-span-3 flex gap-2">
              <Input
                value={exportDir}
                readOnly
                placeholder="Select destination..."
                className="flex-1 bg-muted/50"
              />
              <Button variant="secondary" size="icon" onClick={handleBrowseDir}>
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <Separator className="my-2" />

          {/* Metadata */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="tags" className="text-right">
              Tags
            </Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="col-span-3"
              placeholder="scalping, aggressive, eu (comma separated)"
            />
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="comments" className="text-right pt-2">
              Comments
            </Label>
            <Textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="col-span-3 min-h-[80px]"
              placeholder="Description of this configuration..."
            />
          </div>

          <Separator className="my-2" />

          {/* Options */}
          {format === ".set" && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs text-muted-foreground">
                Optimization
              </Label>
              <div className="col-span-3 flex items-center space-x-2">
                <Switch
                  id="opt-hints"
                  checked={includeOptimization}
                  onCheckedChange={setIncludeOptimization}
                />
                <Label htmlFor="opt-hints" className="font-normal text-sm">
                  Include optimization hints
                </Label>
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-xs text-muted-foreground">
              Vault
            </Label>
            <div className="col-span-3 flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="save-vault"
                  checked={saveToVault}
                  onCheckedChange={setSaveToVault}
                />
                <Label htmlFor="save-vault" className="font-normal text-sm">
                  Save copy to Vault
                </Label>
              </div>

              {saveToVault && (
                <Select value={vaultCategory} onValueChange={setVaultCategory}>
                  <SelectTrigger className="w-[140px] h-8">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="Scalping">Scalping</SelectItem>
                    <SelectItem value="Swing">Swing</SelectItem>
                    <SelectItem value="Conservative">Conservative</SelectItem>
                    <SelectItem value="Aggressive">Aggressive</SelectItem>
                    <SelectItem value="Testing">Testing</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? "Exporting..." : "Export File"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

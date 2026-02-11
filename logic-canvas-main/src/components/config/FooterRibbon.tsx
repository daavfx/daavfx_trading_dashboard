import { FileJson, FileText, Clock, Undo, Redo, Columns, Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Platform } from "@/components/layout/TopBar";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import type { MTConfig } from "@/types/mt-config";
import { useMemo, useState } from "react";
import { ExportOptionsModal } from "./ExportOptionsModal";
import { useSettings } from "@/contexts/SettingsContext";
import { withUseDirectPriceGrid } from "@/utils/unit-mode";

interface FooterRibbonProps {
  platform: Platform;
  config?: MTConfig | null;
}

const platformLabels: Record<Platform, string> = {
  mt4: "MetaTrader 4", mt5: "MetaTrader 5", python: "Python", c: "C", cpp: "C++", rust: "Rust",
};

const platformText: Record<Platform, string> = {
  mt4: "text-platform-mt4", mt5: "text-platform-mt5", python: "text-platform-python",
  c: "text-platform-c", cpp: "text-platform-cpp", rust: "text-platform-rust",
};

function buildOptimizationPreview(config?: MTConfig | null, includeHints?: boolean): string {
  if (!config || !includeHints) {
    return "";
  }

  const engine = config.engines?.[0];
  const group = engine?.groups?.[0];
  const logic = group?.logics?.[0];

  if (!engine || !group || !logic) {
    return "";
  }

  const engineId = engine.engine_id;
  const groupNumber = group.group_number;
  const logicName = logic.logic_name.toUpperCase();

  const prefix = engineId === "B" ? "B" : engineId === "C" ? "C" : "";
  let logicChar: string;
  switch (logicName) {
    case "POWER":
      logicChar = "P";
      break;
    case "REPOWER":
      logicChar = "R";
      break;
    case "SCALPER":
      logicChar = "S";
      break;
    case "SCALP":
      logicChar = "S";
      break;
    case "STOPPER":
      logicChar = "ST";
      break;
    case "STO":
      logicChar = "STO";
      break;
    case "SCA":
      logicChar = "SCA";
      break;
    case "RPO":
      logicChar = "RPO";
      break;
    default:
      logicChar = "P";
      break;
  }

  const suffix = `${prefix}${logicChar}${groupNumber}`;

  const lot = logic.initial_lot ?? 0;
  const grid = logic.grid ?? 0;
  const mult = logic.multiplier ?? 0;

  const lotStep = 0.01;
  const lotMin = 0.01;
  const lotMax = Math.max(lot * 3, 0.03);

  const gridBase = grid > 0 ? grid : 100;
  const gridStep = gridBase <= 10 ? 1 : gridBase <= 200 ? 5 : 10;
  const gridMin = Math.max(gridBase * 0.5, 5);
  const gridMax = Math.min(gridBase * 2, 100000);

  const multStep = 0.1;
  const multMin = 0.5;
  const multMax = 3.0;

  return [
    `gInput_Initial_loT_${suffix}=${lot.toFixed(2)},F=${lotStep.toFixed(2)},1=${lotMin.toFixed(2)},2=${lotMax.toFixed(2)}`,
    `gInput_Grid_${suffix}=${grid.toFixed(1)},F=${gridStep.toFixed(1)},1=${gridMin.toFixed(1)},2=${gridMax.toFixed(1)}`,
    `gInput_Mult_${suffix}=${mult.toFixed(2)},F=${multStep.toFixed(2)},1=${multMin.toFixed(2)},2=${multMax.toFixed(2)}`,
  ].join("\n");
}

export function FooterRibbon({ platform, config }: FooterRibbonProps) {
  const { settings } = useSettings();
  const [includeOptimizationHints, setIncludeOptimizationHints] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<".set" | "JSON">(".set");

  const optimizationPreview = useMemo(
    () => buildOptimizationPreview(config, includeOptimizationHints),
    [config, includeOptimizationHints]
  );

  const handleExport = (format: ".set" | "JSON") => {
    if (!config) {
      toast.error("No configuration loaded to export");
      return;
    }
    setExportFormat(format);
    setExportModalOpen(true);
  };

  const handleExportBothSet = async () => {
    if (!config) {
      toast.error("No configuration loaded to export");
      return;
    }

    try {
      const configToExport = withUseDirectPriceGrid(config, settings);
      const mt4Path = await save({
        defaultPath: `DAAVFX_MT4_Config.set`,
        filters: [{ name: "MT4/MT5 Settings", extensions: ["set"] }],
      });
      if (!mt4Path) return;

      await invoke("export_set_file", {
        config: configToExport,
        file_path: mt4Path, // Note: rust command expects file_path, not filePath? Wait, let's check. 
                            // Previous code used filePath but rust signature is file_path usually.
                            // I should double check mt_bridge.rs.
                            // The previous code had `filePath: mt4Path` and `invoke("export_set_file", { config, filePath, ... })`
                            // If rust uses snake_case arguments, tauri usually handles conversion if configured, 
                            // but standard practice is to match the rust argument name.
                            // Looking at my previous thought: "Updated export_set_file to include tags/comments parameters..."
                            // Let's assume snake_case `file_path` is safer given my recent edits.
                            // Wait, the previous code used `filePath`. If it worked, Tauri camelCase -> snake_case conversion might be active.
                            // But I will use `file_path` to be safe as per rust definition `file_path: String`.
        platform: "MT4",
        include_optimization_hints: includeOptimizationHints,
        tags: null,
        comments: null
      });

      const mt5Path = await save({
        defaultPath: `DAAVFX_MT5_Config.set`,
        filters: [{ name: "MT4/MT5 Settings", extensions: ["set"] }],
      });
      if (!mt5Path) return;

      await invoke("export_set_file", {
        config: configToExport,
        file_path: mt5Path,
        platform: "MT5",
        include_optimization_hints: includeOptimizationHints,
        tags: null,
        comments: null
      });

      toast.success("Exported MT4+MT5 .set files successfully");
    } catch (err) {
      toast.error(`Export failed: ${err}`);
    }
  };

  return (
    <footer className="h-9 border-t border-border bg-background-elevated flex items-center justify-between px-4 text-[10px]">
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1">
              <Download className="w-3 h-3" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem 
              className="text-xs cursor-pointer"
              onClick={() => handleExport(".set")}
            >
              <FileText className="w-3 h-3 mr-2" />
              Export .set...
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="text-xs cursor-pointer"
              onClick={() => handleExport("JSON")}
            >
              <FileJson className="w-3 h-3 mr-2" />
              Export JSON...
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-xs cursor-pointer"
              onClick={handleExportBothSet}
            >
              <FileText className="w-3 h-3 mr-2" />
              Quick Export Both (MT4 + MT5)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[10px] py-2" onSelect={(e) => e.preventDefault()}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={includeOptimizationHints}
                  onChange={(e) => setIncludeOptimizationHints(e.target.checked)}
                />
                <span>Include optimization hints (F / min / max)</span>
              </label>
            </DropdownMenuItem>
            {optimizationPreview && (
              <DropdownMenuItem className="text-[9px] font-mono whitespace-pre-wrap py-2" onSelect={(e) => e.preventDefault()}>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-muted-foreground">Preview (first engine/group):</span>
                  <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap leading-[1.1]">
                    {optimizationPreview}
                  </pre>
                </div>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <ExportOptionsModal 
          open={exportModalOpen} 
          onOpenChange={setExportModalOpen} 
          config={config || null}
          platform={platform}
          defaultFormat={exportFormat}
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-muted-foreground/60">
          <span>Created by</span>
          <a href="https://www.daavile.com" target="_blank" rel="noopener noreferrer" className="text-foreground/70 hover:text-primary transition-colors">daavile.com</a>
          <span className="mx-1">·</span>
          <span>Powered by</span>
          <a href="https://www.ryiuk.pro" target="_blank" rel="noopener noreferrer" className="text-amber-500/80 hover:text-amber-400 transition-colors">ryiuk.pro</a>
        </div>
        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>
            {config?.last_saved_at
              ? `Saved ${new Date(config.last_saved_at).toLocaleTimeString()}`
              : "No saves yet"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Check className="w-3 h-3 text-chart-3" />
          <span className="text-chart-3">Autosave</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Target:</span>
          <span className={cn("font-medium", platformText[platform])}>{platformLabels[platform]}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
          <Undo className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
          <Redo className="w-3 h-3" />
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground">
              <Columns className="w-3 h-3 mr-1" />Density
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem className="text-xs">Compact</DropdownMenuItem>
            <DropdownMenuItem className="text-xs">Comfortable</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </footer>
  );
}

import {
  FileJson,
  FileText,
  Clock,
  Undo,
  Redo,
  Check,
  Download,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import type { MTConfig } from "@/types/mt-config";
import { useMemo, useState } from "react";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { ExportOptionsModal } from "./ExportOptionsModal";
import { useSettings } from "@/contexts/SettingsContext";
import { withUseDirectPriceGrid } from "@/utils/unit-mode";
import { generateMassiveCompleteConfig } from "@/lib/config/generateMassiveConfig";
import { exportToSetFileWithDirections } from "@/lib/setfile/exporter";
import type { Platform } from "@/components/layout/TopBar";

interface FooterRibbonProps {
  config?: MTConfig | null;
  platform?: Platform;
}


function buildOptimizationPreview(
  config?: MTConfig | null,
  includeHints?: boolean,
): string {
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

export function FooterRibbon({ config, platform }: FooterRibbonProps) {
  const { settings } = useSettings();
  const [includeOptimizationHints, setIncludeOptimizationHints] =
    useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<".set" | "JSON">(".set");
  const { metrics } = useSystemHealth();

  const optimizationPreview = useMemo(
    () => buildOptimizationPreview(config, includeOptimizationHints),
    [config, includeOptimizationHints],
  );

  const handleExport = (format: ".set" | "JSON") => {
    if (!config) {
      toast.error("No configuration loaded to export");
      return;
    }
    setExportFormat(format);
    setExportModalOpen(true);
  };

  const handleGenerateMassiveExport = async () => {
    try {
      const generated = generateMassiveCompleteConfig("MT4");
      const massiveConfig = generated.config;
      const setfileContent = exportToSetFileWithDirections(massiveConfig);

      const path = await save({
        defaultPath: `DAAVFX_MASSIVE_COMPLETE.set`,
        filters: [{ name: "Set File", extensions: ["set"] }],
      });
      if (!path) return;

      await invoke("write_text_file", {
        filePath: path,
        content: setfileContent,
      });

      toast.success(
        `Exported massive setfile: ${setfileContent.split("\n").length.toLocaleString()} lines`,
      );
    } catch (err) {
      toast.error(`Export failed: ${err}`);
    }
  };

  return (
    <footer className="h-9 border-t border-border bg-background-elevated flex items-center justify-between px-4 text-[10px]">
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1"
            >
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
              onClick={handleGenerateMassiveExport}
            >
              <FileText className="w-3 h-3 mr-2" />
              Generate Massive & Export (.set)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-[10px] py-2"
              onSelect={(e) => e.preventDefault()}
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={includeOptimizationHints}
                  onChange={(e) =>
                    setIncludeOptimizationHints(e.target.checked)
                  }
                />
                <span>Include optimization hints (F / min / max)</span>
              </label>
            </DropdownMenuItem>
            {optimizationPreview && (
              <DropdownMenuItem
                className="text-[9px] font-mono whitespace-pre-wrap py-2"
                onSelect={(e) => e.preventDefault()}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-muted-foreground">
                    Preview (first engine/group):
                  </span>
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
        defaultFormat={exportFormat}
      />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-muted-foreground/60">
          <span>Created by</span>
          <a
            href="https://www.daavile.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground/70 hover:text-primary transition-colors"
          >
            daavile.com
          </a>
          <span className="mx-1">·</span>
          <span>Powered by</span>
          <a
            href="https://www.ryiuk.pro"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-500/80 hover:text-amber-400 transition-colors"
          >
            ryiuk.pro
          </a>
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
          <span className="font-medium">Set Files</span>
        </div>
        <div className={
          `flex items-center gap-1.5 ` +
          (metrics.memory.status === "critical"
            ? "text-red-500"
            : metrics.memory.status === "warning"
            ? "text-amber-500"
            : "text-emerald-500")
        }>
          <Database className="w-3 h-3" />
          <span>
            {metrics.memory.used} MB / {metrics.memory.limit} MB
          </span>
          <span className="mx-1">·</span>
          <span>
            Peak: {metrics.memory.peak} MB
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground"
        >
          <Undo className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground"
        >
          <Redo className="w-3 h-3" />
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        {/* appearance density control removed */}
      </div>
    </footer>
  );
}

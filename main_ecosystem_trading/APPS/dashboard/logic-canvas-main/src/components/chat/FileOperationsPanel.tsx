import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Download, 
  Upload, 
  FileJson, 
  FileText, 
  FolderOpen,
  Check,
  X,
  ChevronDown,
  FileUp,
  HardDrive,
  Sparkles,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MTConfig } from "@/types/mt-config";

interface FileOperationsPanelProps {
  config: MTConfig | null;
  onExport: (format: "json" | "set") => void;
  onLoad: (format: "json" | "set") => void;
  onImport: () => void;
  isProcessing?: boolean;
}

export function FileOperationsPanel({ 
  config, 
  onExport, 
  onLoad, 
  onImport,
  isProcessing = false 
}: FileOperationsPanelProps) {
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [showLoadOptions, setShowLoadOptions] = useState(false);
  const [activeOperation, setActiveOperation] = useState<string | null>(null);
  const clearActiveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clearActiveTimeoutRef.current) {
        clearTimeout(clearActiveTimeoutRef.current);
        clearActiveTimeoutRef.current = null;
      }
    };
  }, []);

  const scheduleClearActive = () => {
    if (clearActiveTimeoutRef.current) {
      clearTimeout(clearActiveTimeoutRef.current);
    }
    clearActiveTimeoutRef.current = setTimeout(() => setActiveOperation(null), 2000);
  };

  const handleExport = (format: "json" | "set") => {
    setActiveOperation(`export-${format}`);
    onExport(format);
    setShowExportOptions(false);
    scheduleClearActive();
  };

  const handleLoad = (format: "json" | "set") => {
    setActiveOperation(`load-${format}`);
    onLoad(format);
    setShowLoadOptions(false);
    scheduleClearActive();
  };

  return (
    <div className="space-y-3 p-4 rounded-xl border border-border/60 bg-gradient-to-br from-muted/30 to-muted/10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <HardDrive className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-xs font-semibold">File Operations</span>
        </div>
        {config && (
          <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
            {config.total_inputs} inputs loaded
          </span>
        )}
      </div>

      {/* Export Section */}
      <div className="space-y-2">
        <button
          onClick={() => setShowExportOptions(!showExportOptions)}
          disabled={!config || isProcessing}
          className={cn(
            "w-full flex items-center justify-between p-2.5 rounded-lg border transition-all",
            !config 
              ? "opacity-50 cursor-not-allowed bg-muted/20 border-border/30" 
              : "bg-background/50 border-border/60 hover:border-primary/30 hover:bg-primary/5"
          )}
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <Download className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-left">
              <div className="text-xs font-medium">Export Configuration</div>
              <div className="text-[10px] text-muted-foreground">
                {!config ? "No config loaded" : "Save to .set or .json file"}
              </div>
            </div>
          </div>
          <ChevronDown className={cn(
            "w-4 h-4 text-muted-foreground transition-transform",
            showExportOptions && "rotate-180"
          )} />
        </button>

        <AnimatePresence>
          {showExportOptions && config && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-muted/20 border border-border/40">
                <button
                  onClick={() => handleExport("set")}
                  disabled={isProcessing}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all",
                    activeOperation === "export-set"
                      ? "bg-emerald-500/10 border-emerald-500/30"
                      : "bg-background/50 border-border/40 hover:border-emerald-500/30 hover:bg-emerald-500/5"
                  )}
                >
                  <FileText className="w-5 h-5 text-emerald-500" />
                  <span className="text-[10px] font-medium">Set File (.set)</span>
                  <span className="text-[9px] text-muted-foreground">Standard format</span>
                </button>
                <button
                  onClick={() => handleExport("json")}
                  disabled={isProcessing}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all",
                    activeOperation === "export-json"
                      ? "bg-blue-500/10 border-blue-500/30"
                      : "bg-background/50 border-border/40 hover:border-blue-500/30 hover:bg-blue-500/5"
                  )}
                >
                  <FileJson className="w-5 h-5 text-blue-500" />
                  <span className="text-[10px] font-medium">JSON .json</span>
                  <span className="text-[9px] text-muted-foreground">Full metadata</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Load Section */}
      <div className="space-y-2">
        <button
          onClick={() => setShowLoadOptions(!showLoadOptions)}
          disabled={isProcessing}
          className={cn(
            "w-full flex items-center justify-between p-2.5 rounded-lg border transition-all",
            isProcessing
              ? "opacity-50 cursor-not-allowed"
              : "bg-background/50 border-border/60 hover:border-primary/30 hover:bg-primary/5"
          )}
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <Upload className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-left">
              <div className="text-xs font-medium">Load Configuration</div>
              <div className="text-[10px] text-muted-foreground">
                Import from file
              </div>
            </div>
          </div>
          <ChevronDown className={cn(
            "w-4 h-4 text-muted-foreground transition-transform",
            showLoadOptions && "rotate-180"
          )} />
        </button>

        <AnimatePresence>
          {showLoadOptions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-muted/20 border border-border/40">
                <button
                  onClick={() => handleLoad("set")}
                  disabled={isProcessing}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all",
                    activeOperation === "load-set"
                      ? "bg-amber-500/10 border-amber-500/30"
                      : "bg-background/50 border-border/40 hover:border-amber-500/30 hover:bg-amber-500/5"
                  )}
                >
                  <FileText className="w-5 h-5 text-amber-500" />
                  <span className="text-[10px] font-medium">Load .set</span>
                  <span className="text-[9px] text-muted-foreground">Set File format</span>
                </button>
                <button
                  onClick={() => handleLoad("json")}
                  disabled={isProcessing}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all",
                    activeOperation === "load-json"
                      ? "bg-blue-500/10 border-blue-500/30"
                      : "bg-background/50 border-border/40 hover:border-blue-500/30 hover:bg-blue-500/5"
                  )}
                >
                  <FileJson className="w-5 h-5 text-blue-500" />
                  <span className="text-[10px] font-medium">Load .json</span>
                  <span className="text-[9px] text-muted-foreground">Full config</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quick Actions */}
      <div className="pt-2 border-t border-border/40">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onImport}
            disabled={isProcessing}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-background/50 border border-border/40 hover:border-primary/30 hover:bg-primary/5 transition-all text-[10px]"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Browse Files
          </button>
          <button
            onClick={() => onLoad("set")}
            disabled={isProcessing}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-background/50 border border-border/40 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all text-[10px]"
          >
            <FileUp className="w-3.5 h-3.5" />
            Quick Load
          </button>
        </div>
      </div>

      {/* Status Indicator */}
      {isProcessing && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20"
        >
          <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
          <span className="text-[10px] text-primary">Processing...</span>
        </motion.div>
      )}
    </div>
  );
}

// Visual result card for export/load operations
interface FileOperationResultProps {
  type: "export" | "load" | "import";
  format: "json" | "set";
  fileName: string;
  filePath: string;
  inputCount?: number;
  success: boolean;
  error?: string;
  onDismiss?: () => void;
}

export function FileOperationResult({
  type,
  format,
  fileName,
  filePath,
  inputCount,
  success,
  error,
  onDismiss
}: FileOperationResultProps) {
  const isExport = type === "export";
  const Icon = format === "json" ? FileJson : FileText;
  const colorClass = format === "json" ? "text-blue-500" : isExport ? "text-emerald-500" : "text-amber-500";
  const bgClass = format === "json" ? "bg-blue-500/10" : isExport ? "bg-emerald-500/10" : "bg-amber-500/10";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "p-4 rounded-xl border space-y-3",
        success 
          ? "bg-gradient-to-br from-muted/30 to-muted/10 border-border/60" 
          : "bg-red-500/5 border-red-500/20"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", bgClass)}>
            {success ? (
              <Icon className={cn("w-5 h-5", colorClass)} />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500" />
            )}
          </div>
          <div>
            <div className="text-xs font-semibold">
              {success 
                ? `${isExport ? "Exported" : "Loaded"} ${format.toUpperCase()} File` 
                : "Operation Failed"
              }
            </div>
            <div className="text-[10px] text-muted-foreground">
              {success ? fileName : error}
            </div>
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 rounded-md hover:bg-muted/50 transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Success Details */}
      {success && (
        <>
          <div className="p-2.5 rounded-lg bg-background/50 border border-border/40">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">File Path</div>
            <div className="text-[10px] font-mono text-foreground break-all">{filePath}</div>
          </div>

          {inputCount !== undefined && (
            <div className="flex items-center gap-2">
              <div className="flex-1 p-2 rounded-lg bg-background/50 border border-border/40">
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Inputs</div>
                <div className="text-sm font-semibold">{inputCount}</div>
              </div>
              <div className="flex-1 p-2 rounded-lg bg-background/50 border border-border/40">
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Format</div>
                <div className="text-sm font-semibold">{format.toUpperCase()}</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[10px] text-emerald-500">
            <Check className="w-3.5 h-3.5" />
            <span>Operation completed successfully</span>
          </div>
        </>
      )}
    </motion.div>
  );
}

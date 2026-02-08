import { motion } from "framer-motion";
import { Layers, X, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiEditIndicatorProps {
  selectedEngines: string[];
  selectedGroups: string[];
  selectedLogics: string[];
  isGroup1Mode: boolean;
  onClearSelection: () => void;
}

export function MultiEditIndicator({
  selectedEngines,
  selectedGroups,
  selectedLogics,
  isGroup1Mode,
  onClearSelection,
}: MultiEditIndicatorProps) {
  const totalSelected = selectedEngines.length + selectedGroups.length + selectedLogics.length;
  
  if (totalSelected <= 3 && selectedEngines.length <= 1 && selectedGroups.length <= 1) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 p-3 rounded-lg border border-primary/30 bg-primary/5"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-primary/10">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">Multi-Edit Mode</div>
            <div className="text-[11px] text-muted-foreground">
              {isGroup1Mode ? (
                <span className="flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Group 1 mode: Editing unique parameters
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Groups 2-20 mode: Editing shared parameters
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onClearSelection}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {selectedEngines.map((engine) => (
          <SelectionChip key={engine} label={engine} type="engine" />
        ))}
        {selectedGroups.map((group) => (
          <SelectionChip key={group} label={group} type="group" isGroup1={group === "Group 1"} />
        ))}
        {selectedLogics.map((logic) => (
          <SelectionChip key={logic} label={logic} type="logic" />
        ))}
      </div>

      {isGroup1Mode && selectedGroups.length > 1 && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-400/80 bg-amber-500/10 px-2 py-1.5 rounded">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Group 1 has unique parameters. Cannot mix with Groups 2-20.</span>
        </div>
      )}
    </motion.div>
  );
}

function SelectionChip({ 
  label, 
  type, 
  isGroup1 
}: { 
  label: string; 
  type: "engine" | "group" | "logic";
  isGroup1?: boolean;
}) {
  const colors = {
    engine: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    group: isGroup1 
      ? "bg-amber-500/10 text-amber-400 border-amber-500/30" 
      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    logic: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border",
        colors[type]
      )}
    >
      {label}
      {isGroup1 && <span className="ml-1 opacity-60">(unique)</span>}
    </span>
  );
}

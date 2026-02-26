import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogicModule } from "./LogicModule";
import type { EngineConfig, MTConfig } from "@/types/mt-config";
import type { Platform } from "@/components/layout/TopBar";

interface GroupCardProps {
  group: string;
  engine: string;
  engineData?: EngineConfig;
  selectedLogics: string[];
  selectedFields: string[];
  mode: 1 | 2;
  platform?: Platform;
  onUpdateLogic: (logic: string, field: string, value: any, groupNum: number) => void;
  config: MTConfig | null;
}

const allLogics = ["POWER", "REPOWER", "SCALPER", "STOPPER", "STO", "SCA", "RPO"];

export function GroupCard({
  group,
  engine,
  engineData,
  selectedLogics,
  selectedFields,
  mode,
  platform,
  onUpdateLogic,
  config,
}: GroupCardProps) {
  const logics = selectedLogics.length > 0
    ? allLogics.filter((l) => selectedLogics.includes(l))
    : allLogics;

  // Prefix logic names with B or C for Engine B and C
  const enginePrefix = engine === "Engine B" ? "B" : engine === "Engine C" ? "C" : "";
  const prefixedLogics = enginePrefix
    ? logics.map(l => enginePrefix + l)
    : logics;

  // Initialize expandedLogics with prefixed names
  useEffect(() => {
    setExpandedLogics(prefixedLogics);
  }, [engine]);

  const [expanded, setExpanded] = useState(true);
  const [expandedLogics, setExpandedLogics] = useState<string[]>([...logics]);
  const groupNum = parseInt(group.replace("Group ", ""));
  const isGroup1 = group === "Group 1";

  const toggleLogic = (logic: string) => {
    setExpandedLogics((prev) =>
      prev.includes(logic) ? prev.filter((l) => l !== logic) : [...prev, logic]
    );
  };

  const expandAllLogics = () => setExpandedLogics([...prefixedLogics]);
  const collapseAllLogics = () => setExpandedLogics([]);

  const prefix = engine.replace("Engine ", "").toLowerCase();

  return (
    <div
      className={cn(
        "rounded-lg border bg-background/40 overflow-hidden transition-all",
        expanded ? "border-border shadow-sm" : "border-border/50",
        isGroup1 && "ring-1 ring-primary/10"
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full px-4 py-3 flex items-center justify-between transition-colors",
          expanded ? "bg-card/60" : "hover:bg-card/40"
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn("w-1 h-6 rounded-full", isGroup1 ? "bg-primary" : "bg-muted-foreground/50")} />
          <motion.div
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </motion.div>
          <span className="text-xs font-mono text-foreground flex items-center gap-2">
            <span className="text-muted-foreground">{prefix}/</span>
            <span className="font-semibold">{group}</span>
            {isGroup1 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-medium">
                TRIGGER
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {prefixedLogics.length} logic{prefixedLogics.length > 1 ? "s" : ""}
          </span>
          <Layers className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2">
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <span className="text-[10px] text-muted-foreground">
                  {expandedLogics.length}/{prefixedLogics.length} logics expanded
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={expandAllLogics}
                    className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/40 transition-colors"
                  >
                    Expand All
                  </button>
                  <button
                    onClick={collapseAllLogics}
                    className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/40 transition-colors"
                  >
                    Collapse All
                  </button>
                </div>
              </div>

              {prefixedLogics.map((logic) => {
                const foundLogicConfig = engineData?.groups
                  ?.find((g: any) => g.group_number === groupNum)
                  ?.logics.find((l: any) => l.logic_name?.toUpperCase() === logic);

                return (
                  <LogicModule
                    key={`${group}-${logic}`}
                    name={logic}
                    engine={engine}
                    expanded={expandedLogics.includes(logic)}
                    onToggle={() => toggleLogic(logic)}
                    logicConfig={foundLogicConfig}
                    group={group}
                    groups={[group]}
                    engineData={engineData}
                    selectedFields={selectedFields}
                    mode={mode}
                    onUpdate={(field, value) => {
                      let processedValue = value;
                      if (typeof value === "string" && (value === "ON" || value === "OFF")) {
                        processedValue = value === "ON";
                      }
                      onUpdateLogic(logic, field, processedValue, groupNum);
                    }}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

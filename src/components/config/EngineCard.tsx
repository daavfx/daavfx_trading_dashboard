import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Copy, RotateCcw, GitCompare, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LogicModule } from "./LogicModule";
import { Platform } from "@/components/layout/TopBar";
import { CompareModal } from "./CompareModal";
import { DuplicateModal } from "./DuplicateModal";

interface EngineCardProps {
  engine: string;
  tradingType: string;
  groups: string[];
  platform: Platform;
  engineData?: any;
  mtConfig?: any;
  selectedLogics: string[];
  selectedFields?: string[];
  onUpdateLogic?: (logic: string, field: string, value: any) => void;
}

const platformIndicator: Record<Platform, string> = {
  mt4: "bg-platform-mt4",
  mt5: "bg-platform-mt5",
  python: "bg-platform-python",
  c: "bg-platform-c",
  cpp: "bg-platform-cpp",
  rust: "bg-platform-rust",
};

export function EngineCard({ engine, tradingType, groups, platform, engineData, mtConfig, selectedLogics, selectedFields = [], onUpdateLogic }: EngineCardProps) {
  const [expanded, setExpanded] = useState(engine === "Engine A");
  const [expandedLogics, setExpandedLogics] = useState<string[]>(["POWER"]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  
  // Filter logics to only show selected ones
  const allLogics = ["POWER", "REPOWER", "SCALPER", "STOPPER", "STO", "SCA", "RPO"];
  const logics = selectedLogics.length > 0 
    ? allLogics.filter(l => selectedLogics.includes(l))
    : allLogics;

  const toggleLogic = (logic: string) => {
    setExpandedLogics((prev) => prev.includes(logic) ? prev.filter((l) => l !== logic) : [...prev, logic]);
  };

  const expandAllLogics = () => setExpandedLogics([...logics]);
  const collapseAllLogics = () => setExpandedLogics([]);

  const isEngineA = engine === "Engine A";

  return (
    <>
      <div className={cn(
        "card-elevated overflow-hidden",
        isEngineA && "ring-1 ring-primary/10"
      )}>
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-card-hover transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className={cn("w-1.5 h-10 rounded-full", platformIndicator[platform])} />
            <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.1 }}>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </motion.div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{engine}</span>
                {isEngineA && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-medium">
                    <Star className="w-2.5 h-2.5" />
                    PRIMARY
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{tradingType}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <StatusBadge status="partial" />
            <span className="text-[11px] text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded">
              {groups.length} grp · {logics.length} logic
            </span>
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
              <div className="px-5 pb-5 space-y-3">
                {/* Collapse/Expand All Logics */}
                <div className="flex items-center justify-between py-2 border-b border-border/40">
                  <span className="text-[11px] text-muted-foreground">
                    {expandedLogics.length}/{logics.length} logics expanded
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={expandAllLogics}
                      className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/40 transition-colors"
                    >
                      Expand All
                    </button>
                    <button
                      onClick={collapseAllLogics}
                      className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/40 transition-colors"
                    >
                      Collapse All
                    </button>
                  </div>
                </div>

                {logics.map((logic) => {
                  // Find real logic config from first selected group
                  const groupNum = groups.length > 0 ? parseInt(groups[0].replace("Group ", "")) : 1;
                  const logicConfig = engineData?.groups.find((g: any) => g.group_number === groupNum)
                    ?.logics.find((l: any) => l.logic_name?.toUpperCase() === logic);
                  
                  return (
                    <LogicModule
                      key={logic}
                      name={logic}
                      engine={engine}
                      expanded={expandedLogics.includes(logic)}
                      onToggle={() => toggleLogic(logic)}
                      platform={platform}
                      logicConfig={logicConfig}
                      groups={groups}
                      engineData={engineData}
                      selectedFields={selectedFields || []}
                      onUpdate={(field, value) => onUpdateLogic?.(logic, field, value)}
                    />
                  );
                })}
                
                <div className="flex items-center gap-2 pt-3 border-t border-border/40">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 px-3 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => setDuplicateOpen(true)}
                  >
                    <Copy className="w-3.5 h-3.5 mr-1.5" />Duplicate
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 px-3 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />Reset
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 px-3 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => setCompareOpen(true)}
                  >
                    <GitCompare className="w-3.5 h-3.5 mr-1.5" />Compare
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <CompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        sourceEngine={engine}
      />
      <DuplicateModal
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        sourceEngine={engine}
        sourceGroups={groups}
      />
    </>
  );
}

function StatusBadge({ status }: { status: "filled" | "partial" | "empty" }) {
  return (
    <span className={cn(
      "px-2.5 py-1 text-[10px] rounded-md font-medium",
      status === "filled" && "status-filled",
      status === "partial" && "status-partial",
      status === "empty" && "status-empty"
    )}>
      {status === "filled" ? "Complete" : status === "partial" ? "Partial" : "Empty"}
    </span>
  );
}

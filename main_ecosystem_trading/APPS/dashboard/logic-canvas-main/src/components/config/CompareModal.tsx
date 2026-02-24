import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface CompareModalProps {
  open: boolean;
  onClose: () => void;
  sourceEngine: string;
  targetEngine?: string;
}

const engines = ["Engine A", "Engine B", "Engine C"];
const logics = ["POWER", "REPOWER", "SCALPER", "STOPPER", "STO", "SCA", "RPO"];
const groups = Array.from({ length: 20 }, (_, i) => `Group ${i + 1}`);

const getMockData = (engine: string, logic: string, group: string) => {
  // Generate deterministic mock data based on inputs
  const seed = (engine.charCodeAt(7) + logic.charCodeAt(0) + parseInt(group.split(" ")[1])) % 10;
  return [
    { field: "initial_lot", value: (1.0 + seed * 0.1).toFixed(1) },
    { field: "tp", value: (5.0 + seed * 0.2).toFixed(1) },
    { field: "sl", value: (3.0 + seed * 0.5).toFixed(1) },
    { field: "grid", value: seed % 2 === 0 ? "ON" : "OFF" },
    { field: "start_level", value: 10 + seed },
    { field: "max_orders", value: 5 + seed },
    { field: "multiplier", value: (1.3 + seed * 0.1).toFixed(1) },
    { field: "trail_start", value: (2.0 + seed * 0.3).toFixed(1) },
  ];
};

export function CompareModal({ open, onClose, sourceEngine }: CompareModalProps) {
  const [leftEngine, setLeftEngine] = useState(sourceEngine);
  const [rightEngine, setRightEngine] = useState(engines.find(e => e !== sourceEngine) || engines[1]);
  const [leftLogic, setLeftLogic] = useState("POWER");
  const [rightLogic, setRightLogic] = useState("POWER");
  const [currentGroup, setCurrentGroup] = useState(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copiedFieldResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedFieldResetRef.current) {
        clearTimeout(copiedFieldResetRef.current);
        copiedFieldResetRef.current = null;
      }
    };
  }, []);

  const group = groups[currentGroup];
  const leftData = getMockData(leftEngine, leftLogic, group);
  const rightData = getMockData(rightEngine, rightLogic, group);

  const comparison = leftData.map((left, idx) => ({
    field: left.field,
    left: left.value,
    right: rightData[idx].value,
    diff: left.value !== rightData[idx].value,
  }));

  const diffCount = comparison.filter(c => c.diff).length;

  const copyValue = (field: string, value: string | number, direction: "left" | "right") => {
    // console.log(`Copying ${field}: ${value} to ${direction === "left" ? "right" : "left"}`);
    setCopiedField(field);
    if (copiedFieldResetRef.current) {
      clearTimeout(copiedFieldResetRef.current);
    }
    copiedFieldResetRef.current = setTimeout(() => {
      setCopiedField(null);
      copiedFieldResetRef.current = null;
    }, 1500);
  };

  const prevGroup = () => setCurrentGroup(prev => Math.max(0, prev - 1));
  const nextGroup = () => setCurrentGroup(prev => Math.min(groups.length - 1, prev + 1));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <ArrowLeftRight className="w-4 h-4 text-primary" />
            Compare Configurations
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selection Row */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left Side */}
            <div className="space-y-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Left Selection</div>
              <div className="flex gap-2">
                <select
                  value={leftEngine}
                  onChange={(e) => setLeftEngine(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-border bg-input text-xs px-3 focus:ring-2 focus:ring-primary/20"
                >
                  {engines.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <select
                  value={leftLogic}
                  onChange={(e) => setLeftLogic(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-border bg-input text-xs px-3 focus:ring-2 focus:ring-primary/20"
                >
                  {logics.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            {/* Right Side */}
            <div className="space-y-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Right Selection</div>
              <div className="flex gap-2">
                <select
                  value={rightEngine}
                  onChange={(e) => setRightEngine(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-border bg-input text-xs px-3 focus:ring-2 focus:ring-primary/20"
                >
                  {engines.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <select
                  value={rightLogic}
                  onChange={(e) => setRightLogic(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-border bg-input text-xs px-3 focus:ring-2 focus:ring-primary/20"
                >
                  {logics.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Group Navigator */}
          <div className="flex items-center justify-center gap-4 py-3 border-y border-border/50">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={prevGroup}
              disabled={currentGroup === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">{group}</span>
              <span className="text-[10px] text-muted-foreground">
                {currentGroup + 1} of {groups.length}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={nextGroup}
              disabled={currentGroup === groups.length - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            
            {/* Quick Jump */}
            <div className="ml-4 flex gap-1">
              {[0, 4, 9, 14, 19].map(idx => (
                <button
                  key={idx}
                  onClick={() => setCurrentGroup(idx)}
                  className={cn(
                    "w-7 h-7 rounded text-[10px] font-mono transition-colors",
                    currentGroup === idx 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted/30 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Comparison Table */}
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_auto_120px] bg-muted/30 border-b border-border/50 text-[10px] uppercase tracking-wide text-muted-foreground">
              <div className="px-4 py-3">Parameter</div>
              <div className="px-4 py-3 text-center border-l border-border/30">
                {leftEngine} / {leftLogic}
              </div>
              <div className="px-2 py-3"></div>
              <div className="px-4 py-3 text-center border-l border-border/30">
                {rightEngine} / {rightLogic}
              </div>
            </div>

            <ScrollArea className="max-h-72">
              <div className="divide-y divide-border/30">
                {comparison.map((row) => (
                  <div
                    key={row.field}
                    className={cn(
                      "grid grid-cols-[1fr_120px_auto_120px] text-xs",
                      row.diff && "bg-warning/5"
                    )}
                  >
                    <div className="px-4 py-3 font-mono text-muted-foreground flex items-center gap-2">
                      {row.diff ? (
                        <span className="w-2 h-2 rounded-full bg-warning" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-success" />
                      )}
                      {row.field}
                    </div>
                    <div className="px-4 py-3 text-center font-mono border-l border-border/30 flex items-center justify-center gap-2">
                      <span>{row.left}</span>
                      {row.diff && (
                        <button 
                          onClick={() => copyValue(row.field, row.left, "right")}
                          className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          title="Copy to right"
                        >
                          {copiedField === row.field ? (
                            <Check className="w-3 h-3 text-success" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                    <div className="px-2 py-3 flex items-center justify-center">
                      {row.diff && <ArrowLeftRight className="w-3 h-3 text-warning/70" />}
                    </div>
                    <div className={cn(
                      "px-4 py-3 text-center font-mono border-l border-border/30 flex items-center justify-center gap-2",
                      row.diff && "text-warning"
                    )}>
                      {row.diff && (
                        <button 
                          onClick={() => copyValue(row.field, row.right, "left")}
                          className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          title="Copy to left"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                      <span>{row.right}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-6 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-warning" />
                {diffCount} differences
              </span>
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-success" />
                {comparison.length - diffCount} matching
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
              <Button size="sm" className="btn-gold">
                Sync All Differences
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

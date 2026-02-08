import { useState } from "react";
import { Copy, Check, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DuplicateModalProps {
  open: boolean;
  onClose: () => void;
  sourceEngine: string;
  sourceGroups: string[];
}

export function DuplicateModal({ open, onClose, sourceEngine, sourceGroups }: DuplicateModalProps) {
  const [targetEngine, setTargetEngine] = useState<string | null>(null);
  const [targetGroups, setTargetGroups] = useState<string[]>([]);
  const [duplicateLogics, setDuplicateLogics] = useState(true);

  const engines = ["Engine A", "Engine B", "Engine C"];
  const allGroups = Array.from({ length: 15 }, (_, i) => `Group ${i + 1}`);

  const toggleGroup = (group: string) => {
    setTargetGroups((prev) =>
      prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]
    );
  };

  const handleDuplicate = () => {
    // console.log("Duplicating:", {
    //   from: { engine: sourceEngine, groups: sourceGroups },
    //   to: { engine: targetEngine, groups: targetGroups },
    //   includeLogics: duplicateLogics,
    // });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Copy className="w-4 h-4 text-primary" />
            Duplicate Configuration
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source */}
          <div className="p-3 rounded bg-muted/20 border border-border/50">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Source</div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{sourceEngine}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-xs text-muted-foreground">
                {sourceGroups.length} group{sourceGroups.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Target Engine */}
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
              Target Engine
            </div>
            <div className="flex gap-1">
              {engines.map((engine) => (
                <button
                  key={engine}
                  onClick={() => setTargetEngine(engine)}
                  className={cn(
                    "flex-1 px-3 py-2 rounded text-xs transition-colors border",
                    targetEngine === engine
                      ? "bg-primary/20 text-primary border-primary/40"
                      : "bg-muted/20 text-muted-foreground hover:text-foreground border-border/50 hover:border-border"
                  )}
                >
                  {engine}
                </button>
              ))}
            </div>
          </div>

          {/* Target Groups */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Target Groups
              </div>
              <button
                onClick={() => setTargetGroups(targetGroups.length === allGroups.length ? [] : allGroups)}
                className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
              >
                {targetGroups.length === allGroups.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1 max-h-32 overflow-y-auto p-1 rounded border border-border/50 bg-muted/10">
              {allGroups.map((group) => {
                const num = parseInt(group.replace("Group ", ""));
                const selected = targetGroups.includes(group);
                return (
                  <button
                    key={group}
                    onClick={() => toggleGroup(group)}
                    className={cn(
                      "px-2 py-1.5 rounded text-[10px] transition-colors",
                      selected
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    )}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center justify-between py-2 border-y border-border/30">
            <span className="text-xs text-muted-foreground">Include all logic configurations</span>
            <button
              onClick={() => setDuplicateLogics(!duplicateLogics)}
              className={cn(
                "w-9 h-5 rounded-full transition-colors relative",
                duplicateLogics ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                  duplicateLogics ? "left-[18px]" : "left-0.5"
                )}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="gold"
              onClick={handleDuplicate}
              disabled={!targetEngine || targetGroups.length === 0}
              className="flex-1"
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" />
              Duplicate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

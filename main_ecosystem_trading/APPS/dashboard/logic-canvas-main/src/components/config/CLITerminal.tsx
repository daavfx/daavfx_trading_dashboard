import { useState, useCallback } from "react";
import { Terminal, Zap, X, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CLITerminalProps {
  onExecuteCommand: (command: string) => void;
  placeholder?: string;
  className?: string;
}

export function CLITerminal({ 
  onExecuteCommand, 
  placeholder = "set grid power a 600, set lot 0.02, enable reverse...",
  className 
}: CLITerminalProps) {
  const [input, setInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);

  const handleExecute = useCallback(() => {
    const cmd = input.trim();
    if (!cmd) return;
    
    setIsExecuting(true);
    onExecuteCommand(cmd);
    setInput("");
    setTimeout(() => setIsExecuting(false), 300);
  }, [input, onExecuteCommand]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleExecute();
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Main Terminal Container */}
      <div className="rounded-xl border border-border/60 bg-background/80 shadow-sm overflow-hidden">
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">CLI Terminal</span>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Press Enter to apply
          </div>
        </div>

        {/* Input Row */}
        <div className="flex items-center gap-2 px-4 py-3 bg-background/40">
          <div className="flex-1 flex items-center gap-3">
            <span className="text-sm font-mono text-muted-foreground shrink-0">&gt;</span>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm font-mono h-7 placeholder:text-muted-foreground/50"
            />
          </div>
          {input && (
            <button
              onClick={() => setInput("")}
              className="p-1.5 hover:bg-muted rounded-md transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
          <Button
            onClick={handleExecute}
            disabled={!input.trim() || isExecuting}
            size="sm"
            className={cn(
              "h-8 px-4 gap-1.5 shrink-0 font-medium",
              isExecuting && "animate-pulse"
            )}
          >
            <Zap className="w-3.5 h-3.5" />
            Apply
          </Button>
        </div>

        {/* Quick Commands */}
        <div className="px-4 py-2.5 bg-muted/20 border-t border-border/40">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">Quick:</span>
            {[
              { label: "grid 600", cmd: "set grid to 600" },
              { label: "lot 0.02", cmd: "set lot 0.02" },
              { label: "mult 1.5", cmd: "set multiplier 1.5" },
              { label: "trail 50", cmd: "set trail to 50" },
              { label: "reverse", cmd: "enable reverse" },
              { label: "hedge", cmd: "enable hedge" },
              { label: "show", cmd: "show grid" },
            ].map((q) => (
              <button
                key={q.label}
                onClick={() => setInput(q.cmd)}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-background border border-border/40 hover:bg-muted/50 hover:border-border/60 text-muted-foreground hover:text-foreground transition-all font-mono"
              >
                <span>{q.label}</span>
                <ChevronRight className="w-3 h-3 opacity-40" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

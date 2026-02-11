import { useState } from "react";
import { 
  Sparkles, 
  Zap, 
  Calculator, 
  Copy, 
  Trash2, 
  RefreshCcw, 
  Wand2,
  TrendingUp,
  Percent,
  Sliders,
  ShieldCheck,
  BrainCircuit,
  Activity
} from "lucide-react";
import { Platform } from "@/components/layout/TopBar";
import { ChatPanel } from "@/components/layout/ChatPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MTConfig } from "@/types/mt-config";

interface BatchEditTabProps {
  platform: Platform;
  config: MTConfig | null;
  onConfigChange: (config: MTConfig) => void;
  onNavigate: (target: { engines?: string[]; groups?: number[]; logics?: string[]; fields?: string[] }) => void;
}

export function BatchEditTab({ platform, config, onConfigChange, onNavigate }: BatchEditTabProps) {
  const [showTools, setShowTools] = useState(true);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);

  const handleToolClick = (command: string) => {
    setActiveCommand(command);
    // Reset after a brief delay so it can be triggered again
    setTimeout(() => setActiveCommand(null), 100);
  };

  return (
    <div className="h-[calc(100vh-180px)] flex bg-background/50 rounded-xl border border-border/40 overflow-hidden shadow-sm">
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/30 bg-muted/10 backdrop-blur-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 shadow-[0_0_15px_-3px_rgba(59,130,246,0.15)]">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
                AI Batch Generator
                <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-[9px] font-medium text-primary border border-primary/20">
                  v2.0
                </span>
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <BrainCircuit className="w-3 h-3" />
                Context-aware generation & modification system
              </p>
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className={cn(
              "h-8 gap-2 text-xs transition-all", 
              showTools ? "bg-primary/10 text-primary hover:bg-primary/20" : "text-muted-foreground"
            )}
            onClick={() => setShowTools(!showTools)}
          >
            <Wand2 className="w-3.5 h-3.5" />
            {showTools ? "Hide Gadgets" : "Show Gadgets"}
          </Button>
        </div>

        {/* Chat Interface */}
        <div className="flex-1 overflow-hidden relative bg-background">
          <div className="absolute inset-0">
            <ChatPanel 
              config={config} 
              onConfigChange={onConfigChange} 
              onNavigate={onNavigate}
              externalCommand={activeCommand}
            />
          </div>
        </div>
      </div>

      {/* Tools Sidebar (Gadgets) */}
      {showTools && (
        <div className="w-64 border-l border-border/40 bg-muted/5 flex flex-col overflow-y-auto backdrop-blur-sm">
          <div className="p-4 space-y-6">
            
            {/* Quick Presets */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Zap className="w-3 h-3" /> Quick Actions
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <ToolButton 
                  icon={<RefreshCcw className="w-3.5 h-3.5" />} 
                  label="Reset All" 
                  onClick={() => handleToolClick("reset all groups to default")}
                  variant="outline"
                />
                <ToolButton 
                  icon={<Copy className="w-3.5 h-3.5" />} 
                  label="Clone G1" 
                  onClick={() => handleToolClick("copy settings from group 1 to all groups")}
                  variant="outline"
                />
              </div>
            </div>

            {/* Progression Tools */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" /> Progression
              </h3>
              <div className="space-y-1.5">
                <ToolButton 
                  icon={<span className="text-[10px] font-mono font-bold">Fib</span>} 
                  label="Fibonacci Grid" 
                  onClick={() => handleToolClick("create fibonacci progression for grid from 100 to 2000 for all groups")}
                />
                <ToolButton 
                  icon={<span className="text-[10px] font-mono font-bold">Lin</span>} 
                  label="Linear Lots" 
                  onClick={() => handleToolClick("create linear progression for initial_lot from 0.01 to 0.1 for all groups")}
                />
                <ToolButton 
                  icon={<span className="text-[10px] font-mono font-bold">Exp</span>} 
                  label="Exp Multiplier" 
                  onClick={() => handleToolClick("create exponential progression for multiplier from 1.1 factor 1.1 for all groups")}
                />
              </div>
            </div>

            {/* Bulk Modifiers */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sliders className="w-3 h-3" /> Bulk Adjust
              </h3>
              <div className="space-y-1.5">
                <ToolButton 
                  icon={<Percent className="w-3.5 h-3.5" />} 
                  label="Increase Risk 10%" 
                  onClick={() => handleToolClick("increase initial_lot by 10% for all groups")}
                />
                <ToolButton 
                  icon={<Percent className="w-3.5 h-3.5" />} 
                  label="Decrease Risk 10%" 
                  onClick={() => handleToolClick("decrease initial_lot by 10% for all groups")}
                />
              </div>
            </div>

             {/* Safety & Magic */}
             <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Wand2 className="w-3 h-3" /> Magic Tools
              </h3>
              <div className="space-y-1.5">
                <ToolButton 
                  icon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />} 
                  label="Optimize Grid" 
                  onClick={() => handleToolClick("analyze and optimize grid settings for current volatility")}
                  className="border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                />
                <ToolButton 
                  icon={<ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />} 
                  label="Safety Check" 
                  onClick={() => handleToolClick("check for dangerous settings and fix risks")}
                  className="border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                />
                <ToolButton 
                  icon={<Activity className="w-3.5 h-3.5 text-blue-500" />} 
                  label="Smart Hedge" 
                  onClick={() => handleToolClick("setup hedge mode for high volatility markets")}
                  className="border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                />
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

function ToolButton({ 
  icon, 
  label, 
  onClick, 
  variant = "ghost",
  className
}: { 
  icon: React.ReactNode; 
  label: string; 
  onClick: () => void; 
  variant?: "ghost" | "outline";
  className?: string;
}) {
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={onClick}
      className={cn(
        "w-full justify-start h-8 text-xs font-normal transition-all duration-200",
        variant === "ghost" && "bg-background/50 hover:bg-background border border-transparent hover:border-border/50 hover:shadow-sm",
        className
      )}
    >
      <div className="mr-2 shrink-0 opacity-70">{icon}</div>
      <span className="truncate">{label}</span>
    </Button>
  );
}

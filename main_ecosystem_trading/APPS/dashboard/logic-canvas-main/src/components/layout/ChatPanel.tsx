import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, 
  Bot, 
  User, 
  Command, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles,
  Trash2,
  Zap,
  ChevronUp,
  ChevronDown,
  Search,
  Sliders,
  TrendingUp,
  Copy as CopyIcon,
  GitCompare,
  Terminal,
  ShieldAlert,
  Camera,
  LineChart
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useChatCommands } from "@/hooks/useChatCommands";
import { commandExecutor } from "@/lib/chat";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { QuickActionsPanel } from "@/components/chat/QuickActionsPanel";
import { FileOperationsPanel } from "@/components/chat/FileOperationsPanel";
import { ChangePreviewPanel } from "@/components/chat/ChangePreviewPanel";
import type { MTConfig } from "@/types/mt-config";
import type { TransactionPlan, ChangePreview, FieldChange } from "@/lib/chat/types";

interface ChatPanelProps {
  config?: MTConfig | null;
  onConfigChange?: (config: MTConfig) => void;
  onNavigate?: (target: { engines?: string[]; groups?: number[]; logics?: string[]; fields?: string[] }) => void;
  onPlanSnapshot?: (snapshot: {
    pendingPlan: TransactionPlan | null;
    lastAppliedPreview: ChangePreview[] | null;
  }) => void;
  externalCommand?: string | null;
  selectedEngines?: string[];
  selectedGroups?: string[];
  selectedLogics?: string[];
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onClearSelection?: () => void;
}

interface CommandTemplate {
  label: string;
  example: string;
}

// Get styled background based on risk level in message content
function getPlanStyle(content: string): string {
  if (content.includes("CRITICAL RISK") || content.includes("🔴")) {
    return "bg-red-500/10 border border-red-500/30 text-foreground";
  }
  if (content.includes("HIGH RISK") || content.includes("🟠")) {
    return "bg-orange-500/10 border border-orange-500/30 text-foreground";
  }
  if (content.includes("MEDIUM RISK") || content.includes("🟡")) {
    return "bg-yellow-500/10 border border-yellow-500/30 text-foreground";
  }
  if (content.includes("LOW RISK") || content.includes("🟢")) {
    return "bg-green-500/10 border border-green-500/30 text-foreground";
  }
  // Default assistant style
  return "bg-card border border-border/60 text-foreground";
}

export function ChatPanel({
  config = null,
  onConfigChange,
  onNavigate,
  onPlanSnapshot,
  externalCommand,
  selectedEngines = [],
  selectedGroups = [],
  selectedLogics = [],
  isCollapsed = false,
  onToggleCollapse,
  onClearSelection,
}: ChatPanelProps) {
  const [showGuide, setShowGuide] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Track pending plan and recent changes for the ChangePreviewPanel
  const [localPendingPlan, setLocalPendingPlan] = useState<TransactionPlan | null>(null);
  const [localRecentChanges, setLocalRecentChanges] = useState<FieldChange[]>([]);

  const defaultTarget = {
    engines: selectedEngines
      .map((e) => {
        const m = e.match(/Engine\s+([A-Z])/i);
        return m ? m[1].toUpperCase() : null;
      })
      .filter(Boolean) as string[],
    groups: selectedGroups
      .map((g) => {
        const m = g.match(/(\d+)/);
        return m ? parseInt(m[1], 10) : null;
      })
      .filter((n): n is number => typeof n === "number" && !Number.isNaN(n)),
    logics: selectedLogics
      .map((l) => {
        const trimmed = String(l).trim();
        const mColon = trimmed.match(/^([A-Z])\s*[:/\\-]\s*(.+)$/i);
        if (mColon) {
          return `${mColon[1].toUpperCase()}:${String(mColon[2]).trim().toUpperCase()}`;
        }
        return trimmed.toUpperCase();
      })
      .filter(Boolean),
  };

  const targetLabelParts: string[] = [];
  if (defaultTarget.engines.length) targetLabelParts.push(`Engine ${defaultTarget.engines.join(",")}`);
  if (defaultTarget.groups.length) targetLabelParts.push(`G${defaultTarget.groups.join(",")}`);
  if (defaultTarget.logics.length) targetLabelParts.push(defaultTarget.logics.join(","));
  const targetLabel = targetLabelParts.length ? targetLabelParts.join(" · ") : "No selection";
  
  const commandGroups: { title: string; icon: any; items: CommandTemplate[] }[] = [
    {
      title: "Query",
      icon: Search,
      items: [
        { label: "show grid", example: "show grid for all groups" },
        { label: "find high grid", example: "show all groups with grid > 500" },
        { label: "analyze power", example: "analyze power settings for group 1" },
      ],
    },
    {
      title: "Set",
      icon: Sliders,
      items: [
        { label: "set grid", example: "set grid to 600 for groups 1-8" },
        { label: "set lot", example: "set initial_lot to 0.02 for power" },
        { label: "bulk update", example: "set multiplier to 1.5 where grid > 500" },
      ],
    },
    {
      title: "Progression",
      icon: TrendingUp,
      items: [
        { label: "fibonacci", example: "create progression for grid from 600 to 3000 fibonacci groups 1-8" },
        { label: "linear", example: "create linear progression for lot from 0.01 to 0.08 groups 1-8" },
        { label: "exponential", example: "create exponential progression for lot from 0.01 factor 1.5 groups 1-8" },
      ],
    },
    {
      title: "Risk & Safety",
      icon: ShieldAlert,
      items: [
        { label: "equity stop", example: "set equity_stop_value to 35%" },
        { label: "max drawdown", example: "set max_drawdown_percent to 25%" },
        { label: "news filter", example: "enable news_filter for all" },
      ],
    },
    {
      title: "Copy / Compare",
      icon: CopyIcon,
      items: [
        { label: "copy settings", example: "copy power settings from group 1 to groups 2-8" },
        { label: "compare", example: "compare grid between group 1 and group 5" },
      ],
    },
    {
      title: "Meta",
      icon: Terminal,
      items: [
        { label: "apply plan", example: "apply" },
        { label: "apply partial", example: "apply 1-3" },
        { label: "apply remaining", example: "apply remaining" },
        { label: "cancel plan", example: "cancel" },
        { label: "undo last", example: "undo" },
        { label: "redo last", example: "redo" },
        { label: "plan history", example: "history 10" },
        { label: "fast mode", example: "/fast on" },
        { label: "full guide", example: "help" },
      ],
    },
  ];
  
  const {
    messages,
    suggestions,
    inputValue,
    setInputValue,
    sendMessage,
    applySuggestion,
    clearHistory
  } = useChatCommands({
    config,
    onConfigChange: onConfigChange || (() => {}),
    onNavigate,
    onClearSelection,
    defaultTarget
  });

  useEffect(() => {
    if (!onPlanSnapshot) return;

    let pendingPlan: TransactionPlan | null = null;
    let lastAppliedPreview: ChangePreview[] | null = null;

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      const plan = m.result?.pendingPlan;
      if (!pendingPlan && plan && plan.status === "pending") {
        pendingPlan = plan;
      }
      if (!lastAppliedPreview && m.result?.changes && m.result.changes.length > 0) {
        lastAppliedPreview = m.result.changes.map((c) => ({
          engine: c.engine,
          group: c.group,
          logic: c.logic,
          field: c.field,
          currentValue: c.oldValue,
          newValue: c.newValue,
        }));
      }
      if (pendingPlan && lastAppliedPreview) break;
    }

    // Update local state for ChangePreviewPanel
    setLocalPendingPlan(pendingPlan);
    setLocalRecentChanges(lastAppliedPreview ? 
      lastAppliedPreview.map(c => ({
        engine: c.engine,
        group: c.group,
        logic: c.logic,
        field: c.field,
        oldValue: c.currentValue,
        newValue: c.newValue
      })) : []);
    
    onPlanSnapshot({ pendingPlan, lastAppliedPreview });
  }, [messages, onPlanSnapshot]);

  // Handle external commands from BatchEditTab gadgets
  useEffect(() => {
    if (externalCommand) {
      setInputValue(externalCommand);
      sendMessage(externalCommand);
    }
  }, [externalCommand, sendMessage, setInputValue]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const viewport = root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  if (isCollapsed) {
    return (
      <aside className="h-full border-l border-border bg-background-elevated flex flex-col items-center py-4">
        <button 
          onClick={onToggleCollapse} 
          className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/30 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="mt-4 writing-mode-vertical text-[10px] text-muted-foreground tracking-widest uppercase font-medium">
          Ryiuk
        </div>
        <div className="mt-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
      </aside>
    );
  }

  return (
    <aside className="h-full border-l border-border bg-background-elevated flex flex-col">
      {/* Header */}
      <div className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
          <div className="p-1.5 rounded-md bg-gradient-to-br from-amber-500/20 to-yellow-500/10 shrink-0">
            <Bot className="w-4 h-4 text-amber-500" />
          </div>
          <div className="min-w-0 flex flex-col">
            <span className="text-xs font-semibold text-foreground truncate">Ryiuk</span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
              <span className="text-[10px] text-muted-foreground truncate">
                {config ? "Config loaded" : "No config"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={() => setShowQuickActions((prev) => !prev)}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              showQuickActions 
                ? "bg-amber-500/20 text-amber-400"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}
            title="Quick Actions"
          >
            <Zap className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={clearHistory}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/30 transition-colors"
            title="Clear history"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowGuide((prev) => !prev)}
            className="px-1.5 py-1 text-[10px] text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/30 transition-colors"
            title="Command guide"
          >
            /help
          </button>
          <button 
            onClick={onToggleCollapse} 
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/30 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-border/60 bg-muted/10 text-[10px] text-muted-foreground">
        Target: <span className="text-foreground/80">{targetLabel}</span>
      </div>

      {showGuide && (
        <div className="px-4 py-2 border-b border-border/60 bg-muted/10 text-[10px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-foreground">Command guide</span>
            <span className="text-muted-foreground">Type / or # before commands if you like</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {commandGroups.map((group) => (
              <div key={group.title} className="space-y-1">
                <div className="flex items-center gap-1.5 mb-1">
                  {group.icon && <group.icon className="w-3 h-3 text-primary/70" />}
                  <div className="uppercase tracking-wide text-[9px] text-muted-foreground font-semibold">{group.title}</div>
                </div>
                <div className="flex flex-col gap-1">
                  {group.items.map((item) => (
                    <button
                      key={item.example}
                      onClick={() => setInputValue(item.example)}
                      className="text-left text-[10px] px-2 py-1 rounded bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors truncate"
                    >
                      {item.example}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions Panel */}
      {showQuickActions && (
        <div className="border-b border-border/60 space-y-3 p-3">
          <QuickActionsPanel
            config={config}
            onConfigChange={onConfigChange || (() => {})}
            onMessage={(msg) => {
              // Add message to chat
              const assistantMessage = {
                id: `assistant-${Date.now()}`,
                role: "assistant" as const,
                content: msg,
                timestamp: Date.now()
              };
              // We need to trigger this through the hook
              sendMessage(`/quick-action-result: ${msg}`);
            }}
          />
          
          {/* File Operations */}
          <FileOperationsPanel
            config={config}
            onExport={(format) => sendMessage(`/export ${format}`)}
            onLoad={(format) => sendMessage(`/load ${format}`)}
            onImport={() => sendMessage("/load")}
          />
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 w-full" ref={scrollRef}>
        <div className="p-4 space-y-3 w-full max-w-full">
          <AnimatePresence>
            {messages.filter(msg => !(msg.id === 'welcome' && messages.length > 1)).map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("flex gap-2.5 w-full max-w-full min-w-0", msg.role === "user" && "flex-row-reverse")}
              >
                <div className={cn(
                  "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                  msg.role === "assistant" ? "bg-amber-500/10" : 
                  msg.role === "system" ? "bg-primary/10" : "bg-accent/10"
                )}>
                  {msg.role === "user" 
                    ? <User className="w-3 h-3 text-accent" />
                    : <Bot className="w-3 h-3 text-amber-500" />
                  }
                </div>
                <div className={cn(
                  "flex-1 min-w-0 max-w-[calc(100%-2.5rem)] px-3 py-2 rounded-lg text-xs leading-relaxed overflow-hidden",
                  msg.role === "user" 
                    ? "bg-accent/10 border border-accent/20 text-foreground"
                    : msg.role === "system"
                    ? "bg-muted/30 border border-border/40 text-muted-foreground"
                    : getPlanStyle(msg.content)
                )}>
                  <ChatMessageContent 
                    message={msg} 
                    onSend={sendMessage} 
                    onNavigate={onNavigate} 
                    onCompose={setInputValue}
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="px-4 py-2 border-t border-border/50 bg-muted/20">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5">Suggestions</div>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => applySuggestion(suggestion)}
                className="text-[10px] px-2 py-1 rounded bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors truncate max-w-full"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Change Preview Panel - Shows pending/recent changes */}
      {(localPendingPlan || localRecentChanges.length > 0) && (
        <div className="px-4 py-2 border-t border-border/50">
          <ChangePreviewPanel
            pendingPlan={localPendingPlan}
            recentChanges={localRecentChanges}
            onConfirm={() => sendMessage("apply")}
            onCancel={() => sendMessage("cancel")}
            onUndo={() => sendMessage("undo")}
            compact
          />
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="relative">
          <Command className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="set grid to 600 for groups 1-8..."
            className="pl-9 pr-10 h-9 text-xs input-refined"
          />
          <Button
            size="icon"
            onClick={() => sendMessage(inputValue)}
            disabled={!inputValue.trim()}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
        {messages.length === 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] text-muted-foreground/60">
            <button onClick={() => setInputValue("show grid for all groups")} className="hover:text-muted-foreground">show grid</button>
            <span>·</span>
            <button onClick={() => setInputValue("set grid to 500 for groups 1-8")} className="hover:text-muted-foreground">set grid</button>
            <span>·</span>
            <button onClick={() => setInputValue("create progression for grid fibonacci groups 1-8")} className="hover:text-muted-foreground">fibonacci</button>
          </div>
        )}
      </div>
    </aside>
  );
}

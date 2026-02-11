import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown, ChevronRight, Copy, Check, ArrowRight, Eye, Pencil, Sparkles, Zap, AlertTriangle,
  Search, Sliders, TrendingUp, ShieldAlert, Terminal, Command, FileJson, FileText, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  WelcomeMessage,
  SemanticPreviewPanel,
  ResultStatus,
  SectionHeader,
  GradientDivider,
  LabeledDivider,
  OperationCard,
  StatCard
} from "./PremiumChatStyles";
import { VisualTransactionReview } from "./VisualTransactionReview";
import { FileOperationResult } from "./FileOperationsPanel";
import {
  TransactionPlan,
  ChangePreview,
  ChatMessage,
  QueryResult,
  QueryMatch,
  CommandResult,
  FieldChange
} from "@/lib/chat/types";

interface ChatMessageContentProps {
  message: ChatMessage;
  onSend?: (text: string) => void;
  onNavigate?: (target: { engines?: string[]; groups?: number[]; logics?: string[]; fields?: string[] }) => void;
  onCompose?: (text: string) => void;
}

export function ChatMessageContent({ message, onSend, onNavigate, onCompose }: ChatMessageContentProps) {
  // Welcome message - use premium component
  if (message.id === "welcome") {
    return <WelcomeMessage onCompose={onCompose} />;
  }

  if (message.result?.changes && message.result.changes.length > 0) {
    if (message.result.pendingPlan) {
      return <TransactionPlanRenderer plan={message.result.pendingPlan} isApplied={true} onSend={onSend} />;
    }
    return <ChangesRenderer result={message.result} />;
  }

  // Handle structured pending plan
  if (message.result?.pendingPlan) {
    return <TransactionPlanRenderer plan={message.result.pendingPlan} isApplied={false} onSend={onSend} />;
  }

  // If it's a query result, render the structured view
  if (message.result?.queryResult) {
    // Note: Auto-navigation is handled by useChatCommands hook when command is executed
    // We don't do it here to avoid side effects in render and double-navigation during history replay
    return <QueryResultsRenderer result={message.result.queryResult} onNavigate={onNavigate} onCompose={onCompose} />;
  }

  // Handle semantic preview
  if (message.content.includes("[SEMANTIC PREVIEW]")) {
    return <SemanticPreviewRenderer content={message.content} onSend={onSend} />;
  }

  // Handle plan previews or other structured content if added later
  // For now, check if content looks like a plan (heuristic)
  if (message.content.includes("Transaction Plan")) {
    return <PlanRenderer content={message.content} onSend={onSend} />;
  }

  // Handle legacy snapshot results (fallback)
  if (message.content.includes("Snapshot for")) {
    return <SnapshotRenderer content={message.content} />;
  }

  // Handle help message
  if (message.content.includes("Command guide:")) {
    return <HelpRenderer content={message.content} />;
  }

  // Handle error/vague messages
  if (message.content.includes("Target too vague") || message.content.includes("Missing field") || message.content.startsWith("Error:")) {
    return <ErrorRenderer content={message.content} onCompose={onCompose} />;
  }

  // Handle export/load results with visual cards
  if (message.content.includes("Exported") && (message.content.includes(".set") || message.content.includes(".json"))) {
    return <FileOperationResultRenderer content={message.content} type="export" />;
  }
  if (message.content.includes("Loaded") && (message.content.includes(".set") || message.content.includes(".json"))) {
    return <FileOperationResultRenderer content={message.content} type="load" />;
  }
  if (message.content.includes("Export failed") || message.content.includes("Load failed") || message.content.includes("cancelled")) {
    return <FileOperationErrorRenderer content={message.content} />;
  }

  // Default text renderer with styling based on content
  const styleClass = getPlanStyle(message.content);

  return (
    <div className={cn(
      "text-xs leading-relaxed whitespace-pre-wrap break-words overflow-hidden",
      message.role === "user" ? "text-foreground" : "text-foreground",
      styleClass
    )}>
      {message.content}
    </div>
  );
}

function ChangesRenderer({ result }: { result: CommandResult }) {
  const changes = result.changes || [];
  const count = changes.length;
  const [expanded, setExpanded] = useState(count <= 5);

  const displayedChanges = expanded ? changes : changes.slice(0, 5);

  return (
    <div className="space-y-3 w-full max-w-full overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ResultStatus type="success" />
          <span className="text-xs font-semibold">
            {count} change{count !== 1 ? 's' : ''} applied
          </span>
        </div>
        {count > 5 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {expanded ? 'Show less' : `Show ${count - 5} more`}
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        )}
      </div>
      
      <div className="grid gap-2">
        {displayedChanges.map((change, i) => (
          <OperationCard
            key={i}
            field={change.field}
            operation="set"
            oldValue={change.oldValue}
            newValue={change.newValue}
          />
        ))}
      </div>
    </div>
  );
}

function QueryResultsRenderer({ result, onNavigate, onCompose }: { result: QueryResult; onNavigate?: ChatMessageContentProps['onNavigate']; onCompose?: ChatMessageContentProps['onCompose'] }) {
  return (
    <div className="space-y-4 w-full max-w-full overflow-hidden">
      <SectionHeader
        icon={Search}
        title="Query Results"
        subtitle={result.summary}
        variant="info"
      />
      
      <div className="grid gap-2">
        {result.matches.slice(0, 10).map((match, i) => (
          <div
            key={i}
            className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border/40 hover:border-primary/30 transition-colors group cursor-pointer"
            onClick={() => {
              if (onNavigate) {
                onNavigate({
                  engines: [match.engine],
                  groups: [match.group],
                  logics: [match.logic],
                  fields: [match.field]
                });
              }
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
              <span className="text-[10px] text-muted-foreground shrink-0">
                {match.engine} G{match.group}
              </span>
              <span className="text-xs font-medium truncate">
                {match.logic} → {match.field}
              </span>
            </div>
            <span className="text-xs font-mono text-foreground shrink-0 ml-2">
              {match.value}
            </span>
          </div>
        ))}
        {result.matches.length > 10 && (
          <div className="text-[10px] text-muted-foreground text-center py-1">
            ... and {result.matches.length - 10} more matches
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionPlanRenderer({
  plan,
  isApplied,
  onSend
}: {
  plan: TransactionPlan;
  isApplied: boolean;
  onSend?: (text: string) => void;
}) {
  const [editedPlan, setEditedPlan] = useState<TransactionPlan>(plan);
  
  // Use the visual review interface for pending plans
  if (!isApplied && plan.status === "pending" && onSend) {
    return (
      <div className="w-full max-w-full overflow-hidden">
        <VisualTransactionReview
          plan={editedPlan}
          onApply={(approvedChanges) => {
            // Build the apply command with specific indices or "apply" for all
            if (approvedChanges.length === editedPlan.preview.length) {
              onSend("apply");
            } else if (approvedChanges.length === 0) {
              onSend("cancel");
            } else {
              // Build partial apply command
              const indices = approvedChanges.map(change => {
                const idx = editedPlan.preview.findIndex(p => 
                  p.engine === change.engine && 
                  p.group === change.group && 
                  p.field === change.field
                );
                return idx + 1;
              }).join(",");
              onSend(`apply ${indices}`);
            }
          }}
          onCancel={() => onSend("cancel")}
          onEditChange={(index, newValue) => {
            // Update the edited plan with new value
            setEditedPlan(prev => ({
              ...prev,
              preview: prev.preview.map((change, i) => 
                i === index ? { ...change, newValue } : change
              )
            }));
          }}
        />
      </div>
    );
  }

  // For applied plans, use the original premium styling
  const [expanded, setExpanded] = useState(plan.preview.length <= 8);
  const changes = expanded ? plan.preview : plan.preview.slice(0, 8);

  const riskLevel = plan.risk.level;
  const colors = {
    critical: { bg: "from-red-500/20 to-red-500/5", border: "border-red-500/30", text: "text-red-400", icon: ShieldAlert },
    high: { bg: "from-orange-500/20 to-orange-500/5", border: "border-orange-500/30", text: "text-orange-400", icon: AlertTriangle },
    medium: { bg: "from-amber-500/20 to-amber-500/5", border: "border-amber-500/30", text: "text-amber-400", icon: Zap },
    low: { bg: "from-emerald-500/20 to-emerald-500/5", border: "border-emerald-500/30", text: "text-emerald-400", icon: Check },
  }[riskLevel];

  const Icon = colors.icon;

  return (
    <div className="space-y-4 w-full max-w-full overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-400">
      <div className={cn(
        "relative overflow-hidden p-4 rounded-xl border bg-gradient-to-br shadow-lg",
        colors.bg, colors.border
      )}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-16 translate-x-16 blur-3xl pointer-events-none" />

        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={cn("p-2.5 rounded-lg bg-background/40 backdrop-blur-md shadow-inner shrink-0", colors.text)}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-foreground truncate">
                Tactical Changes Applied
              </h3>
              <p className="text-[10px] text-muted-foreground opacity-80 uppercase tracking-widest font-medium truncate">
                {plan.type} • {riskLevel} risk assessment
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end shrink-0">
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              applied
            </span>
            <span className="text-[9px] text-muted-foreground/60 mt-1 font-mono">
              {new Date(plan.createdAt).toLocaleTimeString()}
            </span>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-background/30 border border-white/5 text-xs text-foreground/90 leading-relaxed italic">
          {plan.description}
        </div>
      </div>

      {plan.risk.reasons.length > 0 && riskLevel !== "low" && (
        <div className="grid gap-2">
          <LabeledDivider label="Risk Assessment Factors" />
          <div className="flex flex-wrap gap-2">
            {plan.risk.reasons.map((reason, i) => (
              <span key={i} className="px-2 py-1 rounded-md bg-muted/20 border border-border/40 text-[10px] text-muted-foreground flex items-center gap-1.5 transition-colors hover:border-border/60">
                <div className={cn("w-1.5 h-1.5 rounded-full", colors.text.replace('text-', 'bg-'))} />
                {reason}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <LabeledDivider label={`Visual Diff (${plan.preview.length} targets)`} />
        <div className="grid gap-2">
          {changes.map((change, i) => (
            <OperationCard
              key={i}
              field={change.field}
              operation="set"
              oldValue={change.currentValue}
              newValue={change.newValue}
            />
          ))}
        </div>

        {plan.preview.length > 8 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full py-2 text-[10px] text-muted-foreground hover:text-foreground text-center rounded-lg bg-muted/10 hover:bg-muted/20 border border-border/20 transition-all flex items-center justify-center gap-2"
          >
            {expanded ? (
              <>Show less summary<ChevronDown className="w-3 h-3" /></>
            ) : (
              <>Show {plan.preview.length - 8} more targets in diff<ChevronRight className="w-3 h-3" /></>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function PlanRenderer({ content, onSend }: { content: string, onSend?: (text: string) => void }) {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);
  const isPending = content.includes("Type 'apply' to confirm") || content.includes("apply / cancel");

  const riskLevel = content.includes("CRITICAL RISK") ? "critical"
    : content.includes("HIGH RISK") ? "high"
      : content.includes("MEDIUM RISK") ? "medium"
        : "low";

  const riskColors = {
    critical: { bg: "from-red-500/20 to-red-500/5", border: "border-red-500/30", text: "text-red-400" },
    high: { bg: "from-orange-500/20 to-orange-500/5", border: "border-orange-500/30", text: "text-orange-400" },
    medium: { bg: "from-amber-500/20 to-amber-500/5", border: "border-amber-500/30", text: "text-amber-400" },
    low: { bg: "from-emerald-500/20 to-emerald-500/5", border: "border-emerald-500/30", text: "text-emerald-400" },
  };

  const colors = riskColors[riskLevel];

  const descriptionLines = lines.slice(1).filter(l =>
    !l.startsWith("•") &&
    !l.startsWith("⚠️") &&
    !l.startsWith("💡") &&
    !l.startsWith("📋") &&
    !l.includes("Type 'apply'")
  );

  return (
    <div className="space-y-4 w-full max-w-full overflow-hidden">
      <div className={cn(
        "relative overflow-hidden p-4 rounded-xl border bg-gradient-to-br shadow-lg",
        colors.bg, colors.border
      )}>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Command className={cn("w-4 h-4", colors.text)} />
              <span className="text-sm font-bold">Transaction Plan</span>
            </div>
            <span className={cn("text-[10px] uppercase tracking-wider font-semibold", colors.text)}>
              {riskLevel} Risk
            </span>
          </div>
          <p className="text-xs leading-relaxed italic">{descriptionLines.join(" ")}</p>
        </div>
      </div>

      {isPending && onSend && (
        <div className="flex gap-2">
          <button
            onClick={() => onSend("apply")}
            className="flex-1 py-2.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/30 transition-colors border border-emerald-500/30"
          >
            Apply
          </button>
          <button
            onClick={() => onSend("cancel")}
            className="px-4 py-2.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/30 transition-colors border border-red-500/30"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function SemanticPreviewRenderer({ content, onSend }: { content: string, onSend?: (text: string) => void }) {
  const lines = content.split('\n').filter(l => l.trim());
  const description = lines.find(l => !l.startsWith("[") && !l.includes("Reply")) || "";

  return (
    <div className="space-y-4 w-full max-w-full overflow-hidden">
      <SemanticPreviewPanel
        description={description.replace(/\*\*/g, '')}
        confidence={85}
        previewItems={[]}
      />

      {onSend && (
        <div className="flex gap-2">
          <button
            onClick={() => onSend("apply")}
            className="flex-1 py-2.5 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/30 transition-colors border border-amber-500/30"
          >
            Apply Semantic Changes
          </button>
          <button
            onClick={() => onSend("cancel")}
            className="px-4 py-2.5 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/80 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function SnapshotRenderer({ content }: { content: string }) {
  const lines = content.split('\n');
  const title = lines[0];
  const dataLines = lines.slice(1).filter(l => l.includes(":"));

  return (
    <div className="space-y-3 w-full max-w-full overflow-hidden">
      <SectionHeader
        icon={Camera}
        title={title}
        subtitle="Current configuration snapshot"
        variant="info"
      />
      <div className="grid gap-1.5">
        {dataLines.map((line, i) => {
          const [label, value] = line.split(":").map(s => s.trim());
          return (
            <div key={i} className="flex justify-between p-2 rounded bg-muted/20 text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ErrorRenderer({ content, onCompose }: { content: string, onCompose?: (text: string) => void }) {
  const examples = [
    "set grid to 600 for groups 1-8",
    "show all power groups",
    "copy settings from group 1 to group 2"
  ];

  return (
    <div className="space-y-4 w-full max-w-full overflow-hidden">
      <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-sm font-semibold text-red-400">Command Error</span>
        </div>
        <p className="text-xs text-foreground/80 leading-relaxed">{content}</p>
      </div>

      {onCompose && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500/70" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">Try these instead</span>
          </div>
          <div className="grid gap-1.5">
            {examples.map((ex, i) => (
              <button
                key={i}
                onClick={() => onCompose(ex)}
                className="w-full text-left px-3 py-2.5 rounded-md bg-muted/30 hover:bg-muted/60 border border-border/40 hover:border-amber-500/30 transition-all group flex items-center justify-between"
              >
                <code className="text-xs text-foreground/80 font-mono group-hover:text-amber-500 transition-colors truncate mr-2">
                  {ex}
                </code>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground group-hover:text-foreground opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
                  <span>Use</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getPlanStyle(content: string): string {
  if (content.includes("CRITICAL RISK") || content.includes("🔴")) return "text-red-500 font-medium";
  if (content.includes("HIGH RISK") || content.includes("🟠")) return "text-orange-500 font-medium";
  if (content.includes("MEDIUM RISK") || content.includes("🟡")) return "text-yellow-500 font-medium";
  if (content.includes("LOW RISK") || content.includes("🟢")) return "text-green-500 font-medium";
  return "";
}

function HelpRenderer({ content }: { content: string }) {
  const sections = content.split('\n\n').filter(s => s.trim());

  const getIconForSection = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('query') || t.includes('analysis')) return Search;
    if (t.includes('set') || t.includes('configuration')) return Sliders;
    if (t.includes('progression')) return TrendingUp;
    if (t.includes('risk') || t.includes('safety')) return ShieldAlert;
    if (t.includes('copy') || t.includes('replication') || t.includes('compare')) return Copy;
    if (t.includes('meta') || t.includes('controls')) return Terminal;
    return Command;
  };

  const getColorForSection = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('query') || t.includes('analysis')) return "text-blue-400";
    if (t.includes('set') || t.includes('configuration')) return "text-emerald-400";
    if (t.includes('progression')) return "text-purple-400";
    if (t.includes('risk') || t.includes('safety')) return "text-red-400";
    if (t.includes('copy') || t.includes('replication') || t.includes('compare')) return "text-amber-400";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Command}
        title="Ryiuk Command Center"
        subtitle="Complete reference guide"
        variant="info"
      />

      <div className="grid gap-3">
        {sections.slice(1).map((section, i) => {
          const lines = section.split('\n');
          const titleRaw = lines[0]?.replace(/[#*]/g, '').trim();
          const commands = lines.slice(1);

          if (!titleRaw) return null;

          const Icon = getIconForSection(titleRaw);
          const colorClass = getColorForSection(titleRaw);

          return (
            <div key={i} className="p-3 rounded-lg border border-border/40 bg-card/50 hover:bg-card/80 transition-colors group">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("p-1.5 rounded-md bg-muted/30 group-hover:bg-muted/50 transition-colors", colorClass)}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <h4 className="text-xs font-semibold text-foreground">{titleRaw}</h4>
              </div>

              <div className="space-y-1.5 pl-1">
                {commands.map((cmd, j) => {
                  const cleanCmd = cmd.replace(/^[•-]\s*/, '').trim();
                  const parts = cleanCmd.split('—');
                  const commandPart = parts[0]?.trim();
                  const descPart = parts[1]?.trim();

                  return (
                    <div key={j} className="text-[10px] flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                      <span className="font-mono text-primary/90 font-medium bg-primary/5 px-1 rounded border border-primary/10">
                        {commandPart}
                      </span>
                      {descPart && (
                        <span className="text-muted-foreground italic">
                          — {descPart}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Visual renderer for export/load success results
function FileOperationResultRenderer({ content, type }: { content: string; type: "export" | "load" }) {
  // Extract format from content
  const format = content.includes(".json") || content.includes("JSON") ? "json" : "set";
  const Icon = format === "json" ? FileJson : FileText;
  const colorClass = format === "json" ? "text-blue-500" : type === "export" ? "text-emerald-500" : "text-amber-500";
  const bgClass = format === "json" ? "bg-blue-500/10" : type === "export" ? "bg-emerald-500/10" : "bg-amber-500/10";
  const borderClass = format === "json" ? "border-blue-500/20" : type === "export" ? "border-emerald-500/20" : "border-amber-500/20";
  
  // Extract file path and input count
  const pathMatch = content.match(/to (.+)$/);
  const filePath = pathMatch ? pathMatch[1] : "";
  const fileName = filePath.split(/[\\/]/).pop() || "";
  const inputMatch = content.match(/(\d+) inputs?/);
  const inputCount = inputMatch ? parseInt(inputMatch[1]) : undefined;
  
  return (
    <div className={cn("p-4 rounded-xl border space-y-3 bg-gradient-to-br from-muted/30 to-muted/10", borderClass)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", bgClass)}>
          <Icon className={cn("w-5 h-5", colorClass)} />
        </div>
        <div>
          <div className="text-sm font-bold">
            {type === "export" ? "Exported" : "Loaded"} {format.toUpperCase()} File
          </div>
          <div className="text-[10px] text-muted-foreground">{fileName}</div>
        </div>
        <div className="ml-auto">
          <div className="p-1.5 rounded-full bg-emerald-500/10">
            <Check className="w-4 h-4 text-emerald-500" />
          </div>
        </div>
      </div>
      
      {/* File Path */}
      <div className="p-2.5 rounded-lg bg-background/50 border border-border/40">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">File Path</div>
        <div className="text-[10px] font-mono break-all">{filePath}</div>
      </div>
      
      {/* Stats */}
      <div className="flex items-center gap-2">
        {inputCount !== undefined && (
          <div className="flex-1 p-2 rounded-lg bg-background/50 border border-border/40">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Inputs</div>
            <div className="text-sm font-semibold">{inputCount}</div>
          </div>
        )}
        <div className={cn("flex-1 p-2 rounded-lg border", bgClass, borderClass)}>
          <div className={cn("text-[9px] uppercase tracking-wide", colorClass)}>Format</div>
          <div className="text-sm font-semibold">{format.toUpperCase()}</div>
        </div>
      </div>
      
      {/* Success message */}
      <div className="flex items-center gap-1.5 text-[10px] text-emerald-500">
        <Check className="w-3.5 h-3.5" />
        <span>Operation completed successfully</span>
      </div>
    </div>
  );
}

// Visual renderer for export/load errors
function FileOperationErrorRenderer({ content }: { content: string }) {
  const isCancelled = content.includes("cancelled");
  
  return (
    <div className={cn(
      "p-4 rounded-xl border space-y-3",
      isCancelled 
        ? "bg-amber-500/5 border-amber-500/20" 
        : "bg-red-500/5 border-red-500/20"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "p-2 rounded-lg",
          isCancelled ? "bg-amber-500/10" : "bg-red-500/10"
        )}>
          {isCancelled ? (
            <X className="w-5 h-5 text-amber-500" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-500" />
          )}
        </div>
        <div>
          <div className="text-sm font-bold">
            {isCancelled ? "Operation Cancelled" : "Operation Failed"}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {content.replace("❌ ", "").replace("❌", "").trim()}
          </div>
        </div>
      </div>
    </div>
  );
}

// Premium Styled Chat Components - Prime Level Visual Design
// Rich visual elements, separators, icons, and sophisticated styling

import { cn } from "@/lib/utils";
import { 
  Sparkles, 
  Zap, 
  ArrowRight, 
  ArrowUpRight,
  Check,
  X,
  AlertTriangle,
  Info,
  Terminal,
  Cpu,
  TrendingUp,
  TrendingDown,
  Activity,
  Settings,
  Layers,
  Grid3X3,
  Target,
  Percent,
  DollarSign,
  BarChart3,
  PieChart,
  LineChart
} from "lucide-react";
import { motion } from "framer-motion";
import { ReactNode } from "react";

// ============================================================================
// VISUAL SEPARATORS
// ============================================================================

export function GradientDivider({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-px my-3", className)}>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/20 to-transparent blur-sm" />
    </div>
  );
}

export function DottedDivider() {
  return (
    <div className="flex items-center gap-1 my-2 opacity-30">
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="w-1 h-1 rounded-full bg-current" />
      ))}
    </div>
  );
}

export function LabeledDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent to-border/50" />
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-medium">{label}</span>
      <div className="flex-1 h-px bg-gradient-to-l from-transparent to-border/50" />
    </div>
  );
}

// ============================================================================
// HEADER COMPONENTS
// ============================================================================

export function SectionHeader({ 
  icon: Icon, 
  title, 
  subtitle,
  variant = "default"
}: { 
  icon: React.ElementType; 
  title: string; 
  subtitle?: string;
  variant?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const colors = {
    default: "from-primary/20 to-primary/5 text-primary border-primary/20",
    success: "from-emerald-500/20 to-emerald-500/5 text-emerald-400 border-emerald-500/20",
    warning: "from-amber-500/20 to-amber-500/5 text-amber-400 border-amber-500/20",
    danger: "from-red-500/20 to-red-500/5 text-red-400 border-red-500/20",
    info: "from-blue-500/20 to-blue-500/5 text-blue-400 border-blue-500/20",
  };
  
  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-lg border bg-gradient-to-r",
      colors[variant]
    )}>
      <div className="p-1.5 rounded-md bg-background/50 backdrop-blur-sm">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-[10px] opacity-70">{subtitle}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// STAT CARDS
// ============================================================================

export function StatCard({
  label,
  value,
  change,
  icon: Icon,
  trend
}: {
  label: string;
  value: string | number;
  change?: string;
  icon?: React.ElementType;
  trend?: "up" | "down" | "neutral";
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Activity;
  const trendColor = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-muted-foreground";
  
  return (
    <div className="relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-br from-card to-card/50 p-3">
      <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-primary/5 to-transparent rounded-bl-full" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
        </div>
        {Icon && <Icon className="w-5 h-5 text-muted-foreground/50" />}
      </div>
      {change && (
        <div className={cn("flex items-center gap-1 mt-2 text-[10px]", trendColor)}>
          <TrendIcon className="w-3 h-3" />
          <span>{change}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// OPERATION PREVIEW CARDS
// ============================================================================

export function OperationCard({
  field,
  operation,
  factor,
  value,
  oldValue,
  newValue
}: {
  field: string;
  operation: string;
  factor?: number;
  value?: number;
  oldValue?: number;
  newValue?: number;
}) {
  const opLabel = operation === "scale" 
    ? `×${factor?.toFixed(2)}`
    : operation === "set" 
    ? `= ${value}`
    : operation === "add"
    ? `+ ${value}`
    : `- ${value}`;
  
  const getIcon = () => {
    if (field.includes("lot")) return DollarSign;
    if (field.includes("grid")) return Grid3X3;
    if (field.includes("mult")) return Layers;
    if (field.includes("trail")) return Activity;
    return Settings;
  };
  
  const Icon = getIcon();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-br from-card/80 to-card/40 p-3 hover:border-primary/30 transition-all"
    >
      {/* Glow effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Icon className="w-4 h-4" />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{field}</p>
          <p className="text-[10px] text-muted-foreground">{opLabel}</p>
        </div>
        
        {oldValue !== undefined && newValue !== undefined && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-muted-foreground line-through opacity-60">{oldValue.toFixed(2)}</span>
            <ArrowRight className="w-3 h-3 text-primary" />
            <span className="text-primary font-bold">{newValue.toFixed(2)}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// SEMANTIC PREVIEW PANEL
// ============================================================================

export function SemanticPreviewPanel({
  description,
  operations,
  target,
  onApply,
  onCancel
}: {
  description: string;
  operations: Array<{ field: string; op: string; factor?: number; value?: number }>;
  target?: { engines?: string[]; groups?: number[]; logics?: string[] };
  onApply?: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="space-y-3">
      <SectionHeader 
        icon={Sparkles} 
        title="Semantic Command Preview"
        subtitle={description}
        variant="info"
      />
      
      <div className="grid gap-2">
        {operations.map((op, i) => (
          <OperationCard
            key={i}
            field={op.field}
            operation={op.op}
            factor={op.factor}
            value={op.value}
          />
        ))}
      </div>
      
      {target && (Object.keys(target).length > 0) && (
        <>
          <LabeledDivider label="Target Scope" />
          <div className="flex flex-wrap gap-2">
            {target.engines?.map(e => (
              <span key={e} className="px-2 py-1 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Engine {e}
              </span>
            ))}
            {target.groups?.map(g => (
              <span key={g} className="px-2 py-1 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Group {g}
              </span>
            ))}
            {target.logics?.map(l => (
              <span key={l} className="px-2 py-1 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {l}
              </span>
            ))}
          </div>
        </>
      )}
      
      {(onApply || onCancel) && (
        <>
          <GradientDivider />
          <div className="flex gap-2">
            {onApply && (
              <button
                onClick={onApply}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-xs font-medium hover:from-emerald-500 hover:to-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Check className="w-4 h-4" />
                Apply Changes
              </button>
            )}
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-lg border border-border/50 text-muted-foreground text-xs hover:bg-muted/30 hover:text-foreground transition-all"
              >
                Cancel
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// WELCOME MESSAGE
// ============================================================================

interface WelcomeMessageProps {
  onCompose?: (text: string) => void;
}

export function WelcomeMessage({ onCompose }: WelcomeMessageProps) {
  return (
    <div className="space-y-4 w-full max-w-full overflow-hidden">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20 p-3">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/20 to-transparent rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-amber-500/10 to-transparent rounded-full blur-xl pointer-events-none" />
        
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-500 text-black shadow-lg shadow-amber-500/30 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate">Ryiuk Command Center</h2>
              <p className="text-[9px] text-muted-foreground truncate">Natural language trading configuration</p>
            </div>
          </div>
          
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Control your trading parameters using natural language.
          </p>
        </div>
      </div>

      <LabeledDivider label="Quick Commands" />
      
      {/* Command Categories - responsive grid */}
      <div className="grid grid-cols-2 gap-1.5">
        <CommandCard
          icon={LineChart}
          title="Query"
          examples={["show grid for all", "find high values"]}
          color="blue"
          onCompose={onCompose}
        />
        <CommandCard
          icon={Settings}
          title="Configure"
          examples={["set grid to 600", "enable reverse"]}
          color="emerald"
          onCompose={onCompose}
        />
        <CommandCard
          icon={BarChart3}
          title="Progression"
          examples={["fibonacci 600→3000", "linear lot scale"]}
          color="amber"
          onCompose={onCompose}
        />
        <CommandCard
          icon={Zap}
          title="Semantic"
          examples={["30% more aggressive", "make it safer"]}
          color="purple"
          onCompose={onCompose}
        />
      </div>

      <LabeledDivider label="Pro Tips" />
      
      {/* Tips */}
      <div className="grid gap-1.5">
        <TipCard 
          icon={Terminal}
          tip="Use natural language—Ryiuk understands context"
          example="double the lot for power groups 1-5"
          onCompose={onCompose}
        />
        <TipCard 
          icon={Target}
          tip="All commands show a preview before applying"
          example="Type 'apply' to confirm or 'cancel' to abort"
          onCompose={onCompose}
        />
      </div>
    </div>
  );
}

function CommandCard({
  icon: Icon,
  title,
  examples,
  color,
  onCompose
}: {
  icon: React.ElementType;
  title: string;
  examples: string[];
  color: "blue" | "emerald" | "amber" | "purple";
  onCompose?: (text: string) => void;
}) {
  const colors = {
    blue: "from-blue-500/10 to-blue-500/5 border-blue-500/20 text-blue-400",
    emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 text-emerald-400",
    amber: "from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-400",
    purple: "from-purple-500/10 to-purple-500/5 border-purple-500/20 text-purple-400",
  };
  
  return (
    <div className={cn(
      "p-2 rounded-lg border bg-gradient-to-br transition-all hover:scale-[1.02] overflow-hidden",
      colors[color]
    )}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 shrink-0" />
        <span className="text-[10px] font-semibold truncate">{title}</span>
      </div>
      <div className="space-y-0.5">
        {examples.map((ex, i) => (
          <button
            key={i}
            onClick={() => onCompose?.(ex)}
            className="block w-full text-left text-[9px] text-muted-foreground hover:text-foreground truncate cursor-pointer transition-colors"
          >
            • {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

function TipCard({
  icon: Icon,
  tip,
  example,
  onCompose
}: {
  icon: React.ElementType;
  tip: string;
  example: string;
  onCompose?: (text: string) => void;
}) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/20 border border-border/30 overflow-hidden">
      <div className="p-1 rounded-md bg-primary/10 text-primary shrink-0">
        <Icon className="w-3 h-3" />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="text-[10px] text-foreground truncate">{tip}</p>
        <button
          onClick={() => onCompose?.(example)}
          className="text-[9px] text-muted-foreground hover:text-foreground mt-0.5 font-mono truncate cursor-pointer transition-colors text-left block w-full"
        >
          {example}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// RESULT STATUS
// ============================================================================

export function ResultStatus({
  success,
  message,
  details
}: {
  success: boolean;
  message: string;
  details?: string;
}) {
  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-lg border",
      success 
        ? "bg-emerald-500/10 border-emerald-500/20" 
        : "bg-red-500/10 border-red-500/20"
    )}>
      <div className={cn(
        "p-1.5 rounded-full",
        success ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
      )}>
        {success ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
      </div>
      <div>
        <p className={cn("text-sm font-medium", success ? "text-emerald-400" : "text-red-400")}>
          {message}
        </p>
        {details && <p className="text-[10px] text-muted-foreground mt-1">{details}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// SNAPSHOT VIEW
// ============================================================================

export function SnapshotView({
  title,
  data,
  onNavigate
}: {
  title: string;
  data: Array<{ label: string; values: Record<string, any> }>;
  onNavigate?: (target: any) => void;
}) {
  return (
    <div className="space-y-3">
      <SectionHeader icon={PieChart} title={title} variant="info" />
      
      <div className="grid gap-2">
        {data.map((item, i) => (
          <div 
            key={i}
            className="p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
            onClick={() => onNavigate?.(item)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-foreground">{item.label}</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-1 text-[9px]">
              {Object.entries(item.values).slice(0, 6).map(([key, val]) => (
                <div key={key} className="text-[10px]">
                  <span className="text-muted-foreground">{key}: </span>
                  <span className="text-foreground font-mono">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

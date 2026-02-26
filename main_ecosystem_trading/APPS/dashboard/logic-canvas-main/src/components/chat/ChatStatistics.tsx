import { motion } from "framer-motion";
import { 
  TrendingUp, 
  Terminal, 
  Camera,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatStatisticsProps {
  stats: {
    totalChangesApplied: number;
    commandsToday: number;
    snapshotsCount: number;
    lastCommandAt: Date | null;
  };
  compact?: boolean;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sublabel?: string;
  color: string;
  compact?: boolean;
}

function StatCard({ icon, label, value, sublabel, color, compact }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 px-3 py-2.5 transition-all",
        "hover:border-border hover:bg-card/80",
        compact && "px-2 py-2"
      )}
    >
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
        color
      )}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-semibold text-foreground",
          compact ? "text-sm" : "text-base"
        )}>
          {value}
        </p>
        <p className={cn(
          "text-muted-foreground",
          compact ? "text-[9px]" : "text-[10px]"
        )}>
          {label}
        </p>
        {sublabel && !compact && (
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">
            {sublabel}
          </p>
        )}
      </div>
    </motion.div>
  );
}

export function ChatStatistics({ stats, compact = false }: ChatStatisticsProps) {
  const formatLastCommand = (date: Date | null): string => {
    if (!date) return "Never";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMin / 60);
    
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 px-1 mb-2">
        <TrendingUp className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Statistics
        </span>
      </div>

      <div className={cn(
        "grid gap-2",
        compact ? "grid-cols-2" : "grid-cols-2"
      )}>
        <StatCard
          icon={<TrendingUp className="w-4 h-4 text-green-500" />}
          label="Changes Applied"
          value={stats.totalChangesApplied.toLocaleString()}
          color="bg-green-500/10"
          compact={compact}
        />
        <StatCard
          icon={<Terminal className="w-4 h-4 text-blue-500" />}
          label="Commands Today"
          value={stats.commandsToday}
          color="bg-blue-500/10"
          compact={compact}
        />
        <StatCard
          icon={<Camera className="w-4 h-4 text-purple-500" />}
          label="Snapshots"
          value={stats.snapshotsCount}
          color="bg-purple-500/10"
          compact={compact}
        />
        <StatCard
          icon={<Clock className="w-4 h-4 text-amber-500" />}
          label="Last Command"
          value={formatLastCommand(stats.lastCommandAt)}
          color="bg-amber-500/10"
          compact={compact}
        />
      </div>
    </div>
  );
}
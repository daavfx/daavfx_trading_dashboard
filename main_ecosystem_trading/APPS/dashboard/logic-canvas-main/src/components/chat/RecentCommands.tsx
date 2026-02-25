import { motion, AnimatePresence } from "framer-motion";
import { 
  Terminal, 
  Check, 
  X, 
  Clock, 
  AlertCircle,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CommandHistoryItem } from "@/contexts/ChatSidebarContext";

interface RecentCommandsProps {
  commands: CommandHistoryItem[];
  maxItems?: number;
  compact?: boolean;
  onCommandClick?: (command: string) => void;
}

const statusIcons = {
  pending: <Clock className="w-3 h-3 text-amber-500" />,
  applied: <Check className="w-3 h-3 text-green-500" />,
  cancelled: <X className="w-3 h-3 text-muted-foreground" />,
  error: <AlertCircle className="w-3 h-3 text-red-500" />,
};

const statusColors = {
  pending: "border-amber-500/30 bg-amber-500/5",
  applied: "border-green-500/30 bg-green-500/5",
  cancelled: "border-border/50 bg-muted/20",
  error: "border-red-500/30 bg-red-500/5",
};

export function RecentCommands({ 
  commands, 
  maxItems = 10,
  compact = false,
  onCommandClick 
}: RecentCommandsProps) {
  const displayCommands = commands.slice(-maxItems).reverse();

  if (commands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Terminal className="w-8 h-8 text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground">No commands yet</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Type a command in the chat to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Recent Commands
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/60 font-mono">
          {commands.length}
        </span>
      </div>

      <ScrollArea className={cn("pr-2", compact ? "max-h-32" : "max-h-48")}>
        <AnimatePresence mode="popLayout">
          {displayCommands.map((cmd, index) => (
            <motion.div
              key={cmd.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.15, delay: index * 0.02 }}
              className={cn(
                "group flex items-center gap-2 px-2.5 py-2 rounded-lg border mb-1 cursor-pointer transition-all",
                "hover:border-primary/30 hover:bg-primary/5",
                statusColors[cmd.status]
              )}
              onClick={() => onCommandClick?.(cmd.command)}
            >
              {/* Status Icon */}
              <div className="flex-shrink-0">
                {statusIcons[cmd.status]}
              </div>

              {/* Command Text */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {cmd.command}
                </p>
                {!compact && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatTimeAgo(new Date(cmd.timestamp))}
                  </p>
                )}
              </div>

              {/* Changes Count */}
              {cmd.changesCount !== undefined && cmd.changesCount > 0 && (
                <div className="flex-shrink-0 flex items-center gap-1">
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                    {cmd.changesCount} changes
                  </span>
                </div>
              )}

              {/* Hover Action */}
              <ChevronRight className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-opacity flex-shrink-0" />
            </motion.div>
          ))}
        </AnimatePresence>
      </ScrollArea>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) {
    return "Just now";
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (diffHour < 24) {
    return `${diffHour}h ago`;
  }
  return date.toLocaleDateString();
}
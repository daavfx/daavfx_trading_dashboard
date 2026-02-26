import { motion } from "framer-motion";
import { 
  Zap, 
  Camera, 
  RotateCcw, 
  FolderArchive,
  GitBranch,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}

interface QuickActionsProps {
  onCreateSnapshot?: () => void;
  onRestoreLast?: () => void;
  onOpenVault?: () => void;
  onOpenVersionControl?: () => void;
  compact?: boolean;
}

export function QuickActions({
  onCreateSnapshot,
  onRestoreLast,
  onOpenVault,
  onOpenVersionControl,
  compact = false,
}: QuickActionsProps) {
  const actions: QuickAction[] = [
    {
      id: 'snapshot',
      label: 'Create Snapshot',
      icon: <Camera className="w-4 h-4" />,
      color: 'text-purple-500 bg-purple-500/10 hover:bg-purple-500/20',
      onClick: onCreateSnapshot,
    },
    {
      id: 'restore',
      label: 'Restore Last',
      icon: <RotateCcw className="w-4 h-4" />,
      color: 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20',
      onClick: onRestoreLast,
    },
    {
      id: 'version-control',
      label: 'Version Control',
      icon: <GitBranch className="w-4 h-4" />,
      color: 'text-blue-500 bg-blue-500/10 hover:bg-blue-500/20',
      onClick: onOpenVersionControl,
    },
    {
      id: 'vault',
      label: 'Vault',
      icon: <FolderArchive className="w-4 h-4" />,
      color: 'text-green-500 bg-green-500/10 hover:bg-green-500/20',
      onClick: onOpenVault,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 px-1 mb-2">
        <Zap className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Quick Actions
        </span>
      </div>

      <div className={cn(
        "grid gap-2",
        compact ? "grid-cols-2" : "grid-cols-2"
      )}>
        {actions.map((action, index) => (
          <motion.div
            key={action.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: index * 0.05 }}
          >
            <Button
              variant="ghost"
              size={compact ? "sm" : "default"}
              onClick={action.onClick}
              className={cn(
                "w-full h-auto flex-col gap-1.5 py-3 px-3 border border-border/50 rounded-lg transition-all",
                "hover:border-border hover:shadow-sm",
                action.color
              )}
            >
              {action.icon}
              <span className={cn(
                "font-medium",
                compact ? "text-[9px]" : "text-[10px]"
              )}>
                {action.label}
              </span>
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
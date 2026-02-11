import { motion } from "framer-motion";
import { Server, Layers, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface SingleEditContextProps {
  engine: string;
  group: string;
  logic: string;
}

export function SingleEditContext({ engine, group, logic }: SingleEditContextProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 p-4 rounded-lg border border-border/40 bg-card/30 backdrop-blur-sm"
    >
      <div className="flex flex-col gap-2">
        {/* Breadcrumb Path */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Server className="w-3 h-3" />
            <span className="font-medium">{engine}</span>
          </div>
          <span className="text-muted-foreground/40">/</span>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Layers className="w-3 h-3" />
            <span className="font-medium">{group}</span>
          </div>
        </div>

        {/* Main Title */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{logic}</h1>
            <p className="text-xs text-muted-foreground">Single Logic Editor</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

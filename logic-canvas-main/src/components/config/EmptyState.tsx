import { motion } from "framer-motion";
import { Zap, ArrowRight, FileUp, FileJson, Grid3X3, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import type { MTConfig } from "@/types/mt-config";

interface EmptyStateProps {
  onLoadSetfile: (config?: MTConfig) => void;
  onChooseEngine: () => void;
}

export function EmptyState({ onLoadSetfile, onChooseEngine }: EmptyStateProps) {
  const handleLoadFile = async (format: ".set" | "JSON") => {
    try {
      const filePath = await open({
        filters: format === ".set"
          ? [{ name: "MT4/MT5 Settings", extensions: ["set"] }]
          : [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });

      if (!filePath) return;

      let config: MTConfig;
      if (format === ".set") {
        // Try massive setfile parser first (v19 format)
        try {
          interface ParseResult {
            success: boolean;
            total_inputs_parsed: number;
            logic_directions_found: number;
            config: MTConfig | null;
          }

          const result = await invoke<ParseResult>("parse_massive_setfile", { filePath });
          
          if (result.success && result.config) {
            config = result.config;
            if (result.logic_directions_found >= 630) {
              toast.success(`Loaded MASSIVE setfile: ${result.total_inputs_parsed} inputs (${result.logic_directions_found} logic-directions)`);
            } else {
              toast.success(`Loaded ${result.total_inputs_parsed} inputs (${result.logic_directions_found} logic-directions)`);
            }
          } else {
            // Fallback to standard parser
            config = await invoke<MTConfig>("import_set_file", { filePath });
            toast.success(`Loaded ${format} file (${config.total_inputs} inputs)`);
          }
        } catch (parseErr) {
          // Fallback to standard parser
          console.warn("Massive parser failed, using standard parser:", parseErr);
          config = await invoke<MTConfig>("import_set_file", { filePath });
          toast.success(`Loaded ${format} file (${config.total_inputs} inputs)`);
        }
      } else {
        config = await invoke<MTConfig>("import_json_file", { filePath });
      }

      const name = Array.isArray(filePath)
        ? String(filePath[0]).split(/[/\\\\]/).pop() || String(filePath[0])
        : String(filePath).split(/[/\\\\]/).pop() || String(filePath);
      config = {
        ...config,
        current_set_name: name,
      };

      onLoadSetfile(config);
    } catch (err) {
      toast.error(`Import failed: ${err}`);
    }
  };

  const steps = [
    { icon: Grid3X3, title: "Select", desc: "Engine + Groups" },
    { icon: Zap, title: "Logics", desc: "POWER, STO, RPO..." },
    { icon: MousePointerClick, title: "Multi-Edit", desc: "Batch changes" },
    { icon: ArrowRight, title: "Export", desc: ".set or JSON" },
  ];

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-background via-background to-primary/5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl w-full"
      >
        {/* DAAVFX x Ryiuk Branding */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="relative w-20 h-20 mx-auto mb-5"
          >
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/30 to-yellow-600/20 blur-xl animate-pulse" />
            <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600 flex items-center justify-center shadow-2xl border border-amber-400/30">
              <span className="text-black font-black text-3xl tracking-tight">D</span>
            </div>
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className="absolute -bottom-1 -right-2 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[8px] font-medium text-zinc-400"
            >
              RYIUK
            </motion.div>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-black text-foreground mb-1 tracking-tight"
          >
            <span className="bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-500 bg-clip-text text-transparent">DAAVFX</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-muted-foreground text-xs"
          >
            Multi-Logic Trading Engine Configuration
          </motion.p>
        </div>

        {/* Quick Steps - Compact Horizontal */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex justify-center gap-1 mb-6"
        >
          {steps.map((step, index) => (
            <div key={step.title} className="flex items-center">
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 border border-border/40">
                <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                  <step.icon className="w-3 h-3 text-primary" />
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-foreground leading-tight">{step.title}</div>
                  <div className="text-[8px] text-muted-foreground leading-tight">{step.desc}</div>
                </div>
              </div>
              {index < steps.length - 1 && (
                <ArrowRight className="w-3 h-3 text-muted-foreground/30 mx-1" />
              )}
            </div>
          ))}
        </motion.div>

        {/* Pro tip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mb-6 px-4 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 max-w-md mx-auto"
        >
          <span className="text-[10px] text-amber-500/80">
            <strong>TIP:</strong> Group 1 is unique — multi-select logics/engines only. Groups 2-20 support full multi-select.
          </span>
        </motion.div>

        {/* Quick actions */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex justify-center gap-3"
        >
          <Button variant="outline" size="lg" onClick={() => handleLoadFile(".set")} className="gap-2 h-10">
            <FileUp className="w-4 h-4" />
            Load .set
          </Button>
          <Button variant="outline" size="lg" onClick={() => handleLoadFile("JSON")} className="gap-2 h-10">
            <FileJson className="w-4 h-4" />
            Load JSON
          </Button>
          <Button
            size="lg"
            onClick={onChooseEngine}
            className="gap-2 h-10 bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-semibold hover:from-amber-400 hover:to-yellow-400 shadow-lg shadow-amber-500/25"
          >
            <Zap className="w-4 h-4" />
            Start Fresh
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}

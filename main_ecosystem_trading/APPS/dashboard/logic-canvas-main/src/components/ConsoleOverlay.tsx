import { useState, useEffect, useRef } from "react";
import { X, Terminal, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  data?: any[];
}

// DISABLED in production to prevent performance issues
const IS_DEV = import.meta.env.DEV;

export function ConsoleOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingLogsRef = useRef<LogEntry[]>([]);
  const flushTimeoutRef = useRef<number | null>(null);
  const isRenderingRef = useRef(false);
  
  // Toggle with Ctrl+I (only in dev)
  useEffect(() => {
    if (!IS_DEV) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Capture console logs - ONLY in dev mode and ONLY errors
  useEffect(() => {
    if (!IS_DEV) return;
    
    const originalError = console.error;

    const addLog = (level: LogEntry["level"], args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      const newLog: LogEntry = {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
        data: args
      };
      
      pendingLogsRef.current.push(newLog);

      if (flushTimeoutRef.current === null) {
        flushTimeoutRef.current = window.setTimeout(() => {
          if (pendingLogsRef.current.length > 0) {
            setLogs((prev) => [...prev.slice(-49), ...pendingLogsRef.current]);
            pendingLogsRef.current = [];
          }
          flushTimeoutRef.current = null;
        }, 250); // Slower flush rate
      }
    };

    // Only capture errors, not all logs
    console.error = (...args) => {
      originalError(...args);
      addLog("error", args);
    };

    return () => {
      console.error = originalError;

      if (flushTimeoutRef.current !== null) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  // Don't render anything in production
  if (!IS_DEV || !isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-8">
      <div className="w-full max-w-4xl h-[80vh] bg-[#0c0c0c] border border-border/40 rounded-lg shadow-2xl flex flex-col font-mono text-sm overflow-hidden ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/20 bg-muted/5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Terminal className="w-4 h-4" />
            <span className="font-semibold text-foreground">DAAVFX System Console</span>
          </div>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7" 
              onClick={() => setLogs([])}
              title="Clear Console"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7" 
              onClick={() => setIsOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Logs */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-1">
          {logs.length === 0 ? (
            <div className="text-muted-foreground/50 text-center py-8 italic">
              System ready. Listening for events...
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded">
                <span className="text-muted-foreground/50 shrink-0 select-none w-20">
                  {log.timestamp}
                </span>
                <span className={cn(
                  "uppercase font-bold text-[10px] w-12 shrink-0 pt-0.5 select-none",
                  log.level === "error" ? "text-red-500" :
                  log.level === "warn" ? "text-yellow-500" :
                  log.level === "debug" ? "text-blue-500" :
                  "text-green-500"
                )}>
                  {log.level}
                </span>
                <div className="whitespace-pre-wrap break-all text-muted-foreground font-medium">
                  {log.message}
                </div>
              </div>
            ))
          )}
        </div>
        
        {/* Footer */}
        <div className="px-4 py-2 bg-muted/5 border-t border-border/20 text-[10px] text-muted-foreground/50 flex justify-between">
          <span>Press Ctrl+I to toggle</span>
          <span>{logs.length} entries</span>
        </div>
      </div>
    </div>
  );
}

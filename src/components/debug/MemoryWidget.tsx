import { useMemoryMonitor, formatBytes, getMemoryWarningLevel } from '@/hooks/useMemoryMonitor';
import { Activity, AlertTriangle, AlertCircle } from 'lucide-react';

export function MemoryWidget() {
  const { memory, peakMemory } = useMemoryMonitor(true);

  if (!memory) {
    return (
      <div className="text-[10px] text-muted-foreground px-2 py-1">
        Memory monitoring unavailable
      </div>
    );
  }

  const level = getMemoryWarningLevel(memory.usedJSHeapSize, memory.jsHeapSizeLimit);
  const Icon = level === 'critical' ? AlertCircle : level === 'warning' ? AlertTriangle : Activity;
  const colorClass = 
    level === 'critical' ? 'text-red-500 bg-red-500/10' :
    level === 'warning' ? 'text-amber-500 bg-amber-500/10' :
    'text-emerald-500 bg-emerald-500/10';

  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded ${colorClass}`}>
      <Icon className="w-3 h-3" />
      <span className="text-[10px] font-medium">
        {formatBytes(memory.usedJSHeapSize)} / {formatBytes(memory.jsHeapSizeLimit)}
      </span>
      <span className="text-[9px] text-muted-foreground">
        Peak: {formatBytes(peakMemory)}
      </span>
    </div>
  );
}

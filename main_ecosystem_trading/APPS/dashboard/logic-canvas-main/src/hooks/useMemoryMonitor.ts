import { useEffect, useState } from 'react';

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export function useMemoryMonitor(enabled: boolean = true) {
  const [memory, setMemory] = useState<MemoryInfo | null>(null);
  const [peakMemory, setPeakMemory] = useState<number>(0);

  useEffect(() => {
    if (!enabled || !(window as any).performance?.memory) return;

    const interval = setInterval(() => {
      const memInfo = (window as any).performance.memory;
      if (memInfo) {
        setMemory({
          usedJSHeapSize: Math.round(memInfo.usedJSHeapSize / 1024 / 1024), // MB
          totalJSHeapSize: Math.round(memInfo.totalJSHeapSize / 1024 / 1024), // MB
          jsHeapSizeLimit: Math.round(memInfo.jsHeapSizeLimit / 1024 / 1024), // MB
        });
        setPeakMemory(prev => Math.max(prev, memInfo.usedJSHeapSize));
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [enabled]);

  return { memory, peakMemory: Math.round(peakMemory / 1024 / 1024) };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 MB';
  return `${bytes} MB`;
}

export function getMemoryWarningLevel(used: number, limit: number): 'normal' | 'warning' | 'critical' {
  const ratio = used / limit;
  if (ratio > 0.9) return 'critical';
  if (ratio > 0.75) return 'warning';
  return 'normal';
}

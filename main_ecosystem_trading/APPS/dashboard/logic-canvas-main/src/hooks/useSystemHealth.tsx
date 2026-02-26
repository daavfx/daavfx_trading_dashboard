// System Health Monitor - Comprehensive diagnostics
// Provides real-time visibility into system state

import { useEffect, useState, useCallback } from 'react';
import { Activity, AlertTriangle, CheckCircle, Database, Cpu } from 'lucide-react';

interface HealthMetrics {
  memory: {
    used: number;
    total: number;
    limit: number;
    peak: number;
    status: 'healthy' | 'warning' | 'critical';
  };
  renders: {
    count: number;
    rate: number;
    status: 'healthy' | 'warning' | 'critical';
  };
  state: {
    mode: string;
    hasPending: boolean;
    selectionCount: number;
    status: 'healthy' | 'warning' | 'critical';
  };
}

export function useSystemHealth() {
  const [metrics, setMetrics] = useState<HealthMetrics>({
    memory: { used: 0, total: 0, limit: 0, peak: 0, status: 'healthy' },
    renders: { count: 0, rate: 0, status: 'healthy' },
    state: { mode: 'none', hasPending: false, selectionCount: 0, status: 'healthy' },
  });

  const updateMetrics = useCallback(() => {
    const memInfo = (window as any).performance?.memory;
    
    setMetrics(prev => {
      // Memory status
      let memoryStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (memInfo) {
        const ratio = memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit;
        if (ratio > 0.9) memoryStatus = 'critical';
        else if (ratio > 0.75) memoryStatus = 'warning';
      }

      if (!memInfo) return prev;
      const usedMb = Math.round(memInfo.usedJSHeapSize / 1024 / 1024);
      const totalMb = Math.round(memInfo.totalJSHeapSize / 1024 / 1024);
      const limitMb = Math.round(memInfo.jsHeapSizeLimit / 1024 / 1024);
      return {
        ...prev,
        memory: {
          used: usedMb,
          total: totalMb,
          limit: limitMb,
          peak: Math.max(prev.memory.peak, usedMb),
          status: memoryStatus,
        },
      };
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(updateMetrics, 5000);
    return () => clearInterval(interval);
  }, [updateMetrics]);

  const updateStateMetrics = useCallback((mode: string, hasPending: boolean, selectionCount: number) => {
    setMetrics(prev => ({
      ...prev,
      state: {
        mode,
        hasPending,
        selectionCount,
        status: hasPending && selectionCount === 0 ? 'warning' : 'healthy',
      },
    }));
  }, []);

  return { metrics, updateStateMetrics };
}

export function SystemHealthPanel({ 
  metrics 
}: { 
  metrics: HealthMetrics 
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-emerald-500 bg-emerald-500/10';
      case 'warning': return 'text-amber-500 bg-amber-500/10';
      case 'critical': return 'text-red-500 bg-red-500/10';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const getIcon = (status: string) => {
    switch (status) {
      case 'healthy': return CheckCircle;
      case 'warning': return AlertTriangle;
      case 'critical': return Activity;
      default: return Activity;
    }
  };

  return (
    <div className="space-y-2">
      {/* Memory */}
      <div className={`flex items-center gap-2 px-2 py-1.5 rounded ${getStatusColor(metrics.memory.status)}`}>
        <Database className="w-3 h-3" />
        <span className="text-[10px] font-medium">
          Memory: {metrics.memory.used}MB / {metrics.memory.limit}MB
        </span>
      </div>

      {/* State */}
      <div className={`flex items-center gap-2 px-2 py-1.5 rounded ${getStatusColor(metrics.state.status)}`}>
        <Cpu className="w-3 h-3" />
        <span className="text-[10px] font-medium">
          State: {metrics.state.mode} {metrics.state.hasPending && '(pending)'}
        </span>
      </div>

      {/* Overall */}
      <div className={`flex items-center gap-2 px-2 py-1.5 rounded ${
        metrics.memory.status === 'critical' || metrics.state.status === 'critical'
          ? 'text-red-500 bg-red-500/10'
          : metrics.memory.status === 'warning' || metrics.state.status === 'warning'
          ? 'text-amber-500 bg-amber-500/10'
          : 'text-emerald-500 bg-emerald-500/10'
      }`}>
        {(() => {
          const Icon = getIcon(
            metrics.memory.status === 'critical' || metrics.state.status === 'critical'
              ? 'critical'
              : metrics.memory.status === 'warning' || metrics.state.status === 'warning'
              ? 'warning'
              : 'healthy'
          );
          return <Icon className="w-3 h-3" />;
        })()}
        <span className="text-[10px] font-medium">
          System: {metrics.memory.status === 'critical' || metrics.state.status === 'critical'
            ? 'Critical'
            : metrics.memory.status === 'warning' || metrics.state.status === 'warning'
            ? 'Warning'
            : 'Healthy'}
        </span>
      </div>
    </div>
  );
}

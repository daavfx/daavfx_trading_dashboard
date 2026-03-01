// LogicCanvas - Live visualization of all 270 trading nodes
// This is the "WTF moment" component that makes the system legendary

import React, { useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { MTConfig } from '@/types/mt-config';
import { 
  Cpu, 
  Activity, 
  Zap, 
  TrendingUp, 
  TrendingDown,
  Target,
  Layers,
  Eye,
  EyeOff,
  RefreshCw,
  Maximize2,
  Grid3X3
} from 'lucide-react';

interface LogicCanvasProps {
  config: MTConfig | null;
  onNodeClick?: (engine: string, group: number, logic: string) => void;
  highlightedNodes?: Array<{ engine: string; group: number; logic: string }>;
  onConfigChange?: (config: MTConfig) => void;
}

// Strategy type colors
const STRATEGY_COLORS: Record<string, string> = {
  POWER: 'bg-blue-500',
  REPOWER: 'bg-blue-600',
  SCALPER: 'bg-green-500',
  STOPPER: 'bg-red-500',
  STO: 'bg-purple-500',
  SCA: 'bg-yellow-500',
  RPO: 'bg-orange-500',
};

const STRATEGY_ICONS: Record<string, React.ReactNode> = {
  POWER: <Zap className="w-3 h-3" />,
  REPOWER: <RefreshCw className="w-3 h-3" />,
  SCALPER: <Target className="w-3 h-3" />,
  STOPPER: <TrendingDown className="w-3 h-3" />,
  STO: <Activity className="w-3 h-3" />,
  SCA: <TrendingUp className="w-3 h-3" />,
  RPO: <Layers className="w-3 h-3" />,
};

// Normalize grid values for color intensity (0-1)
const getGridIntensity = (value: number): number => {
  if (!value || value <= 0) return 0;
  // Log scale: 100-10000 pips -> 0-1
  return Math.min(1, Math.log10(value / 100 + 1) / 2);
};

// Get color from grid value (blue = tight, red = wide)
const getGridColor = (value: number): string => {
  const intensity = getGridIntensity(value);
  // Low grid = aggressive = blue-ish
  // High grid = conservative = red-ish
  const hue = intensity * 120; // 0 = blue, 120 = green
  return `hsl(${hue}, 70%, 50%)`;
};

interface NodeData {
  id: string;
  engine: string;
  engineId: string;
  group: number;
  logic: string;
  grid: number;
  lot: number;
  multiplier: number;
  enabled: boolean;
  color: string;
  intensity: number;
}

export function LogicCanvas({ 
  config, 
  onNodeClick, 
  highlightedNodes = [],
  onConfigChange 
}: LogicCanvasProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedEngine, setSelectedEngine] = useState<string | null>(null);
  const [showDisabled, setShowDisabled] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'lot' | 'multiplier'>('grid');

  // Generate all 270 nodes from config
  const nodes = useMemo<NodeData[]>(() => {
    if (!config) return [];

    const nodeData: NodeData[] = [];

    for (const engine of config.engines) {
      for (const group of engine.groups) {
        for (const logic of group.logics) {
          const logicName = logic.logic_name?.toUpperCase() || '';
          const grid = (logic as any).grid || (logic as any).Grid || 0;
          const lot = (logic as any).initial_lot || (logic as any).Initial_Lot || 0;
          const multiplier = (logic as any).multiplier || (logic as any).Multiplier || 1;
          const enabled = (logic as any).enabled !== false;

          nodeData.push({
            id: `${engine.engine_id}-${group.group_number}-${logicName}`,
            engine: `Engine ${engine.engine_id}`,
            engineId: engine.engine_id,
            group: group.group_number,
            logic: logicName,
            grid: typeof grid === 'number' ? grid : 0,
            lot: typeof lot === 'number' ? lot : 0,
            multiplier: typeof multiplier === 'number' ? multiplier : 1,
            enabled,
            color: STRATEGY_COLORS[logicName] || 'bg-gray-500',
            intensity: getGridIntensity(typeof grid === 'number' ? grid : 0),
          });
        }
      }
    }

    return nodeData;
  }, [config]);

  // Group nodes by engine
  const engineGroups = useMemo(() => {
    const groups: Record<string, NodeData[]> = {};
    for (const node of nodes) {
      if (!groups[node.engine]) {
        groups[node.engine] = [];
      }
      groups[node.engine].push(node);
    }
    return groups;
  }, [nodes]);

  // Check if node is highlighted
  const isHighlighted = useCallback((node: NodeData): boolean => {
    return highlightedNodes.some(
      h => h.engine === node.engineId && h.group === node.group && h.logic === node.logic
    );
  }, [highlightedNodes]);

  // Stats
  const stats = useMemo(() => {
    const enabled = nodes.filter(n => n.enabled).length;
    const disabled = nodes.filter(n => !n.enabled).length;
    const avgGrid = nodes.length > 0 
      ? nodes.reduce((sum, n) => sum + n.grid, 0) / nodes.length 
      : 0;
    const totalLot = nodes.reduce((sum, n) => sum + n.lot, 0);
    
    return { enabled, disabled, avgGrid, totalLot, total: nodes.length };
  }, [nodes]);

  if (!config) {
    return (
      <Card className="w-full h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Grid3X3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No configuration loaded</p>
        </div>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="w-full h-full flex flex-col overflow-hidden">
        <CardHeader className="flex-shrink-0 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Live Trading Grid</CardTitle>
              <Badge variant="outline" className="ml-2">
                {stats.total} nodes
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex rounded-md border">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                >
                  Grid
                </Button>
                <Button
                  variant={viewMode === 'lot' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('lot')}
                >
                  Lot
                </Button>
                <Button
                  variant={viewMode === 'multiplier' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('multiplier')}
                >
                  Mult
                </Button>
              </div>

              {/* Show disabled toggle */}
              <Button
                variant={showDisabled ? 'outline' : 'ghost'}
                size="sm"
                onClick={() => setShowDisabled(!showDisabled)}
              >
                {showDisabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              {stats.enabled} active
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              {stats.disabled} disabled
            </span>
            <span>Avg Grid: {stats.avgGrid.toFixed(0)}</span>
            <span>Total Lot: {stats.totalLot.toFixed(4)}</span>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-auto p-2">
          <div className="flex gap-4 h-full">
            {/* Engine columns */}
            {Object.entries(engineGroups).map(([engineName, engineNodes]) => (
              <div 
                key={engineName}
                className={cn(
                  "flex-1 flex flex-col min-w-0 rounded-lg border overflow-hidden",
                  selectedEngine === engineName && "ring-2 ring-primary"
                )}
              >
                {/* Engine header */}
                <div 
                  className={cn(
                    "flex-shrink-0 p-2 text-center font-medium text-sm cursor-pointer",
                    "bg-muted/50 hover:bg-muted transition-colors"
                  )}
                  onClick={() => setSelectedEngine(selectedEngine === engineName ? null : engineName)}
                >
                  {engineName}
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {engineNodes.filter(n => n.enabled).length}/{engineNodes.length}
                  </Badge>
                </div>

                {/* Groups grid */}
                <div className="flex-1 overflow-auto p-1">
                  <div className="grid grid-cols-5 gap-1">
                    {engineNodes
                      .filter(n => showDisabled || n.enabled)
                      .sort((a, b) => a.group - b.group)
                      .map((node) => {
                        const isHovered = hoveredNode === node.id;
                        const isHl = isHighlighted(node);
                        
                        return (
                          <Tooltip key={node.id}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "relative aspect-square rounded-sm cursor-pointer transition-all duration-200",
                                  "flex flex-col items-center justify-center text-[10px] font-medium",
                                  !node.enabled && "opacity-40",
                                  isHovered && "scale-110 z-10 shadow-lg",
                                  isHl && "ring-2 ring-yellow-400 ring-offset-1"
                                )}
                                style={{
                                  backgroundColor: node.enabled 
                                    ? getGridColor(node.grid)
                                    : '#333',
                                }}
                                onClick={() => onNodeClick?.(node.engineId, node.group, node.logic)}
                                onMouseEnter={() => setHoveredNode(node.id)}
                                onMouseLeave={() => setHoveredNode(null)}
                              >
                                {/* Strategy icon */}
                                <div className={cn("text-white/80", node.color)}>
                                  {STRATEGY_ICONS[node.logic] || <Cpu className="w-2 h-2" />}
                                </div>
                                
                                {/* Group number */}
                                <span className="text-white/90 font-bold">
                                  {node.group}
                                </span>

                                {/* Value display based on view mode */}
                                <span className="text-white/70 text-[8px]">
                                  {viewMode === 'grid' && node.grid > 0 && `G${node.grid}`}
                                  {viewMode === 'lot' && node.lot > 0 && `L${node.lot.toFixed(2)}`}
                                  {viewMode === 'multiplier' && `M${node.multiplier}`}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-sm">
                                <div className="font-bold">{node.engine} - G{node.group}</div>
                                <div className="text-muted-foreground">{node.logic}</div>
                                <div className="mt-1 space-y-0.5">
                                  <div>Grid: {node.grid}</div>
                                  <div>Lot: {node.lot.toFixed(4)}</div>
                                  <div>Multiplier: {node.multiplier}</div>
                                  <div>Enabled: {node.enabled ? 'Yes' : 'No'}</div>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>

        {/* Legend */}
        <div className="flex-shrink-0 p-2 border-t bg-muted/30">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {Object.entries(STRATEGY_COLORS).map(([logic, color]) => (
              <div key={logic} className="flex items-center gap-1">
                <div className={cn("w-3 h-3 rounded-sm", color)} />
                <span className="text-xs text-muted-foreground">{logic}</span>
              </div>
            ))}
            <div className="flex items-center gap-1 ml-4 pl-4 border-l">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getGridColor(200) }} />
              <span className="text-xs text-muted-foreground">Tight (200)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getGridColor(5000) }} />
              <span className="text-xs text-muted-foreground">Wide (5000)</span>
            </div>
          </div>
        </div>
      </Card>
    </TooltipProvider>
  );
}

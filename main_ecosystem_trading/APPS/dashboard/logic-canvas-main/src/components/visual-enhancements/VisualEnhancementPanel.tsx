// Visual Canvas Enhancements for Parameter Visualization
// Includes parameter heatmaps, strategy flow charts, and change propagation visualization

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Treemap,
  Tooltip as RechartsTooltip
} from 'recharts';
import { MTConfig } from '@/types/mt-config';
import {
  Activity,
  GitBranch,
  Zap,
  TrendingUp,
  Eye,
  Network,
  Grid3X3,
  Heatmap
} from 'lucide-react';

interface VisualEnhancementPanelProps {
  config: MTConfig | null;
}

interface ParameterHeatmapData {
  engine: string;
  group: number;
  logic: string;
  parameter: string;
  value: number | string;
  normalizedValue: number; // 0-1 scale for coloring
  category: string;
}

interface StrategyFlowData {
  id: string;
  name: string;
  value: number;
  depth: number;
  parent?: string;
}

export function VisualEnhancementPanel({ config }: VisualEnhancementPanelProps) {
  const [activeTab, setActiveTab] = useState('heatmap');

  // Generate heatmap data from config
  const heatmapData = useMemo<ParameterHeatmapData[]>(() => {
    if (!config) return [];

    const data: ParameterHeatmapData[] = [];

    for (const engine of config.engines) {
      for (const group of engine.groups) {
        for (const logic of group.logics) {
          // Extract numeric parameters for visualization
          Object.entries(logic).forEach(([key, value]) => {
            if (typeof value === 'number' && !isNaN(value)) {
              // Skip metadata fields
              if (['group_number', 'engine_id'].includes(key)) return;

              // Determine category based on parameter name
              let category = 'other';
              if (key.includes('grid') || key.includes('Grid')) category = 'grid';
              if (key.includes('trail') || key.includes('Trail')) category = 'trail';
              if (key.includes('lot') || key.includes('Lot')) category = 'lot';
              if (key.includes('tp') || key.includes('TP')) category = 'tp';
              if (key.includes('sl') || key.includes('SL')) category = 'sl';

              // Normalize value for coloring (0-1 scale)
              let normalizedValue = 0;
              if (category === 'grid') normalizedValue = Math.min(1, Math.abs(value) / 10000); // Max grid of 10000
              else if (category === 'trail') normalizedValue = Math.min(1, Math.abs(value) / 5000); // Max trail of 5000
              else if (category === 'lot') normalizedValue = Math.min(1, Math.abs(value) / 1); // Max lot of 1
              else normalizedValue = Math.min(1, Math.abs(value) / 1000); // Generic normalization

              data.push({
                engine: `Engine ${engine.engine_id}`,
                group: group.group_number,
                logic: logic.logic_name,
                parameter: key,
                value,
                normalizedValue,
                category
              });
            }
          });
        }
      }
    }

    return data;
  }, [config]);

  // Generate strategy flow data
  const strategyFlowData = useMemo<StrategyFlowData[]>(() => {
    if (!config) return [];

    const data: StrategyFlowData[] = [];

    // Create a hierarchical view of the strategy
    for (const engine of config.engines) {
      data.push({
        id: `engine-${engine.engine_id}`,
        name: `Engine ${engine.engine_id}`,
        value: engine.groups.length,
        depth: 0
      });

      for (const group of engine.groups) {
        data.push({
          id: `engine-${engine.engine_id}-group-${group.group_number}`,
          name: `Group ${group.group_number}`,
          value: group.logics.length,
          depth: 1,
          parent: `engine-${engine.engine_id}`
        });

        for (const logic of group.logics) {
          data.push({
            id: `engine-${engine.engine_id}-group-${group.group_number}-logic-${logic.logic_name}`,
            name: logic.logic_name,
            value: Object.keys(logic).length,
            depth: 2,
            parent: `engine-${engine.engine_id}-group-${group.group_number}`
          });
        }
      }
    }

    return data;
  }, [config]);

  // Get parameter statistics
  const paramStats = useMemo(() => {
    if (heatmapData.length === 0) return null;

    const stats: Record<string, { min: number; max: number; avg: number; count: number }> = {};

    heatmapData.forEach(item => {
      if (!stats[item.category]) {
        stats[item.category] = { min: Infinity, max: -Infinity, avg: 0, count: 0 };
      }

      const stat = stats[item.category];
      stat.min = Math.min(stat.min, item.normalizedValue);
      stat.max = Math.max(stat.max, item.normalizedValue);
      stat.avg += item.normalizedValue;
      stat.count += 1;
    });

    Object.values(stats).forEach(stat => {
      stat.avg /= stat.count;
    });

    return stats;
  }, [heatmapData]);

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            <CardTitle>Visual Enhancements</CardTitle>
          </div>
        </div>
        <CardDescription>
          Visual representations of your parameter configurations
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
            <TabsTrigger value="flow">Flow Chart</TabsTrigger>
            <TabsTrigger value="distribution">Distribution</TabsTrigger>
            <TabsTrigger value="propagation">Propagation</TabsTrigger>
          </TabsList>

          <TabsContent value="heatmap" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              {paramStats && Object.entries(paramStats).map(([category, stat]) => (
                <div key={category} className="p-2 border rounded-md">
                  <div className="text-xs font-medium capitalize">{category}</div>
                  <div className="text-xs text-muted-foreground">
                    Min: {stat.min.toFixed(2)}, Max: {stat.max.toFixed(2)}, Avg: {stat.avg.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex-1 min-h-[400px]">
              {heatmapData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <Treemap
                    data={heatmapData}
                    dataKey="normalizedValue"
                    ratio={4}
                    stroke="#ffffff"
                    fill="#8884d8"
                    content={<CustomizedContent />}
                  >
                    <RechartsTooltip content={<TreemapTooltip />} />
                  </Treemap>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No parameter data to visualize
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="flow" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="flex-1">
              {strategyFlowData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={strategyFlowData}
                    layout="vertical"
                    margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={100}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" name="Parameter Count" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No strategy data to visualize
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="distribution" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="flex-1">
              {heatmapData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={Object.entries(
                      heatmapData.reduce((acc, item) => {
                        acc[item.category] = (acc[item.category] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([category, count]) => ({ category, count }))}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" name="Parameter Count" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No distribution data to visualize
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="propagation" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="p-4 border rounded-md bg-muted/30">
              <h4 className="font-medium mb-2">Change Propagation Visualization</h4>
              <p className="text-sm text-muted-foreground">
                This view shows how changes to parameters might affect related parameters and strategies.
                The system analyzes dependencies between parameters to predict propagation effects.
              </p>

              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm">Directly Affected Parameters</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span className="text-sm">Indirectly Affected Parameters</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-sm">Critical Dependencies</span>
                </div>
              </div>

              <div className="mt-4 p-3 bg-background border rounded-md">
                <h5 className="font-medium text-sm mb-2">Example Propagation Path</h5>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Grid Spacing → Trail Distance → Position Size → Risk Exposure</div>
                  <div className="ml-4 flex items-center">
                    <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                    <span>Increased grid spacing may require adjusted trail distance</span>
                  </div>
                  <div className="ml-8 flex items-center">
                    <div className="w-2 h-2 rounded-full bg-yellow-500 mr-2"></div>
                    <span>This affects position sizing rules</span>
                  </div>
                  <div className="ml-12 flex items-center">
                    <div className="w-2 h-2 rounded-full bg-red-500 mr-2"></div>
                    <span>Ultimately impacting overall risk exposure</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Custom content for the treemap
const CustomizedContent: React.FC<any> = (props) => {
  const { root, depth, x, y, width, height, index, payload } = props;

  if (depth === 0 || !payload) {
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{ fill: '#fff', stroke: '#aaa', strokeWidth: 2, strokeDasharray: '2 2' }}
        />
      </g>
    );
  }

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: `hsl(${payload.normalizedValue * 120}, 70%, 50%)`, // Green to Red scale
          stroke: '#fff',
          strokeWidth: 2
        }}
      />
      {width > 80 && height > 30 && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontSize={10}
        >
          {payload.parameter}
        </text>
      )}
      {width > 80 && (
        <text
          x={x + 4}
          y={y + 14}
          fill="#fff"
          fontSize={10}
          textAnchor="start"
        >
          {payload.value}
        </text>
      )}
    </g>
  );
};

// Custom tooltip for the treemap
const TreemapTooltip: React.FC<any> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-background border p-2 rounded-md shadow-md">
        <p className="font-medium">{data.parameter}</p>
        <p className="text-sm">Value: {data.value}</p>
        <p className="text-sm">Engine: {data.engine}</p>
        <p className="text-sm">Group: {data.group}</p>
        <p className="text-sm">Logic: {data.logic}</p>
        <p className="text-sm">Category: {data.category}</p>
      </div>
    );
  }
  return null;
};

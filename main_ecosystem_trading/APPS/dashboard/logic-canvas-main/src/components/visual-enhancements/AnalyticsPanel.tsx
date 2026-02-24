// Advanced Analytics Panel Component

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAnalytics } from '@/hooks/useAnalytics';
import { MTConfig } from '@/types/mt-config';
import {
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Target,
  Activity,
  Play,
  Square,
  Zap,
  Thermometer
} from 'lucide-react';

interface AnalyticsPanelProps {
  config: MTConfig | null;
}

export function AnalyticsPanel({ config }: AnalyticsPanelProps) {
  const {
    state,
    performAnalysis,
    getHighRiskItems,
    getRecommendationsByImpact,
    getStrongCorrelations
  } = useAnalytics(config);

  const [activeTab, setActiveTab] = useState('overview');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Auto-refresh if enabled
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        performAnalysis(config);
      }, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, performAnalysis, config]);

  const highRiskItems = getHighRiskItems();
  const highImpactRecs = getRecommendationsByImpact('high');
  const strongCorrelations = getStrongCorrelations();

  const handleRunAnalysis = () => {
    performAnalysis(config);
  };

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            <CardTitle>Advanced Analytics</CardTitle>
          </div>
          <div className="flex gap-2">
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <Zap className="h-4 w-4 mr-1" />
              {autoRefresh ? 'Auto-Refresh On' : 'Auto-Refresh Off'}
            </Button>
            <Button
              variant={state.isAnalyzing ? "secondary" : "outline"}
              size="sm"
              onClick={handleRunAnalysis}
              disabled={!config || state.isAnalyzing}
            >
              {state.isAnalyzing ? <Square className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              {state.isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
            </Button>
          </div>
        </div>
        <CardDescription>
          Correlation analysis, risk assessment, and optimization recommendations
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center">
              <div className="text-2xl font-bold">{state.performanceMetrics.length}</div>
              <div className="text-xs text-muted-foreground">Metrics Tracked</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center">
              <div className="text-2xl font-bold">{highRiskItems.length}</div>
              <div className="text-xs text-muted-foreground">High Risk Items</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center">
              <div className="text-2xl font-bold">{state.recommendations.length}</div>
              <div className="text-xs text-muted-foreground">Recommendations</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center">
              <div className="text-2xl font-bold">{strongCorrelations.length}</div>
              <div className="text-xs text-muted-foreground">Strong Correlations</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="correlations">Correlations</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
            <TabsTrigger value="risks">Risks</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Performance Overview
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {state.performanceMetrics.slice(0, 3).map(metric => (
                        <div key={metric.id} className="border rounded-md p-3">
                          <div className="font-medium">{metric.name}</div>
                          <div className="text-2xl font-bold mt-1">{metric.currentValue.toFixed(2)}</div>
                          <div className="text-sm text-muted-foreground">{metric.description}</div>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline">{metric.trend}</Badge>
                            <Badge variant="outline">Conf: {(metric.confidence * 100).toFixed(0)}%</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Risk Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {highRiskItems.slice(0, 3).map(risk => (
                        <div key={risk.id} className="flex items-center justify-between p-3 border rounded-md">
                          <div>
                            <div className="font-medium">{risk.parameter}</div>
                            <div className="text-sm text-muted-foreground">{risk.factors[0]}</div>
                          </div>
                          <Badge variant={risk.riskLevel === 'high' ? 'destructive' : 'default'}>
                            {risk.riskLevel} ({risk.riskScore})
                          </Badge>
                        </div>
                      ))}
                      {highRiskItems.length === 0 && (
                        <div className="text-center py-4 text-muted-foreground">
                          No high-risk items detected
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {highImpactRecs.slice(0, 3).map(rec => (
                        <div key={rec.id} className="flex items-center justify-between p-3 border rounded-md">
                          <div>
                                <div className="font-medium">{rec.title}</div>
                                <div className="text-sm text-muted-foreground">{rec.description}</div>
                              </div>
                              <div className="text-right">
                                <Badge variant="outline">Exp. +{rec.expectedImprovement}%</Badge>
                                <div className="text-xs text-muted-foreground mt-1">Conf: {(rec.confidence * 100).toFixed(0)}%</div>
                              </div>
                            </div>
                          ))}
                          {highImpactRecs.length === 0 && (
                            <div className="text-center py-4 text-muted-foreground">
                              No high-impact recommendations at this time
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="correlations" className="flex-1 flex flex-col gap-4 overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="space-y-3">
                    {strongCorrelations.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No strong correlations detected. Run analysis to identify parameter relationships.
                      </div>
                    ) : (
                      strongCorrelations.map(correlation => (
                        <Card key={`${correlation.parameterA}-${correlation.parameterB}`}>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-medium">
                                  {correlation.parameterA.split('.').pop()} ↔ {correlation.parameterB.split('.').pop()}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {correlation.parameterA} ↔ {correlation.parameterB}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold text-lg">
                                  {correlation.correlationCoefficient > 0 ? '+' : ''}{correlation.correlationCoefficient.toFixed(3)}
                                </div>
                                <Badge variant={correlation.strength === 'strong' ? 'default' : correlation.strength === 'moderate' ? 'secondary' : 'outline'}>
                                  {correlation.strength}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline">p-value: {correlation.pValue}</Badge>
                              <Badge variant="outline">n={correlation.sampleSize}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="metrics" className="flex-1 flex flex-col gap-4 overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {state.performanceMetrics.map(metric => (
                      <Card key={metric.id}>
                        <CardHeader>
                          <CardTitle className="text-base">{metric.name}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Current:</span>
                              <span className="font-medium">{metric.currentValue.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Baseline:</span>
                              <span>{metric.baselineValue.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Trend:</span>
                              <span className={metric.trend === 'increasing' ? 'text-green-600' : metric.trend === 'decreasing' ? 'text-red-600' : 'text-blue-600'}>
                                {metric.trend}
                              </span>
                            </div>
                            <Separator />
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Confidence:</span>
                              <span>{(metric.confidence * 100).toFixed(0)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Volatility:</span>
                              <span>{(metric.volatility * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="recommendations" className="flex-1 flex flex-col gap-4 overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="space-y-3">
                    {state.recommendations.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No recommendations available. Run analysis to get optimization suggestions.
                      </div>
                    ) : (
                      state.recommendations.map(recommendation => (
                        <Card key={recommendation.id} className={recommendation.applied ? 'opacity-70' : ''}>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium">{recommendation.title}</h4>
                                  {recommendation.applied && <Badge variant="secondary">Applied</Badge>}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">{recommendation.description}</p>

                                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">Target: </span>
                                    <span>{recommendation.targetParameter.split('.').pop()}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Suggested: </span>
                                    <span>{String(recommendation.suggestedValue)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Expected: </span>
                                    <span>+{recommendation.expectedImprovement}%</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Confidence: </span>
                                    <span>{(recommendation.confidence * 100).toFixed(0)}%</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <Badge variant={recommendation.impact === 'high' ? 'destructive' : recommendation.impact === 'medium' ? 'default' : 'secondary'}>
                                  {recommendation.impact}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {recommendation.reason}
                                </Badge>
                              </div>
                            </div>

                            {!recommendation.applied && (
                              <div className="mt-3 flex gap-2">
                                <Button size="sm">Apply Recommendation</Button>
                                <Button size="sm" variant="outline">Learn More</Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="risks" className="flex-1 flex flex-col gap-4 overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="space-y-3">
                    {state.riskAnalyses.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No risks detected. Run analysis to assess configuration risks.
                      </div>
                    ) : (
                      state.riskAnalyses.map(risk => (
                        <Card key={risk.id}>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium">{risk.parameter.split('.').pop()}</h4>
                                  <Badge
                                    variant={
                                      risk.riskLevel === 'critical' ? 'destructive' :
                                      risk.riskLevel === 'high' ? 'destructive' :
                                      risk.riskLevel === 'medium' ? 'default' : 'secondary'
                                    }
                                  >
                                    {risk.riskLevel} ({risk.riskScore})
                                  </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {risk.parameter}
                                </div>

                                <div className="mt-3">
                                  <div className="text-sm font-medium mb-1">Risk Factors:</div>
                                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                    {risk.factors.map((factor, idx) => (
                                      <li key={idx}>{factor}</li>
                                    ))}
                                  </ul>

                                  <div className="text-sm font-medium mb-1 mt-2">Mitigation Strategies:</div>
                                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                    {risk.mitigationStrategies.map((strategy, idx) => (
                                      <li key={idx}>{strategy}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>

                              <div className="text-right">
                                <div className="text-sm">
                                  <div>Prob: {(risk.probability * 100).toFixed(0)}%</div>
                                  <div>Impact: {(risk.impact * 100).toFixed(0)}%</div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      );
    }

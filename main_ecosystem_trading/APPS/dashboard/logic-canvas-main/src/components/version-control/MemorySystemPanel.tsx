// Memory System Panel Component

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useMemorySystem } from '@/hooks/useMemorySystem';
import { MTConfig } from '@/types/mt-config';
import { Brain, TrendingUp, TrendingDown, Activity, Clock, Target, Zap } from 'lucide-react';

interface MemorySystemPanelProps {
  config: MTConfig | null;
  userId: string;
}

export function MemorySystemPanel({ config, userId }: MemorySystemPanelProps) {
  const {
    state,
    getUserPreferences,
    getStrategyPatterns,
    getMemoryEntries,
    getSuggestedCombinations,
    startLearning,
    stopLearning
  } = useMemorySystem(config);

  const [activeTab, setActiveTab] = useState('patterns');

  const userPreferences = getUserPreferences(userId);
  const strategyPatterns = getStrategyPatterns();
  const memoryEntries = getMemoryEntries(userId);
  const suggestedCombinations = getSuggestedCombinations(userId);

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            <CardTitle>Memory System</CardTitle>
          </div>
          <div className="flex gap-2">
            <Button
              variant={state.isLearning ? "default" : "outline"}
              size="sm"
              onClick={state.isLearning ? stopLearning : startLearning}
            >
              <Zap className="h-4 w-4 mr-1" />
              {state.isLearning ? 'Learning' : 'Paused'}
            </Button>
          </div>
        </div>
        <CardDescription>
          AI-powered learning from your trading patterns
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="patterns">Patterns</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="patterns" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="space-y-4">
                {strategyPatterns.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No patterns detected yet. The system learns from your changes.
                  </p>
                ) : (
                  strategyPatterns.map((pattern) => (
                    <Card key={pattern.id}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium">{pattern.name}</h4>
                            <p className="text-sm text-muted-foreground mt-1">{pattern.description}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline">Freq: {pattern.frequency}</Badge>
                              {pattern.successRate !== undefined && (
                                <Badge variant={pattern.successRate > 0.5 ? "default" : "secondary"}>
                                  {pattern.successRate > 0.5 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                  {(pattern.successRate * 100).toFixed(1)}%
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
                              Created {new Date(pattern.createdAt).toLocaleDateString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              by {pattern.createdBy}
                            </p>
                          </div>
                        </div>

                        {pattern.parameterCombinations.length > 0 && (
                          <div className="mt-3">
                            <Label className="text-xs font-medium">Sample Parameters:</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(pattern.parameterCombinations[0]).slice(0, 5).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-xs truncate max-w-[120px]">
                                  {key.split('_').pop()}: {String(value)}
                                </Badge>
                              ))}
                              {Object.keys(pattern.parameterCombinations[0]).length > 5 && (
                                <Badge variant="outline" className="text-xs">
                                  +{Object.keys(pattern.parameterCombinations[0]).length - 5} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="preferences" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="space-y-4">
                {userPreferences.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No preferences learned yet. The system learns from repeated parameter combinations.
                  </p>
                ) : (
                  userPreferences
                    .sort((a, b) => b.frequency - a.frequency)
                    .map((preference) => (
                      <Card key={preference.id}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2">
                                <Target className="h-4 w-4 text-muted-foreground" />
                                <h4 className="font-medium">Preference #{preference.frequency}</h4>
                              </div>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {Object.entries(preference.parameterCombination).slice(0, 5).map(([key, value]) => (
                                  <Badge key={key} variant="secondary" className="text-xs truncate max-w-[120px]">
                                    {key.split('_').pop()}: {String(value)}
                                  </Badge>
                                ))}
                                {Object.keys(preference.parameterCombination).length > 5 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{Object.keys(preference.parameterCombination).length - 5} more
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">
                                Used {preference.frequency} times
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(preference.lastUsed).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          {preference.performanceScore !== undefined && (
                            <div className="mt-2">
                              <Badge variant={preference.performanceScore > 0 ? "default" : "secondary"}>
                                {preference.performanceScore > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                Perf: {preference.performanceScore.toFixed(2)}
                              </Badge>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="suggestions" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="space-y-4">
                {suggestedCombinations.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No suggestions available. The system will recommend parameter combinations based on your preferences.
                  </p>
                ) : (
                  suggestedCombinations.map((combination, index) => (
                    <Card key={combination.id}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium">Suggestion #{index + 1}</h4>
                            <p className="text-sm text-muted-foreground mt-1">Based on your frequent parameter combinations</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {Object.entries(combination.parameterCombination).slice(0, 5).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-xs truncate max-w-[120px]">
                                  {key.split('_').pop()}: {String(value)}
                                </Badge>
                              ))}
                              {Object.keys(combination.parameterCombination).length > 5 && (
                                <Badge variant="outline" className="text-xs">
                                  +{Object.keys(combination.parameterCombination).length - 5} more
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline">Freq: {combination.frequency}</Badge>
                            {combination.performanceScore !== undefined && (
                              <div className="mt-1">
                                <Badge variant={combination.performanceScore > 0 ? "default" : "secondary"}>
                                  {combination.performanceScore > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                  Perf: {combination.performanceScore.toFixed(2)}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="history" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="space-y-3">
                {memoryEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No memory entries yet. All your parameter changes are recorded here.
                  </p>
                ) : (
                  memoryEntries
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .map((entry) => (
                      <Card key={entry.id}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2">
                                <Activity className="h-4 w-4 text-muted-foreground" />
                                <h4 className="font-medium">{entry.action}</h4>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(entry.timestamp).toLocaleString()}
                              </p>

                              {entry.parametersChanged.length > 0 && (
                                <div className="mt-2">
                                  <Label className="text-xs font-medium">Parameters Changed:</Label>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {entry.parametersChanged.slice(0, 3).map((param, idx) => (
                                      <Badge key={idx} variant="outline" className="text-xs">
                                        {param.parameter}: {String(param.oldValue)} → {String(param.newValue)}
                                      </Badge>
                                    ))}
                                    {entry.parametersChanged.length > 3 && (
                                      <Badge variant="outline" className="text-xs">
                                        +{entry.parametersChanged.length - 3} more
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            {entry.outcome && (
                              <div className="text-right">
                                {entry.outcome.performanceChange !== undefined && (
                                  <Badge variant={entry.outcome.performanceChange > 0 ? "default" : "secondary"}>
                                    {entry.outcome.performanceChange > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                    {entry.outcome.performanceChange.toFixed(2)}
                                  </Badge>
                                )}
                                {entry.outcome.success !== undefined && (
                                  <div className="mt-1">
                                    <Badge variant={entry.outcome.success ? "default" : "destructive"}>
                                      {entry.outcome.success ? 'Success' : 'Failed'}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            )}
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

// Smart Undo/Redo Panel Component

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { MTConfig } from '@/types/mt-config';
import { RotateCcw, RotateCw, History, Trash2, Play, Square, Clock } from 'lucide-react';

interface UndoRedoPanelProps {
  config: MTConfig | null;
  onConfigChange: (config: MTConfig) => void;
}

export function UndoRedoPanel({ config, onConfigChange }: UndoRedoPanelProps) {
  const {
    state,
    undo,
    redo,
    selectiveUndo,
    getUndoOperations,
    getRedoOperations,
    canUndo,
    canRedo,
    clear,
    applyOperationToConfig
  } = useUndoRedo(config);

  const [selectedUndoOps, setSelectedUndoOps] = useState<string[]>([]);
  const [selectedRedoOps, setSelectedRedoOps] = useState<string[]>([]);

  const undoOperations = getUndoOperations();
  const redoOperations = getRedoOperations();

  const handleUndo = async () => {
    if (selectedUndoOps.length > 0) {
      // Selective undo
      const result = await selectiveUndo(selectedUndoOps);
      if (config) {
        let newConfig = config;
        for (const op of result) {
          newConfig = applyOperationToConfig(newConfig, op);
        }
        onConfigChange(newConfig);
      }
      setSelectedUndoOps([]);
    } else {
      // Regular undo
      const result = await undo();
      if (result && config) {
        const newConfig = applyOperationToConfig(config, result);
        onConfigChange(newConfig);
      }
    }
  };

  const handleRedo = async () => {
    if (selectedRedoOps.length > 0) {
      // For simplicity, we'll just do regular redo if any are selected
      const result = await redo();
      if (result && config) {
        const newConfig = applyOperationToConfig(config, result);
        onConfigChange(newConfig);
      }
      setSelectedRedoOps([]);
    } else {
      // Regular redo
      const result = await redo();
      if (result && config) {
        const newConfig = applyOperationToConfig(config, result);
        onConfigChange(newConfig);
      }
    }
  };

  const toggleUndoSelection = (opId: string) => {
    setSelectedUndoOps(prev =>
      prev.includes(opId)
        ? prev.filter(id => id !== opId)
        : [...prev, opId]
    );
  };

  const toggleRedoSelection = (opId: string) => {
    setSelectedRedoOps(prev =>
      prev.includes(opId)
        ? prev.filter(id => id !== opId)
        : [...prev, opId]
    );
  };

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            <CardTitle>Smart Undo/Redo</CardTitle>
          </div>
        </div>
        <CardDescription>
          Granular control over configuration changes
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex gap-2">
          <Button
            onClick={handleUndo}
            disabled={!canUndo() || state.isProcessing}
            variant="outline"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Undo
          </Button>
          <Button
            onClick={handleRedo}
            disabled={!canRedo() || state.isProcessing}
            variant="outline"
          >
            <RotateCw className="h-4 w-4 mr-2" />
            Redo
          </Button>
          <Button
            onClick={clear}
            variant="outline"
            disabled={state.isProcessing}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear History
          </Button>
        </div>

        <Tabs defaultValue="undo" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="undo">Undo Stack ({undoOperations.length})</TabsTrigger>
            <TabsTrigger value="redo">Redo Stack ({redoOperations.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="undo" className="flex-1 flex flex-col gap-4 overflow-hidden">
            {undoOperations.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No operations to undo
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="space-y-2">
                  {undoOperations.map((op) => (
                    <Card
                      key={op.id}
                      className={`cursor-pointer transition-all ${
                        selectedUndoOps.includes(op.id) ? 'ring-2 ring-primary bg-accent' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => toggleUndoSelection(op.id)}
                    >
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {new Date(op.timestamp).toLocaleTimeString()}
                              </span>
                              <Badge variant="outline" className="text-xs ml-2">
                                {op.type}
                              </Badge>
                            </div>
                            <p className="font-medium truncate text-sm">{op.description}</p>
                            <div className="text-xs text-muted-foreground mt-1">
                              {op.target.engineId}
                              {op.target.groupId !== undefined && ` > G${op.target.groupId}`}
                              {op.target.logicName && ` > ${op.target.logicName}`}
                              {op.target.parameter && ` > ${op.target.parameter}`}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                              <span>Before: {JSON.stringify(op.before)}</span>
                              <span>→</span>
                              <span>After: {JSON.stringify(op.after)}</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="redo" className="flex-1 flex flex-col gap-4 overflow-hidden">
            {redoOperations.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No operations to redo
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="space-y-2">
                  {redoOperations.map((op) => (
                    <Card
                      key={op.id}
                      className={`cursor-pointer transition-all ${
                        selectedRedoOps.includes(op.id) ? 'ring-2 ring-primary bg-accent' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => toggleRedoSelection(op.id)}
                    >
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {new Date(op.timestamp).toLocaleTimeString()}
                              </span>
                              <Badge variant="outline" className="text-xs ml-2">
                                {op.type}
                              </Badge>
                            </div>
                            <p className="font-medium truncate text-sm">{op.description}</p>
                            <div className="text-xs text-muted-foreground mt-1">
                              {op.target.engineId}
                              {op.target.groupId !== undefined && ` > G${op.target.groupId}`}
                              {op.target.logicName && ` > ${op.target.logicName}`}
                              {op.target.parameter && ` > ${op.target.parameter}`}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                              <span>Before: {JSON.stringify(op.before)}</span>
                              <span>→</span>
                              <span>After: {JSON.stringify(op.after)}</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>

        <div className="text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Processing: {state.isProcessing ? 'Yes' : 'No'}</span>
            <span>Context: {state.currentContext}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Max Stack Size: {state.config.maxStackSize}</span>
            <span>Debounce: {state.config.debounceMs}ms</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

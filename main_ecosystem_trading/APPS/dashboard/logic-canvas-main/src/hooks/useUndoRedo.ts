// React hook for undo/redo system integration

import { useState, useEffect } from 'react';
import { MTConfig } from '@/types/mt-config';
import { getUndoRedoManager, UndoRedoManager } from '@/lib/undo-redo/manager';
import { UndoRedoState, ChangeOperation } from '@/lib/undo-redo/types';

export function useUndoRedo(initialConfig?: MTConfig) {
  const [urManager] = useState<UndoRedoManager>(() => getUndoRedoManager());
  const [state, setState] = useState<UndoRedoState>(urManager.getState());

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = urManager.subscribe(setState);
    return unsubscribe;
  }, [urManager]);

  const addOperation = (operation: Omit<ChangeOperation, 'id' | 'timestamp'>) => {
    return urManager.addOperation(operation);
  };

  const undo = async () => {
    return urManager.undo();
  };

  const redo = async () => {
    return urManager.redo();
  };

  const selectiveUndo = async (operationIds: string[]) => {
    return urManager.selectiveUndo(operationIds);
  };

  const getUndoOperations = () => {
    return urManager.getUndoOperations();
  };

  const getRedoOperations = () => {
    return urManager.getRedoOperations();
  };

  const canUndo = () => {
    return urManager.canUndo();
  };

  const canRedo = () => {
    return urManager.canRedo();
  };

  const clear = () => {
    urManager.clear();
  };

  const switchContext = (context: string) => {
    urManager.switchContext(context);
  };

  const applyOperationToConfig = (config: MTConfig, operation: ChangeOperation) => {
    return urManager.applyOperationToConfig(config, operation);
  };

  return {
    // State
    state,

    // Operations
    addOperation,
    undo,
    redo,
    selectiveUndo,

    // Queries
    getUndoOperations,
    getRedoOperations,
    canUndo,
    canRedo,

    // Utilities
    clear,
    switchContext,
    applyOperationToConfig,
  };
}

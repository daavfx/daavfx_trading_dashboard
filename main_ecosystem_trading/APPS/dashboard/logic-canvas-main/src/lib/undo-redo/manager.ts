// Smart Undo/Redo System for Trading Parameters
// Handles granular undo/redo operations with grouping and selective rollback

import { v4 as uuidv4 } from 'uuid';
import { MTConfig } from '@/types/mt-config';
import {
  UndoRedoState,
  ChangeOperation,
  UndoRedoConfig,
  UndoRedoStack,
  OperationGroup
} from './types';

const STORAGE_KEY = 'daavfx_undo_redo';

export class UndoRedoManager {
  private state: UndoRedoState;
  private onChangeCallbacks: Array<(state: UndoRedoState) => void> = [];
  private debounceTimers: Record<string, NodeJS.Timeout> = {};

  constructor(config?: UndoRedoConfig) {
    // Try to load from localStorage first
    const saved = this.loadFromStorage();
    
    if (saved) {
      this.state = saved;
    } else {
      this.state = {
        stacks: {
          'default': { undo: [], redo: [] }
        },
        currentContext: 'default',
        config: {
          maxStackSize: config?.maxStackSize || 100,
          debounceMs: config?.debounceMs || 500,
          enableConfirmation: config?.enableConfirmation ?? true,
          autoGroupSimilar: config?.autoGroupSimilar ?? true,
        },
        isProcessing: false,
      };
    }
  }

  // Persist to localStorage
  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[UndoRedo] Failed to save to storage:', e);
    }
  }

  // Load from localStorage
  private loadFromStorage(): UndoRedoState | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('[UndoRedo] Failed to load from storage:', e);
    }
    return null;
  }

  // Subscribe to state changes
  subscribe(callback: (state: UndoRedoState) => void): () => void {
    this.onChangeCallbacks.push(callback);
    return () => {
      const index = this.onChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.onChangeCallbacks.splice(index, 1);
      }
    };
  }

  private notifyChange(): void {
    this.saveToStorage();
    this.onChangeCallbacks.forEach(callback => callback(this.getState()));
  }

  getState(): UndoRedoState {
    return { ...this.state };
  }

  getConfig(): UndoRedoConfig {
    return { ...this.state.config };
  }

  updateConfig(config: Partial<UndoRedoConfig>): void {
    this.state.config = { ...this.state.config, ...config };
    this.notifyChange();
  }

  // Switch to a different context
  switchContext(context: string): void {
    if (!this.state.stacks[context]) {
      this.state.stacks[context] = { undo: [], redo: [] };
    }
    this.state.currentContext = context;
    this.notifyChange();
  }

  // Get current stack
  private getCurrentStack(): UndoRedoStack {
    return this.state.stacks[this.state.currentContext] || { undo: [], redo: [] };
  }

  // Add an operation to the undo stack
  addOperation(operation: Omit<ChangeOperation, 'id' | 'timestamp'>): ChangeOperation {
    if (this.state.isProcessing) {
      throw new Error('Cannot add operation while processing undo/redo');
    }

    const op: ChangeOperation = {
      ...operation,
      id: uuidv4(),
      timestamp: Date.now(),
    };

    const stack = this.getCurrentStack();

    // Clear redo stack when adding new operation
    stack.redo = [];

    // Group similar operations if enabled and within debounce window
    if (this.state.config.autoGroupSimilar) {
      const lastOp = stack.undo[stack.undo.length - 1];
      if (lastOp && this.operationsAreSimilar(op, lastOp) &&
          (op.timestamp - lastOp.timestamp) < (this.state.config.debounceMs || 0)) {
        // Merge with last operation
        this.mergeOperations(lastOp, op);
      } else {
        stack.undo.push(op);
      }
    } else {
      stack.undo.push(op);
    }

    // Maintain max stack size
    if (stack.undo.length > this.state.config.maxStackSize!) {
      stack.undo = stack.undo.slice(-this.state.config.maxStackSize!);
    }

    this.notifyChange();
    return op;
  }

  // Check if two operations are similar enough to be grouped
  private operationsAreSimilar(op1: ChangeOperation, op2: ChangeOperation): boolean {
    // Same target and similar type
    return op1.target.engineId === op2.target.engineId &&
           op1.target.groupId === op2.target.groupId &&
           op1.target.logicName === op2.target.logicName &&
           op1.target.parameter === op2.target.parameter &&
           op1.type === op2.type;
  }

  // Merge two operations
  private mergeOperations(existing: ChangeOperation, newOp: ChangeOperation): void {
    // For update operations, we keep the original "before" and update the "after"
    if (existing.type === 'UPDATE' && newOp.type === 'UPDATE') {
      existing.after = newOp.after;
      existing.timestamp = newOp.timestamp;
      existing.description = `${existing.description}; then ${newOp.description}`;
    }
    if (existing.type === 'GROUP_UPDATE' && newOp.type === 'GROUP_UPDATE') {
      existing.after = newOp.after;
      existing.timestamp = newOp.timestamp;
      existing.description = `${existing.description}; then ${newOp.description}`;
    }
  }

  // Perform undo operation
  async undo(): Promise<ChangeOperation | null> {
    if (this.state.isProcessing) {
      throw new Error('Undo/redo operation already in progress');
    }

    const stack = this.getCurrentStack();
    if (stack.undo.length === 0) {
      return null;
    }

    this.state.isProcessing = true;
    this.notifyChange();

    try {
      const operation = stack.undo.pop()!;

      // Move to redo stack
      stack.redo.push(operation);

      const inverse = this.getInverseOperation(operation);
      this.notifyChange();
      return inverse;
    } finally {
      this.state.isProcessing = false;
      this.notifyChange();
    }
  }

  // Perform redo operation
  async redo(): Promise<ChangeOperation | null> {
    if (this.state.isProcessing) {
      throw new Error('Undo/redo operation already in progress');
    }

    const stack = this.getCurrentStack();
    if (stack.redo.length === 0) {
      return null;
    }

    this.state.isProcessing = true;
    this.notifyChange();

    try {
      const operation = stack.redo.pop()!;

      // Move back to undo stack
      stack.undo.push(operation);

      // Apply operation to config
      // In a real implementation, this would modify the actual config
      // For now, we'll just return the operation

      this.notifyChange();
      return operation;
    } finally {
      this.state.isProcessing = false;
      this.notifyChange();
    }
  }

  // Selective undo - undo specific operations
  async selectiveUndo(operationIds: string[]): Promise<ChangeOperation[]> {
    if (this.state.isProcessing) {
      throw new Error('Undo/redo operation already in progress');
    }

    const stack = this.getCurrentStack();
    const undone: ChangeOperation[] = [];

    this.state.isProcessing = true;
    this.notifyChange();

    try {
      // Filter out the specified operations from undo stack
      const remainingUndo = [];
      for (const op of stack.undo) {
        if (operationIds.includes(op.id)) {
          // Move to redo stack
          stack.redo.push(op);
          undone.push(this.getInverseOperation(op));
        } else {
          remainingUndo.push(op);
        }
      }

      stack.undo = remainingUndo;

      this.notifyChange();
      return undone.sort((a, b) => b.timestamp - a.timestamp);
    } finally {
      this.state.isProcessing = false;
      this.notifyChange();
    }
  }

  // Get available undo operations
  getUndoOperations(): ChangeOperation[] {
    const stack = this.getCurrentStack();
    return [...stack.undo].reverse(); // Most recent first
  }

  // Get available redo operations
  getRedoOperations(): ChangeOperation[] {
    const stack = this.getCurrentStack();
    return [...stack.redo].reverse(); // Most recent first
  }

  // Check if undo is available
  canUndo(): boolean {
    const stack = this.getCurrentStack();
    return stack.undo.length > 0;
  }

  // Check if redo is available
  canRedo(): boolean {
    const stack = this.getCurrentStack();
    return stack.redo.length > 0;
  }

  // Clear the undo/redo stacks
  clear(): void {
    const stack = this.getCurrentStack();
    stack.undo = [];
    stack.redo = [];
    this.notifyChange();
  }

  // Apply an operation to a config (helper method)
  applyOperationToConfig(config: MTConfig, operation: ChangeOperation): MTConfig {
    if (operation.target.engineId === 'CONFIG' && operation.target.parameter === '__CONFIG__') {
      return operation.after as MTConfig;
    }

    const newConfig = JSON.parse(JSON.stringify(config)); // Deep clone

    try {
      if (operation.target.groupId !== undefined && operation.target.logicName) {
        // Find the specific engine, group, and logic
        const engine = newConfig.engines.find((e: any) => e.engine_id === operation.target.engineId);
        if (!engine) return config;

        const group = engine.groups.find((g: any) => g.group_number === operation.target.groupId);
        if (!group) return config;

        const logic = group.logics.find((l: any) => l.logic_name === operation.target.logicName);
        if (!logic) return config;

        // Apply the change based on operation type
        if (operation.type === 'UPDATE' && operation.target.parameter) {
          (logic as any)[operation.target.parameter] = operation.after;
        } else if (operation.type === 'CREATE' && operation.target.parameter) {
          (logic as any)[operation.target.parameter] = operation.after;
        } else if (operation.type === 'DELETE' && operation.target.parameter) {
          delete (logic as any)[operation.target.parameter];
        }
      } else if (operation.target.engineId === 'GENERAL') {
        // Handle general config changes
        if (operation.target.parameter) {
          (newConfig.general as any)[operation.target.parameter] = operation.after;
        }
      }
    } catch (e) {
      return config; // Return original config if operation fails
    }

    return newConfig;
  }

  // Get inverse of an operation (for undo)
  getInverseOperation(operation: ChangeOperation): ChangeOperation {
    return {
      ...operation,
      id: uuidv4(),
      timestamp: Date.now(),
      before: operation.after,
      after: operation.before,
      description: `Undo: ${operation.description}`,
    };
  }

  // Reset the undo/redo system
  reset(): void {
    this.state = {
      stacks: {
        'default': { undo: [], redo: [] }
      },
      currentContext: 'default',
      config: this.state.config,
      isProcessing: false,
    };
    this.notifyChange();
  }
}

// Singleton instance
let undoRedoManager: UndoRedoManager | null = null;

export function getUndoRedoManager(config?: UndoRedoConfig): UndoRedoManager {
  if (!undoRedoManager) {
    undoRedoManager = new UndoRedoManager(config);
  }
  return undoRedoManager;
}

// Types for Smart Undo/Redo System

export interface ChangeOperation {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE' | 'MOVE' | 'GROUP_UPDATE';
  target: {
    engineId: string;
    groupId?: number;
    logicName?: string;
    parameter?: string;
  };
  before: any;  // Previous state/value
  after: any;   // New state/value
  timestamp: number;
  description: string;
  userId?: string;
  tags?: string[];
}

export interface UndoRedoStack {
  undo: ChangeOperation[];
  redo: ChangeOperation[];
}

export interface UndoRedoConfig {
  maxStackSize?: number;        // Maximum number of operations to keep
  debounceMs?: number;          // Debounce time for grouping similar operations
  enableConfirmation?: boolean; // Whether to show confirmation for undo/redo
  autoGroupSimilar?: boolean;   // Whether to automatically group similar operations
}

export interface UndoRedoState {
  stacks: Record<string, UndoRedoStack>; // Multiple stacks for different contexts
  currentContext: string; // Current active context
  config: UndoRedoConfig;
  isProcessing: boolean; // Whether an undo/redo operation is in progress
}

export interface OperationGroup {
  id: string;
  operations: ChangeOperation[];
  timestamp: number;
  description: string;
  userId?: string;
}

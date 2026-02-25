import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { TransactionPlan, ChangePreview } from '@/lib/chat/types';

export interface CommandHistoryItem {
  id: string;
  command: string;
  timestamp: Date;
  status: 'pending' | 'applied' | 'cancelled' | 'error';
  changesCount?: number;
}

export interface ChatSidebarState {
  // Pending plan from chat
  pendingPlan: TransactionPlan | null;
  
  // Recent commands history
  commandHistory: CommandHistoryItem[];
  
  // Applied changes summary
  appliedChanges: ChangePreview[];
  
  // Statistics
  stats: {
    totalChangesApplied: number;
    commandsToday: number;
    snapshotsCount: number;
    lastCommandAt: Date | null;
  };
  
  // Selected targets from sidebar
  selectedTargets: {
    engines: string[];
    groups: number[];
    logics: string[];
  };
}

export interface ChatSidebarContextValue extends ChatSidebarState {
  // Actions
  setPendingPlan: (plan: TransactionPlan | null) => void;
  confirmPlan: () => void;
  cancelPlan: () => void;
  
  addCommandToHistory: (command: string, status: CommandHistoryItem['status'], changesCount?: number) => void;
  
  addAppliedChanges: (changes: ChangePreview[]) => void;
  clearAppliedChanges: () => void;
  
  updateStats: (updates: Partial<ChatSidebarState['stats']>) => void;
  
  setSelectedTargets: (targets: ChatSidebarState['selectedTargets']) => void;
  
  // Callbacks
  onConfirmPlan?: () => void;
  onCancelPlan?: () => void;
  setCallbacks: (callbacks: { onConfirmPlan?: () => void; onCancelPlan?: () => void }) => void;
}

const ChatSidebarContext = createContext<ChatSidebarContextValue | null>(null);

export function useChatSidebar() {
  const context = useContext(ChatSidebarContext);
  if (!context) {
    throw new Error('useChatSidebar must be used within a ChatSidebarProvider');
  }
  return context;
}

interface ChatSidebarProviderProps {
  children: React.ReactNode;
  initialStats?: Partial<ChatSidebarState['stats']>;
}

export function ChatSidebarProvider({ children, initialStats }: ChatSidebarProviderProps) {
  const [state, setState] = useState<ChatSidebarState>({
    pendingPlan: null,
    commandHistory: [],
    appliedChanges: [],
    stats: {
      totalChangesApplied: initialStats?.totalChangesApplied ?? 0,
      commandsToday: initialStats?.commandsToday ?? 0,
      snapshotsCount: initialStats?.snapshotsCount ?? 0,
      lastCommandAt: initialStats?.lastCommandAt ?? null,
    },
    selectedTargets: {
      engines: [],
      groups: [],
      logics: [],
    },
  });
  
  const callbacksRef = useRef<{
    onConfirmPlan?: () => void;
    onCancelPlan?: () => void;
  }>({});
  
  // Load command history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('daavfx-command-history');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const today = new Date().toDateString();
          const todayCommands = parsed.filter((item: CommandHistoryItem) => 
            new Date(item.timestamp).toDateString() === today
          );
          setState(prev => ({
            ...prev,
            commandHistory: parsed.slice(-50), // Keep last 50 commands
            stats: {
              ...prev.stats,
              commandsToday: todayCommands.length,
            },
          }));
        }
      }
    } catch {
      // Ignore errors
    }
  }, []);
  
  // Save command history to localStorage
  const saveToLocalStorage = useCallback((history: CommandHistoryItem[]) => {
    try {
      localStorage.setItem('daavfx-command-history', JSON.stringify(history.slice(-50)));
    } catch {
      // Ignore errors
    }
  }, []);
  
  const setPendingPlan = useCallback((plan: TransactionPlan | null) => {
    setState(prev => ({ ...prev, pendingPlan: plan }));
  }, []);
  
  const addCommandToHistory = useCallback((command: string, status: CommandHistoryItem['status'], changesCount?: number) => {
    const newItem: CommandHistoryItem = {
      id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      command,
      timestamp: new Date(),
      status,
      changesCount,
    };
    
    setState(prev => {
      const newHistory = [...prev.commandHistory, newItem].slice(-50);
      saveToLocalStorage(newHistory);
      return {
        ...prev,
        commandHistory: newHistory,
      };
    });
  }, [saveToLocalStorage]);
  
  const addAppliedChanges = useCallback((changes: ChangePreview[]) => {
    setState(prev => ({
      ...prev,
      appliedChanges: [...prev.appliedChanges, ...changes].slice(-100),
    }));
  }, []);
  
  const clearAppliedChanges = useCallback(() => {
    setState(prev => ({ ...prev, appliedChanges: [] }));
  }, []);
  
  const updateStats = useCallback((updates: Partial<ChatSidebarState['stats']>) => {
    setState(prev => ({
      ...prev,
      stats: { ...prev.stats, ...updates },
    }));
  }, []);
  
  const setSelectedTargets = useCallback((targets: ChatSidebarState['selectedTargets']) => {
    setState(prev => ({ ...prev, selectedTargets: targets }));
  }, []);
  
  const setCallbacks = useCallback((callbacks: { onConfirmPlan?: () => void; onCancelPlan?: () => void }) => {
    callbacksRef.current = callbacks;
  }, []);
  
  const confirmPlan = useCallback(() => {
    const plan = state.pendingPlan;
    if (plan && plan.changes) {
      const changesCount = plan.changes.length;
      addCommandToHistory(plan.description || 'Apply changes', 'applied', changesCount);
      addAppliedChanges(plan.changes);
      setState(prev => ({
        ...prev,
        pendingPlan: null,
        stats: {
          ...prev.stats,
          totalChangesApplied: prev.stats.totalChangesApplied + changesCount,
          commandsToday: prev.stats.commandsToday + 1,
          lastCommandAt: new Date(),
        },
      }));
      callbacksRef.current.onConfirmPlan?.();
    }
  }, [state.pendingPlan, addCommandToHistory, addAppliedChanges]);
  
  const cancelPlan = useCallback(() => {
    if (state.pendingPlan) {
      addCommandToHistory(state.pendingPlan.description || 'Apply changes', 'cancelled');
      setState(prev => ({ ...prev, pendingPlan: null }));
      callbacksRef.current.onCancelPlan?.();
    }
  }, [state.pendingPlan, addCommandToHistory]);
  
  const value: ChatSidebarContextValue = {
    ...state,
    setPendingPlan,
    confirmPlan,
    cancelPlan,
    addCommandToHistory,
    addAppliedChanges,
    clearAppliedChanges,
    updateStats,
    setSelectedTargets,
    setCallbacks,
  };
  
  return (
    <ChatSidebarContext.Provider value={value}>
      {children}
    </ChatSidebarContext.Provider>
  );
}

// Centralized State Manager - Single Source of Truth
// Eliminates the state lattice by consolidating all selection/pending state

import { useState, useCallback, useRef } from 'react';
import type { TransactionPlan, ChangePreview } from '@/lib/chat/types';

type SelectionMode = 'none' | 'manual' | 'chat';

interface SelectionState {
  mode: SelectionMode;
  engines: string[];
  groups: string[];
  logics: string[];
  fields: string[];
  pendingPlan: TransactionPlan | null;
  lastAppliedPreview: ChangePreview[] | null;
}

interface SelectionSnapshot {
  engines: string[];
  groups: string[];
  logics: string[];
}

// INVARIANT: Only one mode can be active at any time
// INVARIANT: Pending state is always null when mode is 'none'
// INVARIANT: Chat mode auto-exits on any manual interaction
export function useSelectionManager() {
  const [state, setState] = useState<SelectionState>({
    mode: 'none',
    engines: [],
    groups: [],
    logics: [],
    fields: [],
    pendingPlan: null,
    lastAppliedPreview: null,
  });

  // Store manual selections to restore after chat mode
  const manualSnapshotRef = useRef<SelectionSnapshot>({
    engines: [],
    groups: [],
    logics: [],
  });

  // GUARD: Enter chat mode - saves current state and switches
  const enterChatMode = useCallback((target: {
    engines?: string[];
    groups?: string[];
    logics?: string[];
    fields?: string[];
  }) => {
    setState(prev => {
      // Save current manual selections before switching
      if (prev.mode !== 'chat') {
        manualSnapshotRef.current = {
          engines: prev.engines,
          groups: prev.groups,
          logics: prev.logics,
        };
      }

      return {
        ...prev,
        mode: 'chat',
        engines: target.engines || prev.engines,
        groups: target.groups || prev.groups,
        logics: target.logics || prev.logics,
        fields: target.fields || [],
      };
    });
  }, []);

  // GUARD: Manual selection change - exits chat mode
  const updateManualSelection = useCallback((type: 'engines' | 'groups' | 'logics', items: string[]) => {
    setState(prev => {
      // If in chat mode, exit it and clear pending
      if (prev.mode === 'chat') {
        return {
          ...prev,
          mode: 'manual',
          [type]: items,
          pendingPlan: null,
          lastAppliedPreview: null,
        };
      }

      return {
        ...prev,
        mode: items.length > 0 ? 'manual' : 'none',
        [type]: items,
      };
    });
  }, []);

  // GUARD: Set pending plan - only allowed in chat mode
  const setPendingPlan = useCallback((plan: TransactionPlan | null) => {
    setState(prev => {
      // INVARIANT: Pending plan can only exist in chat mode
      if (prev.mode !== 'chat' && plan !== null) {
        console.warn('[SelectionManager] Attempted to set pending plan outside chat mode');
        return prev;
      }
      return { ...prev, pendingPlan: plan };
    });
  }, []);

  // GUARD: Clear all selections and pending state
  const clearAll = useCallback(() => {
    setState({
      mode: 'none',
      engines: [],
      groups: [],
      logics: [],
      fields: [],
      pendingPlan: null,
      lastAppliedPreview: null,
    });
    manualSnapshotRef.current = { engines: [], groups: [], logics: [] };
  }, []);

  // GUARD: Exit chat mode and restore manual selections
  const exitChatMode = useCallback(() => {
    setState(prev => {
      if (prev.mode !== 'chat') return prev;

      const snapshot = manualSnapshotRef.current;
      const hasSelections = snapshot.engines.length > 0 || 
                           snapshot.groups.length > 0 || 
                           snapshot.logics.length > 0;

      return {
        ...prev,
        mode: hasSelections ? 'manual' : 'none',
        engines: snapshot.engines,
        groups: snapshot.groups,
        logics: snapshot.logics,
        pendingPlan: null,
        lastAppliedPreview: null,
      };
    });
  }, []);

  return {
    state,
    isChatMode: state.mode === 'chat',
    isManualMode: state.mode === 'manual',
    hasSelection: state.engines.length > 0 || state.groups.length > 0 || state.logics.length > 0,
    enterChatMode,
    updateManualSelection,
    setPendingPlan,
    clearAll,
    exitChatMode,
  };
}

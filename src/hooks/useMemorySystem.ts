// React hook for memory system integration

import { useState, useEffect } from 'react';
import { MTConfig } from '@/types/mt-config';
import { getMemorySystemManager, MemorySystemManager } from '@/lib/memory-system/manager';
import {
  MemorySystemState,
  UserPreference,
  StrategyPattern,
  ChangeImpactPrediction,
  MemoryEntry
} from './types';

export function useMemorySystem(initialConfig?: MTConfig) {
  const [memManager] = useState<MemorySystemManager>(() => getMemorySystemManager());
  const [state, setState] = useState<MemorySystemState>(memManager.getState());

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = memManager.subscribe(setState);
    return unsubscribe;
  }, [memManager]);

  const recordAction = (
    userId: string,
    action: string,
    parametersChanged: Array<{
      parameter: string;
      oldValue: any;
      newValue: any;
      engineId: string;
      groupId: number;
      logicName: string;
    }>,
    context: MemoryEntry['context'] = {},
    outcome?: MemoryEntry['outcome']
  ) => {
    return memManager.recordAction(userId, action, parametersChanged, context, outcome);
  };

  const getChangePredictions = (parameterKey: string) => {
    return memManager.getChangePredictions(parameterKey);
  };

  const predictChangeImpact = (
    parameterKey: string,
    newValue: any,
    currentValue: any
  ) => {
    return memManager.predictChangeImpact(parameterKey, newValue, currentValue);
  };

  const getUserPreferences = (userId: string) => {
    return memManager.getUserPreferences(userId);
  };

  const getTopUserPreferences = (userId: string, limit: number = 5) => {
    return memManager.getTopUserPreferences(userId, limit);
  };

  const getStrategyPatterns = () => {
    return memManager.getStrategyPatterns();
  };

  const getMemoryEntries = (userId?: string) => {
    return memManager.getMemoryEntries(userId);
  };

  const getSuggestedCombinations = (userId: string, context: any = {}) => {
    return memManager.getSuggestedCombinations(userId, context);
  };

  const startLearning = () => {
    memManager.startLearning();
  };

  const stopLearning = () => {
    memManager.stopLearning();
  };

  return {
    // State
    state,

    // Actions
    recordAction,
    getChangePredictions,
    predictChangeImpact,
    startLearning,
    stopLearning,

    // Queries
    getUserPreferences,
    getTopUserPreferences,
    getStrategyPatterns,
    getMemoryEntries,
    getSuggestedCombinations,
  };
}

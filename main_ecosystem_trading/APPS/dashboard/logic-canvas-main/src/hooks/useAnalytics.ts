// React hook for analytics system integration

import { useState, useEffect } from 'react';
import { MTConfig } from '@/types/mt-config';
import { getAnalyticsManager, AnalyticsManager } from '@/lib/analytics/manager';
import {
  AnalyticsState,
  ParameterCorrelation,
  PerformanceMetric,
  OptimizationRecommendation,
  RiskAnalysis,
  BacktestResult
} from './types';

export function useAnalytics(initialConfig?: MTConfig) {
  const [anManager] = useState<AnalyticsManager>(() => getAnalyticsManager());
  const [state, setState] = useState<AnalyticsState>(anManager.getState());

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = anManager.subscribe(setState);
    return unsubscribe;
  }, [anManager]);

  const performAnalysis = async (config?: MTConfig) => {
    await anManager.performAnalysis(config);
  };

  const startAnalysis = () => {
    anManager.startAnalysis();
  };

  const stopAnalysis = () => {
    anManager.stopAnalysis();
  };

  const addBacktestResult = (result: Omit<BacktestResult, 'id'>) => {
    return anManager.addBacktestResult(result);
  };

  const applyRecommendation = (recId: string) => {
    return anManager.applyRecommendation(recId);
  };

  const getHighRiskItems = () => {
    return anManager.getHighRiskItems();
  };

  const getRecommendationsByImpact = (impact: 'low' | 'medium' | 'high') => {
    return anManager.getRecommendationsByImpact(impact);
  };

  const getStrongCorrelations = () => {
    return anManager.getStrongCorrelations();
  };

  return {
    // State
    state,

    // Operations
    performAnalysis,
    startAnalysis,
    stopAnalysis,
    addBacktestResult,
    applyRecommendation,

    // Queries
    getHighRiskItems,
    getRecommendationsByImpact,
    getStrongCorrelations,
  };
}

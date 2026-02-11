// Types for Advanced Memory System

export interface UserPreference {
  id: string;
  userId: string;
  parameterCombination: Record<string, any>; // Key-value pairs of parameter settings
  frequency: number; // How often this combination is used
  lastUsed: number; // Timestamp of last use
  performanceScore?: number; // How well this performs (if known)
  tags: string[]; // Associated tags
}

export interface StrategyPattern {
  id: string;
  name: string;
  description: string;
  parameterCombinations: Record<string, any>[][]; // Multiple combinations that form this pattern
  frequency: number; // How often this pattern is used
  successRate?: number; // Success rate of this pattern
  createdAt: number;
  createdBy: string;
  tags: string[];
}

export interface ChangeImpactPrediction {
  parameter: string;
  predictedEffect: 'positive' | 'negative' | 'neutral' | 'unknown';
  confidence: number; // 0-1 scale
  historicalImpact?: number; // Average impact based on past changes
  relatedParameters: string[]; // Parameters that might be affected
  description: string;
}

export interface MemoryEntry {
  id: string;
  userId: string;
  action: string; // What action was taken
  parametersChanged: Array<{
    parameter: string;
    oldValue: any;
    newValue: any;
    engineId: string;
    groupId: number;
    logicName: string;
  }>;
  context: {
    marketConditions?: string;
    accountBalance?: number;
    timeOfDay?: string;
    dayOfWeek?: string;
  };
  outcome?: {
    performanceChange?: number; // How performance changed after the action
    timeToOutcome?: number; // How long it took to see results
    success?: boolean; // Whether the change was beneficial
  };
  timestamp: number;
}

export interface MemorySystemConfig {
  maxMemoryEntries?: number; // Maximum number of memory entries to store
  learningRate?: number; // How quickly to adapt to new patterns (0-1)
  predictionThreshold?: number; // Minimum confidence to show predictions
  autoLearn?: boolean; // Whether to automatically learn from changes
}

export interface MemorySystemState {
  userPreferences: UserPreference[];
  strategyPatterns: StrategyPattern[];
  memoryEntries: MemoryEntry[];
  changePredictions: Record<string, ChangeImpactPrediction[]>; // Predictions for each parameter
  config: MemorySystemConfig;
  isLearning: boolean;
}

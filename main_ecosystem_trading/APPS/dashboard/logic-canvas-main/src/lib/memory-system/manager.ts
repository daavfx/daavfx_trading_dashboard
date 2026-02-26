// Advanced Memory System for Trading Parameters
// Learns from user behavior and predicts change impacts

import { v4 as uuidv4 } from 'uuid';
import { MTConfig } from '@/types/mt-config';
import {
  MemorySystemState,
  UserPreference,
  StrategyPattern,
  ChangeImpactPrediction,
  MemoryEntry,
  MemorySystemConfig
} from './types';

const STORAGE_KEY = 'daavfx_memory_system';

export class MemorySystemManager {
  private state: MemorySystemState;
  private onChangeCallbacks: Array<(state: MemorySystemState) => void> = [];

  constructor(config?: MemorySystemConfig) {
    // Try to load from localStorage first
    const saved = this.loadFromStorage();
    
    if (saved) {
      this.state = saved;
    } else {
      this.state = {
        userPreferences: [],
        strategyPatterns: [],
        memoryEntries: [],
        changePredictions: {},
        config: {
          maxMemoryEntries: config?.maxMemoryEntries || 1000,
          learningRate: config?.learningRate || 0.1,
          predictionThreshold: config?.predictionThreshold || 0.7,
          autoLearn: config?.autoLearn ?? true,
        },
        isLearning: true,
      };
    }
  }

  // Persist to localStorage
  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[MemorySystem] Failed to save to storage:', e);
    }
  }

  // Load from localStorage
  private loadFromStorage(): MemorySystemState | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('[MemorySystem] Failed to load from storage:', e);
    }
    return null;
  }

  // Subscribe to state changes
  subscribe(callback: (state: MemorySystemState) => void): () => void {
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

  getState(): MemorySystemState {
    return { ...this.state };
  }

  getConfig(): MemorySystemConfig {
    return { ...this.state.config };
  }

  updateConfig(config: Partial<MemorySystemConfig>): void {
    this.state.config = { ...this.state.config, ...config };
    this.notifyChange();
  }

  // Record a user action and its context
  recordAction(
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
  ): MemoryEntry {
    const entry: MemoryEntry = {
      id: uuidv4(),
      userId,
      action,
      parametersChanged,
      context,
      outcome,
      timestamp: Date.now(),
    };

    this.state.memoryEntries.push(entry);

    // Maintain max memory entries
    if (this.state.memoryEntries.length > this.state.config.maxMemoryEntries!) {
      this.state.memoryEntries = this.state.memoryEntries.slice(-this.state.config.maxMemoryEntries!);
    }

    // Learn from this action if auto-learn is enabled
    if (this.state.config.autoLearn) {
      this.learnFromAction(entry);
    }

    this.notifyChange();
    return entry;
  }

  // Learn from a recorded action
  private learnFromAction(entry: MemoryEntry): void {
    // Update user preferences based on the parameters changed
    this.updateUserPreferences(entry);

    // Look for strategy patterns in the parameters changed
    this.detectStrategyPatterns(entry);

    // Update change predictions based on outcomes
    if (entry.outcome) {
      this.updateChangePredictions(entry);
    }
  }

  // Update user preferences based on an action
  private updateUserPreferences(entry: MemoryEntry): void {
    // Create a parameter combination key from the changed parameters
    const paramCombo: Record<string, any> = {};
    for (const change of entry.parametersChanged) {
      // Use a composite key including engine, group, logic, and parameter
      const key = `${change.engineId}_${change.groupId}_${change.logicName}_${change.parameter}`;
      paramCombo[key] = change.newValue;
    }

    // Check if this combination already exists
    const existingPref = this.state.userPreferences.find(pref =>
      this.isSameParameterCombination(pref.parameterCombination, paramCombo) && pref.userId === entry.userId
    );

    if (existingPref) {
      // Update existing preference
      existingPref.frequency += 1;
      existingPref.lastUsed = Date.now();
      if (entry.outcome?.performanceChange !== undefined) {
        existingPref.performanceScore = (existingPref.performanceScore || 0) * 0.8 +
                                       entry.outcome.performanceChange * 0.2; // Weighted average
      }
    } else {
      // Create new preference
      const newPref: UserPreference = {
        id: uuidv4(),
        userId: entry.userId,
        parameterCombination: paramCombo,
        frequency: 1,
        lastUsed: Date.now(),
        performanceScore: entry.outcome?.performanceChange,
        tags: [],
      };
      this.state.userPreferences.push(newPref);
    }
  }

  // Detect strategy patterns in the parameters
  private detectStrategyPatterns(entry: MemoryEntry): void {
    // For now, we'll look for common parameter combinations that appear together
    // In a real implementation, we'd use more sophisticated pattern recognition

    // Group the parameters by some logical criteria
    const paramKeys = entry.parametersChanged.map(change =>
      `${change.engineId}_${change.groupId}_${change.logicName}_${change.parameter}`
    );

    // Check if this combination matches any existing pattern
    const matchedPattern = this.state.strategyPatterns.find(pattern =>
      this.isSubsetOf(paramKeys, Object.keys(pattern.parameterCombinations[0] || {}))
    );

    if (matchedPattern) {
      // Update existing pattern
      matchedPattern.frequency += 1;
      // Add this combination to the pattern if it's not already there
      const comboExists = matchedPattern.parameterCombinations.some(combo =>
        this.isSameParameterCombination(combo, this.paramsToCombo(entry.parametersChanged))
      );
      if (!comboExists) {
        matchedPattern.parameterCombinations.push(this.paramsToCombo(entry.parametersChanged));
      }
    } else {
      // Create new pattern
      const newPattern: StrategyPattern = {
        id: uuidv4(),
        name: `Pattern_${Date.now()}`, // Generate a name
        description: `Automatically detected pattern from ${entry.action}`,
        parameterCombinations: [this.paramsToCombo(entry.parametersChanged)],
        frequency: 1,
        createdAt: Date.now(),
        createdBy: entry.userId,
        tags: [],
      };
      this.state.strategyPatterns.push(newPattern);
    }
  }

  // Convert parameters changed to a combination object
  private paramsToCombo(params: Array<{parameter: string; newValue: any; engineId: string; groupId: number; logicName: string}>): Record<string, any> {
    const combo: Record<string, any> = {};
    for (const param of params) {
      const key = `${param.engineId}_${param.groupId}_${param.logicName}_${param.parameter}`;
      combo[key] = param.newValue;
    }
    return combo;
  }

  // Update change predictions based on outcomes
  private updateChangePredictions(entry: MemoryEntry): void {
    if (!entry.outcome) return;

    for (const change of entry.parametersChanged) {
      const paramKey = `${change.engineId}_${change.groupId}_${change.logicName}_${change.parameter}`;

      if (!this.state.changePredictions[paramKey]) {
        this.state.changePredictions[paramKey] = [];
      }

      // Find existing prediction for this parameter
      const existingPred = this.state.changePredictions[paramKey].find(p => p.parameter === change.parameter);

      if (existingPred) {
        // Update existing prediction using learning rate
        const perfChange = entry.outcome.performanceChange || 0;
        existingPred.historicalImpact = (existingPred.historicalImpact || 0) * (1 - this.state.config.learningRate!) +
                                       perfChange * this.state.config.learningRate!;

        // Determine effect based on performance change
        if (perfChange > 0.5) {
          existingPred.predictedEffect = 'positive';
        } else if (perfChange < -0.5) {
          existingPred.predictedEffect = 'negative';
        } else {
          existingPred.predictedEffect = 'neutral';
        }

        // Update confidence based on frequency of similar changes
        const similarChanges = this.state.memoryEntries.filter(e =>
          e.parametersChanged.some(c =>
            `${c.engineId}_${c.groupId}_${c.logicName}_${c.parameter}` === paramKey
          )
        ).length;

        existingPred.confidence = Math.min(1.0, similarChanges / 10.0); // Normalize confidence
      } else {
        // Create new prediction
        const perfChange = entry.outcome.performanceChange || 0;
        const newPred: ChangeImpactPrediction = {
          parameter: change.parameter,
          predictedEffect: perfChange > 0.5 ? 'positive' :
                          perfChange < -0.5 ? 'negative' : 'neutral',
          confidence: 0.5, // Default confidence
          historicalImpact: perfChange,
          relatedParameters: [], // Would be populated based on correlation analysis
          description: `Changing ${change.parameter} typically results in ${perfChange.toFixed(2)} performance change`
        };

        this.state.changePredictions[paramKey].push(newPred);
      }
    }
  }

  // Get change predictions for a parameter
  getChangePredictions(parameterKey: string): ChangeImpactPrediction[] {
    return this.state.changePredictions[parameterKey] || [];
  }

  // Get user preferences
  getUserPreferences(userId: string): UserPreference[] {
    return this.state.userPreferences.filter(pref => pref.userId === userId);
  }

  // Get top user preferences
  getTopUserPreferences(userId: string, limit: number = 5): UserPreference[] {
    return this.state.userPreferences
      .filter(pref => pref.userId === userId)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  // Get strategy patterns
  getStrategyPatterns(): StrategyPattern[] {
    return [...this.state.strategyPatterns];
  }

  // Get memory entries
  getMemoryEntries(userId?: string): MemoryEntry[] {
    if (userId) {
      return this.state.memoryEntries.filter(entry => entry.userId === userId);
    }
    return [...this.state.memoryEntries];
  }

  // Predict the impact of changing a parameter
  predictChangeImpact(
    parameterKey: string,
    newValue: any,
    currentValue: any
  ): ChangeImpactPrediction | null {
    const predictions = this.getChangePredictions(parameterKey);
    if (predictions.length === 0) return null;

    // Return the most confident prediction
    const sortedPredictions = predictions.sort((a, b) => b.confidence - a.confidence);
    return sortedPredictions[0];
  }

  // Get suggested parameter combinations based on user preferences
  getSuggestedCombinations(userId: string, context: any = {}): UserPreference[] {
    // Get user's top preferences
    const topPrefs = this.getTopUserPreferences(userId, 10);

    // Sort by frequency and recency
    return topPrefs.sort((a, b) => {
      // Prioritize by frequency first, then by recency
      const freqDiff = b.frequency - a.frequency;
      if (freqDiff !== 0) return freqDiff;
      return b.lastUsed - a.lastUsed;
    });
  }

  // Check if two parameter combinations are the same
  private isSameParameterCombination(a: Record<string, any>, b: Record<string, any>): boolean {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();

    if (aKeys.length !== bKeys.length) return false;

    for (let i = 0; i < aKeys.length; i++) {
      const key = aKeys[i];
      if (a[key] !== b[key]) return false;
    }

    return true;
  }

  // Check if array a is a subset of array b
  private isSubsetOf(a: string[], b: string[]): boolean {
    return a.every(item => b.includes(item));
  }

  // Start learning mode
  startLearning(): void {
    this.state.isLearning = true;
    this.notifyChange();
  }

  // Stop learning mode
  stopLearning(): void {
    this.state.isLearning = false;
    this.notifyChange();
  }

  // Reset the memory system
  reset(): void {
    this.state = {
      userPreferences: [],
      strategyPatterns: [],
      memoryEntries: [],
      changePredictions: {},
      config: this.state.config,
      isLearning: this.state.isLearning,
    };
    this.notifyChange();
  }
}

// Singleton instance
let memorySystemManager: MemorySystemManager | null = null;

export function getMemorySystemManager(config?: MemorySystemConfig): MemorySystemManager {
  if (!memorySystemManager) {
    memorySystemManager = new MemorySystemManager(config);
  }
  return memorySystemManager;
}

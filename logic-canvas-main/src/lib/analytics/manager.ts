// Advanced Analytics System for Trading Parameters
// Provides correlation analysis, performance tracking, risk assessment, and optimization recommendations

import { v4 as uuidv4 } from 'uuid';
import { MTConfig } from '@/types/mt-config';
import {
  AnalyticsState,
  ParameterCorrelation,
  PerformanceMetric,
  OptimizationRecommendation,
  RiskAnalysis,
  BacktestResult,
  AnalyticsConfig
} from './types';

export class AnalyticsManager {
  private state: AnalyticsState;
  private onChangeCallbacks: Array<(state: AnalyticsState) => void> = [];
  private analysisInterval: NodeJS.Timeout | null = null;

  constructor(config?: AnalyticsConfig) {
    this.state = {
      correlations: [],
      performanceMetrics: [],
      recommendations: [],
      riskAnalyses: [],
      backtestResults: [],
      config: {
        enableCorrelationAnalysis: config?.enableCorrelationAnalysis ?? true,
        enablePerformanceTracking: config?.enablePerformanceTracking ?? true,
        enableRiskAssessment: config?.enableRiskAssessment ?? true,
        enableOptimization: config?.enableOptimization ?? true,
        correlationThreshold: config?.correlationThreshold || 0.5,
        riskThreshold: config?.riskThreshold || 70,
        backtestDuration: config?.backtestDuration || 30, // 30 days
        dataRetentionDays: config?.dataRetentionDays || 90, // 90 days
      },
      isAnalyzing: false,
      lastAnalysis: null,
    };
  }

  // Subscribe to state changes
  subscribe(callback: (state: AnalyticsState) => void): () => void {
    this.onChangeCallbacks.push(callback);
    return () => {
      const index = this.onChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.onChangeCallbacks.splice(index, 1);
      }
    };
  }

  private notifyChange(): void {
    this.onChangeCallbacks.forEach(callback => callback(this.getState()));
  }

  getState(): AnalyticsState {
    return { ...this.state };
  }

  getConfig(): AnalyticsConfig {
    return { ...this.state.config };
  }

  updateConfig(config: Partial<AnalyticsConfig>): void {
    this.state.config = { ...this.state.config, ...config };
    this.notifyChange();
  }

  // Start periodic analysis
  startAnalysis(): void {
    if (this.analysisInterval) return; // Already running

    this.analysisInterval = setInterval(() => {
      this.performAnalysis();
    }, 300000); // Run every 5 minutes
  }

  // Stop periodic analysis
  stopAnalysis(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
  }

  // Perform comprehensive analysis
  async performAnalysis(config?: MTConfig): Promise<void> {
    if (this.state.isAnalyzing) return;

    this.state.isAnalyzing = true;
    this.notifyChange();

    try {
      if (this.state.config.enableCorrelationAnalysis) {
        this.analyzeCorrelations(config);
      }

      if (this.state.config.enablePerformanceTracking) {
        this.trackPerformance(config);
      }

      if (this.state.config.enableRiskAssessment) {
        this.assessRisk(config);
      }

      if (this.state.config.enableOptimization) {
        this.generateRecommendations(config);
      }

      this.state.lastAnalysis = Date.now();
    } finally {
      this.state.isAnalyzing = false;
      this.notifyChange();
    }
  }

  // Analyze correlations between parameters
  private analyzeCorrelations(config?: MTConfig): void {
    if (!config) return;

    // Simplified correlation analysis - in a real implementation, this would
    // analyze historical data to determine how parameters relate to each other
    const correlations: ParameterCorrelation[] = [];

    // Example: analyze correlations between grid, trail, and lot parameters
    for (const engine of config.engines) {
      for (const group of engine.groups) {
        for (const logic of group.logics) {
          // Look for numeric parameters that might correlate
          const numericParams: { [key: string]: number } = {};

          Object.entries(logic).forEach(([key, value]) => {
            if (typeof value === 'number' && !isNaN(value)) {
              numericParams[key] = value;
            }
          });

          // Compare each parameter with others
          const paramKeys = Object.keys(numericParams);
          for (let i = 0; i < paramKeys.length; i++) {
            for (let j = i + 1; j < paramKeys.length; j++) {
              const paramA = paramKeys[i];
              const paramB = paramKeys[j];

              // Calculate a simplified correlation (in reality, this would use historical data)
              const valueA = numericParams[paramA];
              const valueB = numericParams[paramB];

              // For demonstration, we'll create a correlation based on the relationship
              let correlation = 0;
              if (paramA.includes('grid') && paramB.includes('trail')) {
                // Grid and trail parameters often have positive correlation
                correlation = 0.6;
              } else if (paramA.includes('lot') && paramB.includes('risk')) {
                // Lot and risk parameters might have positive correlation
                correlation = 0.5;
              } else {
                // Default weak correlation
                correlation = (Math.random() * 0.4) - 0.2; // Between -0.2 and 0.2
              }

              // Only add if correlation exceeds threshold
              if (Math.abs(correlation) >= (this.state.config.correlationThreshold || 0)) {
                const strength = Math.abs(correlation) > 0.7 ? 'strong' :
                               Math.abs(correlation) > 0.5 ? 'moderate' : 'weak';

                correlations.push({
                  parameterA: `${engine.engine_id}.${group.group_number}.${logic.logic_name}.${paramA}`,
                  parameterB: `${engine.engine_id}.${group.group_number}.${logic.logic_name}.${paramB}`,
                  correlationCoefficient: correlation,
                  strength,
                  pValue: 0.05, // Assume statistical significance for demo
                  sampleSize: 100, // Sample size for demo
                  lastUpdated: Date.now(),
                });
              }
            }
          }
        }
      }
    }

    // Update correlations, keeping only strong ones or replacing existing
    this.state.correlations = correlations;
  }

  // Track performance metrics
  private trackPerformance(config?: MTConfig): void {
    if (!config) return;

    // Simplified performance tracking - in reality, this would use actual trading results
    const metrics: PerformanceMetric[] = [];

    // Example metrics based on configuration
    metrics.push({
      id: 'avg-grid-spacing',
      name: 'Average Grid Spacing',
      description: 'Average grid spacing across all logics',
      currentValue: this.calculateAvgGridSpacing(config),
      baselineValue: 3000,
      trend: 'stable',
      volatility: 0.1,
      confidence: 0.9,
      lastUpdated: Date.now(),
      tags: ['grid', 'spacing', 'efficiency']
    });

    metrics.push({
      id: 'avg-trail-distance',
      name: 'Average Trail Distance',
      description: 'Average trail distance across all logics',
      currentValue: this.calculateAvgTrailDistance(config),
      baselineValue: 2000,
      trend: 'stable',
      volatility: 0.15,
      confidence: 0.85,
      lastUpdated: Date.now(),
      tags: ['trail', 'distance', 'efficiency']
    });

    metrics.push({
      id: 'leverage-factor',
      name: 'Leverage Factor',
      description: 'Overall leverage based on lot multipliers',
      currentValue: this.calculateLeverageFactor(config),
      baselineValue: 1.5,
      trend: 'stable',
      volatility: 0.2,
      confidence: 0.8,
      lastUpdated: Date.now(),
      tags: ['leverage', 'risk', 'lot']
    });

    this.state.performanceMetrics = metrics;
  }

  // Assess risks in the configuration
  private assessRisk(config?: MTConfig): void {
    if (!config) return;

    const risks: RiskAnalysis[] = [];

    // Analyze risk based on configuration parameters
    for (const engine of config.engines) {
      for (const group of engine.groups) {
        for (const logic of group.logics) {
          // Check for high-risk configurations
          if (typeof logic.multiplier === 'number' && logic.multiplier > 2.5) {
            risks.push({
              id: uuidv4(),
              parameter: `${engine.engine_id}.${group.group_number}.${logic.logic_name}.multiplier`,
              riskLevel: 'high',
              riskScore: 85,
              factors: ['High multiplier increases risk exponentially'],
              mitigationStrategies: ['Reduce multiplier to 2.0 or below', 'Implement stricter stop losses'],
              probability: 0.7,
              impact: 0.8,
              createdAt: Date.now()
            });
          }

          if (typeof logic.initial_lot === 'number' && logic.initial_lot > 0.1) {
            risks.push({
              id: uuidv4(),
              parameter: `${engine.engine_id}.${group.group_number}.${logic.logic_name}.initial_lot`,
              riskLevel: 'medium',
              riskScore: 65,
              factors: ['High initial lot size'],
              mitigationStrategies: ['Reduce initial lot to 0.05 or below', 'Implement position sizing rules'],
              probability: 0.5,
              impact: 0.6,
              createdAt: Date.now()
            });
          }

          if (typeof logic.grid === 'number' && logic.grid < 1000) {
            risks.push({
              id: uuidv4(),
              parameter: `${engine.engine_id}.${group.group_number}.${logic.logic_name}.grid`,
              riskLevel: 'medium',
              riskScore: 60,
              factors: ['Low grid spacing may cause frequent trades'],
              mitigationStrategies: ['Increase grid spacing to 1500+', 'Adjust trail parameters accordingly'],
              probability: 0.6,
              impact: 0.5,
              createdAt: Date.now()
            });
          }
        }
      }
    }

    this.state.riskAnalyses = risks;
  }

  // Generate optimization recommendations
  private generateRecommendations(config?: MTConfig): void {
    if (!config) return;

    const recommendations: OptimizationRecommendation[] = [];

    // Generate recommendations based on configuration analysis
    for (const engine of config.engines) {
      for (const group of engine.groups) {
        for (const logic of group.logics) {
          // Example recommendation: if multiplier is too high
          if (typeof logic.multiplier === 'number' && logic.multiplier > 2.0) {
            recommendations.push({
              id: uuidv4(),
              title: 'Reduce Multiplier for Lower Risk',
              description: 'The current multiplier is quite high, which exponentially increases risk with each trade.',
              targetParameter: `${engine.engine_id}.${group.group_number}.${logic.logic_name}.multiplier`,
              suggestedValue: 1.8,
              expectedImprovement: 15, // 15% risk reduction
              confidence: 0.75,
              impact: 'high',
              reason: 'Lower multipliers reduce exponential risk growth',
              createdAt: Date.now(),
              applied: false
            });
          }

          // Example recommendation: if grid is too tight
          if (typeof logic.grid === 'number' && logic.grid < 1500) {
            recommendations.push({
              id: uuidv4(),
              title: 'Increase Grid Spacing',
              description: 'The current grid spacing might be too tight, causing excessive trading frequency.',
              targetParameter: `${engine.engine_id}.${group.group_number}.${logic.logic_name}.grid`,
              suggestedValue: 2000,
              expectedImprovement: 10, // 10% efficiency improvement
              confidence: 0.7,
              impact: 'medium',
              reason: 'Wider grids reduce trade frequency and slippage',
              createdAt: Date.now(),
              applied: false
            });
          }

          // Example recommendation: if trail start is too low
          if (typeof logic.trail_start === 'number' && logic.trail_start < 5) {
            recommendations.push({
              id: uuidv4(),
              title: 'Increase Trail Start',
              description: 'The trail start value is quite low, which might cause premature trailing.',
              targetParameter: `${engine.engine_id}.${group.group_number}.${logic.logic_name}.trail_start`,
              suggestedValue: 10,
              expectedImprovement: 8, // 8% profit improvement
              confidence: 0.65,
              impact: 'medium',
              reason: 'Higher trail start allows more profit accumulation before trailing begins',
              createdAt: Date.now(),
              applied: false
            });
          }
        }
      }
    }

    this.state.recommendations = recommendations;
  }

  // Calculate average grid spacing
  private calculateAvgGridSpacing(config: MTConfig): number {
    let total = 0;
    let count = 0;

    for (const engine of config.engines) {
      for (const group of engine.groups) {
        for (const logic of group.logics) {
          if (typeof logic.grid === 'number') {
            total += logic.grid;
            count++;
          }
        }
      }
    }

    return count > 0 ? total / count : 0;
  }

  // Calculate average trail distance
  private calculateAvgTrailDistance(config: MTConfig): number {
    let total = 0;
    let count = 0;

    for (const engine of config.engines) {
      for (const group of engine.groups) {
        for (const logic of group.logics) {
          if (typeof logic.trail_value === 'number') {
            total += logic.trail_value;
            count++;
          }
        }
      }
    }

    return count > 0 ? total / count : 0;
  }

  // Calculate leverage factor
  private calculateLeverageFactor(config: MTConfig): number {
    let totalMultiplier = 0;
    let count = 0;

    for (const engine of config.engines) {
      for (const group of engine.groups) {
        for (const logic of group.logics) {
          if (typeof logic.multiplier === 'number') {
            totalMultiplier += logic.multiplier;
            count++;
          }
        }
      }
    }

    return count > 0 ? totalMultiplier / count : 1;
  }

  // Add a backtest result
  addBacktestResult(result: Omit<BacktestResult, 'id'>): BacktestResult {
    const newResult: BacktestResult = {
      ...result,
      id: uuidv4(),
    };

    this.state.backtestResults.push(newResult);

    // Maintain only recent results based on retention policy
    const retentionCutoff = Date.now() - ((this.state.config.dataRetentionDays || 90) * 24 * 60 * 60 * 1000);
    this.state.backtestResults = this.state.backtestResults.filter(
      result => result.startDate > retentionCutoff
    );

    this.notifyChange();
    return newResult;
  }

  // Apply a recommendation
  applyRecommendation(recId: string): boolean {
    const rec = this.state.recommendations.find(r => r.id === recId);
    if (!rec) return false;

    rec.applied = true;
    rec.appliedAt = Date.now();

    this.notifyChange();
    return true;
  }

  // Get high-risk items
  getHighRiskItems(): RiskAnalysis[] {
    return this.state.riskAnalyses.filter(r =>
      r.riskLevel === 'high' || r.riskLevel === 'critical' || r.riskScore >= (this.state.config.riskThreshold || 70)
    );
  }

  // Get recommendations by impact level
  getRecommendationsByImpact(impact: 'low' | 'medium' | 'high'): OptimizationRecommendation[] {
    return this.state.recommendations.filter(r => r.impact === impact);
  }

  // Get correlations above threshold
  getStrongCorrelations(): ParameterCorrelation[] {
    return this.state.correlations.filter(c =>
      Math.abs(c.correlationCoefficient) >= (this.state.config.correlationThreshold || 0.5)
    );
  }

  // Reset the analytics system
  reset(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    this.state = {
      correlations: [],
      performanceMetrics: [],
      recommendations: [],
      riskAnalyses: [],
      backtestResults: [],
      config: this.state.config,
      isAnalyzing: false,
      lastAnalysis: null,
    };
    this.notifyChange();
  }
}

// Singleton instance
let analyticsManager: AnalyticsManager | null = null;

export function getAnalyticsManager(config?: AnalyticsConfig): AnalyticsManager {
  if (!analyticsManager) {
    analyticsManager = new AnalyticsManager(config);
  }
  return analyticsManager;
}

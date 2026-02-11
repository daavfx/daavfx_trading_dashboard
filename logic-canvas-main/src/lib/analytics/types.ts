// Types for Advanced Analytics System

export interface ParameterCorrelation {
  parameterA: string;
  parameterB: string;
  correlationCoefficient: number; // -1 to 1
  strength: 'weak' | 'moderate' | 'strong';
  pValue: number; // Statistical significance
  sampleSize: number;
  lastUpdated: number;
}

export interface PerformanceMetric {
  id: string;
  name: string;
  description: string;
  currentValue: number;
  baselineValue: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  volatility: number; // Standard deviation
  confidence: number; // 0-1 scale
  lastUpdated: number;
  tags: string[];
}

export interface OptimizationRecommendation {
  id: string;
  title: string;
  description: string;
  targetParameter: string;
  suggestedValue: any;
  expectedImprovement: number; // Expected improvement percentage
  confidence: number; // 0-1 scale
  impact: 'low' | 'medium' | 'high';
  reason: string;
  createdAt: number;
  applied: boolean;
  appliedAt?: number;
}

export interface RiskAnalysis {
  id: string;
  parameter: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number; // 0-100 scale
  factors: string[]; // Factors contributing to risk
  mitigationStrategies: string[];
  probability: number; // 0-1 scale
  impact: number; // 0-1 scale
  createdAt: number;
}

export interface BacktestResult {
  id: string;
  strategy: string;
  parameters: Record<string, any>;
  startDate: number;
  endDate: number;
  duration: number; // In days
  initialBalance: number;
  finalBalance: number;
  profit: number;
  profitPercentage: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  tags: string[];
  notes?: string;
}

export interface AnalyticsConfig {
  enableCorrelationAnalysis?: boolean;
  enablePerformanceTracking?: boolean;
  enableRiskAssessment?: boolean;
  enableOptimization?: boolean;
  correlationThreshold?: number; // Minimum correlation to report
  riskThreshold?: number; // Risk score threshold for alerts
  backtestDuration?: number; // Default backtest duration in days
  dataRetentionDays?: number; // How long to keep historical data
}

export interface AnalyticsState {
  correlations: ParameterCorrelation[];
  performanceMetrics: PerformanceMetric[];
  recommendations: OptimizationRecommendation[];
  riskAnalyses: RiskAnalysis[];
  backtestResults: BacktestResult[];
  config: AnalyticsConfig;
  isAnalyzing: boolean;
  lastAnalysis: number | null;
}

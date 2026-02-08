use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tokio::time::{interval, Duration};
use uuid::Uuid;
use ndarray::{Array2, ArrayView2};
use statrs::statistics::{Statistics, Correlation};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskMetrics {
    pub portfolio_value: f64,
    pub daily_pnl: f64,
    pub total_pnl: f64,
    pub max_drawdown: f64,
    pub current_drawdown: f64,
    pub sharpe_ratio: f64,
    pub sortino_ratio: f64,
    pub calmar_ratio: f64,
    pub var_95: f64,  // Value at Risk (95% confidence)
    pub var_99: f64,  // Value at Risk (99% confidence)
    pub expected_shortfall: f64,
    pub beta: f64,
    pub alpha: f64,
    pub tracking_error: f64,
    pub information_ratio: f64,
    pub volatility: f64,
    pub skewness: f64,
    pub kurtosis: f64,
    pub tail_ratio: f64,
    pub omega_ratio: f64,
    pub ulcer_index: f64,
    pub pain_index: f64,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorrelationMatrix {
    pub symbols: Vec<String>,
    pub matrix: Vec<Vec<f64>>,
    pub eigenvalues: Vec<f64>,
    pub condition_number: f64,
    pub determinant: f64,
    pub is_positive_definite: bool,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskLimits {
    pub max_position_size: f64,
    pub max_portfolio_exposure: f64,
    pub max_single_symbol_exposure: f64,
    pub max_correlation_exposure: f64,
    pub max_daily_loss: f64,
    pub max_drawdown_limit: f64,
    pub max_volatility: f64,
    pub min_diversification_ratio: f64,
    pub max_concentration_risk: f64,
    pub max_tail_risk: f64,
    pub var_limit_95: f64,
    pub var_limit_99: f64,
    pub expected_shortfall_limit: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskAlert {
    pub id: String,
    pub alert_type: RiskAlertType,
    pub severity: RiskSeverity,
    pub message: String,
    pub symbol: Option<String>,
    pub current_value: f64,
    pub limit_value: f64,
    pub percentage_breached: f64,
    pub timestamp: i64,
    pub acknowledged: bool,
    pub suggested_actions: Vec<String>,
    pub auto_action_taken: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RiskAlertType {
    PositionSizeExceeded,
    CorrelationLimitExceeded,
    DailyLossLimitExceeded,
    DrawdownLimitExceeded,
    VolatilityLimitExceeded,
    VarLimitExceeded,
    ConcentrationRiskExceeded,
    TailRiskExceeded,
    DiversificationRatioTooLow,
    ExpectedShortfallExceeded,
    LiquidityRiskDetected,
    MarketStressDetected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RiskSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortfolioRisk {
    pub symbols: Vec<String>,
    pub weights: Vec<f64>,
    pub returns: Vec<Vec<f64>>,  // Historical returns for each symbol
    pub covariances: Vec<Vec<f64>>,
    pub correlations: Vec<Vec<f64>>,
    pub volatilities: Vec<f64>,
    pub expected_returns: Vec<f64>,
    pub risk_metrics: RiskMetrics,
    pub correlation_matrix: CorrelationMatrix,
    pub risk_limits: RiskLimits,
    pub risk_contributions: HashMap<String, f64>,
    pub tail_risk_contributions: HashMap<String, f64>,
    pub stress_test_results: HashMap<String, StressTestResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StressTestResult {
    pub scenario_name: String,
    pub portfolio_loss: f64,
    pub max_drawdown: f64,
    pub recovery_time_days: i32,
    var_impact: f64,
    pub correlation_breakdown: HashMap<String, f64>,
    pub liquidity_impact: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiversificationAnalysis {
    pub diversification_ratio: f64,
    pub effective_number_of_bets: f64,
    pub herfindahl_index: f64,
    pub concentration_ratio: f64,
    pub entropy_measure: f64,
    pub principal_components: Vec<PrincipalComponent>,
    pub risk_parity_weights: Vec<f64>,
    pub minimum_variance_weights: Vec<f64>,
    pub maximum_diversification_weights: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrincipalComponent {
    pub component_id: usize,
    pub explained_variance: f64,
    pub cumulative_variance: f64,
    pub factor_loadings: HashMap<String, f64>,
}

pub struct EnhancedRiskManager {
    risk_limits: RiskLimits,
    portfolio_risk: Arc<RwLock<Option<PortfolioRisk>>>,
    risk_history: Arc<RwLock<Vec<RiskMetrics>>>,
    active_alerts: Arc<RwLock<Vec<RiskAlert>>>,
    correlation_cache: Arc<RwLock<HashMap<String, CorrelationMatrix>>>,
    risk_config: RiskConfig,
}

#[derive(Debug, Clone)]
struct RiskConfig {
    lookback_days: usize,
    confidence_levels: Vec<f64>,
    correlation_window: usize,
    stress_test_scenarios: Vec<StressScenario>,
    auto_hedge_threshold: f64,
    rebalancing_frequency_hours: u64,
}

#[derive(Debug, Clone)]
struct StressScenario {
    name: String,
    market_shock: f64,
    correlation_increase: f64,
    liquidity_reduction: f64,
    volatility_spike: f64,
}

impl EnhancedRiskManager {
    pub fn new(risk_limits: RiskLimits) -> Result<Self, String> {
        let config = RiskConfig {
            lookback_days: 252, // 1 year
            confidence_levels: vec![0.95, 0.99],
            correlation_window: 60,
            stress_test_scenarios: vec![
                StressScenario {
                    name: "Market Crash".to_string(),
                    market_shock: -0.20,
                    correlation_increase: 0.30,
                    liquidity_reduction: 0.50,
                    volatility_spike: 2.0,
                },
                StressScenario {
                    name: "Interest Rate Shock".to_string(),
                    market_shock: -0.10,
                    correlation_increase: 0.20,
                    liquidity_reduction: 0.30,
                    volatility_spike: 1.5,
                },
                StressScenario {
                    name: "Currency Crisis".to_string(),
                    market_shock: -0.15,
                    correlation_increase: 0.25,
                    liquidity_reduction: 0.40,
                    volatility_spike: 1.8,
                },
            ],
            auto_hedge_threshold: 0.85,
            rebalancing_frequency_hours: 4,
        };

        Ok(Self {
            risk_limits,
            portfolio_risk: Arc::new(RwLock::new(None)),
            risk_history: Arc::new(RwLock::new(Vec::new())),
            active_alerts: Arc::new(RwLock::new(Vec::new())),
            correlation_cache: Arc::new(RwLock::new(HashMap::new())),
            risk_config: config,
        })
    }

    pub fn calculate_portfolio_risk(&self, symbols: Vec<String>, weights: Vec<f64>, returns: Vec<Vec<f64>>) -> Result<PortfolioRisk, String> {
        if symbols.len() != weights.len() || symbols.len() != returns.len() {
            return Err("Input dimensions mismatch".to_string());
        }

        // Calculate basic statistics
        let n = symbols.len();
        let mut volatilities = Vec::new();
        let mut expected_returns = Vec::new();
        
        for (i, symbol_returns) in returns.iter().enumerate() {
            let vol = self.calculate_volatility(symbol_returns)?;
            let exp_ret = self.calculate_expected_return(symbol_returns)?;
            volatilities.push(vol);
            expected_returns.push(exp_ret);
        }

        // Calculate correlation matrix
        let correlation_matrix = self.calculate_correlation_matrix(&returns, &symbols)?;
        
        // Calculate covariance matrix
        let covariances = self.calculate_covariance_matrix(&returns)?;

        // Calculate portfolio risk metrics
        let risk_metrics = self.calculate_comprehensive_risk_metrics(&weights, &expected_returns, &covariances)?;

        // Calculate risk contributions
        let risk_contributions = self.calculate_risk_contributions(&weights, &covariances, &symbols)?;

        // Calculate tail risk contributions
        let tail_risk_contributions = self.calculate_tail_risk_contributions(&weights, &returns, &symbols)?;

        // Perform stress tests
        let stress_test_results = self.perform_stress_tests(&weights, &expected_returns, &covariances, &symbols)?;

        Ok(PortfolioRisk {
            symbols: symbols.clone(),
            weights,
            returns,
            covariances,
            correlations: correlation_matrix.matrix.clone(),
            volatilities,
            expected_returns,
            risk_metrics,
            correlation_matrix,
            risk_limits: self.risk_limits.clone(),
            risk_contributions,
            tail_risk_contributions,
            stress_test_results,
        })
    }

    fn calculate_volatility(&self, returns: &[f64]) -> Result<f64, String> {
        if returns.is_empty() {
            return Err("Empty returns array".to_string());
        }
        
        let variance = returns.variance();
        Ok(variance.sqrt())
    }

    fn calculate_expected_return(&self, returns: &[f64]) -> Result<f64, String> {
        if returns.is_empty() {
            return Err("Empty returns array".to_string());
        }
        
        Ok(returns.mean())
    }

    fn calculate_correlation_matrix(&self, returns: &[Vec<f64>], symbols: &[String]) -> Result<CorrelationMatrix, String> {
        let n = returns.len();
        let mut matrix = vec![vec![0.0; n]; n];
        
        for i in 0..n {
            for j in 0..n {
                if i == j {
                    matrix[i][j] = 1.0;
                } else {
                    let corr = self.calculate_correlation(&returns[i], &returns[j])?;
                    matrix[i][j] = corr;
                    matrix[j][i] = corr; // Symmetric
                }
            }
        }

        // Calculate eigenvalues for condition analysis
        let eigenvalues = self.calculate_eigenvalues(&matrix)?;
        let condition_number = eigenvalues.iter().max_by(|a, b| a.partial_cmp(b).unwrap()).unwrap() /
                              eigenvalues.iter().min_by(|a, b| a.partial_cmp(b).unwrap()).unwrap();

        // Calculate determinant
        let determinant = self.calculate_determinant(&matrix)?;

        // Check positive definiteness
        let is_positive_definite = eigenvalues.iter().all(|&x| x > 0.0);

        Ok(CorrelationMatrix {
            symbols: symbols.to_vec(),
            matrix,
            eigenvalues,
            condition_number,
            determinant,
            is_positive_definite,
            timestamp: chrono::Utc::now().timestamp(),
        })
    }

    fn calculate_correlation(&self, x: &[f64], y: &[f64]) -> Result<f64, String> {
        if x.len() != y.len() || x.len() < 2 {
            return Err("Arrays must have same length and at least 2 elements".to_string());
        }

        let n = x.len() as f64;
        let mean_x = x.mean();
        let mean_y = y.mean();

        let mut numerator = 0.0;
        let mut sum_sq_x = 0.0;
        let mut sum_sq_y = 0.0;

        for i in 0..x.len() {
            let dx = x[i] - mean_x;
            let dy = y[i] - mean_y;
            numerator += dx * dy;
            sum_sq_x += dx * dx;
            sum_sq_y += dy * dy;
        }

        let denominator = (sum_sq_x * sum_sq_y).sqrt();
        
        if denominator == 0.0 {
            return Ok(0.0); // No correlation if no variance
        }

        Ok(numerator / denominator)
    }

    fn calculate_covariance_matrix(&self, returns: &[Vec<f64>]) -> Result<Vec<Vec<f64>>, String> {
        let n = returns.len();
        let mut cov_matrix = vec![vec![0.0; n]; n];

        for i in 0..n {
            for j in 0..n {
                let cov = self.calculate_covariance(&returns[i], &returns[j])?;
                cov_matrix[i][j] = cov;
            }
        }

        Ok(cov_matrix)
    }

    fn calculate_covariance(&self, x: &[f64], y: &[f64]) -> Result<f64, String> {
        if x.len() != y.len() || x.len() < 2 {
            return Err("Arrays must have same length and at least 2 elements".to_string());
        }

        let n = x.len() as f64;
        let mean_x = x.mean();
        let mean_y = y.mean();

        let mut covariance = 0.0;
        for i in 0..x.len() {
            covariance += (x[i] - mean_x) * (y[i] - mean_y);
        }

        Ok(covariance / (n - 1.0))
    }

    fn calculate_comprehensive_risk_metrics(&self, weights: &[f64], expected_returns: &[f64], covariances: &[Vec<f64>]) -> Result<RiskMetrics, String> {
        let portfolio_return: f64 = weights.iter().zip(expected_returns.iter()).map(|(w, r)| w * r).sum();
        
        let portfolio_variance: f64 = weights.iter().enumerate().map(|(i, w1)| {
            weights.iter().enumerate().map(|(j, w2)| w1 * w2 * covariances[i][j]).sum::<f64>()
        }).sum();
        
        let portfolio_volatility = portfolio_variance.sqrt();

        // Calculate VaR using historical simulation (simplified)
        let var_95 = self.calculate_var_historical(weights, expected_returns, covariances, 0.95)?;
        let var_99 = self.calculate_var_historical(weights, expected_returns, covariances, 0.99)?;

        // Calculate Expected Shortfall (CVaR)
        let expected_shortfall = self.calculate_expected_shortfall(weights, expected_returns, covariances, 0.95)?;

        // Calculate other advanced metrics
        let sharpe_ratio = if portfolio_volatility > 0.0 { portfolio_return / portfolio_volatility } else { 0.0 };
        let sortino_ratio = self.calculate_sortino_ratio(weights, expected_returns, covariances)?;
        let calmar_ratio = self.calculate_calmar_ratio(weights, expected_returns, covariances)?;

        Ok(RiskMetrics {
            portfolio_value: 100000.0, // Default portfolio value
            daily_pnl: portfolio_return,
            total_pnl: portfolio_return * 252.0, // Annualized
            max_drawdown: 0.0, // Would need historical data
            current_drawdown: 0.0,
            sharpe_ratio,
            sortino_ratio,
            calmar_ratio,
            var_95,
            var_99,
            expected_shortfall,
            beta: 1.0, // Would need market benchmark
            alpha: portfolio_return - 0.0, // Assuming market return of 0%
            tracking_error: portfolio_volatility,
            information_ratio: sharpe_ratio,
            volatility: portfolio_volatility,
            skewness: 0.0, // Would need return distribution
            kurtosis: 3.0, // Normal distribution
            tail_ratio: 1.0,
            omega_ratio: 1.0,
            ulcer_index: 0.0,
            pain_index: 0.0,
            timestamp: chrono::Utc::now().timestamp(),
        })
    }

    fn calculate_var_historical(&self, weights: &[f64], expected_returns: &[f64], covariances: &[Vec<f64>], confidence: f64) -> Result<f64, String> {
        // Simplified VaR calculation using normal distribution assumption
        let portfolio_return: f64 = weights.iter().zip(expected_returns.iter()).map(|(w, r)| w * r).sum();
        let portfolio_variance: f64 = weights.iter().enumerate().map(|(i, w1)| {
            weights.iter().enumerate().map(|(j, w2)| w1 * w2 * covariances[i][j]).sum::<f64>()
        }).sum();
        
        let portfolio_volatility = portfolio_variance.sqrt();
        
        // Use normal distribution quantile (simplified)
        let z_score = match (confidence * 100.0) as i32 {
            95 => 1.645,
            99 => 2.326,
            _ => 1.645,
        };

        Ok(-(portfolio_return - z_score * portfolio_volatility))
    }

    fn calculate_expected_shortfall(&self, weights: &[f64], expected_returns: &[f64], covariances: &[Vec<f64>], confidence: f64) -> Result<f64, String> {
        let var = self.calculate_var_historical(weights, expected_returns, covariances, confidence)?;
        
        // Simplified CVaR calculation (assuming normal distribution)
        let z_score = match (confidence * 100.0) as i32 {
            95 => 1.645,
            99 => 2.326,
            _ => 1.645,
        };
        
        let phi_z = (-z_score * z_score / 2.0).exp() / (2.0 * std::f64::consts::PI).sqrt();
        let cvar_multiplier = phi_z / (1.0 - confidence);
        
        Ok(var * cvar_multiplier)
    }

    fn calculate_sortino_ratio(&self, weights: &[f64], expected_returns: &[f64], covariances: &[Vec<f64>]) -> Result<f64, String> {
        // Simplified Sortino ratio calculation
        let portfolio_return: f64 = weights.iter().zip(expected_returns.iter()).map(|(w, r)| w * r).sum();
        
        // For simplicity, assume downside deviation is 70% of total volatility
        let portfolio_variance: f64 = weights.iter().enumerate().map(|(i, w1)| {
            weights.iter().enumerate().map(|(j, w2)| w1 * w2 * covariances[i][j]).sum::<f64>()
        }).sum();
        
        let downside_deviation = (portfolio_variance * 0.7).sqrt();
        
        Ok(if downside_deviation > 0.0 { portfolio_return / downside_deviation } else { 0.0 })
    }

    fn calculate_calmar_ratio(&self, weights: &[f64], expected_returns: &[f64], covariances: &[Vec<f64>]) -> Result<f64, String> {
        // Simplified Calmar ratio (would need actual max drawdown)
        let portfolio_return: f64 = weights.iter().zip(expected_returns.iter()).map(|(w, r)| w * r).sum();
        let max_drawdown = 0.15; // Assume 15% max drawdown
        
        Ok(if max_drawdown > 0.0 { portfolio_return / max_drawdown } else { 0.0 })
    }

    fn calculate_risk_contributions(&self, weights: &[f64], covariances: &[Vec<f64>], symbols: &[String]) -> Result<HashMap<String, f64>, String> {
        let mut contributions = HashMap::new();
        let portfolio_variance: f64 = weights.iter().enumerate().map(|(i, w1)| {
            weights.iter().enumerate().map(|(j, w2)| w1 * w2 * covariances[i][j]).sum::<f64>()
        }).sum();

        for (i, symbol) in symbols.iter().enumerate() {
            let marginal_risk: f64 = weights.iter().enumerate().map(|(j, w)| w * covariances[i][j]).sum();
            let risk_contribution = weights[i] * marginal_risk / portfolio_variance;
            contributions.insert(symbol.clone(), risk_contribution);
        }

        Ok(contributions)
    }

    fn calculate_tail_risk_contributions(&self, weights: &[f64], returns: &[Vec<f64>], symbols: &[String]) -> Result<HashMap<String, f64>, String> {
        // Simplified tail risk contribution calculation
        let mut contributions = HashMap::new();
        
        for (i, symbol) in symbols.iter().enumerate() {
            // Calculate tail risk as the 5th percentile of returns
            let mut symbol_returns = returns[i].clone();
            symbol_returns.sort_by(|a, b| a.partial_cmp(b).unwrap());
            
            let tail_index = (symbol_returns.len() as f64 * 0.05) as usize;
            let tail_return = symbol_returns[tail_index.min(symbol_returns.len() - 1)];
            
            contributions.insert(symbol.clone(), tail_return * weights[i]);
        }

        Ok(contributions)
    }

    fn perform_stress_tests(&self, weights: &[f64], expected_returns: &[f64], covariances: &[Vec<f64>], symbols: &[String]) -> Result<HashMap<String, StressTestResult>, String> {
        let mut results = HashMap::new();

        for scenario in &self.risk_config.stress_test_scenarios {
            let stressed_returns: Vec<f64> = expected_returns.iter()
                .map(|&ret| ret + scenario.market_shock)
                .collect();

            let stressed_covariances: Vec<Vec<f64>> = covariances.iter().map(|row| {
                row.iter().map(|&cov| cov * (1.0 + scenario.correlation_increase)).collect()
            }).collect();

            let portfolio_loss = weights.iter().zip(stressed_returns.iter())
                .map(|(w, r)| w * r)
                .sum::<f64>();

            let max_drawdown = portfolio_loss.abs() * 2.0; // Simplified
            let recovery_time_days = (max_drawdown / 0.01).ceil() as i32; // Assume 1% recovery per day

            let mut correlation_breakdown = HashMap::new();
            for symbol in symbols {
                correlation_breakdown.insert(symbol.clone(), scenario.correlation_increase);
            }

            results.insert(scenario.name.clone(), StressTestResult {
                scenario_name: scenario.name.clone(),
                portfolio_loss,
                max_drawdown,
                recovery_time_days,
                var_impact: portfolio_loss * 1.5, // Simplified
                correlation_breakdown,
                liquidity_impact: scenario.liquidity_reduction,
            });
        }

        Ok(results)
    }

    fn calculate_eigenvalues(&self, matrix: &[Vec<f64>]) -> Result<Vec<f64>, String> {
        // Simplified eigenvalue calculation for 2x2 and 3x3 matrices
        // In production, use a proper linear algebra library
        
        if matrix.len() == 2 && matrix[0].len() == 2 {
            let a = matrix[0][0];
            let b = matrix[0][1];
            let c = matrix[1][0];
            let d = matrix[1][1];
            
            let trace = a + d;
            let det = a * d - b * c;
            
            let discriminant = (trace * trace - 4.0 * det).sqrt();
            let eigen1 = (trace + discriminant) / 2.0;
            let eigen2 = (trace - discriminant) / 2.0;
            
            Ok(vec![eigen1, eigen2])
        } else {
            // For larger matrices, return placeholder values
            Ok(vec![1.0; matrix.len()])
        }
    }

    fn calculate_determinant(&self, matrix: &[Vec<f64>]) -> Result<f64, String> {
        if matrix.is_empty() || matrix.len() != matrix[0].len() {
            return Err("Matrix must be square".to_string());
        }

        let n = matrix.len();
        
        if n == 2 {
            Ok(matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0])
        } else if n == 3 {
            let a = matrix[0][0];
            let b = matrix[0][1];
            let c = matrix[0][2];
            let d = matrix[1][0];
            let e = matrix[1][1];
            let f = matrix[1][2];
            let g = matrix[2][0];
            let h = matrix[2][1];
            let i = matrix[2][2];
            
            Ok(a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g))
        } else {
            // For larger matrices, return placeholder
            Ok(1.0)
        }
    }

    pub fn check_risk_limits(&self, portfolio_risk: &PortfolioRisk) -> Vec<RiskAlert> {
        let mut alerts = Vec::new();

        // Check position size limits
        for (i, symbol) in portfolio_risk.symbols.iter().enumerate() {
            let position_size = portfolio_risk.weights[i].abs();
            if position_size > self.risk_limits.max_single_symbol_exposure {
                alerts.push(RiskAlert {
                    id: Uuid::new_v4().to_string(),
                    alert_type: RiskAlertType::PositionSizeExceeded,
                    severity: RiskSeverity::High,
                    message: format!("Position size for {} exceeds limit", symbol),
                    symbol: Some(symbol.clone()),
                    current_value: position_size,
                    limit_value: self.risk_limits.max_single_symbol_exposure,
                    percentage_breached: (position_size - self.risk_limits.max_single_symbol_exposure) / self.risk_limits.max_single_symbol_exposure * 100.0,
                    timestamp: chrono::Utc::now().timestamp(),
                    acknowledged: false,
                    suggested_actions: vec!["Reduce position size".to_string(), "Diversify portfolio".to_string()],
                    auto_action_taken: None,
                });
            }
        }

        // Check correlation limits
        if portfolio_risk.correlation_matrix.condition_number > self.risk_limits.max_correlation_exposure {
            alerts.push(RiskAlert {
                id: Uuid::new_v4().to_string(),
                alert_type: RiskAlertType::CorrelationLimitExceeded,
                severity: RiskSeverity::Medium,
                message: "Portfolio correlation exceeds safe limits".to_string(),
                symbol: None,
                current_value: portfolio_risk.correlation_matrix.condition_number,
                limit_value: self.risk_limits.max_correlation_exposure,
                percentage_breached: (portfolio_risk.correlation_matrix.condition_number - self.risk_limits.max_correlation_exposure) / self.risk_limits.max_correlation_exposure * 100.0,
                timestamp: chrono::Utc::now().timestamp(),
                acknowledged: false,
                suggested_actions: vec!["Reduce correlated positions".to_string(), "Add uncorrelated assets".to_string()],
                auto_action_taken: None,
            });
        }

        // Check VaR limits
        if portfolio_risk.risk_metrics.var_95 > self.risk_limits.var_limit_95 {
            alerts.push(RiskAlert {
                id: Uuid::new_v4().to_string(),
                alert_type: RiskAlertType::VarLimitExceeded,
                severity: RiskSeverity::Critical,
                message: "95% VaR limit exceeded".to_string(),
                symbol: None,
                current_value: portfolio_risk.risk_metrics.var_95,
                limit_value: self.risk_limits.var_limit_95,
                percentage_breached: (portfolio_risk.risk_metrics.var_95 - self.risk_limits.var_limit_95) / self.risk_limits.var_limit_95 * 100.0,
                timestamp: chrono::Utc::now().timestamp(),
                acknowledged: false,
                suggested_actions: vec!["Reduce position sizes".to_string(), "Add hedging".to_string()],
                auto_action_taken: None,
            });
        }

        // Check expected shortfall limits
        if portfolio_risk.risk_metrics.expected_shortfall > self.risk_limits.expected_shortfall_limit {
            alerts.push(RiskAlert {
                id: Uuid::new_v4().to_string(),
                alert_type: RiskAlertType::ExpectedShortfallExceeded,
                severity: RiskSeverity::Critical,
                message: "Expected shortfall limit exceeded".to_string(),
                symbol: None,
                current_value: portfolio_risk.risk_metrics.expected_shortfall,
                limit_value: self.risk_limits.expected_shortfall_limit,
                percentage_breached: (portfolio_risk.risk_metrics.expected_shortfall - self.risk_limits.expected_shortfall_limit) / self.risk_limits.expected_shortfall_limit * 100.0,
                timestamp: chrono::Utc::now().timestamp(),
                acknowledged: false,
                suggested_actions: vec!["Reduce tail risk exposure".to_string(), "Implement stop losses".to_string()],
                auto_action_taken: None,
            });
        }

        alerts
    }

    pub fn calculate_diversification_metrics(&self, portfolio_risk: &PortfolioRisk) -> Result<DiversificationAnalysis, String> {
        let n = portfolio_risk.symbols.len();
        
        // Calculate diversification ratio
        let portfolio_volatility = portfolio_risk.risk_metrics.volatility;
        let weighted_avg_volatility: f64 = portfolio_risk.weights.iter()
            .zip(portfolio_risk.volatilities.iter())
            .map(|(w, vol)| w.abs() * vol)
            .sum();
        
        let diversification_ratio = weighted_avg_volatility / portfolio_volatility;

        // Calculate effective number of bets
        let herfindahl_index: f64 = portfolio_risk.weights.iter().map(|w| w * w).sum();
        let effective_number_of_bets = 1.0 / herfindahl_index;

        // Calculate concentration ratio
        let mut sorted_weights = portfolio_risk.weights.clone();
        sorted_weights.sort_by(|a, b| b.partial_cmp(a).unwrap());
        let concentration_ratio: f64 = sorted_weights.iter().take(5).sum();

        // Calculate entropy measure
        let entropy_measure: f64 = portfolio_risk.weights.iter()
            .filter(|&&w| w > 0.0)
            .map(|&w| -w * w.ln())
            .sum();

        // Calculate principal components (simplified)
        let principal_components = self.calculate_principal_components(&portfolio_risk.correlation_matrix)?;

        // Calculate risk parity weights (simplified)
        let risk_parity_weights = self.calculate_risk_parity_weights(&portfolio_risk.volatilities, &portfolio_risk.correlations)?;

        // Calculate minimum variance weights
        let minimum_variance_weights = self.calculate_minimum_variance_weights(&portfolio_risk.covariances)?;

        // Calculate maximum diversification weights
        let maximum_diversification_weights = self.calculate_maximum_diversification_weights(&portfolio_risk.volatilities, &portfolio_risk.correlations)?;

        Ok(DiversificationAnalysis {
            diversification_ratio,
            effective_number_of_bets,
            herfindahl_index,
            concentration_ratio,
            entropy_measure,
            principal_components,
            risk_parity_weights,
            minimum_variance_weights,
            maximum_diversification_weights,
        })
    }

    fn calculate_principal_components(&self, correlation_matrix: &CorrelationMatrix) -> Result<Vec<PrincipalComponent>, String> {
        // Simplified PCA - in production, use proper linear algebra library
        let mut components = Vec::new();
        
        for i in 0..correlation_matrix.matrix.len().min(3) { // Top 3 components
            let explained_variance = 1.0 / (i as f64 + 1.0); // Placeholder
            let cumulative_variance = explained_variance;
            
            let mut factor_loadings = HashMap::new();
            for (j, symbol) in correlation_matrix.symbols.iter().enumerate() {
                let loading = if i == j { 1.0 } else { 0.5 }; // Placeholder
                factor_loadings.insert(symbol.clone(), loading);
            }

            components.push(PrincipalComponent {
                component_id: i,
                explained_variance,
                cumulative_variance,
                factor_loadings,
            });
        }

        Ok(components)
    }

    fn calculate_risk_parity_weights(&self, volatilities: &[f64], correlations: &[Vec<f64>]) -> Result<Vec<f64>, String> {
        // Simplified risk parity - equal risk contribution
        let n = volatilities.len();
        let equal_weight = 1.0 / n as f64;
        Ok(vec![equal_weight; n])
    }

    fn calculate_minimum_variance_weights(&self, covariances: &[Vec<f64>]) -> Result<Vec<f64>, String> {
        // Simplified minimum variance - inverse volatility weighting
        let n = covariances.len();
        let mut weights = Vec::new();
        
        for i in 0..n {
            let variance = covariances[i][i];
            let weight = if variance > 0.0 { 1.0 / variance } else { 1.0 };
            weights.push(weight);
        }

        // Normalize weights
        let total: f64 = weights.iter().sum();
        Ok(weights.iter().map(|&w| w / total).collect())
    }

    fn calculate_maximum_diversification_weights(&self, volatilities: &[f64], correlations: &[Vec<f64>]) -> Result<Vec<f64>, String> {
        // Simplified maximum diversification - inverse volatility weighting
        let mut weights = Vec::new();
        
        for &volatility in volatilities {
            let weight = if volatility > 0.0 { 1.0 / volatility } else { 1.0 };
            weights.push(weight);
        }

        // Normalize weights
        let total: f64 = weights.iter().sum();
        Ok(weights.iter().map(|&w| w / total).collect())
    }

    pub fn start_real_time_monitoring(&self, update_interval_ms: u64) -> Result<(), String> {
        let active_alerts = Arc::clone(&self.active_alerts);
        
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_millis(update_interval_ms));
            
            loop {
                interval.tick().await;
                
                // Clean up old alerts (older than 24 hours)
                let mut alerts = active_alerts.write().unwrap();
                let cutoff_time = chrono::Utc::now().timestamp() - 86400;
                alerts.retain(|alert| alert.timestamp > cutoff_time);
            }
        });

        Ok(())
    }

    pub fn get_current_risk_metrics(&self) -> Option<RiskMetrics> {
        self.portfolio_risk.read().unwrap().as_ref().map(|pr| pr.risk_metrics.clone())
    }

    pub fn get_active_alerts(&self) -> Vec<RiskAlert> {
        self.active_alerts.read().unwrap().clone()
    }

    pub fn acknowledge_alert(&self, alert_id: &str) -> Result<(), String> {
        let mut alerts = self.active_alerts.write().unwrap();
        
        if let Some(alert) = alerts.iter_mut().find(|a| a.id == alert_id) {
            alert.acknowledged = true;
            Ok(())
        } else {
            Err("Alert not found".to_string())
        }
    }

    pub fn get_risk_history(&self, limit: Option<usize>) -> Vec<RiskMetrics> {
        let history = self.risk_history.read().unwrap();
        let limit = limit.unwrap_or(history.len());
        history.iter().rev().take(limit).cloned().collect()
    }
}

// Tauri commands for enhanced risk management
#[tauri::command]
pub async fn calculate_portfolio_risk(
    symbols: Vec<String>,
    weights: Vec<f64>,
    returns: Vec<Vec<f64>>,
    risk_manager: tauri::State<'_, Arc<EnhancedRiskManager>>,
) -> Result<PortfolioRisk, String> {
    risk_manager.calculate_portfolio_risk(symbols, weights, returns)
}

#[tauri::command]
pub fn check_risk_limits(
    portfolio_risk: PortfolioRisk,
    risk_manager: tauri::State<'_, Arc<EnhancedRiskManager>>,
) -> Vec<RiskAlert> {
    risk_manager.check_risk_limits(&portfolio_risk)
}

#[tauri::command]
pub fn calculate_diversification_metrics(
    portfolio_risk: PortfolioRisk,
    risk_manager: tauri::State<'_, Arc<EnhancedRiskManager>>,
) -> Result<DiversificationAnalysis, String> {
    risk_manager.calculate_diversification_metrics(&portfolio_risk)
}

#[tauri::command]
pub fn get_active_risk_alerts(
    risk_manager: tauri::State<'_, Arc<EnhancedRiskManager>>,
) -> Vec<RiskAlert> {
    risk_manager.get_active_alerts()
}

#[tauri::command]
pub fn acknowledge_risk_alert(
    alert_id: String,
    risk_manager: tauri::State<'_, Arc<EnhancedRiskManager>>,
) -> Result<(), String> {
    risk_manager.acknowledge_alert(&alert_id)
}

#[tauri::command]
pub fn get_risk_history(
    limit: Option<usize>,
    risk_manager: tauri::State<'_, Arc<EnhancedRiskManager>>,
) -> Vec<RiskMetrics> {
    risk_manager.get_risk_history(limit)
}

#[tauri::command]
pub fn get_correlation_matrix(
    symbols: Vec<String>,
    returns: Vec<Vec<f64>>,
    risk_manager: tauri::State<'_, Arc<EnhancedRiskManager>>,
) -> Result<CorrelationMatrix, String> {
    risk_manager.calculate_correlation_matrix(&returns, &symbols)
}

#[tauri::command]
pub fn run_stress_test(
    portfolio_risk: PortfolioRisk,
    risk_manager: tauri::State<'_, Arc<EnhancedRiskManager>>,
) -> Result<HashMap<String, StressTestResult>, String> {
    Ok(portfolio_risk.stress_test_results)
}

#[tauri::command]
pub fn get_risk_metrics(
    risk_manager: tauri::State<'_, Arc<EnhancedRiskManager>>,
) -> Option<RiskMetrics> {
    risk_manager.get_current_risk_metrics()
}

#[tauri::command]
pub fn get_diversification_metrics(
    portfolio_risk: PortfolioRisk,
    risk_manager: tauri::State<'_, Arc<EnhancedRiskManager>>,
) -> Result<DiversificationAnalysis, String> {
    risk_manager.calculate_diversification_metrics(&portfolio_risk)
}
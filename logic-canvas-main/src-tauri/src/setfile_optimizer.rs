use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;
use std::path::PathBuf;
use std::fs;
use std::time::Instant;
use tokio::time::Duration;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationGoal {
    pub name: String,
    pub weight: f64,
    pub maximize: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationConstraint {
    pub name: String,
    pub value: f64,
    pub constraint_type: String, // "max", "min", "equals"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationParameter {
    pub name: String,
    pub min_value: f64,
    pub max_value: f64,
    pub step: f64,
    pub is_discrete: bool,
    pub enum_values: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationConfig {
    pub population_size: usize,
    pub generations: usize,
    pub mutation_rate: f64,
    pub crossover_rate: f64,
    pub elite_size: usize,
    pub tournament_size: usize,
    pub convergence_threshold: f64,
    pub max_stagnation_generations: usize,
    pub parallel_workers: usize,
    pub objectives: Vec<OptimizationGoal>,
    pub constraints: Vec<OptimizationConstraint>,
    pub parameters: Vec<OptimizationParameter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradingChromosome {
    pub id: String,
    pub parameters: HashMap<String, f64>,
    pub fitness_scores: HashMap<String, f64>,
    pub rank: usize,
    pub crowding_distance: f64,
    pub generation: usize,
    pub backtest_results: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationResults {
    pub pareto_front: Vec<TradingChromosome>,
    pub total_generations: usize,
    pub total_time: f64,
    pub population_size: usize,
    pub convergence_history: Vec<f64>,
    pub best_solutions: Vec<TradingChromosome>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetfileOptimizerState {
    pub is_running: bool,
    pub current_generation: usize,
    pub total_generations: usize,
    pub population_size: usize,
    pub best_fitness: f64,
    pub average_fitness: f64,
    pub convergence_rate: f64,
    pub estimated_time_remaining: f64,
    pub last_update: String,
}

pub struct SetfileOptimizer {
    config: OptimizationConfig,
    base_config: HashMap<String, serde_json::Value>,
    state: SetfileOptimizerState,
    optimization_id: String,
    python_path: PathBuf,
    optimizer_script: PathBuf,
}

impl SetfileOptimizer {
    pub fn new(
        config: OptimizationConfig,
        base_config: HashMap<String, serde_json::Value>,
        python_path: Option<PathBuf>,
    ) -> Result<Self, String> {
        let python_path = python_path.unwrap_or_else(|| PathBuf::from("python"));
        let optimizer_script = PathBuf::from("src-tauri/src/setfile_optimizer.py");
        
        if !optimizer_script.exists() {
            return Err(format!("Optimizer script not found: {:?}", optimizer_script));
        }
        
        let state = SetfileOptimizerState {
            is_running: false,
            current_generation: 0,
            total_generations: config.generations,
            population_size: config.population_size,
            best_fitness: 0.0,
            average_fitness: 0.0,
            convergence_rate: 0.0,
            estimated_time_remaining: 0.0,
            last_update: chrono::Utc::now().to_rfc3339(),
        };
        
        Ok(Self {
            config,
            base_config,
            state,
            optimization_id: Uuid::new_v4().to_string(),
            python_path,
            optimizer_script,
        })
    }
    
    pub async fn run_optimization(
        &mut self,
        on_progress: Option<Box<dyn Fn(SetfileOptimizerState) + Send + Sync>>,
    ) -> Result<OptimizationResults, String> {
        if self.state.is_running {
            return Err("Optimization already in progress".to_string());
        }
        
        self.state.is_running = true;
        self.state.last_update = chrono::Utc::now().to_rfc3339();
        
        let start_time = Instant::now();
        
        // Prepare optimization data
        let optimization_data = serde_json::json!({
            "optimization_id": &self.optimization_id,
            "config": &self.config,
            "base_config": &self.base_config,
        });
        
        // Create temporary input file
        let temp_input = PathBuf::from(format!("optimization_input_{}.json", self.optimization_id));
        fs::write(&temp_input, optimization_data.to_string())
            .map_err(|e| format!("Failed to write input file: {}", e))?;
        
        // Run Python optimizer
        let output = Command::new(&self.python_path)
            .arg(&self.optimizer_script)
            .arg("--input")
            .arg(&temp_input)
            .arg("--output")
            .arg(format!("optimization_output_{}.json", self.optimization_id))
            .output()
            .map_err(|e| format!("Failed to run optimizer: {}", e))?;
        
        // Clean up input file
        let _ = fs::remove_file(&temp_input);
        
        if !output.status.success() {
            let error_msg = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Optimizer failed: {}", error_msg));
        }
        
        // Read results
        let results_file = PathBuf::from(format!("optimization_output_{}.json", self.optimization_id));
        let results_data = fs::read_to_string(&results_file)
            .map_err(|e| format!("Failed to read results: {}", e))?;
        
        let results: OptimizationResults = serde_json::from_str(&results_data)
            .map_err(|e| format!("Failed to parse results: {}", e))?;
        
        // Clean up output file
        let _ = fs::remove_file(&results_file);
        
        self.state.is_running = false;
        self.state.total_time = start_time.elapsed().as_secs_f64();
        self.state.last_update = chrono::Utc::now().to_rfc3339();
        
        Ok(results)
    }
    
    pub fn get_state(&self) -> SetfileOptimizerState {
        self.state.clone()
    }
    
    pub fn stop_optimization(&mut self) {
        self.state.is_running = false;
        self.state.last_update = chrono::Utc::now().to_rfc3339();
    }
    
    pub fn save_results(&self, results: &OptimizationResults, filename: Option<String>) -> Result<String, String> {
        let filename = filename.unwrap_or_else(|| {
            format!("setfile_optimization_{}.json", chrono::Utc::now().format("%Y%m%d_%H%M%S"))
        });
        
        let output_path = PathBuf::from("optimization_results").join(&filename);
        output_path.parent().unwrap().mkdir_all().map_err(|e| format!("Failed to create directory: {}", e))?;
        
        let results_json = serde_json::to_string_pretty(results)
            .map_err(|e| format!("Failed to serialize results: {}", e))?;
        
        fs::write(&output_path, results_json)
            .map_err(|e| format!("Failed to write results: {}", e))?;
        
        Ok(output_path.to_string_lossy().to_string())
    }
    
    pub fn export_best_solution(&self, chromosome: &TradingChromosome, filename: String) -> Result<String, String> {
        // Convert chromosome to setfile format
        let mut setfile_content = String::new();
        
        // Add header
        setfile_content.push_str("; DAAVFX Optimized Configuration\n");
        setfile_content.push_str(&format!("; Generated: {}\n", chrono::Utc::now().to_rfc3339()));
        setfile_content.push_str(&format!("; Optimization ID: {}\n", self.optimization_id));
        setfile_content.push_str(&format!("; Fitness Scores: {:?}\n", chromosome.fitness_scores));
        setfile_content.push_str("\n");
        
        // Add parameters
        for (param_name, value) in &chromosome.parameters {
            let setfile_key = self.map_parameter_to_setfile_key(param_name);
            setfile_content.push_str(&format!("{}={:.6}\n", setfile_key, value));
        }
        
        // Add base configuration parameters
        for (key, value) in &self.base_config {
            if !chromosome.parameters.contains_key(key) {
                let setfile_value = match value {
                    serde_json::Value::Bool(b) => if *b { "1" } else { "0" }.to_string(),
                    serde_json::Value::Number(n) => n.to_string(),
                    serde_json::Value::String(s) => s.clone(),
                    _ => continue,
                };
                setfile_content.push_str(&format!("{}={}\n", key, setfile_value));
            }
        }
        
        let output_path = PathBuf::from("optimized_setfiles").join(&filename);
        output_path.parent().unwrap().mkdir_all().map_err(|e| format!("Failed to create directory: {}", e))?;
        
        fs::write(&output_path, setfile_content)
            .map_err(|e| format!("Failed to write setfile: {}", e))?;
        
        Ok(output_path.to_string_lossy().to_string())
    }
    
    fn map_parameter_to_setfile_key(&self, param_name: &str) -> String {
        // Map optimization parameter names to setfile keys
        match param_name {
            "initial_lot" => "gInput_Initial_Lot".to_string(),
            "lot_multiplier" => "gInput_Lot_Multiplier".to_string(),
            "max_lot" => "gInput_Max_Lot".to_string(),
            "grid_size" => "gInput_Grid_Size".to_string(),
            "grid_expansion" => "gInput_Grid_Expansion".to_string(),
            "max_grid_levels" => "gInput_Max_Grid_Levels".to_string(),
            "trail_method" => "gInput_Trail_Method".to_string(),
            "trail_value" => "gInput_Trail_Value".to_string(),
            "trail_start" => "gInput_Trail_Start".to_string(),
            "trail_step" => "gInput_Trail_Step".to_string(),
            "tp_points" => "gInput_TP_Points".to_string(),
            "sl_points" => "gInput_SL_Points".to_string(),
            "tp_multiplier" => "gInput_TP_Multiplier".to_string(),
            "sl_multiplier" => "gInput_SL_Multiplier".to_string(),
            "risk_per_trade" => "gInput_Risk_Per_Trade".to_string(),
            "max_risk_total" => "gInput_Max_Risk_Total".to_string(),
            "equity_stop" => "gInput_Equity_Stop".to_string(),
            "session_start_hour" => "gInput_Session_Start_Hour".to_string(),
            "session_end_hour" => "gInput_Session_End_Hour".to_string(),
            "news_buffer_minutes" => "gInput_News_Buffer_Minutes".to_string(),
            _ => param_name.to_string(),
        }
    }
}

// Tauri commands for setfile optimization
#[tauri::command]
pub async fn start_setfile_optimization(
    config: OptimizationConfig,
    base_config: HashMap<String, serde_json::Value>,
    python_path: Option<String>,
) -> Result<String, String> {
    let python_path = python_path.map(PathBuf::from);
    
    let mut optimizer = SetfileOptimizer::new(config, base_config, python_path)?;
    let optimization_id = optimizer.optimization_id.clone();
    
    // Run optimization in background
    tokio::spawn(async move {
        let _ = optimizer.run_optimization(None).await;
    });
    
    Ok(optimization_id)
}

#[tauri::command]
pub fn get_optimization_status(optimization_id: String) -> Result<SetfileOptimizerState, String> {
    // This would need to be implemented with proper state management
    // For now, return a mock state
    Ok(SetfileOptimizerState {
        is_running: false,
        current_generation: 0,
        total_generations: 50,
        population_size: 100,
        best_fitness: 0.0,
        average_fitness: 0.0,
        convergence_rate: 0.0,
        estimated_time_remaining: 0.0,
        last_update: chrono::Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub fn stop_setfile_optimization(optimization_id: String) -> Result<(), String> {
    // This would need to be implemented with proper state management
    Ok(())
}
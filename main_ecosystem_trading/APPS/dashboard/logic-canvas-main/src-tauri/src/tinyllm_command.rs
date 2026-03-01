//! TinyLLM Command - Thin wrapper around tinyllm_daavfx crate
//! Transport-agnostic: this is just the Tauri translation layer

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tinyllm_daavfx::{get_hardware_snapshot, route_command, Route, RoutingDecision};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingResponse {
    pub output: String,
    pub route: String,
    pub pending_inference: bool,
    pub message: Option<String>,
    pub learned_suggestion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingEvent {
    pub input: String,
    pub output: String,
    pub route: String,
    pub confidence: f32,
    pub intent: String,
    pub pending_inference: bool,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedOperation {
    pub target_engine: Option<String>,
    pub target_groups: Vec<u32>,
    pub target_logics: Vec<String>,
    pub parameter: String,
    pub operation_type: String,
    pub factor: Option<f64>,
    pub value: Option<f64>,
}

fn log_training_data(decision: &RoutingDecision, original_input: &str) {
    use std::fs::{create_dir_all, OpenOptions};
    use std::io::Write;
    use std::path::PathBuf;

    // Only log successful commands
    if decision.command.confidence == 0.0 {
        return;
    }

    let log_dir = PathBuf::from(".");
    let log_file = log_dir.join("training_data.log");

    // Create resolved operation record (factual, not raw input)
    let resolved = ResolvedOperation {
        target_engine: decision.command.engines.first().cloned(),
        target_groups: decision.command.groups.clone(),
        target_logics: decision.command.logics.clone(),
        parameter: decision.command.field.clone().unwrap_or_default(),
        operation_type: decision.command.operation.clone().unwrap_or_default(),
        factor: None, // Factor calculated at execution time with actual config values
        value: decision.command.value,
    };

    let log_entry = format!(
        "timestamp={}, input=\"{}\", intent={:?}, resolved={:?}\n",
        chrono::Utc::now().to_rfc3339(),
        original_input.replace("\"", "'"),
        decision.command.intent,
        resolved
    );

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_file) {
        let _ = file.write_all(log_entry.as_bytes());
    }
}

fn format_decision_output(decision: &RoutingDecision) -> String {
    // STRICT MODE: Invalid commands get format hint, NOT pending inference
    if decision.command.confidence == 0.0 || format!("{:?}", decision.command.intent) == "Unknown" {
        return "Unknown command. Try: 'set grid to 500 for G1', 'add 30% to grid for G1', 'show lot for POWER'".to_string();
    }

    // Show the factual operation details
    let field = decision.command.field.as_deref().unwrap_or("none");
    let op = decision.command.operation.as_deref().unwrap_or("set");
    let groups = if decision.command.groups.is_empty() {
        "all".to_string()
    } else {
        decision
            .command
            .groups
            .iter()
            .map(|g| g.to_string())
            .collect::<Vec<_>>()
            .join(",")
    };

    format!("{} {} for groups [{}]", op, field, groups)
}

#[tauri::command]
pub fn process_command(app: AppHandle, input: String) -> Result<RoutingResponse, String> {
    let decision = route_command(&input);

    // Log successful commands to training_data.log (factual resolved operations)
    log_training_data(&decision, &input);

    let route_str = match decision.route {
        Route::Direct => "direct",
        Route::Hybrid => "hybrid",
        Route::Escalate => "escalate",
    };

    // Emit routing event for canvas to subscribe to
    let event = RoutingEvent {
        input: input.clone(),
        output: format_decision_output(&decision),
        route: route_str.to_string(),
        confidence: decision.command.confidence,
        intent: format!("{:?}", decision.command.intent),
        pending_inference: matches!(decision.route, Route::Hybrid | Route::Escalate),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    };

    // Emit event for canvas to subscribe
    let _ = app.emit("routing:decision", &event);

    match decision.route {
        Route::Direct => Ok(RoutingResponse {
            output: format_decision_output(&decision),
            route: "direct".to_string(),
            pending_inference: false,
            message: None,
            learned_suggestion: decision.learned_suggestion,
        }),
        Route::Hybrid | Route::Escalate => {
            // STRICT MODE: Even Escalate is handled as direct
            // No pending inference - just return the parsed command
            Ok(RoutingResponse {
                output: format_decision_output(&decision),
                route: "direct".to_string(),
                pending_inference: false,
                message: None,
                learned_suggestion: decision.learned_suggestion,
            })
        }
    }
}

#[tauri::command]
pub fn get_silicon_status() -> Result<SiliconStatus, String> {
    let snapshot = get_hardware_snapshot(10);

    Ok(SiliconStatus {
        cpu_usage: snapshot.cpu.usage_percent,
        ram_used_bytes: snapshot.memory.used_bytes,
        ram_total_bytes: snapshot.memory.total_bytes,
        ram_usage_percent: snapshot.memory.usage_percent,
        stress_overall: snapshot.stress.overall,
        recommended_steps: snapshot.recommended_steps,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiliconStatus {
    pub cpu_usage: f32,
    pub ram_used_bytes: u64,
    pub ram_total_bytes: u64,
    pub ram_usage_percent: f32,
    pub stress_overall: f32,
    pub recommended_steps: usize,
    pub timestamp: u64,
}

// ryctl - Headless CLI for DAAVFX Trading Dashboard
// Run: echo "make engine A 30% more aggressive" | cargo run --bin ryctl -- --json
// Or:  cargo run --bin ryctl -- --input "show me power group 1 values" --json

use clap::Parser;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{self, Read};
use regex::Regex;

// ============================================================================
// TYPES
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeadlessResult {
    pub input: String,
    pub parsed: ParsedCommand,
    pub result: CommandResult,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedCommand {
    pub command_type: String,
    pub target: CommandTarget,
    pub params: HashMap<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub semantic: Option<SemanticOps>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CommandTarget {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engines: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub groups: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logics: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticOps {
    pub description: String,
    pub operations: Vec<FieldOperation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldOperation {
    pub field: String,
    pub op: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub factor: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<Value>,
}

// ============================================================================
// SEMANTIC RULES
// ============================================================================

fn parse_semantic_command(input: &str) -> Option<SemanticOps> {
    let lower = input.to_lowercase();
    
    // 30% more aggressive
    if let Some(caps) = Regex::new(r"(\d+)\s*%\s*more\s+(aggressive|stronger|faster)")
        .ok()?.captures(&lower) {
        let percent: f64 = caps.get(1)?.as_str().parse().ok()?;
        let factor = 1.0 + (percent / 100.0);
        return Some(SemanticOps {
            description: format!("Increase aggressiveness by {}%", percent),
            operations: vec![
                FieldOperation { field: "multiplier".into(), op: "scale".into(), factor: Some(factor), value: None },
                FieldOperation { field: "initial_lot".into(), op: "scale".into(), factor: Some(factor), value: None },
                FieldOperation { field: "grid".into(), op: "scale".into(), factor: Some(1.0/factor), value: None },
            ],
        });
    }
    
    // 30% safer
    if let Some(caps) = Regex::new(r"(\d+)\s*%\s*(safer|more\s+conservative)")
        .ok()?.captures(&lower) {
        let percent: f64 = caps.get(1)?.as_str().parse().ok()?;
        let grid_factor = 1.0 + (percent / 100.0);
        return Some(SemanticOps {
            description: format!("Increase safety by {}%", percent),
            operations: vec![
                FieldOperation { field: "grid".into(), op: "scale".into(), factor: Some(grid_factor), value: None },
                FieldOperation { field: "multiplier".into(), op: "scale".into(), factor: Some(1.0 - percent/200.0), value: None },
            ],
        });
    }
    
    // double the lot/grid/multiplier
    if let Some(caps) = Regex::new(r"double\s*(?:the\s*)?(lot|grid|multiplier|trail)")
        .ok()?.captures(&lower) {
        let field_alias = caps.get(1)?.as_str();
        let field = match field_alias {
            "lot" => "initial_lot",
            _ => field_alias,
        };
        return Some(SemanticOps {
            description: format!("Double {}", field),
            operations: vec![
                FieldOperation { field: field.into(), op: "scale".into(), factor: Some(2.0), value: None },
            ],
        });
    }
    
    // half the lot/grid
    if let Some(caps) = Regex::new(r"(half|halve)\s*(?:the\s*)?(lot|grid|multiplier|trail)")
        .ok()?.captures(&lower) {
        let field_alias = caps.get(2)?.as_str();
        let field = match field_alias {
            "lot" => "initial_lot",
            _ => field_alias,
        };
        return Some(SemanticOps {
            description: format!("Halve {}", field),
            operations: vec![
                FieldOperation { field: field.into(), op: "scale".into(), factor: Some(0.5), value: None },
            ],
        });
    }
    
    // make it aggressive
    if Regex::new(r"(?:make\s*(?:it\s*)?|go\s*)(aggressive|risky)").ok()?.is_match(&lower) {
        return Some(SemanticOps {
            description: "Apply aggressive preset (+30% mult, -25% grid)".into(),
            operations: vec![
                FieldOperation { field: "multiplier".into(), op: "scale".into(), factor: Some(1.3), value: None },
                FieldOperation { field: "grid".into(), op: "scale".into(), factor: Some(0.75), value: None },
            ],
        });
    }
    
    // make it safe
    if Regex::new(r"(?:make\s*(?:it\s*)?|go\s*|play\s*(?:it\s*)?)(conservative|safe|safer)").ok()?.is_match(&lower) {
        return Some(SemanticOps {
            description: "Apply conservative preset (-30% mult, +40% grid)".into(),
            operations: vec![
                FieldOperation { field: "multiplier".into(), op: "scale".into(), factor: Some(0.7), value: None },
                FieldOperation { field: "grid".into(), op: "scale".into(), factor: Some(1.4), value: None },
            ],
        });
    }
    
    // tighten grid
    if let Some(caps) = Regex::new(r"tighten\s*(?:the\s*)?grid(?:\s*(?:by\s*)?(\d+))?")
        .ok()?.captures(&lower) {
        if let Some(m) = caps.get(1) {
            let reduction: f64 = m.as_str().parse().ok()?;
            return Some(SemanticOps {
                description: format!("Reduce grid by {} pips", reduction),
                operations: vec![
                    FieldOperation { field: "grid".into(), op: "subtract".into(), factor: None, value: Some(reduction) },
                ],
            });
        } else {
            return Some(SemanticOps {
                description: "Tighten grid by 20%".into(),
                operations: vec![
                    FieldOperation { field: "grid".into(), op: "scale".into(), factor: Some(0.8), value: None },
                ],
            });
        }
    }
    
    None
}

// ============================================================================
// PARSING
// ============================================================================

fn detect_command_type(input: &str) -> &'static str {
    let lower = input.to_lowercase();
    if lower.starts_with("show") || lower.starts_with("find") || lower.starts_with("list") || lower.starts_with("get") {
        return "query";
    }
    if lower.starts_with("set") || lower.starts_with("change") || lower.contains("enable") || lower.contains("disable") {
        return "set";
    }
    if lower.contains("progression") {
        return "progression";
    }
    "unknown"
}

fn extract_target(input: &str) -> CommandTarget {
    let lower = input.to_lowercase();
    let mut target = CommandTarget::default();
    
    // Extract engines
    if let Some(caps) = Regex::new(r"engine\s*([abc])").ok().and_then(|r| r.captures(&lower)) {
        target.engines = Some(vec![caps.get(1).unwrap().as_str().to_uppercase()]);
    }
    
    // Extract groups
    if let Some(caps) = Regex::new(r"groups?\s*(\d+)\s*-\s*(\d+)").ok().and_then(|r| r.captures(&lower)) {
        let start: i32 = caps.get(1).unwrap().as_str().parse().unwrap_or(1);
        let end: i32 = caps.get(2).unwrap().as_str().parse().unwrap_or(start);
        if end <= 50 && end >= start {
            target.groups = Some((start..=end).collect());
        }
    } else if let Some(caps) = Regex::new(r"group\s*(\d+)").ok().and_then(|r| r.captures(&lower)) {
        let num: i32 = caps.get(1).unwrap().as_str().parse().unwrap_or(1);
        if num >= 1 && num <= 50 {
            target.groups = Some(vec![num]);
        }
    }
    
    // Extract logics
    let logic_map = [("power", "POWER"), ("repower", "REPOWER"), ("scalper", "SCALPER"), ("stopper", "STOPPER")];
    for (alias, logic) in logic_map {
        if Regex::new(&format!(r"\b{}\b", alias)).ok().map(|r| r.is_match(&lower)).unwrap_or(false) {
            target.logics = Some(vec![logic.into()]);
            break;
        }
    }
    
    // Extract field
    let field_map = [("lot", "initial_lot"), ("grid", "grid"), ("mult", "multiplier"), ("trail", "trail_value"), ("reverse", "reverse_enabled"), ("hedge", "hedge_enabled")];
    for (alias, field) in field_map {
        if Regex::new(&format!(r"\b{}\b", alias)).ok().map(|r| r.is_match(&lower)).unwrap_or(false) {
            target.field = Some(field.into());
            break;
        }
    }
    
    target
}

fn extract_params(input: &str) -> HashMap<String, Value> {
    let mut params = HashMap::new();
    let lower = input.to_lowercase();
    
    if let Some(caps) = Regex::new(r"(?:to|=|:)\s*([\d.]+)").ok().and_then(|r| r.captures(&lower)) {
        if let Ok(v) = caps.get(1).unwrap().as_str().parse::<f64>() {
            params.insert("value".into(), json!(v));
        }
    }
    
    if lower.contains("enable") {
        params.insert("value".into(), json!(true));
    } else if lower.contains("disable") {
        params.insert("value".into(), json!(false));
    }
    
    params
}

fn parse_command(input: &str) -> ParsedCommand {
    let trimmed = input.trim();
    let body = trimmed.strip_prefix('/').or(trimmed.strip_prefix('#')).unwrap_or(trimmed);
    
    let mut cmd_type = detect_command_type(body);
    let target = extract_target(body);
    let params = extract_params(body);
    
    let semantic = if (cmd_type == "set" || cmd_type == "unknown") && (target.field.is_none() || !params.contains_key("value")) {
        if let Some(ops) = parse_semantic_command(body) {
            cmd_type = "semantic";
            Some(ops)
        } else { None }
    } else { None };
    
    ParsedCommand { command_type: cmd_type.into(), target, params, semantic }
}

fn execute_command(cmd: &ParsedCommand) -> CommandResult {
    match cmd.command_type.as_str() {
        "query" => {
            if cmd.target.field.is_some() {
                CommandResult { success: true, message: format!("Query for field: {:?}", cmd.target.field), preview: None }
            } else {
                CommandResult { success: true, message: "Snapshot mode: showing key config values".into(), preview: Some(json!({"mode": "snapshot", "target": cmd.target})) }
            }
        }
        "set" => {
            if cmd.target.field.is_some() && cmd.params.contains_key("value") {
                CommandResult { success: true, message: format!("Set {:?} = {:?}", cmd.target.field, cmd.params.get("value")), preview: None }
            } else {
                CommandResult { success: false, message: "Missing field or value".into(), preview: None }
            }
        }
        "semantic" => {
            if let Some(ref semantic) = cmd.semantic {
                CommandResult {
                    success: true,
                    message: format!("[SEMANTIC PREVIEW] {}", semantic.description),
                    preview: Some(json!({"description": semantic.description, "operations": semantic.operations, "target": cmd.target})),
                }
            } else {
                CommandResult { success: false, message: "No semantic operations found".into(), preview: None }
            }
        }
        _ => CommandResult { success: false, message: format!("Unknown command type: {}", cmd.command_type), preview: None },
    }
}

fn handle_message_headless(input: &str) -> HeadlessResult {
    let cmd = parse_command(input);
    let result = execute_command(&cmd);
    let status = if result.success { "pass" } else { "fail" };
    HeadlessResult { input: input.into(), parsed: cmd, result, status: status.into() }
}

// ============================================================================
// CLI
// ============================================================================

#[derive(Parser, Debug)]
#[command(name = "ryctl")]
#[command(author = "DAAVFX")]
#[command(version = "1.0")]
#[command(about = "Headless CLI for DAAVFX Trading Dashboard - test commands without UI")]
struct Args {
    /// Command input (if not provided, reads from stdin)
    #[arg(short, long)]
    input: Option<String>,
    
    /// Mode: auto, semantic, query, set
    #[arg(short, long, default_value = "auto")]
    mode: String,
    
    /// Output as JSON
    #[arg(short, long)]
    json: bool,
    
    /// Verbose output
    #[arg(short, long)]
    verbose: bool,
    
    /// Run in batch mode (read multiple lines from stdin)
    #[arg(short, long)]
    batch: bool,
}

fn process_input(input: &str, args: &Args) -> String {
    let result = handle_message_headless(input);
    
    if args.json {
        serde_json::to_string_pretty(&result).unwrap_or_else(|_| "{}".into())
    } else if args.verbose {
        format!(
            "Input: {}\nType: {}\nStatus: {}\nMessage: {}\n{}",
            result.input,
            result.parsed.command_type,
            result.status,
            result.result.message,
            if let Some(ref preview) = result.result.preview {
                format!("Preview: {}", serde_json::to_string_pretty(preview).unwrap_or_default())
            } else {
                String::new()
            }
        )
    } else {
        format!("[{}] {}", result.status.to_uppercase(), result.result.message)
    }
}

fn main() {
    let args = Args::parse();
    
    if args.batch {
        // Batch mode: read multiple lines
        let mut input = String::new();
        io::stdin().read_to_string(&mut input).expect("Failed to read stdin");
        
        let mut results = Vec::new();
        for line in input.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() && !trimmed.starts_with('#') {
                let result = handle_message_headless(trimmed);
                results.push(result);
            }
        }
        
        if args.json {
            println!("{}", serde_json::to_string_pretty(&results).unwrap_or("[]".into()));
        } else {
            for result in results {
                println!("[{}] {} -> {}", 
                    result.status.to_uppercase(), 
                    result.input, 
                    result.result.message
                );
            }
        }
    } else {
        // Single command mode
        let input = if let Some(ref cmd) = args.input {
            cmd.clone()
        } else {
            let mut buffer = String::new();
            io::stdin().read_to_string(&mut buffer).expect("Failed to read stdin");
            buffer.trim().to_string()
        };
        
        if input.is_empty() {
            eprintln!("Error: No input provided. Use --input or pipe via stdin.");
            std::process::exit(1);
        }
        
        let output = process_input(&input, &args);
        println!("{}", output);
    }
}

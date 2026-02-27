// Headless Command Handler - CLI interface for automated testing
// Processes chat commands without UI, returns structured JSON

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use regex::Regex;
use std::collections::HashMap;
use tinyllm_daavfx::parse_command as tiny_parse_command;

/// Result of a headless command execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeadlessResult {
    pub input: String,
    pub parsed: ParsedCommand,
    pub result: CommandResult,
    pub status: String, // "pass" or "fail"
}

/// Parsed command structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedCommand {
    pub command_type: String,
    pub target: CommandTarget,
    pub params: HashMap<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub semantic: Option<SemanticOps>,
}

/// Command target (engines, groups, logics, field)
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

/// Semantic operations for natural language commands
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticOps {
    pub description: String,
    pub operations: Vec<FieldOperation>,
}

/// Single field operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldOperation {
    pub field: String,
    pub op: String, // "scale", "set", "add", "subtract"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub factor: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
}

/// Command execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changes: Option<Vec<FieldChange>>,
}

/// Field change record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldChange {
    pub engine: String,
    pub group: i32,
    pub logic: String,
    pub field: String,
    pub old_value: f64,
    pub new_value: f64,
}

// ============================================================================
// FIELD ALIASES
// ============================================================================
fn get_field_aliases() -> HashMap<&'static str, &'static str> {
    let mut m = HashMap::new();
    m.insert("lot", "initial_lot");
    m.insert("lots", "initial_lot");
    m.insert("mult", "multiplier");
    m.insert("grid", "grid");
    m.insert("trail", "trail_value");
    m.insert("tp", "tp_value");
    m.insert("sl", "sl_value");
    m.insert("reverse", "reverse_enabled");
    m.insert("hedge", "hedge_enabled");
    m
}

// ============================================================================
// LOGIC ALIASES
// ============================================================================
fn get_logic_aliases() -> HashMap<&'static str, &'static str> {
    let mut m = HashMap::new();
    m.insert("power", "POWER");
    m.insert("repower", "REPOWER");
    m.insert("scalp", "SCALPER");
    m.insert("scalper", "SCALPER");
    m.insert("stopper", "STOPPER");
    m.insert("sto", "STO");
    m.insert("sca", "SCA");
    m.insert("rpo", "RPO");
    m
}

// ============================================================================
// SEMANTIC RULES
// ============================================================================
struct SemanticRule {
    pattern: Regex,
    extract: fn(&regex::Captures) -> Option<SemanticOps>,
}

fn get_semantic_rules() -> Vec<SemanticRule> {
    vec![
        // "30% more aggressive"
        SemanticRule {
            pattern: Regex::new(r"(\d+)\s*%\s*more\s+(aggressive|stronger|faster)").unwrap(),
            extract: |caps| {
                let percent: f64 = caps.get(1)?.as_str().parse().ok()?;
                let factor = 1.0 + (percent / 100.0);
                let grid_factor = 1.0 / factor;
                Some(SemanticOps {
                    description: format!("Increase aggressiveness by {}%", percent),
                    operations: vec![
                        FieldOperation { field: "multiplier".into(), op: "scale".into(), factor: Some(factor), value: None },
                        FieldOperation { field: "initial_lot".into(), op: "scale".into(), factor: Some(factor), value: None },
                        FieldOperation { field: "grid".into(), op: "scale".into(), factor: Some(grid_factor), value: None },
                    ],
                })
            },
        },
        // "30% safer" or "50% more conservative"
        SemanticRule {
            pattern: Regex::new(r"(\d+)\s*%\s*(safer|more\s+conservative)").unwrap(),
            extract: |caps| {
                let percent: f64 = caps.get(1)?.as_str().parse().ok()?;
                let grid_factor = 1.0 + (percent / 100.0);
                let lot_factor = 1.0 - (percent / 100.0 * 0.5);
                Some(SemanticOps {
                    description: format!("Increase safety by {}%", percent),
                    operations: vec![
                        FieldOperation { field: "grid".into(), op: "scale".into(), factor: Some(grid_factor), value: None },
                        FieldOperation { field: "multiplier".into(), op: "scale".into(), factor: Some(lot_factor), value: None },
                        FieldOperation { field: "initial_lot".into(), op: "scale".into(), factor: Some(lot_factor), value: None },
                    ],
                })
            },
        },
        // "double the lot/grid/multiplier"
        SemanticRule {
            pattern: Regex::new(r"double\s*(?:the\s*)?(lot|grid|multiplier|trail)").unwrap(),
            extract: |caps| {
                let field_alias = caps.get(1)?.as_str();
                let field = match field_alias {
                    "lot" => "initial_lot",
                    "grid" => "grid",
                    "multiplier" => "multiplier",
                    "trail" => "trail_value",
                    _ => field_alias,
                };
                Some(SemanticOps {
                    description: format!("Double {}", field),
                    operations: vec![
                        FieldOperation { field: field.into(), op: "scale".into(), factor: Some(2.0), value: None },
                    ],
                })
            },
        },
        // "half the lot/grid"
        SemanticRule {
            pattern: Regex::new(r"(half|halve)\s*(?:the\s*)?(lot|grid|multiplier|trail)").unwrap(),
            extract: |caps| {
                let field_alias = caps.get(2)?.as_str();
                let field = match field_alias {
                    "lot" => "initial_lot",
                    "grid" => "grid",
                    "multiplier" => "multiplier",
                    "trail" => "trail_value",
                    _ => field_alias,
                };
                Some(SemanticOps {
                    description: format!("Halve {}", field),
                    operations: vec![
                        FieldOperation { field: field.into(), op: "scale".into(), factor: Some(0.5), value: None },
                    ],
                })
            },
        },
        // "make it aggressive"
        SemanticRule {
            pattern: Regex::new(r"(?:make\s*(?:it\s*)?|go\s*)(aggressive|risky)").unwrap(),
            extract: |_| {
                Some(SemanticOps {
                    description: "Apply aggressive preset (+30% mult, +20% lot, -25% grid)".into(),
                    operations: vec![
                        FieldOperation { field: "multiplier".into(), op: "scale".into(), factor: Some(1.3), value: None },
                        FieldOperation { field: "initial_lot".into(), op: "scale".into(), factor: Some(1.2), value: None },
                        FieldOperation { field: "grid".into(), op: "scale".into(), factor: Some(0.75), value: None },
                    ],
                })
            },
        },
        // "make it safe/conservative"
        SemanticRule {
            pattern: Regex::new(r"(?:make\s*(?:it\s*)?|go\s*|play\s*(?:it\s*)?)(conservative|safe|safer|defensive)").unwrap(),
            extract: |_| {
                Some(SemanticOps {
                    description: "Apply conservative preset (-30% mult, -20% lot, +40% grid)".into(),
                    operations: vec![
                        FieldOperation { field: "multiplier".into(), op: "scale".into(), factor: Some(0.7), value: None },
                        FieldOperation { field: "initial_lot".into(), op: "scale".into(), factor: Some(0.8), value: None },
                        FieldOperation { field: "grid".into(), op: "scale".into(), factor: Some(1.4), value: None },
                    ],
                })
            },
        },
        // "tighten the grid by X"
        SemanticRule {
            pattern: Regex::new(r"tighten\s*(?:the\s*)?grid(?:\s*(?:by\s*)?(\d+))?").unwrap(),
            extract: |caps| {
                if let Some(m) = caps.get(1) {
                    let reduction: f64 = m.as_str().parse().ok()?;
                    Some(SemanticOps {
                        description: format!("Reduce grid by {} pips", reduction),
                        operations: vec![
                            FieldOperation { field: "grid".into(), op: "subtract".into(), factor: None, value: Some(reduction) },
                        ],
                    })
                } else {
                    Some(SemanticOps {
                        description: "Tighten grid by 20%".into(),
                        operations: vec![
                            FieldOperation { field: "grid".into(), op: "scale".into(), factor: Some(0.8), value: None },
                        ],
                    })
                }
            },
        },
    ]
}

// ============================================================================
// COMMAND PARSING
// ============================================================================
fn detect_command_type(input: &str) -> &'static str {
    let lower = input.to_lowercase();
    
    if lower.starts_with("show") || lower.starts_with("find") || lower.starts_with("list") || lower.starts_with("get") {
        return "query";
    }
    if lower.starts_with("set") || lower.starts_with("change") || lower.starts_with("update") {
        return "set";
    }
    if lower.contains("enable") || lower.contains("disable") {
        return "set";
    }
    if lower.contains("progression") || lower.contains("sequence") {
        return "progression";
    }
    if lower.starts_with("copy") || lower.starts_with("duplicate") {
        return "copy";
    }
    if lower.starts_with("compare") || lower.starts_with("diff") {
        return "compare";
    }
    
    "unknown"
}

fn extract_target(input: &str) -> CommandTarget {
    let lower = input.to_lowercase();
    let mut target = CommandTarget::default();
    
    // Extract engines
    let engine_re = Regex::new(r"engine\s*([abc])").unwrap();
    if let Some(caps) = engine_re.captures(&lower) {
        target.engines = Some(vec![caps.get(1).unwrap().as_str().to_uppercase()]);
    }
    
    // Extract groups - range format
    let group_range_re = Regex::new(r"groups?\s*(\d+)\s*-\s*(\d+)").unwrap();
    if let Some(caps) = group_range_re.captures(&lower) {
        let start: i32 = caps.get(1).unwrap().as_str().parse().unwrap_or(1);
        let end: i32 = caps.get(2).unwrap().as_str().parse().unwrap_or(start);
        if end <= 50 && end >= start {
            target.groups = Some((start..=end).collect());
        }
    } else {
        // Single group
        let group_re = Regex::new(r"group\s*(\d+)").unwrap();
        if let Some(caps) = group_re.captures(&lower) {
            let num: i32 = caps.get(1).unwrap().as_str().parse().unwrap_or(1);
            if num >= 1 && num <= 50 {
                target.groups = Some(vec![num]);
            }
        }
    }
    
    // Extract logics
    let logic_aliases = get_logic_aliases();
    for (alias, logic) in logic_aliases.iter() {
        let pattern = format!(r"\b{}\b", regex::escape(alias));
        if Regex::new(&pattern).unwrap().is_match(&lower) {
            target.logics = Some(vec![logic.to_string()]);
            break;
        }
    }
    
    // Extract field
    let field_aliases = get_field_aliases();
    for (alias, field) in field_aliases.iter() {
        let pattern = format!(r"\b{}\b", regex::escape(alias));
        if Regex::new(&pattern).unwrap().is_match(&lower) {
            target.field = Some(field.to_string());
            break;
        }
    }
    
    target
}

fn extract_params(input: &str, _cmd_type: &str) -> HashMap<String, Value> {
    let mut params = HashMap::new();
    let lower = input.to_lowercase();
    
    // Extract value: "set grid to 600", "set lot = 0.02"
    let value_re = Regex::new(r"(?:to|=|:)\s*([\d.]+)").unwrap();
    if let Some(caps) = value_re.captures(&lower) {
        if let Ok(v) = caps.get(1).unwrap().as_str().parse::<f64>() {
            params.insert("value".into(), json!(v));
        }
    }
    
    // Boolean toggles
    if lower.contains("enable") || lower.contains(" on") {
        params.insert("value".into(), json!(true));
    } else if lower.contains("disable") || lower.contains(" off") {
        params.insert("value".into(), json!(false));
    }
    
    params
}

fn parse_semantic_command(input: &str) -> Option<SemanticOps> {
    let lower = input.to_lowercase();
    
    for rule in get_semantic_rules() {
        if let Some(caps) = rule.pattern.captures(&lower) {
            if let Some(ops) = (rule.extract)(&caps) {
                return Some(ops);
            }
        }
    }
    
    None
}

/// Parse a raw chat input into a structured command
pub fn parse_command(input: &str) -> ParsedCommand {
    let trimmed = input.trim();
    let body = if trimmed.starts_with('/') || trimmed.starts_with('#') {
        &trimmed[1..]
    } else {
        trimmed
    };

    if let Ok(tiny) = tiny_parse_command(body) {
        let mut target = CommandTarget::default();
        if !tiny.engines.is_empty() {
            target.engines = Some(tiny.engines.clone());
        }
        if !tiny.groups.is_empty() {
            target.groups = Some(tiny.groups.iter().map(|g| *g as i32).collect());
        }
        if !tiny.logics.is_empty() {
            target.logics = Some(tiny.logics.clone());
        }
        target.field = tiny.field.clone();

        let mut params = HashMap::new();
        if let Some(v) = tiny.value {
            params.insert("value".to_string(), json!(v));
        }

        let mut cmd_type = match tiny.intent.as_str() {
            "SET" => "set",
            "QUERY" => "query",
            "SEMANTIC" | "FORMULA" => "semantic",
            "PROGRESSION" => "progression",
            "COPY" => "copy",
            "COMPARE" => "compare",
            _ => "unknown",
        };

        let mut semantic = None;
        if (cmd_type == "semantic"
            || ((cmd_type == "set" || cmd_type == "unknown")
                && (target.field.is_none() || !params.contains_key("value"))))
            && parse_semantic_command(body).is_some()
        {
            semantic = parse_semantic_command(body);
            cmd_type = "semantic";
        }

        if cmd_type != "unknown" || tiny.confidence >= 0.35 {
            return ParsedCommand {
                command_type: cmd_type.into(),
                target,
                params,
                semantic,
            };
        }
    }
    
    let mut cmd_type = detect_command_type(body);
    let target = extract_target(body);
    let params = extract_params(body, cmd_type);
    
    // Try semantic parsing if set/unknown without field/value
    let semantic = if (cmd_type == "set" || cmd_type == "unknown") 
        && (target.field.is_none() || !params.contains_key("value")) {
        if let Some(ops) = parse_semantic_command(body) {
            cmd_type = "semantic";
            Some(ops)
        } else {
            None
        }
    } else {
        None
    };
    
    ParsedCommand {
        command_type: cmd_type.into(),
        target,
        params,
        semantic,
    }
}

/// Execute a parsed command and return result
pub fn execute_command(cmd: &ParsedCommand) -> CommandResult {
    match cmd.command_type.as_str() {
        "query" => {
            if cmd.target.field.is_some() {
                CommandResult {
                    success: true,
                    message: format!("Query for field: {:?}", cmd.target.field),
                    preview: None,
                    changes: None,
                }
            } else {
                // Snapshot mode
                CommandResult {
                    success: true,
                    message: "Snapshot mode: showing key config values".into(),
                    preview: Some(json!({
                        "mode": "snapshot",
                        "target": cmd.target,
                    })),
                    changes: None,
                }
            }
        }
        "set" => {
            if cmd.target.field.is_some() && cmd.params.contains_key("value") {
                CommandResult {
                    success: true,
                    message: format!("Set {:?} = {:?}", cmd.target.field, cmd.params.get("value")),
                    preview: None,
                    changes: None,
                }
            } else {
                CommandResult {
                    success: false,
                    message: "Missing field or value".into(),
                    preview: None,
                    changes: None,
                }
            }
        }
        "semantic" => {
            if let Some(ref semantic) = cmd.semantic {
                // Build preview
                let preview = json!({
                    "description": semantic.description,
                    "operations": semantic.operations,
                    "target": cmd.target,
                });
                
                CommandResult {
                    success: true,
                    message: format!("[SEMANTIC PREVIEW] {}", semantic.description),
                    preview: Some(preview),
                    changes: None,
                }
            } else {
                CommandResult {
                    success: false,
                    message: "No semantic operations found".into(),
                    preview: None,
                    changes: None,
                }
            }
        }
        _ => CommandResult {
            success: false,
            message: format!("Unknown command type: {}", cmd.command_type),
            preview: None,
            changes: None,
        },
    }
}

/// Main headless entry point - process input, return structured JSON
pub fn handle_message_headless(input: &str) -> HeadlessResult {
    let cmd = parse_command(input);
    let result = execute_command(&cmd);
    let status = if result.success { "pass" } else { "fail" };
    
    HeadlessResult {
        input: input.into(),
        parsed: cmd,
        result,
        status: status.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_semantic_aggressive() {
        let result = handle_message_headless("make engine A 30% more aggressive");
        assert_eq!(result.status, "pass");
        assert_eq!(result.parsed.command_type, "semantic");
        assert!(result.parsed.semantic.is_some());
    }
    
    #[test]
    fn test_query_snapshot() {
        let result = handle_message_headless("show me power group 1 values");
        assert_eq!(result.status, "pass");
        assert_eq!(result.parsed.command_type, "query");
    }
    
    #[test]
    fn test_set_command() {
        let result = handle_message_headless("set grid to 600 for group 1");
        assert_eq!(result.status, "pass");
        assert_eq!(result.parsed.command_type, "set");
        assert_eq!(result.parsed.target.field, Some("grid".into()));
    }
    
    #[test]
    fn test_double_lot() {
        let result = handle_message_headless("double the lot for engine A");
        assert_eq!(result.status, "pass");
        assert_eq!(result.parsed.command_type, "semantic");
    }
}

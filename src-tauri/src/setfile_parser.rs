// Setfile Parser Module - Properly parses V4 setfiles into MTConfig structure
// Handles 15 groups × 3 engines × 7 logics × 2 directions = 630 logic-directions

use std::collections::HashMap;

/// Parse a parameter name into its components
/// Example: gInput_Initial_loT_P1_Sell -> (param_name, engine, group, logic, direction)
fn parse_parameter_name(name: &str) -> Option<(String, String, u32, String, String)> {
    // Remove gInput_ prefix
    if !name.starts_with("gInput_") {
        return None;
    }

    let rest = &name[7..]; // Skip "gInput_"

    // Find the last underscore (separates param name from suffix)
    let last_underscore = rest.rfind('_')?;
    let suffix = &rest[last_underscore + 1..];

    // Check if it's a direction suffix (_Sell or _Buy)
    let direction = if suffix == "Sell" {
        "Sell"
    } else if suffix == "Buy" {
        "Buy"
    } else {
        // No direction suffix - this is the Buy direction (default)
        suffix
    };

    // Now parse the middle part to get engine, group, logic
    // Examples:
    //   Initial_loT_P1 -> (Initial_loT, A, 1, Power)
    //   Initial_loT_BP1 -> (Initial_loT, B, 1, Power)
    //   Initial_loT_P1_Sell -> (Initial_loT, A, 1, Power, Sell)

    let param_and_suffix = if suffix == "Sell" || suffix == "Buy" {
        &rest[..last_underscore]
    } else {
        rest
    };

    // Find the last underscore before the logic code
    let param_underscore = param_and_suffix.rfind('_')?;
    let param_name = &param_and_suffix[..param_underscore];
    let logic_code = &param_and_suffix[param_underscore + 1..];

    // Parse logic code: P1, BP1, R1, BR1, etc.
    let (engine, logic, group) = parse_logic_code(logic_code)?;

    Some((
        param_name.to_string(),
        engine,
        group,
        logic,
        direction.to_string(),
    ))
}

/// Parse logic code like P1, BP1, R1, BR1 into (engine, logic_name, group)
fn parse_logic_code(code: &str) -> Option<(String, String, u32)> {
    // Logic codes mapping
    let logic_map: HashMap<&str, &str> = [
        ("P", "Power"),
        ("R", "Repower"),
        ("S", "Scalp"),
        ("ST", "Stopper"),
        ("STO", "STO"),
        ("SCA", "SCA"),
        ("RPO", "RPO"),
    ]
    .iter()
    .cloned()
    .collect();

    // Engine prefixes: B=Engine B, C=Engine C, none=Engine A
    let mut engine = "A".to_string();
    let mut remaining = code;

    if code.starts_with("BP")
        || code.starts_with("BR")
        || code.starts_with("BS")
        || code.starts_with("BST")
        || code.starts_with("BSTO")
        || code.starts_with("BSCA")
        || code.starts_with("BRPO")
    {
        engine = "B".to_string();
        remaining = &code[1..]; // Skip 'B'
    } else if code.starts_with("CP")
        || code.starts_with("CR")
        || code.starts_with("CS")
        || code.starts_with("CST")
        || code.starts_with("CSTO")
        || code.starts_with("CSCA")
        || code.starts_with("CRPO")
    {
        engine = "C".to_string();
        remaining = &code[1..]; // Skip 'C'
    }

    // Extract logic code and group number
    // Try longer matches first (STO, SCA, RPO, ST) before shorter (S)
    for (code_part, logic_name) in ["STO", "SCA", "RPO", "ST", "P", "R", "S"].iter() {
        if remaining.starts_with(code_part) {
            let group_str = &remaining[code_part.len()..];
            if let Ok(group) = group_str.parse::<u32>() {
                return Some((engine, logic_name.to_string(), group));
            }
        }
    }

    None
}

/// Build complete MTConfig from parsed values
pub fn build_complete_config(values: &HashMap<String, String>) -> Result<MTConfig, String> {
    // Structure: Engine -> Group -> Logic -> Direction -> Params
    let mut engines: HashMap<String, EngineData> = HashMap::new();

    // Parse all parameters
    for (key, value) in values {
        if let Some((param_name, engine, group, logic, direction)) = parse_parameter_name(key) {
            let engine_data = engines.entry(engine).or_insert_with(|| EngineData::new());
            let group_data = engine_data
                .groups
                .entry(group)
                .or_insert_with(|| GroupData::new());
            let logic_data = group_data
                .logics
                .entry(logic)
                .or_insert_with(|| LogicData::new());
            let direction_data = logic_data
                .directions
                .entry(direction)
                .or_insert_with(|| DirectionData::new());

            // Store the parameter value
            direction_data.params.insert(param_name, value.clone());
        }
    }

    // Convert to MTConfig structure
    let mut config_engines = Vec::new();

    for (engine_id, engine_data) in engines {
        let mut groups = Vec::new();

        // Sort groups by number
        let mut group_numbers: Vec<u32> = engine_data.groups.keys().cloned().collect();
        group_numbers.sort();

        for group_num in group_numbers {
            if let Some(group_data) = engine_data.groups.get(&group_num) {
                let mut logics = Vec::new();

                // Define logic order
                let logic_order = vec!["Power", "Repower", "Scalp", "Stopper", "STO", "SCA", "RPO"];

                for logic_name in &logic_order {
                    if let Some(logic_data) = group_data.logics.get(*logic_name) {
                        // Build LogicConfig from parameters
                        let logic_config = build_logic_config(
                            &engine_id,
                            group_num,
                            *logic_name,
                            logic_data,
                            values,
                        )?;
                        logics.push(logic_config);
                    }
                }

                groups.push(GroupConfig {
                    group_number: group_num as i32,
                    enabled: true,
                    reverse_mode: false,
                    hedge_mode: false,
                    hedge_reference: "Logic_None".to_string(),
                    entry_delay_bars: 0,
                    logics,
                });
            }
        }

        config_engines.push(EngineConfig {
            engine_id: engine_id.clone(),
            engine_name: format!("Engine {}", engine_id),
            max_power_orders: 10,
            groups,
        });
    }

    // Build general config
    let general = build_general_config(values)?;

    Ok(MTConfig {
        version: "17.06.01".to_string(),
        platform: "MT4".to_string(),
        timestamp: chrono::Local::now().to_rfc3339(),
        total_inputs: values.len(),
        last_saved_at: None,
        last_saved_platform: None,
        current_set_name: None,
        tags: None,
        comments: None,
        general,
        engines: config_engines,
    })
}

// Helper structs for building config
struct EngineData {
    groups: HashMap<u32, GroupData>,
}

impl EngineData {
    fn new() -> Self {
        Self {
            groups: HashMap::new(),
        }
    }
}

struct GroupData {
    logics: HashMap<String, LogicData>,
}

impl GroupData {
    fn new() -> Self {
        Self {
            logics: HashMap::new(),
        }
    }
}

struct LogicData {
    directions: HashMap<String, DirectionData>,
}

impl LogicData {
    fn new() -> Self {
        Self {
            directions: HashMap::new(),
        }
    }
}

struct DirectionData {
    params: HashMap<String, String>,
}

impl DirectionData {
    fn new() -> Self {
        Self {
            params: HashMap::new(),
        }
    }
}

// Add these imports to the main file:
// use crate::mt_bridge::{MTConfig, EngineConfig, GroupConfig, LogicConfig, GeneralConfig};

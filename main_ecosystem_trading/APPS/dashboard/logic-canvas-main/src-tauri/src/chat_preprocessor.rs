//! Smart Preprocessor - Strips greetings, slang, and noise from user input
//! 
//! This is the secret sauce: simple regex patterns that extract the actual command
//! from human-like input. No neural network needed for this part.
//!
//! Examples:
//! - "hey set grid to 100" → "set grid to 100"
//! - "hi, can you change multiplier to 1.5?" → "change multiplier to 1.5"
//! - "what's the grid?" → "what's the grid"
//! - "bro make it more aggressive" → "make it more aggressive"

use regex::Regex;

/// Greeting patterns to strip
static GREETING_PATTERNS: &[(&str, &str)] = &[
    // Common greetings at start
    (r"^hey\s+", ""),
    (r"^hi\s*,?\s*", ""),
    (r"^hello\s*,?\s*", ""),
    (r"^yo\s*,?\s*", ""),
    (r"^what's up\s*,?\s*", ""),
    (r"^wassup\s*,?\s*", ""),
    (r"^bro\s*,?\s*", ""),
    (r"^bruh\s*,?\s*", ""),
    (r"^mate\s*,?\s*", ""),
    (r"^man\s*,?\s*", ""),
    (r"^pal\s*,?\s*", ""),
    
    // Greeting suffixes
    (r"\s+,?\s*hey\s*$", ""),
    (r"\s+,?\s*hi\s*$", ""),
    (r"\s+,?\s*hello\s*$", ""),
    (r"\s+,?\s*bro\s*$", ""),
    (r"\s+,?\s*man\s*$", ""),
    
    // Polite prefixes
    (r"^please\s*,?\s*", ""),
    (r"^can you\s+,?\s*", ""),
    (r"^could you\s+,?\s*", ""),
    (r"^would you\s+,?\s*", ""),
    (r"^i want to\s+,?\s*", ""),
    (r"^i need to\s+,?\s*", ""),
    (r"^i need\s+,?\s*", ""),
    
    // Casual chat wrappers
    (r"^so\s+,?\s*", ""),
    (r"^okay\s+,?\s*", ""),
    (r"^ok\s+,?\s*", ""),
    (r"^alright\s+,?\s*", ""),
    (r"^right\s+,?\s*", ""),
    
    // Common slang at end
    (r"\s+boss\s*$", ""),
    (r"\s+my g\s*$", ""),
    (r"\s+fam\s*$", ""),
];

/// Intent keywords that indicate the start of a command
static COMMAND_STARTERS: &[&str] = &[
    "set", "change", "update", "modify", "adjust",
    "show", "display", "list", "query", "find", "search", "what",
    "make", "do", "create", "generate", "apply",
    "copy", "clone", "duplicate",
    "compare", "diff",
    "reset", "restore", "revert",
    "import", "load", "export", "save",
    "increase", "decrease", "multiply", "add", "subtract",
];

/// Check if input starts with a command starter
fn has_command_starter(s: &str) -> bool {
    let lower = s.to_lowercase();
    COMMAND_STARTERS.iter().any(|starter| lower.starts_with(starter))
}

/// Preprocess user input to extract the actual command
pub fn preprocess(input: &str) -> String {
    let mut result = input.trim().to_string();
    
    // Early return if empty
    if result.is_empty() {
        return result;
    }
    
    // Apply greeting/strip patterns
    for (pattern, replacement) in GREETING_PATTERNS.iter() {
        if let Ok(re) = Regex::new(pattern) {
            result = re.replace(&result, *replacement).to_string();
        }
    }
    
    // Clean up multiple spaces
    if let Ok(re) = Regex::new(r"\s{2,}") {
        result = re.replace_all(&result, " ").to_string();
    }
    
    // Trim again
    result = result.trim().to_string();
    
    // If result is empty or too short, return original
    if result.len() < 3 {
        return input.trim().to_string();
    }
    
    result
}

/// Check if this is just a greeting (no command)
pub fn is_greeting(input: &str) -> bool {
    let processed = preprocess(input);
    processed.len() < 5 || !has_command_starter(&processed)
}

/// Extract possible command from natural language
pub fn extract_command(input: &str) -> CommandExtraction {
    let processed = preprocess(input);
    
    // Check for greeting-only
    if is_greeting(&processed) {
        return CommandExtraction {
            command: processed,
            is_greeting: true,
            confidence: 1.0,
            greeting_type: detect_greeting_type(input),
        };
    }
    
    CommandExtraction {
        command: processed,
        is_greeting: false,
        confidence: 0.9,
        greeting_type: None,
    }
}

/// Detect what type of greeting this is
fn detect_greeting_type(input: &str) -> Option<GreetingType> {
    let lower = input.to_lowercase();
    
    if lower.contains("hey") || lower.contains("hi") {
        Some(GreetingType::Casual)
    } else if lower.contains("hello") {
        Some(GreetingType::Formal)
    } else if lower.contains("what's up") || lower.contains("wassup") {
        Some(GreetingType::Slange)
    } else if lower.contains("bro") || lower.contains("bruh") || lower.contains("man") {
        Some(GreetingType::Friendly)
    } else {
        None
    }
}

/// Result of command extraction
#[derive(Debug, Clone, serde::Serialize)]
pub struct CommandExtraction {
    pub command: String,
    pub is_greeting: bool,
    pub confidence: f32,
    pub greeting_type: Option<GreetingType>,
}

/// Types of greetings
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub enum GreetingType {
    Casual,   // hey, hi
    Formal,   // hello, good morning
    Slange,   // what's up, wassup
    Friendly, // bro, bruh, man
}

impl GreetingType {
    pub fn response(&self) -> &'static str {
        match self {
            GreetingType::Casual => "Hey! What can I help you with?",
            GreetingType::Formal => "Hello! How can I assist you today?",
            GreetingType::Slange => "What's good! What do you need?",
            GreetingType::Friendly => "Yo! Let's get it - what do you need?",
        }
    }
}

/// Generate a greeting response
pub fn generate_greeting_response() -> &'static str {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let responses = [
        "Hey! Ready to configure some grids?",
        "Hi there! What do you need?",
        "Yo! Let's make some moves.",
        "What's good! I'm here to help.",
        "Hey boss! What are we adjusting?",
        "Bro! Let's get this money. I mean, grid configured.",
    ];
    responses[rng.gen_range(0..responses.len())]
}

/// Tauri command: preprocess user input
#[tauri::command]
pub fn preprocess_command(input: String) -> CommandExtraction {
    extract_command(&input)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_strip_greetings() {
        assert_eq!(preprocess("hey set grid to 100"), "set grid to 100");
        assert_eq!(preprocess("hi change multiplier"), "change multiplier");
        assert_eq!(preprocess("hello show all groups"), "show all groups");
    }
    
    #[test]
    fn test_strip_polite() {
        assert_eq!(preprocess("please set grid to 500"), "set grid to 500");
        assert_eq!(preprocess("can you change lot size"), "change lot size");
    }
    
    #[test]
    fn test_strip_casual() {
        assert_eq!(preprocess("bro make it safer"), "make it safer");
        assert_eq!(preprocess("man adjust the grid"), "adjust the grid");
    }
    
    #[test]
    fn test_detect_greeting() {
        assert!(is_greeting("hey"));
        assert!(is_greeting("hi there"));
        assert!(!is_greeting("set grid to 100"));
    }
    
    #[test]
    fn test_extract_command() {
        let result = extract_command("hey set grid to 600");
        assert!(!result.is_greeting);
        assert_eq!(result.command, "set grid to 600");
    }
}

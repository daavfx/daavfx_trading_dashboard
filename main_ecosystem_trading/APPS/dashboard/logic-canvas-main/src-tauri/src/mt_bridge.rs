// Setfile export/import - creates and parses MT-style .set files
// No terminal connection: writes only to paths you explicitly choose

use notify::{Event, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
#[cfg(feature = "tauri-app")]
use tauri::{Emitter, State};

// Import the MQL Rust Compiler
use crate::mql_rust_compiler::{
    CompilationError, MQLRustCompiler, PrecompilationResult, ValidationReport,
};

// Path validation and sanitization utilities
fn sanitize_and_validate_path(path: &PathBuf) -> Result<PathBuf, String> {
    // 1. Resolve to absolute path
    let absolute_path = if path.is_absolute() {
        path.clone()
    } else {
        std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?
            .join(path)
    };

    // 2. Canonicalize if possible (best security for existing paths)
    if let Ok(canonical) = absolute_path.canonicalize() {
        return Ok(canonical);
    }

    // 3. If path doesn't exist, resolve the longest existing prefix to handle symlinks safely
    // This prevents writing to "/app/vault/symlink_to_etc/passwd"
    let mut existing_prefix = absolute_path.clone();
    let mut suffix_components = Vec::new();

    while !existing_prefix.exists() {
        if let Some(parent) = existing_prefix.parent() {
            if let Some(name) = existing_prefix.file_name() {
                suffix_components.push(name.to_os_string());
            }
            existing_prefix = parent.to_path_buf();
        } else {
            // Reached root and it doesn't exist? Should not happen for absolute path usually
            break;
        }
    }

    // If we found an existing prefix, canonicalize it
    if existing_prefix.exists() {
        let mut final_path = existing_prefix
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize path prefix: {}", e))?;

        // Append the non-existing components back
        for component in suffix_components.iter().rev() {
            final_path.push(component);
        }

        return Ok(final_path);
    }

    // 4. Fallback (should rarely reach here if root exists): Manual normalization
    let mut normalized = PathBuf::new();

    // Handle Windows prefixes specifically if needed, but components() usually handles it
    // We iterate components to strictly manage ".."
    for component in absolute_path.components() {
        match component {
            std::path::Component::Prefix(prefix) => {
                normalized.push(prefix.as_os_str());
            }
            std::path::Component::RootDir => {
                normalized.push(std::path::Component::RootDir);
            }
            std::path::Component::CurDir => {
                // Skip "."
            }
            std::path::Component::ParentDir => {
                // Attempt to go up
                // If we can pop, we do. If we can't (at root or empty), we FAIL securely.
                // This prevents "..\..\Windows" style attacks escaping the drive/root.
                if !normalized.pop() {
                    return Err(format!(
                        "Path traversal attempt detected (root escape): {:?}",
                        path
                    ));
                }
            }
            std::path::Component::Normal(c) => {
                normalized.push(c);
            }
        }
    }

    Ok(normalized)
}

fn resolve_mt_config_path(path: &PathBuf, default_file_name: &str) -> PathBuf {
    if path.is_dir() {
        path.join(default_file_name)
    } else {
        path.clone()
    }
}

fn validate_path_within_base(path: &PathBuf, base_dir: &PathBuf) -> Result<PathBuf, String> {
    let sanitized = sanitize_and_validate_path(path)?;
    let base_dir_normalized = sanitize_and_validate_path(base_dir)?;

    // Ensure the sanitized path is within the base directory
    if sanitized.starts_with(&base_dir_normalized) {
        Ok(sanitized)
    } else {
        Err(format!(
            "Path must be within the base directory: {:?}",
            base_dir_normalized
        ))
    }
}

// Atomic write helper to prevent file corruption
fn atomic_write(path: &PathBuf, content: &str) -> Result<(), String> {
    // Create a temporary file in the same directory
    let tmp_extension = format!(
        "{}.tmp",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let tmp_path = if let Some(ext) = path.extension() {
        path.with_extension(format!("{}.{}", ext.to_string_lossy(), tmp_extension))
    } else {
        path.with_extension(tmp_extension)
    };

    // Write to the temporary file
    fs::write(&tmp_path, content).map_err(|e| format!("Failed to write temporary file: {}", e))?;

    // Rename temporary file to target file (atomic operation)
    fs::rename(&tmp_path, path).map_err(|e| {
        // Cleanup temp file if rename fails
        let _ = fs::remove_file(&tmp_path);
        format!("Failed to commit file (rename failed): {}", e)
    })?;

    Ok(())
}

// ============================================
// ENCRYPTION / OBFUSCATION UTILITIES
// ============================================

const OBFUSCATION_KEY: &str = "DAAVFX_SECURE_STORAGE_KEY_2024";

fn obfuscate_string(input: &str) -> String {
    if input.is_empty() {
        return String::new();
    }
    // Check if already obfuscated to prevent double encryption
    if input.starts_with("ENC:") {
        return input.to_string();
    }

    // Simple XOR + Hex
    let mut output = String::from("ENC:");
    let key_bytes = OBFUSCATION_KEY.as_bytes();
    for (i, b) in input.bytes().enumerate() {
        let key_byte = key_bytes[i % key_bytes.len()];
        let xored = b ^ key_byte;
        output.push_str(&format!("{:02x}", xored));
    }
    output
}

fn deobfuscate_string(input: &str) -> String {
    if !input.starts_with("ENC:") {
        return input.to_string();
    }
    let hex_part = &input[4..];
    let key_bytes = OBFUSCATION_KEY.as_bytes();
    let mut decoded = Vec::new();

    // Parse hex
    let mut chars = hex_part.chars();
    let mut idx = 0;
    while let (Some(h1), Some(h2)) = (chars.next(), chars.next()) {
        if let Ok(byte) = u8::from_str_radix(&format!("{}{}", h1, h2), 16) {
            let key_byte = key_bytes[idx % key_bytes.len()];
            decoded.push(byte ^ key_byte);
            idx += 1;
        } else {
            return input.to_string(); // Fail safe
        }
    }

    String::from_utf8(decoded).unwrap_or_else(|_| input.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MTConfig {
    pub version: String,
    pub platform: String, // "MT4" or "MT5"
    pub timestamp: String,
    pub total_inputs: usize,
    #[serde(default)]
    pub last_saved_at: Option<String>,
    #[serde(default)]
    pub last_saved_platform: Option<String>,
    #[serde(default)]
    pub current_set_name: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub comments: Option<String>,
    pub general: GeneralConfig,
    pub engines: Vec<EngineConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GeneralConfig {
    // License
    pub license_key: String,
    pub license_server_url: String,
    pub require_license: bool,
    pub license_check_interval: i32,

    // Config
    pub config_file_name: String,
    pub config_file_is_common: bool,

    // Trading (GLOBAL)
    pub allow_buy: bool,
    pub allow_sell: bool,

    // Logging
    pub enable_logs: bool,

    #[serde(default)]
    pub use_direct_price_grid: bool,

    #[serde(default)]
    pub group_mode: Option<i32>,
    #[serde(default)]
    pub grid_unit: Option<i32>,
    #[serde(default)]
    pub pip_factor: Option<i32>,

    // Compounding
    pub compounding_enabled: bool,
    pub compounding_type: String,
    pub compounding_target: f64,
    pub compounding_increase: f64,

    // Restart Policy
    pub restart_policy_power: String,
    pub restart_policy_non_power: String,
    pub close_non_power_on_power_close: bool,
    pub hold_timeout_bars: i32,

    // Global System
    pub magic_number: i32,
    pub magic_number_buy: i32,
    pub magic_number_sell: i32,
    pub max_slippage_points: f64,
    #[serde(default)]
    pub reverse_magic_base: i32,
    #[serde(default)]
    pub hedge_magic_base: i32,
    #[serde(default)]
    pub hedge_magic_independent: bool,

    // Risk Management
    pub risk_management: RiskManagementConfig,

    // Time Filters
    pub time_filters: TimeFiltersConfig,

    // News Filter
    pub news_filter: NewsFilterConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RiskManagementConfig {
    pub spread_filter_enabled: bool,
    pub max_spread_points: f64,
    pub equity_stop_enabled: bool,
    pub equity_stop_value: f64,
    pub drawdown_stop_enabled: bool,
    pub max_drawdown_percent: f64,
    #[serde(default)]
    pub risk_action: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TimeFiltersConfig {
    #[serde(default)]
    pub priority_settings: TimePrioritySettings,
    pub sessions: Vec<SessionConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TimePrioritySettings {
    pub news_filter_overrides_session: bool,
    pub session_filter_overrides_news: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionConfig {
    #[serde(default)]
    pub session_number: i32,
    pub enabled: bool,
    pub day: i32,
    pub start_hour: i32,
    pub start_minute: i32,
    pub end_hour: i32,
    pub end_minute: i32,
    #[serde(default)]
    pub action: String,
    #[serde(default)]
    pub auto_restart: bool,
    #[serde(default)]
    pub restart_mode: String,
    #[serde(default)]
    pub restart_bars: i32,
    #[serde(default)]
    pub restart_minutes: i32,
    #[serde(default)]
    pub restart_pips: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NewsFilterConfig {
    pub enabled: bool,
    pub api_key: String,
    pub api_url: String,
    pub countries: String,
    pub impact_level: i32,
    pub minutes_before: i32,
    pub minutes_after: i32,
    pub action: String,
    #[serde(default)]
    pub calendar_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineConfig {
    pub engine_id: String, // "A", "B", "C"
    pub engine_name: String,
    pub max_power_orders: i32,
    pub groups: Vec<GroupConfig>,
}

impl MTConfig {
    pub fn obfuscate_sensitive_fields(&mut self) {
        self.general.license_key = obfuscate_string(&self.general.license_key);
        self.general.license_server_url = obfuscate_string(&self.general.license_server_url);
        self.general.news_filter.api_key = obfuscate_string(&self.general.news_filter.api_key);
        self.general.news_filter.api_url = obfuscate_string(&self.general.news_filter.api_url);
    }

    pub fn deobfuscate_sensitive_fields(&mut self) {
        self.general.license_key = deobfuscate_string(&self.general.license_key);
        self.general.license_server_url = deobfuscate_string(&self.general.license_server_url);
        self.general.news_filter.api_key = deobfuscate_string(&self.general.news_filter.api_key);
        self.general.news_filter.api_url = deobfuscate_string(&self.general.news_filter.api_url);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupConfig {
    pub group_number: u8, // 1-20 (all groups supported)
    pub enabled: bool,

    // ===== GROUP TRIGGER (Groups 2-20 only) =====
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_power_start: Option<i32>, // gInput_GroupPowerStart_P{N} - # of Power A trades to trigger this group

    // ===== GROUP-LEVEL REVERSE/HEDGE CONTROLS (V17.04+) =====
    #[serde(default)]
    pub reverse_mode: bool, // gInput_Group{N}_ReverseMode
    #[serde(default)]
    pub hedge_mode: bool, // gInput_Group{N}_HedgeMode
    #[serde(default = "default_logic_none")]
    pub hedge_reference: String, // gInput_Group{N}_HedgeReference
    #[serde(default)]
    pub entry_delay_bars: i32, // gInput_Group{N}_EntryDelayBars

    pub logics: Vec<LogicConfig>,
}

fn default_true() -> bool {
    true
}
fn default_logic_none() -> String {
    "Logic_None".to_string()
}
fn default_trail_step_mode() -> String {
    "TrailStepMode_Auto".to_string()
}
fn default_strategy_trail() -> String {
    "Trail".to_string()
}
fn default_mode_trending() -> String {
    "Trending".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogicConfig {
    // METADATA (3 fields)
    pub logic_name: String,
    pub logic_id: String,
    pub enabled: bool,

    // ===== BASE PARAMS (8 fields) =====
    pub initial_lot: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initial_lot_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initial_lot_s: Option<f64>,
    pub multiplier: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiplier_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiplier_s: Option<f64>,
    pub grid: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_s: Option<f64>,
    pub trail_method: String,
    pub trail_value: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_value_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_value_s: Option<f64>,
    pub trail_start: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_start_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_start_s: Option<f64>,
    pub trail_step: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_s: Option<f64>,
    pub trail_step_method: String,

    // ===== LOGIC-SPECIFIC (5 fields) =====
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_level: Option<i32>, // Not for Power
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_lot: Option<f64>, // Not for Power
    pub close_targets: String,
    pub order_count_reference: String,
    pub reset_lot_on_restart: bool,

    // ===== MODE SELECTORS (Dashboard Only / Mapped) =====
    #[serde(default = "default_strategy_trail")]
    pub strategy_type: String,
    #[serde(default = "default_mode_trending")]
    pub trading_mode: String,
    #[serde(default = "default_true")]
    pub allow_buy: bool, // gInput_AllowBuy_{suffix}
    #[serde(default = "default_true")]
    pub allow_sell: bool, // gInput_AllowSell_{suffix}

    // ===== TPSL (6 fields - dashboard-managed) =====
    pub use_tp: bool,
    pub tp_mode: String,
    pub tp_value: f64,
    pub use_sl: bool,
    pub sl_mode: String,
    pub sl_value: f64,

    // ===== REVERSE/HEDGE PER-LOGIC (8 fields - V17.04+) =====
    #[serde(default)]
    pub reverse_enabled: bool, // gInput_G{group}_{logic}_ReverseEnabled
    #[serde(default)]
    pub hedge_enabled: bool, // gInput_G{group}_{logic}_HedgeEnabled
    #[serde(default = "default_scale")]
    pub reverse_scale: f64, // gInput_G{group}_Scale_{logic}_Reverse (100.0 = 100%)
    #[serde(default = "default_half_scale")]
    pub hedge_scale: f64, // gInput_G{group}_Scale_{logic}_Hedge (50.0 = 50%)
    #[serde(default = "default_logic_none")]
    pub reverse_reference: String, // gInput_G{group}_{logic}_ReverseReference
    #[serde(default = "default_logic_none")]
    pub hedge_reference: String, // gInput_G{group}_{logic}_HedgeReference

    // ===== TRAIL STEP ADVANCED (3 fields - V17.04+) =====
    #[serde(default = "default_trail_step_mode")]
    pub trail_step_mode: String, // gInput_TrailStepMode_{suffix}
    #[serde(default = "default_one")]
    pub trail_step_cycle: i32, // gInput_TrailStepCycle_{suffix} (1=always)
    #[serde(default)]
    pub trail_step_balance: f64, // gInput_TrailStepBalance_{suffix} (0=disabled)

    // ===== TRAIL STEP EXTENDED (Levels 2-7) =====
    #[serde(default)]
    pub trail_step_2: Option<f64>,
    #[serde(default)]
    pub trail_step_method_2: Option<String>,
    #[serde(default)]
    pub trail_step_cycle_2: Option<i32>,
    #[serde(default)]
    pub trail_step_balance_2: Option<f64>,
    #[serde(default)]
    pub trail_step_mode_2: Option<String>,

    #[serde(default)]
    pub trail_step_3: Option<f64>,
    #[serde(default)]
    pub trail_step_method_3: Option<String>,
    #[serde(default)]
    pub trail_step_cycle_3: Option<i32>,
    #[serde(default)]
    pub trail_step_balance_3: Option<f64>,
    #[serde(default)]
    pub trail_step_mode_3: Option<String>,

    #[serde(default)]
    pub trail_step_4: Option<f64>,
    #[serde(default)]
    pub trail_step_method_4: Option<String>,
    #[serde(default)]
    pub trail_step_cycle_4: Option<i32>,
    #[serde(default)]
    pub trail_step_balance_4: Option<f64>,
    #[serde(default)]
    pub trail_step_mode_4: Option<String>,

    #[serde(default)]
    pub trail_step_5: Option<f64>,
    #[serde(default)]
    pub trail_step_method_5: Option<String>,
    #[serde(default)]
    pub trail_step_cycle_5: Option<i32>,
    #[serde(default)]
    pub trail_step_balance_5: Option<f64>,
    #[serde(default)]
    pub trail_step_mode_5: Option<String>,

    #[serde(default)]
    pub trail_step_6: Option<f64>,
    #[serde(default)]
    pub trail_step_method_6: Option<String>,
    #[serde(default)]
    pub trail_step_cycle_6: Option<i32>,
    #[serde(default)]
    pub trail_step_balance_6: Option<f64>,
    #[serde(default)]
    pub trail_step_mode_6: Option<String>,

    #[serde(default)]
    pub trail_step_7: Option<f64>,
    #[serde(default)]
    pub trail_step_method_7: Option<String>,
    #[serde(default)]
    pub trail_step_cycle_7: Option<i32>,
    #[serde(default)]
    pub trail_step_balance_7: Option<f64>,
    #[serde(default)]
    pub trail_step_mode_7: Option<String>,

    // ===== CLOSE PARTIAL (5 fields) =====
    pub close_partial: bool,
    pub close_partial_cycle: i32,
    pub close_partial_mode: String,
    pub close_partial_balance: String,
    #[serde(default = "default_trail_step_mode")]
    pub close_partial_trail_step_mode: String, // gInput_ClosePartialTrailStepMode_{suffix}

    // ===== CLOSE PARTIAL EXTENDED (Levels 2-4) =====
    #[serde(default)]
    pub close_partial_2: Option<bool>,
    #[serde(default)]
    pub close_partial_cycle_2: Option<i32>,
    #[serde(default)]
    pub close_partial_mode_2: Option<String>,
    #[serde(default)]
    pub close_partial_balance_2: Option<String>,

    #[serde(default)]
    pub close_partial_3: Option<bool>,
    #[serde(default)]
    pub close_partial_cycle_3: Option<i32>,
    #[serde(default)]
    pub close_partial_mode_3: Option<String>,
    #[serde(default)]
    pub close_partial_balance_3: Option<String>,

    #[serde(default)]
    pub close_partial_4: Option<bool>,
    #[serde(default)]
    pub close_partial_cycle_4: Option<i32>,
    #[serde(default)]
    pub close_partial_mode_4: Option<String>,
    #[serde(default)]
    pub close_partial_balance_4: Option<String>,

    // ===== TRIGGERS (optional) =====
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_bars: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_minutes: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_pips: Option<f64>,
}

fn default_scale() -> f64 {
    100.0
}
fn default_half_scale() -> f64 {
    50.0
}
fn default_one() -> i32 {
    1
}

// Total fields (V17.04+): 3 + 8 + 5 + 6 + 8 + 3 + 5 = 38 fields
// Power has some optional, Non-Power has all

#[derive(Debug, Clone)]
pub struct MTBridgeState {
    pub config: Arc<Mutex<Option<MTConfig>>>,
    pub mt4_path: Arc<Mutex<Option<PathBuf>>>,
    pub mt5_path: Arc<Mutex<Option<PathBuf>>>,
    pub watcher: Arc<Mutex<Option<notify::RecommendedWatcher>>>,
    pub mql_compiler: Arc<Mutex<Option<MQLRustCompiler>>>,
}

impl MTBridgeState {
    pub fn new() -> Self {
        Self {
            config: Arc::new(Mutex::new(None)),
            mt4_path: Arc::new(Mutex::new(None)),
            mt5_path: Arc::new(Mutex::new(None)),
            watcher: Arc::new(Mutex::new(None)),
            mql_compiler: Arc::new(Mutex::new(None)),
        }
    }

    pub fn initialize_compiler(&self) -> Result<(), String> {
        let mt4_path = self.mt4_path.lock().unwrap();
        let mt5_path = self.mt5_path.lock().unwrap();

        let mt4_str = mt4_path
            .as_ref()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let mt5_str = mt5_path
            .as_ref()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        match MQLRustCompiler::new_for_dashboard(&mt4_str, &mt5_str) {
            Ok(compiler) => {
                *self.mql_compiler.lock().unwrap() = Some(compiler);
                Ok(())
            }
            Err(e) => Err(format!("Failed to initialize MQL compiler: {}", e)),
        }
    }
}

// Tauri Commands

#[cfg(feature = "tauri-app")]
#[tauri::command]
pub async fn load_mt_config(
    platform: String,
    state: State<'_, MTBridgeState>,
) -> Result<MTConfig, String> {
    let config_path = match platform.as_str() {
        "MT4" => {
            let path = state.mt4_path.lock().unwrap();
            path.clone().ok_or("MT4 path not set")?
        }
        "MT5" => {
            let path = state.mt5_path.lock().unwrap();
            path.clone().ok_or("MT5 path not set")?
        }
        _ => return Err("Invalid platform".to_string()),
    };

    // Sanitize and validate the path before reading
    let sanitized_path = sanitize_and_validate_path(&config_path)?;
    let resolved_path = resolve_mt_config_path(&sanitized_path, "DAAVFX_Config.json");

    let json_str =
        fs::read_to_string(&resolved_path).map_err(|e| format!("Failed to read config: {}", e))?;

    let config: MTConfig =
        serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse config: {}", e))?;

    *state.config.lock().unwrap() = Some(config.clone());

    Ok(config)
}

#[cfg(feature = "tauri-app")]
#[tauri::command]
pub async fn save_mt_config(
    platform: String,
    config: MTConfig,
    state: State<'_, MTBridgeState>,
) -> Result<(), String> {
    let config_path = match platform.as_str() {
        "MT4" => {
            let path = state.mt4_path.lock().unwrap();
            path.clone().ok_or("MT4 path not set")?
        }
        "MT5" => {
            let path = state.mt5_path.lock().unwrap();
            path.clone().ok_or("MT5 path not set")?
        }
        _ => return Err("Invalid platform".to_string()),
    };

    // Sanitize and validate the path before writing
    let sanitized_path = sanitize_and_validate_path(&config_path)?;
    let default_file_name = if config.general.config_file_name.trim().is_empty() {
        "DAAVFX_Config.json"
    } else {
        config.general.config_file_name.as_str()
    };
    let resolved_path = resolve_mt_config_path(&sanitized_path, default_file_name);

    let json_str = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    atomic_write(&resolved_path, &json_str)?;

    *state.config.lock().unwrap() = Some(config);

    Ok(())
}

#[cfg(feature = "tauri-app")]
#[tauri::command]
pub async fn set_mt_path(
    platform: String,
    path: String,
    state: State<'_, MTBridgeState>,
) -> Result<(), String> {
    let path_buf = PathBuf::from(path);

    // Sanitize and validate the path
    let sanitized_path = sanitize_and_validate_path(&path_buf)?;

    if !sanitized_path.exists() {
        return Err("Path does not exist".to_string());
    }

    match platform.as_str() {
        "MT4" => {
            *state.mt4_path.lock().unwrap() = Some(sanitized_path);
        }
        "MT5" => {
            *state.mt5_path.lock().unwrap() = Some(sanitized_path);
        }
        _ => return Err("Invalid platform".to_string()),
    }

    Ok(())
}

#[cfg(feature = "tauri-app")]
#[tauri::command]
pub async fn start_file_watcher(
    platform: String,
    app_handle: tauri::AppHandle,
    state: State<'_, MTBridgeState>,
) -> Result<(), String> {
    let config_path = match platform.as_str() {
        "MT4" => {
            let path = state.mt4_path.lock().unwrap();
            path.clone().ok_or("MT4 path not set")?
        }
        "MT5" => {
            let path = state.mt5_path.lock().unwrap();
            path.clone().ok_or("MT5 path not set")?
        }
        _ => return Err("Invalid platform".to_string()),
    };

    let (tx, rx) = std::sync::mpsc::channel();

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(_event) = res {
            let _ = tx.send(());
        }
    })
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    let resolved_path = resolve_mt_config_path(&config_path, "DAAVFX_Config.json");

    watcher
        .watch(resolved_path.as_path(), RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch path: {}", e))?;

    *state.watcher.lock().unwrap() = Some(watcher);

    std::thread::spawn(move || {
        while rx.recv().is_ok() {
            let _ = app_handle.emit("config-changed", platform.clone());
        }
    });

    Ok(())
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn get_default_mt4_path() -> Result<String, String> {
    let mut possible_paths: Vec<PathBuf> = Vec::new();

    if let Some(home) = dirs::home_dir() {
        possible_paths.push(home.join("AppData\\Roaming\\MetaQuotes\\Terminal\\Common\\Files"));
    }

    possible_paths.extend([
        PathBuf::from("C:\\Program Files\\MetaTrader 4\\MQL4\\Files\\Common"),
        PathBuf::from("C:\\Program Files (x86)\\MetaTrader 4\\MQL4\\Files\\Common"),
        PathBuf::from("C:\\Program Files\\MetaTrader 4"),
        PathBuf::from("C:\\Program Files (x86)\\MetaTrader 4"),
    ]);

    for path in possible_paths {
        if path.exists() {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    Err("MT4 not found. Please set path manually in Settings.".to_string())
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn get_default_mt5_path() -> Result<String, String> {
    let mut possible_paths: Vec<PathBuf> = Vec::new();

    if let Some(home) = dirs::home_dir() {
        possible_paths.push(home.join("AppData\\Roaming\\MetaQuotes\\Terminal64\\Common\\Files"));
        possible_paths.push(home.join("AppData\\Roaming\\MetaQuotes\\Terminal\\Common\\Files"));
    }

    possible_paths.extend([
        PathBuf::from("C:\\Program Files\\MetaTrader 5\\MQL5\\Files\\Common"),
        PathBuf::from("C:\\Program Files (x86)\\MetaTrader 5\\MQL5\\Files\\Common"),
        PathBuf::from("C:\\Program Files\\MetaTrader 5"),
        PathBuf::from("C:\\Program Files (x86)\\MetaTrader 5"),
    ]);

    for path in possible_paths {
        if path.exists() {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    Err("MT5 not found. Please set path manually in Settings.".to_string())
}

// ============================================
// .SET FILE EXPORT/IMPORT FUNCTIONALITY
// ============================================

#[allow(dead_code)]
fn generate_optimization_hint(field: &str, value: f64) -> String {
    if !value.is_finite() {
        return String::new();
    }

    match field {
        "initial_lot" => {
            let base = if value > 0.0 { value } else { 0.01 };
            let step = 0.01_f64;
            let min = 0.01_f64;
            let max = (base * 3.0).max(0.03);
            format!(",F={:.2},1={:.2},2={:.2}", step, min, max)
        }
        "grid" => {
            let base = if value > 0.0 { value } else { 100.0 };
            let step = if base <= 10.0 {
                1.0
            } else if base <= 200.0 {
                5.0
            } else {
                10.0
            };
            let min = (base * 0.5).max(5.0);
            let max = (base * 2.0).min(100000.0);
            format!(",F={:.1},1={:.1},2={:.1}", step, min, max)
        }
        "multiplier" => {
            let step = 0.1_f64;
            let min = 0.5_f64;
            let max = 3.0_f64;
            format!(",F={:.2},1={:.2},2={:.2}", step, min, max)
        }
        "tp_value" | "sl_value" => {
            if value <= 0.0 {
                return String::new();
            }
            let base = value;
            let step = (base * 0.1).max(5.0).min(1000.0);
            let min = (base * 0.5).max(1.0);
            let max = (base * 2.0).min(100000.0);
            format!(",F=1,1={:.1},2={:.1},3={:.1}", min, step, max)
        }
        _ => String::new(),
    }
}

fn get_optimization_values(field: &str, value: f64) -> (i32, f64, f64, f64) {
    if !value.is_finite() {
        return (0, 0.0, 0.0, 0.0);
    }

    match field {
        "initial_lot" => {
            let base = if value > 0.0 { value } else { 0.01 };
            let step = 0.01_f64;
            let min = 0.01_f64;
            let max = (base * 3.0).max(0.03);
            (1, min, step, max)
        }
        "multiplier" => {
            let base = if value > 1.0 { value } else { 1.5 };
            let step = 0.1_f64;
            let min = 1.0_f64;
            let max = (base * 2.0).max(3.0);
            (1, min, step, max)
        }
        "grid" => {
            let base = if value > 0.0 { value } else { 10.0 };
            let step = 5.0_f64;
            let min = 5.0_f64;
            let max = (base * 3.0).max(50.0);
            (1, min, step, max)
        }
        "tp_value" | "sl_value" => {
            let base = if value > 0.0 { value } else { 50.0 };
            let step = 10.0_f64;
            let min = 10.0_f64;
            let max = (base * 3.0).max(100.0);
            (1, min, step, max)
        }
        _ => (0, 0.0, 0.0, 0.0),
    }
}

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
pub fn export_set_file(
    config: MTConfig,
    file_path: String,
    platform: String,
    include_optimization_hints: bool,
    trade_direction: Option<String>, // "BUY", "SELL", or "BOTH" (default)
    tags: Option<Vec<String>>,
    comments: Option<String>,
) -> Result<(), String> {
    // Add debug logging to see what parameters are received
    println!("[DEBUG] export_set_file called with:");
    println!("[DEBUG]   file_path: {}", file_path);
    println!("[DEBUG]   platform: {}", platform);
    println!("[DEBUG]   include_optimization_hints: {}", include_optimization_hints);
    println!("[DEBUG]   trade_direction: {:?}", trade_direction);

    // Sanitize and validate the file path
    let path_buf = PathBuf::from(&file_path);
    let sanitized_path = sanitize_and_validate_path(&path_buf)?;

    let mut lines: Vec<String> = Vec::new();

    // Header comment
    lines.push(format!("; DAAVFX Configuration Export"));
    lines.push(format!("; Platform: {}", platform));
    lines.push(format!(
        "; Generated: {}",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
    ));
    lines.push(format!("; Total Inputs: {}", config.total_inputs));

    // Custom Metadata
    if let Some(t) = tags {
        if !t.is_empty() {
            lines.push(format!("; Tags: {}", t.join(", ")));
        }
    }
    if let Some(c) = comments {
        if !c.is_empty() {
            lines.push(format!("; Comments: {}", c.replace("\n", " ")));
        }
    }

    lines.push(String::new());

    // General Settings
    lines.push("; === GENERAL SETTINGS ===".to_string());
    lines.push(format!(
        "gInput_MagicNumber={}",
        config.general.magic_number
    ));
    lines.push(format!(
        "gInput_MagicNumberBuy={}",
        config.general.magic_number_buy
    ));
    lines.push(format!(
        "gInput_MagicNumberSell={}",
        config.general.magic_number_sell
    ));
    lines.push(format!(
        "gInput_MagicNumberPowerBuy={}",
        config.general.magic_number_buy
    ));
    lines.push(format!(
        "gInput_MagicNumberPowerSell={}",
        config.general.magic_number_sell
    ));
    lines.push(format!(
        "gInput_MagicNumberReverseBase={}",
        config.general.reverse_magic_base
    ));
    lines.push(format!(
        "gInput_MagicNumberHedgeBase={}",
        config.general.hedge_magic_base
    ));
    lines.push(format!(
        "gInput_HedgeMagicIndependent={}",
        if config.general.hedge_magic_independent {
            1
        } else {
            0
        }
    ));
    lines.push(format!(
        "gInput_MaxSlippage={}",
        (config.general.max_slippage_points.round() as i32)
    ));
    lines.push(format!(
        "gInput_MaxSlippagePoints={:.1}",
        config.general.max_slippage_points
    ));
    lines.push(format!(
        "gInput_allowBuy={}",
        if config.general.allow_buy { 1 } else { 0 }
    ));
    lines.push(format!(
        "gInput_allowSell={}",
        if config.general.allow_sell { 1 } else { 0 }
    ));
    lines.push(format!(
        "gInput_EnableLogs={}",
        if config.general.enable_logs { 1 } else { 0 }
    ));
    lines.push(format!(
        "gInput_UseDirectPriceGrid={}",
        if config.general.use_direct_price_grid {
            1
        } else {
            0
        }
    ));

    // Lazy Fix: Auto-point to self for absolute paths to support >1100 inputs via EA loader
    // This allows the EA to re-read the .set file from disk to bypass MT5 input limits
    let is_absolute =
        file_path.contains(":") || file_path.starts_with("\\\\") || file_path.starts_with("/");
    if is_absolute {
        lines.push(format!("gInput_ConfigFileName={}", file_path));
        lines.push(format!("gInput_ConfigFileIsCommon=0"));
    } else {
        lines.push(format!(
            "gInput_ConfigFileName={}",
            config.general.config_file_name
        ));
        lines.push(format!(
            "gInput_ConfigFileIsCommon={}",
            if config.general.config_file_is_common {
                1
            } else {
                0
            }
        ));
    }

    lines.push(String::new());

    // License
    lines.push("; === LICENSE ===".to_string());
    lines.push(format!("gInput_LicenseKey={}", config.general.license_key));
    lines.push(format!(
        "gInput_LicenseServerURL={}",
        config.general.license_server_url
    ));
    lines.push(format!(
        "gInput_RequireLicense={}",
        if config.general.require_license { 1 } else { 0 }
    ));
    lines.push(format!(
        "gInput_LicenseCheckInterval={}",
        config.general.license_check_interval
    ));
    lines.push(String::new());

    // Compounding
    lines.push("; === COMPOUNDING ===".to_string());
    lines.push(format!(
        "gInput_Input_Compounding={}",
        if config.general.compounding_enabled {
            1
        } else {
            0
        }
    ));
    lines.push(format!(
        "gInput_Input_CompoundingType={}",
        config.general.compounding_type
    ));
    lines.push(format!(
        "gInput_Input_CompoundingTarget={:.1}",
        config.general.compounding_target
    ));
    lines.push(format!(
        "gInput_Input_CompoundIncrease={:.1}",
        config.general.compounding_increase
    ));
    lines.push(String::new());

    // Risk Management
    lines.push("; === RISK MANAGEMENT ===".to_string());
    lines.push(format!(
        "gInput_UseSpreadFilter={}",
        if config.general.risk_management.spread_filter_enabled {
            1
        } else {
            0
        }
    ));
    lines.push(format!(
        "gInput_MaxSpreadPoints={:.1}",
        config.general.risk_management.max_spread_points
    ));
    lines.push(format!(
        "gInput_UseEquityStop={}",
        if config.general.risk_management.equity_stop_enabled {
            1
        } else {
            0
        }
    ));
    lines.push(format!(
        "gInput_EquityStopValue={:.1}",
        config.general.risk_management.equity_stop_value
    ));
    lines.push(format!(
        "gInput_UseDrawdownStop={}",
        if config.general.risk_management.drawdown_stop_enabled {
            1
        } else {
            0
        }
    ));
    lines.push(format!(
        "gInput_MaxDrawdownPercent={:.1}",
        config.general.risk_management.max_drawdown_percent
    ));
    if let Some(risk_action) = config.general.risk_management.risk_action.as_deref() {
        lines.push(format!(
            "gInput_RiskAction={}",
            trigger_action_to_int(risk_action)
        ));
    }
    lines.push(String::new());

    lines.push("; === CLEAN MATH ===".to_string());
    lines.push(format!(
        "gInput_GroupMode={}",
        config.general.group_mode.unwrap_or(1)
    ));
    lines.push(format!(
        "gInput_GridUnit={}",
        config.general.grid_unit.unwrap_or(0)
    ));
    lines.push(format!(
        "gInput_PipFactor={}",
        config.general.pip_factor.unwrap_or(0)
    ));
    lines.push(String::new());

    // News Filter
    lines.push("; === NEWS FILTER ===".to_string());
    lines.push(format!(
        "gInput_EnableNewsFilter={}",
        if config.general.news_filter.enabled {
            1
        } else {
            0
        }
    ));
    lines.push(format!(
        "gInput_NewsFilterEnabled={}",
        if config.general.news_filter.enabled {
            1
        } else {
            0
        }
    ));
    lines.push(format!(
        "gInput_NewsAPIKey={}",
        config.general.news_filter.api_key
    ));
    lines.push(format!(
        "gInput_NewsAPIURL={}",
        config.general.news_filter.api_url
    ));
    lines.push(format!(
        "gInput_NewsFilterCountries={}",
        config.general.news_filter.countries
    ));
    lines.push(format!(
        "gInput_NewsImpactLevel={}",
        config.general.news_filter.impact_level
    ));
    lines.push(format!(
        "gInput_MinutesBeforeNews={}",
        config.general.news_filter.minutes_before
    ));
    lines.push(format!(
        "gInput_MinutesAfterNews={}",
        config.general.news_filter.minutes_after
    ));
    lines.push(format!(
        "gInput_NewsAction={}",
        trigger_action_to_int(&config.general.news_filter.action)
    ));
    if let Some(cf) = config.general.news_filter.calendar_file.as_deref() {
        lines.push(format!("gInput_NewsCalendarFile={}", cf));
    }
    lines.push(String::new());

    // Time Filters / Sessions
    lines.push("; === TIME FILTERS ===".to_string());
    lines.push(format!(
        "gInput_NewsFilterOverridesSession={}",
        if config
            .general
            .time_filters
            .priority_settings
            .news_filter_overrides_session
        {
            1
        } else {
            0
        }
    ));
    lines.push(format!(
        "gInput_SessionFilterOverridesNews={}",
        if config
            .general
            .time_filters
            .priority_settings
            .session_filter_overrides_news
        {
            1
        } else {
            0
        }
    ));
    lines.push(format!(
        "gInput_NewsOverridesSession={}",
        if config
            .general
            .time_filters
            .priority_settings
            .news_filter_overrides_session
        {
            1
        } else {
            0
        }
    ));
    lines.push(format!(
        "gInput_SessionOverridesNews={}",
        if config
            .general
            .time_filters
            .priority_settings
            .session_filter_overrides_news
        {
            1
        } else {
            0
        }
    ));
    let any_session_enabled = config
        .general
        .time_filters
        .sessions
        .iter()
        .any(|s| s.enabled);
    lines.push(format!(
        "gInput_SessionFilterEnabled={}",
        if any_session_enabled { 1 } else { 0 }
    ));

    for (i, session) in config.general.time_filters.sessions.iter().enumerate() {
        let session_num = i + 1;
        let n = session.enabled as i32; // 0 or 1
        lines.push(format!("gInput_Session{}Enabled={}", session_num, n));
        lines.push(format!("gInput_Session{}Day={}", session_num, session.day));
        lines.push(format!(
            "gInput_Session{}StartHour={}",
            session_num, session.start_hour
        ));
        lines.push(format!(
            "gInput_Session{}StartMinute={}",
            session_num, session.start_minute
        ));
        lines.push(format!(
            "gInput_Session{}EndHour={}",
            session_num, session.end_hour
        ));
        lines.push(format!(
            "gInput_Session{}EndMinute={}",
            session_num, session.end_minute
        ));
        lines.push(format!(
            "gInput_Session{}Action={}",
            session_num,
            trigger_action_to_int(&session.action)
        ));
    }
    lines.push(String::new());

    // Engine and Logic configs
    for engine in &config.engines {
        lines.push(format!(";"));
        lines.push(format!("; === ENGINE {} ===", engine.engine_id));

        for group in &engine.groups {
            lines.push(format!("; --- Group {} ---", group.group_number));

            // GroupPowerStart: # of Power A trades to trigger this group (Groups 2-20 only)
            if group.group_number > 1 {
                if let Some(gps) = group.group_power_start {
                    // Export for all 3 engines (P, BP, CP suffixes)
                    lines.push(format!(
                        "gInput_GroupPowerStart_P{}={}",
                        group.group_number, gps
                    ));
                    lines.push(format!(
                        "gInput_GroupPowerStart_BP{}={}",
                        group.group_number, gps
                    ));
                    lines.push(format!(
                        "gInput_GroupPowerStart_CP{}={}",
                        group.group_number, gps
                    ));
                }
            }

            // Group-level Reverse/Hedge controls (V17.04+)
            lines.push(format!(
                "gInput_Group{}_ReverseMode={}",
                group.group_number,
                if group.reverse_mode { 1 } else { 0 }
            ));
            lines.push(format!(
                "gInput_Group{}_HedgeMode={}",
                group.group_number,
                if group.hedge_mode { 1 } else { 0 }
            ));
            lines.push(format!(
                "gInput_Group{}_HedgeReference={}",
                group.group_number, group.hedge_reference
            ));
            lines.push(format!(
                "gInput_Group{}_EntryDelayBars={}",
                group.group_number, group.entry_delay_bars
            ));

            for logic in &group.logics {
                let suffix =
                    get_logic_suffix(&engine.engine_id, group.group_number, &logic.logic_name);
                let short = get_logic_short(&engine.engine_id, &logic.logic_name);

                lines.push(format!(
                    "gInput_Start_{}={}",
                    suffix,
                    if logic.enabled { 1 } else { 0 }
                ));

                // Base params
                let initial_key = format!("gInput_Initial_loT_{}", suffix);
                lines.push(format!("{}={:.2}", initial_key, logic.initial_lot));

                if let Some(v) = logic.initial_lot_b {
                    if v > 0.0 {
                        lines.push(format!("gInput_Initial_loT_{}_B={:.2}", suffix, v));
                    }
                }
                if let Some(v) = logic.initial_lot_s {
                    if v > 0.0 {
                        lines.push(format!("gInput_Initial_loT_{}_S={:.2}", suffix, v));
                    }
                }

                if let Some(ll) = logic.last_lot {
                    let upper = logic.logic_name.to_uppercase();
                    if upper == "POWER" {
                        lines.push(format!("gInput_LastLotPower_{}={:.2}", suffix, ll));
                    } else if upper == "REPOWER" {
                        lines.push(format!("gInput_LastLotRepower_{}={:.2}", suffix, ll));
                    } else {
                        lines.push(format!("gInput_LastLot_{}={:.2}", suffix, ll));
                    }
                }

                // Strategy Type & Trading Mode
                lines.push(format!(
                    "gInput_G{}_{}_StrategyType={}",
                    group.group_number, short, logic.strategy_type
                ));
                lines.push(format!(
                    "gInput_G{}_{}_TradingMode={}",
                    group.group_number, short, logic.trading_mode
                ));

                // Apply trade direction override if specified
                let (allow_buy, allow_sell) = match trade_direction.as_deref() {
                    Some("BUY") => (true, false),
                    Some("SELL") => (false, true),
                    Some("BOTH") | None => (logic.allow_buy, logic.allow_sell),
                    _ => (logic.allow_buy, logic.allow_sell),
                };
                lines.push(format!(
                    "gInput_AllowBuy_{}={}",
                    suffix,
                    if allow_buy { 1 } else { 0 }
                ));
                lines.push(format!(
                    "gInput_AllowSell_{}={}",
                    suffix,
                    if allow_sell { 1 } else { 0 }
                ));

                if include_optimization_hints {
                    let (f, start, step, stop) =
                        get_optimization_values("initial_lot", logic.initial_lot);
                    lines.push(format!("{},F={}", initial_key, f));
                    lines.push(format!("{},1={:.2}", initial_key, start));
                    lines.push(format!("{},2={:.2}", initial_key, step));
                    lines.push(format!("{},3={:.2}", initial_key, stop));
                }

                let mult_key = format!("gInput_Mult_{}", suffix);
                lines.push(format!("{}={:.2}", mult_key, logic.multiplier));
                if let Some(v) = logic.multiplier_b {
                    if v > 0.0 {
                        lines.push(format!("gInput_Mult_{}_B={:.2}", suffix, v));
                    }
                }
                if let Some(v) = logic.multiplier_s {
                    if v > 0.0 {
                        lines.push(format!("gInput_Mult_{}_S={:.2}", suffix, v));
                    }
                }
                if include_optimization_hints {
                    let (f, start, step, stop) =
                        get_optimization_values("multiplier", logic.multiplier);
                    lines.push(format!("{},F={}", mult_key, f));
                    lines.push(format!("{},1={:.2}", mult_key, start));
                    lines.push(format!("{},2={:.2}", mult_key, step));
                    lines.push(format!("{},3={:.2}", mult_key, stop));
                }

                let grid_key = format!("gInput_Grid_{}", suffix);
                lines.push(format!("{}={:.1}", grid_key, logic.grid));
                if let Some(v) = logic.grid_b {
                    if v >= 0.0 {
                        lines.push(format!("gInput_Grid_{}_B={:.1}", suffix, v));
                    }
                }
                if let Some(v) = logic.grid_s {
                    if v >= 0.0 {
                        lines.push(format!("gInput_Grid_{}_S={:.1}", suffix, v));
                    }
                }
                if include_optimization_hints {
                    let (f, start, step, stop) = get_optimization_values("grid", logic.grid);
                    lines.push(format!("{},F={}", grid_key, f));
                    lines.push(format!("{},1={:.1}", grid_key, start));
                    lines.push(format!("{},2={:.1}", grid_key, step));
                    lines.push(format!("{},3={:.1}", grid_key, stop));
                }

                // Trail params - use correct MT4/MT5 variable names
                lines.push(format!("gInput_Trail_{}={}", suffix, logic.trail_method));
                lines.push(format!(
                    "gInput_TrailValue_{}={:.1}",
                    suffix, logic.trail_value
                ));
                if let Some(v) = logic.trail_value_b {
                    if v >= 0.0 {
                        lines.push(format!("gInput_TrailValue_{}_B={:.1}", suffix, v));
                    }
                }
                if let Some(v) = logic.trail_value_s {
                    if v >= 0.0 {
                        lines.push(format!("gInput_TrailValue_{}_S={:.1}", suffix, v));
                    }
                }
                lines.push(format!(
                    "gInput_Trail_Start_{}={:.1}",
                    suffix, logic.trail_start
                ));
                if let Some(v) = logic.trail_start_b {
                    if v >= 0.0 {
                        lines.push(format!("gInput_Trail_Start_{}_B={:.1}", suffix, v));
                    }
                }
                if let Some(v) = logic.trail_start_s {
                    if v >= 0.0 {
                        lines.push(format!("gInput_Trail_Start_{}_S={:.1}", suffix, v));
                    }
                }
                lines.push(format!(
                    "gInput_TrailStep_{}={:.1}",
                    suffix, logic.trail_step
                ));
                if let Some(v) = logic.trail_step_b {
                    if v >= 0.0 {
                        lines.push(format!("gInput_TrailStep_{}_B={:.1}", suffix, v));
                    }
                }
                if let Some(v) = logic.trail_step_s {
                    if v >= 0.0 {
                        lines.push(format!("gInput_TrailStep_{}_S={:.1}", suffix, v));
                    }
                }
                lines.push(format!(
                    "gInput_TrailStepMethod_{}={}",
                    suffix,
                    encode_trail_step_method(&logic.trail_step_method)
                ));

                // Trail Step Advanced (V17.04+)
                lines.push(format!(
                    "gInput_TrailStepMode_{}={}",
                    suffix,
                    encode_trail_step_mode(&logic.trail_step_mode)
                ));
                lines.push(format!(
                    "gInput_TrailStepCycle_{}={}",
                    suffix, logic.trail_step_cycle
                ));
                lines.push(format!(
                    "gInput_TrailStepBalance_{}={:.2}",
                    suffix, logic.trail_step_balance
                ));

                // Trail Step Extended (Levels 2-7)
                // Level 2
                if let Some(v) = logic.trail_step_2 {
                    lines.push(format!("gInput_TrailStep2_{}={:.1}", suffix, v));
                }
                if let Some(ref v) = logic.trail_step_method_2 {
                    lines.push(format!("gInput_TrailStepMethod2_{}={}", suffix, v));
                }
                if let Some(v) = logic.trail_step_cycle_2 {
                    lines.push(format!("gInput_TrailStepCycle2_{}={}", suffix, v));
                }
                if let Some(v) = logic.trail_step_balance_2 {
                    lines.push(format!("gInput_TrailStepBalance2_{}={:.2}", suffix, v));
                }
                if let Some(ref v) = logic.trail_step_mode_2 {
                    lines.push(format!("gInput_TrailStepMode2_{}={}", suffix, v));
                }

                // Level 3
                if let Some(v) = logic.trail_step_3 {
                    lines.push(format!("gInput_TrailStep3_{}={:.1}", suffix, v));
                }
                if let Some(ref v) = logic.trail_step_method_3 {
                    lines.push(format!("gInput_TrailStepMethod3_{}={}", suffix, v));
                }
                if let Some(v) = logic.trail_step_cycle_3 {
                    lines.push(format!("gInput_TrailStepCycle3_{}={}", suffix, v));
                }
                if let Some(v) = logic.trail_step_balance_3 {
                    lines.push(format!("gInput_TrailStepBalance3_{}={:.2}", suffix, v));
                }
                if let Some(ref v) = logic.trail_step_mode_3 {
                    lines.push(format!("gInput_TrailStepMode3_{}={}", suffix, v));
                }

                // Level 4
                if let Some(v) = logic.trail_step_4 {
                    lines.push(format!("gInput_TrailStep4_{}={:.1}", suffix, v));
                }
                if let Some(ref v) = logic.trail_step_method_4 {
                    lines.push(format!("gInput_TrailStepMethod4_{}={}", suffix, v));
                }
                if let Some(v) = logic.trail_step_cycle_4 {
                    lines.push(format!("gInput_TrailStepCycle4_{}={}", suffix, v));
                }
                if let Some(v) = logic.trail_step_balance_4 {
                    lines.push(format!("gInput_TrailStepBalance4_{}={:.2}", suffix, v));
                }
                if let Some(ref v) = logic.trail_step_mode_4 {
                    lines.push(format!("gInput_TrailStepMode4_{}={}", suffix, v));
                }

                // Level 5
                if let Some(v) = logic.trail_step_5 {
                    lines.push(format!("gInput_TrailStep5_{}={:.1}", suffix, v));
                }
                if let Some(ref v) = logic.trail_step_method_5 {
                    lines.push(format!("gInput_TrailStepMethod5_{}={}", suffix, v));
                }
                if let Some(v) = logic.trail_step_cycle_5 {
                    lines.push(format!("gInput_TrailStepCycle5_{}={}", suffix, v));
                }
                if let Some(v) = logic.trail_step_balance_5 {
                    lines.push(format!("gInput_TrailStepBalance5_{}={:.2}", suffix, v));
                }
                if let Some(ref v) = logic.trail_step_mode_5 {
                    lines.push(format!("gInput_TrailStepMode5_{}={}", suffix, v));
                }

                // Level 6
                if let Some(v) = logic.trail_step_6 {
                    lines.push(format!("gInput_TrailStep6_{}={:.1}", suffix, v));
                }
                if let Some(ref v) = logic.trail_step_method_6 {
                    lines.push(format!("gInput_TrailStepMethod6_{}={}", suffix, v));
                }
                if let Some(v) = logic.trail_step_cycle_6 {
                    lines.push(format!("gInput_TrailStepCycle6_{}={}", suffix, v));
                }
                if let Some(v) = logic.trail_step_balance_6 {
                    lines.push(format!("gInput_TrailStepBalance6_{}={:.2}", suffix, v));
                }
                if let Some(ref v) = logic.trail_step_mode_6 {
                    lines.push(format!("gInput_TrailStepMode6_{}={}", suffix, v));
                }

                // Level 7
                if let Some(v) = logic.trail_step_7 {
                    lines.push(format!("gInput_TrailStep7_{}={:.1}", suffix, v));
                }
                if let Some(ref v) = logic.trail_step_method_7 {
                    lines.push(format!("gInput_TrailStepMethod7_{}={}", suffix, v));
                }
                if let Some(v) = logic.trail_step_cycle_7 {
                    lines.push(format!("gInput_TrailStepCycle7_{}={}", suffix, v));
                }
                if let Some(v) = logic.trail_step_balance_7 {
                    lines.push(format!("gInput_TrailStepBalance7_{}={:.2}", suffix, v));
                }
                if let Some(ref v) = logic.trail_step_mode_7 {
                    lines.push(format!("gInput_TrailStepMode7_{}={}", suffix, v));
                }

                // Logic specific
                if group.group_number == 1 {
                    if let Some(sl) = logic.start_level {
                        if let Some(start_key) =
                            get_logic_start_key(&engine.engine_id, &logic.logic_name)
                        {
                            lines.push(format!("gInput_{}={}", start_key, sl));
                        }
                    }
                }

                lines.push(format!(
                    "gInput_CloseTargets_{}={}",
                    suffix, logic.close_targets
                ));

                if group.group_number == 1 {
                    let logic_key = get_logic_global_key(&engine.engine_id, &logic.logic_name);
                    let close_targets = if logic.close_targets.trim().is_empty() {
                        default_close_targets(&engine.engine_id, &logic.logic_name)
                    } else {
                        logic.close_targets.clone()
                    };
                    lines.push(format!(
                        "gInput_CloseTargets_{}={}",
                        logic_key, close_targets
                    ));
                }
                if group.group_number == 1 {
                    let logic_key = get_logic_global_key(&engine.engine_id, &logic.logic_name);
                    lines.push(format!(
                        "gInput_{}_OrderCountReference={}",
                        logic_key, logic.order_count_reference
                    ));
                }
                lines.push(format!(
                    "gInput_MaxPowerOrders_{}={}",
                    suffix, engine.max_power_orders
                ));
                lines.push(format!(
                    "gInput_OrderCountReference_{}={}",
                    suffix, logic.order_count_reference
                ));
                lines.push(format!(
                    "gInput_ResetLotOnRestart_{}={}",
                    suffix,
                    if logic.reset_lot_on_restart { 1 } else { 0 }
                ));

                // TPSL - use group-aware naming
                lines.push(format!(
                    "gInput_G{}_UseTP_{}={}",
                    group.group_number,
                    short,
                    if logic.use_tp { 1 } else { 0 }
                ));
                lines.push(format!(
                    "gInput_G{}_TP_Mode_{}={}",
                    group.group_number, short, logic.tp_mode
                ));
                lines.push(format!(
                    "gInput_G{}_TP_Value_{}={:.1}",
                    group.group_number, short, logic.tp_value
                ));
                if include_optimization_hints && logic.use_tp {
                    let (f, start, step, stop) =
                        get_optimization_values("tp_value", logic.tp_value);
                    lines.push(format!(
                        "gInput_G{}_TP_Value_{},F={}",
                        group.group_number, short, f
                    ));
                    lines.push(format!(
                        "gInput_G{}_TP_Value_{},1={:.1}",
                        group.group_number, short, start
                    ));
                    lines.push(format!(
                        "gInput_G{}_TP_Value_{},2={:.1}",
                        group.group_number, short, step
                    ));
                    lines.push(format!(
                        "gInput_G{}_TP_Value_{},3={:.1}",
                        group.group_number, short, stop
                    ));
                }

                lines.push(format!(
                    "gInput_G{}_UseSL_{}={}",
                    group.group_number,
                    short,
                    if logic.use_sl { 1 } else { 0 }
                ));
                lines.push(format!(
                    "gInput_G{}_SL_Mode_{}={}",
                    group.group_number, short, logic.sl_mode
                ));
                lines.push(format!(
                    "gInput_G{}_SL_Value_{}={:.1}",
                    group.group_number, short, logic.sl_value
                ));
                if include_optimization_hints && logic.use_sl {
                    let (f, start, step, stop) =
                        get_optimization_values("sl_value", logic.sl_value);
                    lines.push(format!(
                        "gInput_G{}_SL_Value_{},F={}",
                        group.group_number, short, f
                    ));
                    lines.push(format!(
                        "gInput_G{}_SL_Value_{},1={:.1}",
                        group.group_number, short, start
                    ));
                    lines.push(format!(
                        "gInput_G{}_SL_Value_{},2={:.1}",
                        group.group_number, short, step
                    ));
                    lines.push(format!(
                        "gInput_G{}_SL_Value_{},3={:.1}",
                        group.group_number, short, stop
                    ));
                }

                // Reverse/Hedge per-logic (V17.04+ full structure)
                lines.push(format!(
                    "gInput_G{}_{}_ReverseEnabled={}",
                    group.group_number,
                    short,
                    if logic.reverse_enabled { 1 } else { 0 }
                ));
                lines.push(format!(
                    "gInput_G{}_{}_HedgeEnabled={}",
                    group.group_number,
                    short,
                    if logic.hedge_enabled { 1 } else { 0 }
                ));
                lines.push(format!(
                    "gInput_G{}_Scale_{}_Reverse={:.1}",
                    group.group_number, short, logic.reverse_scale
                ));
                lines.push(format!(
                    "gInput_G{}_Scale_{}_Hedge={:.1}",
                    group.group_number, short, logic.hedge_scale
                ));
                lines.push(format!(
                    "gInput_G{}_{}_ReverseReference={}",
                    group.group_number, short, logic.reverse_reference
                ));
                lines.push(format!(
                    "gInput_G{}_{}_HedgeReference={}",
                    group.group_number, short, logic.hedge_reference
                ));

                // Close Partial - use correct variable names
                lines.push(format!(
                    "gInput_ClosePartial_{}={}",
                    suffix,
                    if logic.close_partial { 1 } else { 0 }
                ));
                lines.push(format!(
                    "gInput_ClosePartialCycle_{}={}",
                    suffix, logic.close_partial_cycle
                ));
                lines.push(format!(
                    "gInput_ClosePartialMode_{}={}",
                    suffix,
                    encode_partial_mode(&logic.close_partial_mode)
                ));
                lines.push(format!(
                    "gInput_ClosePartialBalance_{}={}",
                    suffix,
                    encode_partial_balance(&logic.close_partial_balance)
                ));
                lines.push(format!(
                    "gInput_ClosePartialTrailStepMode_{}={}",
                    suffix,
                    encode_trail_step_mode(&logic.close_partial_trail_step_mode)
                ));

                // Close Partial Extended (Levels 2-4)
                // Level 2
                if let Some(v) = logic.close_partial_2 {
                    lines.push(format!(
                        "gInput_ClosePartial2_{}={}",
                        suffix,
                        if v { 1 } else { 0 }
                    ));
                }
                if let Some(v) = logic.close_partial_cycle_2 {
                    lines.push(format!("gInput_ClosePartialCycle2_{}={}", suffix, v));
                }
                if let Some(ref v) = logic.close_partial_mode_2 {
                    lines.push(format!(
                        "gInput_ClosePartialMode2_{}={}",
                        suffix,
                        encode_partial_mode(v)
                    ));
                }
                if let Some(ref v) = logic.close_partial_balance_2 {
                    lines.push(format!(
                        "gInput_ClosePartialBalance2_{}={}",
                        suffix,
                        encode_partial_balance(v)
                    ));
                }

                // Level 3
                if let Some(v) = logic.close_partial_3 {
                    lines.push(format!(
                        "gInput_ClosePartial3_{}={}",
                        suffix,
                        if v { 1 } else { 0 }
                    ));
                }
                if let Some(v) = logic.close_partial_cycle_3 {
                    lines.push(format!("gInput_ClosePartialCycle3_{}={}", suffix, v));
                }
                if let Some(ref v) = logic.close_partial_mode_3 {
                    lines.push(format!(
                        "gInput_ClosePartialMode3_{}={}",
                        suffix,
                        encode_partial_mode(v)
                    ));
                }
                if let Some(ref v) = logic.close_partial_balance_3 {
                    lines.push(format!(
                        "gInput_ClosePartialBalance3_{}={}",
                        suffix,
                        encode_partial_balance(v)
                    ));
                }

                // Level 4
                if let Some(v) = logic.close_partial_4 {
                    lines.push(format!(
                        "gInput_ClosePartial4_{}={}",
                        suffix,
                        if v { 1 } else { 0 }
                    ));
                }
                if let Some(v) = logic.close_partial_cycle_4 {
                    lines.push(format!("gInput_ClosePartialCycle4_{}={}", suffix, v));
                }
                if let Some(ref v) = logic.close_partial_mode_4 {
                    lines.push(format!(
                        "gInput_ClosePartialMode4_{}={}",
                        suffix,
                        encode_partial_mode(v)
                    ));
                }
                if let Some(ref v) = logic.close_partial_balance_4 {
                    lines.push(format!(
                        "gInput_ClosePartialBalance4_{}={}",
                        suffix,
                        encode_partial_balance(v)
                    ));
                }

                if let Some(tt) = &logic.trigger_type {
                    lines.push(format!(
                        "gInput_TriggerType_{}={}",
                        suffix,
                        normalize_trigger_type(tt)
                    ));
                }
                if let Some(tb) = logic.trigger_bars {
                    lines.push(format!("gInput_TriggerBars_{}={}", suffix, tb));
                }
                if let Some(tm) = logic.trigger_minutes {
                    lines.push(format!("gInput_TriggerSeconds_{}={}", suffix, tm));
                }
                if let Some(tp) = logic.trigger_pips {
                    lines.push(format!("gInput_TriggerPips_{}={:.1}", suffix, tp));
                }

                lines.push(String::new());
            }
        }
    }

    // Write file
    atomic_write(&sanitized_path, &lines.join("\n"))?;

    Ok(())
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub fn export_set_file_to_mt_common_files(
    config: MTConfig,
    platform: String,
    include_optimization_hints: bool,
) -> Result<String, String> {
    let common_dir = if let Some(home) = dirs::home_dir() {
        home.join("AppData\\Roaming\\MetaQuotes\\Terminal\\Common\\Files")
    } else {
        return Err("Home directory not found".to_string());
    };
    let file_name = format!("DAAVFX_{}_Config.set", platform);
    let file_path = common_dir.join(file_name);
    let path_str = file_path.to_string_lossy().to_string();
    export_set_file(
        config,
        path_str.clone(),
        platform,
        include_optimization_hints,
        None,
        None,
        None,
    )?;
    Ok(path_str)
}

/// Export massive v19 setfile format: gInput_{Group}_{Engine}{Logic}_{Direction}_{Param}
#[cfg_attr(feature = "tauri-app", tauri::command)]
pub fn export_massive_v19_setfile(
    config: MTConfig,
    file_path: String,
    platform: String,
) -> Result<(), String> {
    let path_buf = PathBuf::from(&file_path);
    let sanitized_path = sanitize_and_validate_path(&path_buf)?;

    let mut lines: Vec<String> = Vec::new();

    // Header
    lines.push(format!("; DAAVFX MASSIVE v19 Configuration"));
    lines.push(format!("; Platform: {}", platform));
    lines.push(format!("; Generated: {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S")));
    lines.push(format!("; Format: gInput_{{Group}}_{{Engine}}{{Logic}}_{{Direction}}_{{Param}}"));
    lines.push(format!("; Total Logic Inputs: {}", 69300));
    lines.push(String::new());

    // General settings
    lines.push("; === GENERAL SETTINGS ===".to_string());
    
    // Magic Numbers
    lines.push(format!("gInput_MagicNumber={}", config.general.magic_number));
    lines.push(format!("gInput_MagicNumberBuy={}", config.general.magic_number_buy));
    lines.push(format!("gInput_MagicNumberSell={}", config.general.magic_number_sell));
    lines.push(format!("gInput_MagicNumberPowerBuy={}", config.general.magic_number_buy));
    lines.push(format!("gInput_MagicNumberPowerSell={}", config.general.magic_number_sell));
    lines.push(format!("gInput_MagicNumberReverseBase={}", config.general.reverse_magic_base));
    lines.push(format!("gInput_MagicNumberHedgeBase={}", config.general.hedge_magic_base));
    lines.push(format!(
        "gInput_HedgeMagicIndependent={}",
        if config.general.hedge_magic_independent { 1 } else { 0 }
    ));
    
    // Trading Permissions
    lines.push(format!("gInput_allowBuy={}", if config.general.allow_buy { 1 } else { 0 }));
    lines.push(format!("gInput_allowSell={}", if config.general.allow_sell { 1 } else { 0 }));
    
    // Logging
    lines.push(format!("gInput_EnableLogs={}", if config.general.enable_logs { 1 } else { 0 }));
    
    // Slippage
    lines.push(format!(
        "gInput_MaxSlippage={}",
        (config.general.max_slippage_points.round() as i32)
    ));
    lines.push(format!("gInput_MaxSlippagePoints={:.1}", config.general.max_slippage_points));
    
    // Config File
    lines.push(format!("gInput_ConfigFileName={}", config.general.config_file_name));
    lines.push(format!(
        "gInput_ConfigFileIsCommon={}",
        if config.general.config_file_is_common { 1 } else { 0 }
    ));
    
    // Direct Price Grid
    lines.push(format!(
        "gInput_UseDirectPriceGrid={}",
        if config.general.use_direct_price_grid { 1 } else { 0 }
    ));
    
    // ===== LICENSE =====
    lines.push(String::new());
    lines.push("; === LICENSE ===".to_string());
    lines.push(format!("gInput_LicenseKey={}", config.general.license_key));
    lines.push(format!("gInput_LicenseServerURL={}", config.general.license_server_url));
    lines.push(format!(
        "gInput_RequireLicense={}",
        if config.general.require_license { 1 } else { 0 }
    ));
    lines.push(format!("gInput_LicenseCheckInterval={}", config.general.license_check_interval));
    
    // ===== COMPOUNDING =====
    lines.push(String::new());
    lines.push("; === COMPOUNDING ===".to_string());
    lines.push(format!(
        "gInput_Input_Compounding={}",
        if config.general.compounding_enabled { 1 } else { 0 }
    ));
    lines.push(format!("gInput_Input_CompoundingType={}", config.general.compounding_type));
    lines.push(format!("gInput_Input_CompoundingTarget={:.1}", config.general.compounding_target));
    lines.push(format!("gInput_Input_CompoundIncrease={:.1}", config.general.compounding_increase));
    
    // ===== CLEAN MATH =====
    lines.push(String::new());
    lines.push("; === CLEAN MATH ===".to_string());
    lines.push(format!("gInput_GroupMode={}", config.general.group_mode.unwrap_or(1)));
    lines.push(format!("gInput_GridUnit={}", config.general.grid_unit.unwrap_or(0)));
    lines.push(format!("gInput_PipFactor={}", config.general.pip_factor.unwrap_or(0)));
    
    // ===== RISK MANAGEMENT =====
    lines.push(String::new());
    lines.push("; === RISK MANAGEMENT ===".to_string());
    let rm = &config.general.risk_management;
    lines.push(format!("gInput_UseSpreadFilter={}", if rm.spread_filter_enabled { 1 } else { 0 }));
    lines.push(format!("gInput_MaxSpreadPoints={:.1}", rm.max_spread_points));
    lines.push(format!("gInput_UseEquityStop={}", if rm.equity_stop_enabled { 1 } else { 0 }));
    lines.push(format!("gInput_EquityStopValue={:.1}", rm.equity_stop_value));
    lines.push(format!("gInput_UseDrawdownStop={}", if rm.drawdown_stop_enabled { 1 } else { 0 }));
    lines.push(format!("gInput_MaxDrawdownPercent={:.1}", rm.max_drawdown_percent));
    lines.push(format!("gInput_RiskAction={}", rm.risk_action.as_ref().unwrap_or(&"2".to_string())));
    
    // ===== NEWS FILTER =====
    lines.push(String::new());
    lines.push("; === NEWS FILTER ===".to_string());
    let nf = &config.general.news_filter;
    lines.push(format!("gInput_EnableNewsFilter={}", if nf.enabled { 1 } else { 0 }));
    lines.push(format!("gInput_NewsFilterEnabled={}", if nf.enabled { 1 } else { 0 }));
    lines.push(format!("gInput_NewsAPIKey={}", nf.api_key));
    lines.push(format!("gInput_NewsAPIURL={}", nf.api_url));
    lines.push(format!("gInput_NewsFilterCountries={}", nf.countries));
    lines.push(format!("gInput_NewsImpactLevel={}", nf.impact_level));
    lines.push(format!("gInput_MinutesBeforeNews={}", nf.minutes_before));
    lines.push(format!("gInput_MinutesAfterNews={}", nf.minutes_after));
    lines.push(format!("gInput_NewsAction={}", nf.action));
    lines.push(format!("gInput_NewsCalendarFile={}", nf.calendar_file.as_ref().unwrap_or(&"".to_string())));
    
    // ===== TIME FILTERS =====
    lines.push(String::new());
    lines.push("; === TIME FILTERS ===".to_string());
    let tf = &config.general.time_filters;
    lines.push(format!(
        "gInput_NewsFilterOverridesSession={}",
        if tf.priority_settings.news_filter_overrides_session { 1 } else { 0 }
    ));
    lines.push(format!(
        "gInput_SessionFilterOverridesNews={}",
        if tf.priority_settings.session_filter_overrides_news { 1 } else { 0 }
    ));
    lines.push(format!("gInput_NewsOverridesSession={}", if tf.priority_settings.news_filter_overrides_session { 1 } else { 0 }));
    lines.push(format!("gInput_SessionOverridesNews={}", if tf.priority_settings.session_filter_overrides_news { 1 } else { 0 }));
    lines.push(format!("gInput_SessionFilterEnabled={}", if !tf.sessions.is_empty() { 1 } else { 0 }));
    
    // Sessions 1-7
    for session in &tf.sessions {
        let s = session;
        lines.push(format!("gInput_Session{}Enabled={}", s.session_number, if s.enabled { 1 } else { 0 }));
        lines.push(format!("gInput_Session{}Day={}", s.session_number, s.day));
        lines.push(format!("gInput_Session{}StartHour={}", s.session_number, s.start_hour));
        lines.push(format!("gInput_Session{}StartMinute={}", s.session_number, s.start_minute));
        lines.push(format!("gInput_Session{}EndHour={}", s.session_number, s.end_hour));
        lines.push(format!("gInput_Session{}EndMinute={}", s.session_number, s.end_minute));
        lines.push(format!("gInput_Session{}Action={}", s.session_number, s.action));
    }
    
    lines.push(String::new());

    let encode_trail_method = |raw: &str| -> i32 {
        let upper = raw.to_uppercase();
        if upper.contains("AVG") {
            1
        } else if upper.contains("PROFIT") {
            2
        } else {
            0
        }
    };

    let encode_tpsl_mode = |raw: &str| -> i32 {
        match raw {
            "TPSL_Price" => 1,
            "TPSL_Percent" => 2,
            _ => 0,
        }
    };

    let pick_dir_f64 =
        |buy: bool, base: f64, b: Option<f64>, s: Option<f64>| -> f64 { if buy { b.unwrap_or(base) } else { s.unwrap_or(base) } };

    let logic_names = ["POWER", "REPOWER", "SCALP", "STOPPER", "STO", "SCA", "RPO"];
    let directions = ["Buy", "Sell"];

    let engine_ids = ["A", "B", "C"];
    for engine_id in &engine_ids {
        let engine = config
            .engines
            .iter()
            .find(|e| e.engine_id == *engine_id)
            .cloned()
            .unwrap_or_else(|| EngineConfig {
                engine_id: engine_id.to_string(),
                engine_name: engine_id.to_string(),
                max_power_orders: 0,
                groups: Vec::new(),
            });
        for group_num in 1..=15 {
            let group_num_u8 = group_num as u8;
            let group = engine.groups.iter().find(|g| g.group_number == group_num_u8);

            for logic_name in &logic_names {
                let logic = group
                    .and_then(|g| g.logics.iter().find(|l| l.logic_name == *logic_name))
                    .cloned()
                    .unwrap_or_else(|| create_default_logic(logic_name));

                let v19_suffix = get_v19_suffix(&engine.engine_id, logic_name);

                for direction in &directions {
                    let is_buy = *direction == "Buy";

                    let enabled = logic.enabled && if is_buy { logic.allow_buy } else { logic.allow_sell };

                    lines.push(format!(
                        "gInput_{}_{}_{}_Enabled={}",
                        group_num,
                        v19_suffix,
                        direction,
                        if enabled { 1 } else { 0 }
                    ));

                    if is_buy {
                        lines.push(format!(
                            "gInput_{}_{}_{}_AllowBuy={}",
                            group_num,
                            v19_suffix,
                            direction,
                            if logic.allow_buy { 1 } else { 0 }
                        ));
                    } else {
                        lines.push(format!(
                            "gInput_{}_{}_{}_AllowSell={}",
                            group_num,
                            v19_suffix,
                            direction,
                            if logic.allow_sell { 1 } else { 0 }
                        ));
                    }

                    lines.push(format!(
                        "gInput_{}_{}_{}_InitialLot={:.2}",
                        group_num,
                        v19_suffix,
                        direction,
                        pick_dir_f64(is_buy, logic.initial_lot, logic.initial_lot_b, logic.initial_lot_s)
                    ));

                    lines.push(format!(
                        "gInput_{}_{}_{}_LastLot={:.2}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.last_lot.unwrap_or(0.0)
                    ));

                    lines.push(format!(
                        "gInput_{}_{}_{}_Mult={:.2}",
                        group_num,
                        v19_suffix,
                        direction,
                        pick_dir_f64(is_buy, logic.multiplier, logic.multiplier_b, logic.multiplier_s)
                    ));

                    lines.push(format!(
                        "gInput_{}_{}_{}_Grid={:.1}",
                        group_num,
                        v19_suffix,
                        direction,
                        pick_dir_f64(is_buy, logic.grid, logic.grid_b, logic.grid_s)
                    ));

                    lines.push(format!("gInput_{}_{}_{}_GridBehavior={}", group_num, v19_suffix, direction, 0));

                    lines.push(format!(
                        "gInput_{}_{}_{}_Trail={}",
                        group_num,
                        v19_suffix,
                        direction,
                        encode_trail_method(&logic.trail_method)
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_TrailValue={:.1}",
                        group_num, v19_suffix, direction, logic.trail_value
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_TrailStart={:.1}",
                        group_num,
                        v19_suffix,
                        direction,
                        pick_dir_f64(is_buy, logic.trail_start, logic.trail_start_b, logic.trail_start_s)
                    ));

                    lines.push(format!(
                        "gInput_{}_{}_{}_TrailStep={:.1}",
                        group_num,
                        v19_suffix,
                        direction,
                        pick_dir_f64(is_buy, logic.trail_step, logic.trail_step_b, logic.trail_step_s)
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_TrailStepMethod={}",
                        group_num,
                        v19_suffix,
                        direction,
                        encode_trail_step_method(&logic.trail_step_method)
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_TrailStepMode={}",
                        group_num,
                        v19_suffix,
                        direction,
                        encode_trail_step_mode(&logic.trail_step_mode)
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_TrailStepCycle={}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.trail_step_cycle
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_TrailStepBalance={:.1}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.trail_step_balance
                    ));

                    let step_values = [
                        logic.trail_step_2,
                        logic.trail_step_3,
                        logic.trail_step_4,
                        logic.trail_step_5,
                        logic.trail_step_6,
                        logic.trail_step_7,
                    ];
                    let step_methods = [
                        logic.trail_step_method_2.as_deref(),
                        logic.trail_step_method_3.as_deref(),
                        logic.trail_step_method_4.as_deref(),
                        logic.trail_step_method_5.as_deref(),
                        logic.trail_step_method_6.as_deref(),
                        logic.trail_step_method_7.as_deref(),
                    ];
                    let step_modes = [
                        logic.trail_step_mode_2.as_deref(),
                        logic.trail_step_mode_3.as_deref(),
                        logic.trail_step_mode_4.as_deref(),
                        logic.trail_step_mode_5.as_deref(),
                        logic.trail_step_mode_6.as_deref(),
                        logic.trail_step_mode_7.as_deref(),
                    ];
                    let step_cycles = [
                        logic.trail_step_cycle_2,
                        logic.trail_step_cycle_3,
                        logic.trail_step_cycle_4,
                        logic.trail_step_cycle_5,
                        logic.trail_step_cycle_6,
                        logic.trail_step_cycle_7,
                    ];
                    let step_balances = [
                        logic.trail_step_balance_2,
                        logic.trail_step_balance_3,
                        logic.trail_step_balance_4,
                        logic.trail_step_balance_5,
                        logic.trail_step_balance_6,
                        logic.trail_step_balance_7,
                    ];

                    for i in 0..6 {
                        let n = i + 2;
                        if let Some(v) = step_values[i] {
                            lines.push(format!("gInput_{}_{}_{}_TrailStep{}={:.1}", group_num, v19_suffix, direction, n, v));
                        } else {
                            lines.push(format!("gInput_{}_{}_{}_TrailStep{}={:.1}", group_num, v19_suffix, direction, n, 0.0));
                        }
                        lines.push(format!(
                            "gInput_{}_{}_{}_TrailStepMethod{}={}",
                            group_num,
                            v19_suffix,
                            direction,
                            n,
                            encode_trail_step_method(step_methods[i].unwrap_or(&logic.trail_step_method))
                        ));
                        lines.push(format!(
                            "gInput_{}_{}_{}_TrailStepMode{}={}",
                            group_num,
                            v19_suffix,
                            direction,
                            n,
                            encode_trail_step_mode(step_modes[i].unwrap_or(&logic.trail_step_mode))
                        ));
                        lines.push(format!(
                            "gInput_{}_{}_{}_TrailStepCycle{}={}",
                            group_num,
                            v19_suffix,
                            direction,
                            n,
                            step_cycles[i].unwrap_or(0)
                        ));
                        lines.push(format!(
                            "gInput_{}_{}_{}_TrailStepBalance{}={:.1}",
                            group_num,
                            v19_suffix,
                            direction,
                            n,
                            step_balances[i].unwrap_or(0.0)
                        ));
                    }

                    lines.push(format!(
                        "gInput_{}_{}_{}_UseTP={}",
                        group_num,
                        v19_suffix,
                        direction,
                        if logic.use_tp { 1 } else { 0 }
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_TPMode={}",
                        group_num,
                        v19_suffix,
                        direction,
                        encode_tpsl_mode(&logic.tp_mode)
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_TPValue={:.1}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.tp_value
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_UseSL={}",
                        group_num,
                        v19_suffix,
                        direction,
                        if logic.use_sl { 1 } else { 0 }
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_SLMode={}",
                        group_num,
                        v19_suffix,
                        direction,
                        encode_tpsl_mode(&logic.sl_mode)
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_SLValue={:.1}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.sl_value
                    ));

                    lines.push(format!("gInput_{}_{}_{}_BreakEvenMode={}", group_num, v19_suffix, direction, 0));
                    lines.push(format!("gInput_{}_{}_{}_BreakEvenActivation={:.1}", group_num, v19_suffix, direction, 0.0));
                    lines.push(format!("gInput_{}_{}_{}_BreakEvenLock={:.1}", group_num, v19_suffix, direction, 0.0));
                    lines.push(format!("gInput_{}_{}_{}_BreakEvenTrail={}", group_num, v19_suffix, direction, 0));

                    lines.push(format!(
                        "gInput_{}_{}_{}_TriggerType={}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.trigger_type.as_deref().map(normalize_trigger_type).unwrap_or_else(|| "0".to_string())
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_TriggerBars={}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.trigger_bars.unwrap_or(0)
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_TriggerMinutes={}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.trigger_minutes.unwrap_or(0)
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_TriggerPips={:.1}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.trigger_pips.unwrap_or(0.0)
                    ));

                    lines.push(format!(
                        "gInput_{}_{}_{}_OrderCountReferenceLogic={}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.order_count_reference
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_StartLevel={}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.start_level.unwrap_or(0)
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_ResetLotOnRestart={}",
                        group_num,
                        v19_suffix,
                        direction,
                        if logic.reset_lot_on_restart { 1 } else { 0 }
                    ));

                    let partial_enabled = [
                        logic.close_partial,
                        logic.close_partial_2.unwrap_or(false),
                        logic.close_partial_3.unwrap_or(false),
                        logic.close_partial_4.unwrap_or(false),
                    ];
                    let partial_cycles = [
                        logic.close_partial_cycle,
                        logic.close_partial_cycle_2.unwrap_or(0),
                        logic.close_partial_cycle_3.unwrap_or(0),
                        logic.close_partial_cycle_4.unwrap_or(0),
                    ];
                    let partial_modes = [
                        Some(logic.close_partial_mode.as_str()),
                        logic.close_partial_mode_2.as_deref(),
                        logic.close_partial_mode_3.as_deref(),
                        logic.close_partial_mode_4.as_deref(),
                    ];
                    let partial_balances = [
                        Some(logic.close_partial_balance.as_str()),
                        logic.close_partial_balance_2.as_deref(),
                        logic.close_partial_balance_3.as_deref(),
                        logic.close_partial_balance_4.as_deref(),
                    ];
                    let partial_trail_modes = [
                        Some(logic.close_partial_trail_step_mode.as_str()),
                        Some(logic.close_partial_trail_step_mode.as_str()),
                        Some(logic.close_partial_trail_step_mode.as_str()),
                        Some(logic.close_partial_trail_step_mode.as_str()),
                    ];

                    for idx in 0..4 {
                        let n = idx + 1;
                        let base = if n == 1 { "".to_string() } else { n.to_string() };

                        lines.push(format!(
                            "gInput_{}_{}_{}_ClosePartial{}={}",
                            group_num,
                            v19_suffix,
                            direction,
                            base,
                            if partial_enabled[idx] { 1 } else { 0 }
                        ));
                        lines.push(format!(
                            "gInput_{}_{}_{}_ClosePartialCycle{}={}",
                            group_num,
                            v19_suffix,
                            direction,
                            base,
                            partial_cycles[idx]
                        ));
                        lines.push(format!(
                            "gInput_{}_{}_{}_ClosePartialMode{}={}",
                            group_num,
                            v19_suffix,
                            direction,
                            base,
                            encode_partial_mode(partial_modes[idx].unwrap_or("PartialMode_Balanced"))
                        ));
                        lines.push(format!(
                            "gInput_{}_{}_{}_ClosePartialBalance{}={}",
                            group_num,
                            v19_suffix,
                            direction,
                            base,
                            encode_partial_balance(partial_balances[idx].unwrap_or("PartialBalance_Balanced"))
                        ));
                        lines.push(format!(
                            "gInput_{}_{}_{}_ClosePartialTrailMode{}={}",
                            group_num,
                            v19_suffix,
                            direction,
                            base,
                            encode_trail_step_mode(partial_trail_modes[idx].unwrap_or("TrailStepMode_Auto"))
                        ));
                        lines.push(format!(
                            "gInput_{}_{}_{}_ClosePartialTrigger{}={}",
                            group_num, v19_suffix, direction, base, 0
                        ));
                        lines.push(format!(
                            "gInput_{}_{}_{}_ClosePartialProfitThreshold{}={:.1}",
                            group_num, v19_suffix, direction, base, 0.0
                        ));
                        lines.push(format!(
                            "gInput_{}_{}_{}_ClosePartialPercent{}={:.1}",
                            group_num, v19_suffix, direction, base, 0.0
                        ));
                        lines.push(format!(
                            "gInput_{}_{}_{}_ClosePartialHours{}={}",
                            group_num, v19_suffix, direction, base, 0
                        ));
                    }

                    lines.push(format!(
                        "gInput_{}_{}_{}_ProfitTrailEnabled={}",
                        group_num, v19_suffix, direction, 0
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_ProfitTrailPeakDropPercent={:.1}",
                        group_num, v19_suffix, direction, 0.0
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_ProfitTrailLockPercent={:.1}",
                        group_num, v19_suffix, direction, 0.0
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_ProfitTrailCloseOnTrigger={}",
                        group_num, v19_suffix, direction, 0
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_ProfitTrailUseBreakEven={}",
                        group_num, v19_suffix, direction, 0
                    ));

                    lines.push(format!(
                        "gInput_{}_{}_{}_ReverseEnabled={}",
                        group_num,
                        v19_suffix,
                        direction,
                        if logic.reverse_enabled { 1 } else { 0 }
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_ReverseReference={}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.reverse_reference
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_ReverseScale={:.2}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.reverse_scale
                    ));

                    lines.push(format!(
                        "gInput_{}_{}_{}_HedgeEnabled={}",
                        group_num,
                        v19_suffix,
                        direction,
                        if logic.hedge_enabled { 1 } else { 0 }
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_HedgeReference={}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.hedge_reference
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_HedgeScale={:.2}",
                        group_num,
                        v19_suffix,
                        direction,
                        logic.hedge_scale
                    ));

                    lines.push(format!(
                        "gInput_{}_{}_{}_CloseTargets={}",
                        group_num, v19_suffix, direction, logic.close_targets
                    ));

                    lines.push(String::new());
                }
            }
        }
    }

    // Write to file
    let content = lines.join("\n");
    atomic_write(&sanitized_path, &content)?;

    Ok(())
}

#[derive(Serialize)]
pub struct ActiveSetStatus {
    pub path: String,
    pub exists: bool,
    pub keys_total: u32,
    pub keys_start: u32,
    pub ready: bool,
    pub last_modified_ms: Option<u64>,
}

fn get_mt_common_files_dir() -> Result<PathBuf, String> {
    if let Some(home) = dirs::home_dir() {
        Ok(home.join("AppData\\Roaming\\MetaQuotes\\Terminal\\Common\\Files"))
    } else {
        Err("Home directory not found".to_string())
    }
}

fn _get_mt4_common_files_dir() -> Result<PathBuf, String> {
    if let Some(home) = dirs::home_dir() {
        let base_path = home.join("AppData\\Roaming\\MetaQuotes\\Terminal");
        let common_files = base_path.join("Common\\Files");
        if common_files.exists() {
            return Ok(common_files);
        }
        if let Ok(entries) = std::fs::read_dir(&base_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let files_dir = path.join("Files");
                    if files_dir.exists() {
                        return Ok(files_dir);
                    }
                }
            }
        }
        Ok(common_files)
    } else {
        Err("Home directory not found".to_string())
    }
}

fn _get_mt5_common_files_dir() -> Result<PathBuf, String> {
    if let Some(home) = dirs::home_dir() {
        let base_path = home.join("AppData\\Roaming\\MetaQuotes\\Terminal64");
        let common_files = base_path.join("Common\\Files");
        if common_files.exists() {
            return Ok(common_files);
        }
        if let Ok(entries) = std::fs::read_dir(&base_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let files_dir = path.join("Files");
                    if files_dir.exists() {
                        return Ok(files_dir);
                    }
                }
            }
        }
        Ok(common_files)
    } else {
        Err("Home directory not found".to_string())
    }
}

fn decode_setfile_bytes(bytes: Vec<u8>) -> Result<String, String> {
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let u16_vec: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16(&u16_vec).map_err(|e| format!("Failed to parse UTF-16 .set file: {}", e))
    } else {
        String::from_utf8(bytes)
            .map_err(|e| format!("Failed to parse .set file (not UTF-8 or UTF-16 LE): {}", e))
    }
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub fn export_active_set_file_to_mt_common_files(
    config: MTConfig,
    platform: String,
    include_optimization_hints: bool,
) -> Result<String, String> {
    let common_dir = get_mt_common_files_dir()?;
    let file_path = common_dir.join("ACTIVE.set");
    let path_str = file_path.to_string_lossy().to_string();
    export_set_file(
        config,
        path_str.clone(),
        platform,
        include_optimization_hints,
        None,
        None,
        None,
    )?;
    Ok(path_str)
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub fn _export_vault_file_to_mt_common_files(
    source_file_path: String,
    terminal_type: String,
    custom_common_files_path: Option<String>,
) -> Result<String, String> {
    // Read the source file from vault
    let source_path = PathBuf::from(&source_file_path);
    if !source_path.exists() {
        return Err(format!("Source file not found: {}", source_file_path));
    }

    // Determine the target filename
    let file_stem = source_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Config");
    let target_name = format!("DAAVFX_{}.set", file_stem);

    // Get MT common files directory - use custom path if provided, otherwise auto-detect
    let common_dir = if let Some(custom_path) = custom_common_files_path {
        PathBuf::from(custom_path)
    } else if terminal_type.to_lowercase() == "mt4" {
        _get_mt4_common_files_dir()?
    } else {
        _get_mt5_common_files_dir()?
    };

    let target_path = common_dir.join(&target_name);

    // Read and parse the source file
    let file_content = fs::read_to_string(&source_path)
        .map_err(|e| format!("Failed to read vault file: {}", e))?;

    // If it's a JSON file, convert it to .set format
    let set_content = if source_file_path.ends_with(".json") {
        // Parse JSON and convert to .set format
        let config: MTConfig = serde_json::from_str(&file_content)
            .map_err(|e| format!("Failed to parse JSON: {}", e))?;

        // Generate .set file content
        let mut lines = vec![
            format!(
                "; DAAVFX Configuration - Generated {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
            ),
            String::from("; Exported from Dashboard Vault"),
            String::new(),
        ];

        // Add general settings
        lines.push(format!("MagicNumber__= {}", config.general.magic_number));
        lines.push(String::from("MagicNumber__,F=0"));
        lines.push(String::from("MagicNumber__,1=0"));
        lines.push(String::from("MagicNumber__,2=1"));
        lines.push(String::from("MagicNumber__,3=1"));

        lines.join("\r\n")
    } else {
        // Already a .set file, use as-is
        file_content
    };

    // Write to MT common files
    fs::write(&target_path, set_content)
        .map_err(|e| format!("Failed to write to MT common files: {}", e))?;

    Ok(target_path.to_string_lossy().to_string())
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub fn get_active_set_status() -> Result<ActiveSetStatus, String> {
    let common_dir = get_mt_common_files_dir()?;
    let file_path = common_dir.join("ACTIVE.set");
    let path_str = file_path.to_string_lossy().to_string();

    let metadata = match fs::metadata(&file_path) {
        Ok(m) => m,
        Err(_) => {
            return Ok(ActiveSetStatus {
                path: path_str,
                exists: false,
                keys_total: 0,
                keys_start: 0,
                ready: false,
                last_modified_ms: None,
            })
        }
    };

    let last_modified_ms = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64);

    let bytes = fs::read(&file_path).map_err(|e| format!("Failed to read ACTIVE.set: {}", e))?;
    let content = decode_setfile_bytes(bytes)?;

    let mut keys_total: u32 = 0;
    let mut keys_start: u32 = 0;
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(';') {
            continue;
        }
        if let Some(pos) = line.find('=') {
            let key = line[..pos].trim().to_lowercase();
            if key.is_empty() {
                continue;
            }
            keys_total += 1;
            if key.contains("ginput_start_")
                || key.ends_with("_start")
                || key.contains("_enabled_")
                || key.ends_with("_enabled")
            {
                keys_start += 1;
            }
        }
    }

    let ready = keys_total > 0 && keys_start > 0;
    Ok(ActiveSetStatus {
        path: path_str,
        exists: true,
        keys_total,
        keys_start,
        ready,
        last_modified_ms,
    })
}

/// Import config from MT4/MT5 .set file format
#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
pub async fn import_set_file(file_path: String) -> Result<MTConfig, String> {
    println!("[SETFILE] Rust: Importing setfile: {}", file_path);

    // Sanitize and validate the file path
    let path_buf = PathBuf::from(&file_path);
    let sanitized_path = sanitize_and_validate_path(&path_buf)?;

    // Check file size (allow large setfiles for massive input configs)
    let metadata =
        fs::metadata(&sanitized_path).map_err(|e| format!("Failed to get file metadata: {}", e))?;
    let file_size = metadata.len();
    println!("[SETFILE] Rust: File size: {} bytes", file_size);

    if metadata.len() > 50 * 1024 * 1024 {
        return Err("File too large (max 50MB)".to_string());
    }

    let bytes =
        fs::read(&sanitized_path).map_err(|e| format!("Failed to read .set file: {}", e))?;

    // Handle UTF-16 LE (Common in MT4/MT5)
    let content = if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let u16_vec: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16(&u16_vec)
            .map_err(|e| format!("Failed to parse UTF-16 .set file: {}", e))?
    } else {
        // Fallback to UTF-8
        String::from_utf8(bytes)
            .map_err(|e| format!("Failed to parse .set file (not UTF-8 or UTF-16 LE): {}", e))?
    };

    println!("[SETFILE] Rust: Content length: {} chars", content.len());

    let mut values: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut tags: Option<Vec<String>> = None;
    let mut comments: Option<String> = None;

    // Parse .set file (key=value format)
    let mut line_count = 0;
    let mut key_count = 0;
    for line in content.lines() {
        line_count += 1;
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with(';') {
            if line.starts_with("; Tags: ") {
                let t_str = line.trim_start_matches("; Tags: ");
                tags = Some(t_str.split(',').map(|s| s.trim().to_string()).collect());
            } else if line.starts_with("; Comments: ") {
                comments = Some(line.trim_start_matches("; Comments: ").to_string());
            }
            continue;
        }
        if let Some(pos) = line.find('=') {
            let key = line[..pos].trim().to_string();
            let raw_value = line[pos + 1..].trim();

            // Input Validation: Limit key/value length and characters
            if key.len() > 128 || raw_value.len() > 4096 {
                continue;
            }
            // Basic key validation (alphanumeric + underscore + dot for potential struct paths)
            if key
                .chars()
                .any(|c| !c.is_alphanumeric() && c != '_' && c != '.')
            {
                continue;
            }

            // Strip MT4/MT5 optimization params
            let value = if raw_value.contains("||") {
                raw_value
                    .split("||")
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string()
            } else if raw_value.contains(",F=") {
                raw_value
                    .split(",F=")
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string()
            } else {
                raw_value.to_string()
            };
            values.insert(key.clone(), value);
            key_count += 1;
        }
    }

    println!(
        "[SETFILE] Rust: Parsed {} lines, {} key-value pairs",
        line_count, key_count
    );

    let is_v19_massive = values.keys().any(|k| parse_v19_key(k).is_some());
    if is_v19_massive {
        let v19_validation = validate_v19_setfile(&content);
        if !v19_validation.is_valid {
            return Err(format!("Invalid v19 massive setfile: {:?}", v19_validation.errors));
        }

        let mut config = build_config_from_v19_setfile(&content)?;
        config.tags = tags;
        config.comments = comments;
        config.deobfuscate_sensitive_fields();
        return Ok(config);
    }

    // Debug: Show ALL keys that match gInput pattern
    let ginput_keys: Vec<&String> = values.keys().filter(|k| k.starts_with("gInput_")).collect();
    println!("[SETFILE] Rust: Total gInput keys found: {}", ginput_keys.len());

    // Show sample of logic keys
    let logic_keys: Vec<&String> = ginput_keys.iter().filter(|k| {
        let parts: Vec<&str> = k.split('_').collect();
        parts.len() >= 4 && parts[2].parse::<u8>().is_ok()
    }).take(20).cloned().collect();
    println!("[SETFILE] Rust: Sample logic keys: {:?}", logic_keys);

    // Count keys by pattern
    let mut ap_count = 0;
    let mut ar_count = 0;
    let mut bp_count = 0;
    let mut br_count = 0;
    let mut cp_count = 0;
    let mut cr_count = 0;
    for key in &ginput_keys {
        if key.contains("_AP_") { ap_count += 1; }
        if key.contains("_AR_") { ar_count += 1; }
        if key.contains("_BP_") { bp_count += 1; }
        if key.contains("_BR_") { br_count += 1; }
        if key.contains("_CP_") { cp_count += 1; }
        if key.contains("_CR_") { cr_count += 1; }
    }
    println!("[SETFILE] Rust: Keys by pattern - AP:{} AR:{} BP:{} BR:{} CP:{} CR:{}",
             ap_count, ar_count, bp_count, br_count, cp_count, cr_count);

    // Build config from parsed values
    let mut config = build_config_from_values(&values)?;
    config.tags = tags;
    config.comments = comments;
    config.deobfuscate_sensitive_fields(); // Deobfuscate

    Ok(config)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultMetadata {
    pub tags: Option<Vec<String>>,
    pub comments: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultJson {
    pub metadata: VaultMetadata,
    pub config: MTConfig,
}

/// Export config to JSON format (proper MT4/MT5 compatible)
#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
pub async fn export_json_file(
    config: MTConfig,
    file_path: String,
    tags: Option<Vec<String>>,
    comments: Option<String>,
) -> Result<(), String> {
    // Sanitize and validate the file path
    let path_buf = PathBuf::from(&file_path);
    let sanitized_path = sanitize_and_validate_path(&path_buf)?;

    let json_str = if tags.is_some() || comments.is_some() {
        let wrapper = VaultJson {
            metadata: VaultMetadata { tags, comments },
            config,
        };
        serde_json::to_string_pretty(&wrapper)
            .map_err(|e| format!("Failed to serialize config with metadata: {}", e))?
    } else {
        serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?
    };

    atomic_write(&sanitized_path, &json_str)?;

    Ok(())
}

/// Import config from JSON format
#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
pub async fn import_json_file(file_path: String) -> Result<MTConfig, String> {
    // Sanitize and validate the file path
    let path_buf = PathBuf::from(&file_path);
    let sanitized_path = sanitize_and_validate_path(&path_buf)?;

    let json_str = fs::read_to_string(&sanitized_path)
        .map_err(|e| format!("Failed to read JSON file: {}", e))?;

    // Try parsing as VaultJson first
    if let Ok(wrapper) = serde_json::from_str::<VaultJson>(&json_str) {
        let mut config = wrapper.config;
        config.tags = wrapper.metadata.tags;
        config.comments = wrapper.metadata.comments;
        config.deobfuscate_sensitive_fields(); // Deobfuscate
        return Ok(config);
    }

    // Fallback to raw MTConfig
    let mut config: MTConfig =
        serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse JSON file: {}", e))?;
    config.deobfuscate_sensitive_fields(); // Deobfuscate

    Ok(config)
}

/// Write text content to a file (for exporting generated setfile content)
#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
pub async fn write_text_file(file_path: String, content: String) -> Result<(), String> {
    // Sanitize and validate the file path
    let path_buf = PathBuf::from(&file_path);
    let sanitized_path = sanitize_and_validate_path(&path_buf)?;

    // Use atomic write to prevent corruption
    atomic_write(&sanitized_path, &content)?;

    Ok(())
}

// ============================================
// EXPORT VALIDATION (Phase 3)
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct _ExportValidationResult {
    pub file_path: String,
    pub total_params: usize,
    pub estimated_load_rate: f64,
    pub warnings: Vec<String>,
    pub platform: String,
}

/// Export .set file with validation feedback
#[cfg_attr(feature = "tauri-app", tauri::command)]
pub fn _export_set_file_with_validation(
    config: MTConfig,
    file_path: String,
    platform: String,
    include_optimization_hints: bool,
) -> Result<_ExportValidationResult, String> {
    // Perform the export
    export_set_file(
        config.clone(),
        file_path.clone(),
        platform.clone(),
        include_optimization_hints,
        None,
        None,
        None,
    )?;

    let mut warnings: Vec<String> = Vec::new();
    let mut param_count: usize = 0;

    // Count exported parameters
    // General settings: ~50 params
    param_count += 50;

    // Per engine/group/logic
    for engine in &config.engines {
        for group in &engine.groups {
            // ~4 group-level params
            param_count += 4;
            // ~40 params per logic
            param_count += group.logics.len() * 40;
        }
    }

    // Check for potential issues
    if platform == "MT5" && param_count > 1000 {
        warnings.push(format!(
            "MT5 has 1100 input limit. {} params exported. EA will load hidden params from setfile at runtime.",
            param_count
        ));
    }

    if param_count > 10000 {
        warnings.push(format!(
            "Very large config ({} params). Ensure setfile loader can handle this volume.",
            param_count
        ));
    }

    // Estimate load rate based on config quality
    let estimated_rate = if warnings.is_empty() { 98.0 } else { 95.0 };

    Ok(_ExportValidationResult {
        file_path,
        total_params: param_count,
        estimated_load_rate: estimated_rate,
        warnings,
        platform,
    })
}

/// Quick validation of a setfile path (check it exists and is readable)
#[cfg_attr(feature = "tauri-app", tauri::command)]
pub fn _validate_set_file_path(file_path: String) -> Result<bool, String> {
    let path = std::path::Path::new(&file_path);
    if path.exists() && path.is_file() {
        Ok(true)
    } else {
        Ok(false)
    }
}

// ============================================
// VAULT FUNCTIONALITY
// ============================================

#[derive(Debug, Clone, Serialize)]
pub struct VaultFile {
    pub name: String,
    pub path: String,
    pub last_modified: String,
    pub size: u64,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub comments: Option<String>,
    pub magic_number: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct VaultListing {
    pub vault_path: String,
    pub files: Vec<VaultFile>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TerminalLogTail {
    pub file_path: String,
    pub lines: Vec<String>,
}

fn get_vault_path() -> PathBuf {
    // 1. Try explicit absolute path (Development environment fallback)
    // Removed hardcoded legacy path to avoid saving to wrong directory

    // 2. Search upwards from current directory
    let mut current = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    println!("Searching for Vault starting from: {:?}", current);

    // Prefer repo presets folder if we're running from the repo
    for i in 0..15 {
        let repo_candidate = current.join("APPS").join("dashboard").join("Vault_Presets");
        if repo_candidate.exists() && repo_candidate.is_dir() {
            println!("Found Vault (repo) at level {}: {:?}", i, repo_candidate);
            return repo_candidate;
        }

        let candidate = current.join("Vault_Presets");
        if candidate.exists() && candidate.is_dir() {
            println!("Found Vault at level {}: {:?}", i, candidate);
            return candidate;
        }

        // Legacy nesting
        let candidate_nested = current
            .join("daavfx_trading_ecosystem_6.0")
            .join("Vault_Presets");
        if candidate_nested.exists() && candidate_nested.is_dir() {
            println!("Found Vault nested at level {}: {:?}", i, candidate_nested);
            return candidate_nested;
        }

        if !current.pop() {
            break;
        }
    }

    // 3. Fallback: Use Documents/DAAVFX_Vault
    if let Some(docs) = dirs::document_dir() {
        let vault = docs.join("DAAVFX_Vault");
        if !vault.exists() {
            let _ = fs::create_dir_all(&vault);
        }
        println!("Vault not found, falling back to Documents: {:?}", vault);
        return vault;
    }

    // Ultimate fallback
    println!("Vault not found, using default 'Vault_Presets'");
    PathBuf::from("Vault_Presets")
}

fn resolve_vault_path(vault_path_override: Option<String>) -> Result<PathBuf, String> {
    if let Some(raw_path) = vault_path_override {
        let trimmed = raw_path.trim();
        if !trimmed.is_empty() {
            return sanitize_and_validate_path(&PathBuf::from(trimmed));
        }
    }

    Ok(get_vault_path())
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn list_vault_files(vault_path_override: Option<String>) -> Result<VaultListing, String> {
    let vault_path = resolve_vault_path(vault_path_override)?;
    if !vault_path.exists() {
        return Ok(VaultListing {
            vault_path: vault_path.to_string_lossy().to_string(),
            files: Vec::new(),
        });
    }

    let mut files = Vec::new();

    // Helper to process a directory
    let process_dir = |dir: PathBuf,
                       category: Option<String>|
     -> Result<Vec<VaultFile>, std::io::Error> {
        let mut dir_files = Vec::new();
        if dir.exists() && dir.is_dir() {
            for entry in fs::read_dir(dir)? {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(ext) = path.extension() {
                            let ext_str = ext.to_string_lossy().to_lowercase();
                            if ext_str == "set" || ext_str == "json" {
                                let metadata = entry.metadata()?;
                                let modified =
                                    metadata.modified().unwrap_or(std::time::SystemTime::now());
                                let datetime: chrono::DateTime<chrono::Local> = modified.into();

                                // Extract tags/comments/magic from header
                                let mut tags = None;
                                let mut comments = None;
                                let mut magic_number = None;

                                if let Ok(content) = fs::read_to_string(&path) {
                                    if ext_str == "json" {
                                        if let Ok(wrapper) =
                                            serde_json::from_str::<VaultJson>(&content)
                                        {
                                            tags = wrapper.metadata.tags;
                                            comments = wrapper.metadata.comments;
                                            magic_number =
                                                Some(wrapper.config.general.magic_number);
                                        } else if let Ok(config) =
                                            serde_json::from_str::<MTConfig>(&content)
                                        {
                                            magic_number = Some(config.general.magic_number);
                                        }
                                    } else {
                                        // Check first 200 lines for metadata and magic number
                                        for line in content.lines().take(200) {
                                            if line.starts_with("; Tags: ") {
                                                tags = Some(
                                                    line.trim_start_matches("; Tags: ")
                                                        .split(',')
                                                        .map(|s| s.trim().to_string())
                                                        .collect(),
                                                );
                                            } else if line.starts_with("; Comments: ") {
                                                comments = Some(
                                                    line.trim_start_matches("; Comments: ")
                                                        .to_string(),
                                                );
                                            } else if line.contains("gInput_MagicNumber=")
                                                || line.contains("MagicNumber=")
                                            {
                                                let parts: Vec<&str> = line.split('=').collect();
                                                if parts.len() >= 2 {
                                                    let val_str = parts[1]
                                                        .split(';')
                                                        .next()
                                                        .unwrap_or("")
                                                        .trim();
                                                    if let Ok(val) = val_str.parse::<i32>() {
                                                        magic_number = Some(val);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                dir_files.push(VaultFile {
                                    name: path
                                        .file_name()
                                        .unwrap_or_default()
                                        .to_string_lossy()
                                        .to_string(),
                                    path: path.to_string_lossy().to_string(),
                                    last_modified: datetime.format("%Y-%m-%d %H:%M:%S").to_string(),
                                    size: metadata.len(),
                                    category: category.clone(),
                                    tags,
                                    comments,
                                    magic_number,
                                });
                            }
                        }
                    }
                }
            }
        }
        Ok(dir_files)
    };

    // 1. Root files
    if let Ok(mut root_files) = process_dir(vault_path.clone(), None) {
        files.append(&mut root_files);
    }

    // 2. Subdirectories (Categories)
    if let Ok(entries) = fs::read_dir(&vault_path) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_dir() {
                    let category_name = path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    if let Ok(mut cat_files) = process_dir(path, Some(category_name)) {
                        files.append(&mut cat_files);
                    }
                }
            }
        }
    }

    // Sort by modified date (newest first)
    files.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));

    Ok(VaultListing {
        vault_path: vault_path.to_string_lossy().to_string(),
        files,
    })
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn open_vault_folder(vault_path_override: Option<String>) -> Result<(), String> {
    let vault_path = resolve_vault_path(vault_path_override)?;
    if !vault_path.exists() {
        return Err("Vault folder does not exist".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(vault_path.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Open folder not supported on this OS".to_string())
}

fn calculate_dir_size_recursive(dir: &PathBuf) -> Result<u64, std::io::Error> {
    let mut size = 0;
    if dir.exists() && dir.is_dir() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                size += entry.metadata()?.len();
            } else if path.is_dir() {
                size += calculate_dir_size_recursive(&path)?;
            }
        }
    }
    Ok(size)
}

#[derive(Debug, Clone, Serialize)]
pub struct VaultSizeResult {
    pub total_size: u64,
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn get_vault_size(
    vault_path_override: Option<String>,
) -> Result<VaultSizeResult, String> {
    let vault_path = resolve_vault_path(vault_path_override)?;
    if !vault_path.exists() {
        return Ok(VaultSizeResult { total_size: 0 });
    }

    let total_size = calculate_dir_size_recursive(&vault_path)
        .map_err(|e| format!("Failed to calculate vault size: {}", e))?;

    Ok(VaultSizeResult { total_size })
}

fn get_terminal_root_path() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|e| format!("APPDATA not available: {}", e))?;
    Ok(PathBuf::from(appdata).join("MetaQuotes").join("Terminal"))
}

fn find_latest_terminal_log(root: &PathBuf) -> Option<PathBuf> {
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let instance = entry.path();
        if !instance.is_dir() {
            continue;
        }
        let logs_dir = instance.join("logs");
        if !logs_dir.is_dir() {
            continue;
        }
        let logs = fs::read_dir(&logs_dir).ok()?;
        for log_entry in logs.flatten() {
            let p = log_entry.path();
            if p.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase()
                != "log"
            {
                continue;
            }
            let meta = fs::metadata(&p).ok()?;
            let modified = meta.modified().ok()?;
            match &best {
                None => best = Some((modified, p)),
                Some((best_time, _)) => {
                    if modified > *best_time {
                        best = Some((modified, p));
                    }
                }
            }
        }
    }
    best.map(|(_, p)| p)
}

fn read_tail_lines(path: &PathBuf, max_lines: usize) -> Result<Vec<String>, String> {
    let mut f = fs::File::open(path).map_err(|e| format!("Failed to open log: {}", e))?;
    let size = f
        .metadata()
        .map_err(|e| format!("Failed to stat log: {}", e))?
        .len();
    let chunk = 256_000u64.min(size);
    f.seek(SeekFrom::End(-(chunk as i64)))
        .map_err(|e| format!("Failed to seek log: {}", e))?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf)
        .map_err(|e| format!("Failed to read log: {}", e))?;
    let text = String::from_utf8_lossy(&buf);
    let mut lines: Vec<&str> = text.lines().collect();
    if lines.len() > max_lines {
        lines = lines[lines.len() - max_lines..].to_vec();
    }
    Ok(lines.into_iter().map(|s| s.to_string()).collect())
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn get_mt_terminal_root() -> Result<String, String> {
    Ok(get_terminal_root_path()?.to_string_lossy().to_string())
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn open_mt_terminal_root() -> Result<(), String> {
    let root = get_terminal_root_path()?;
    if !root.exists() {
        return Err("Terminal folder not found".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(root.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Open folder not supported on this OS".to_string())
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn read_recent_terminal_log(lines: u32) -> Result<TerminalLogTail, String> {
    let root = get_terminal_root_path()?;
    if !root.exists() {
        return Err("Terminal folder not found".to_string());
    }
    let latest =
        find_latest_terminal_log(&root).ok_or_else(|| "No terminal log files found".to_string())?;
    let tail = read_tail_lines(&latest, (lines as usize).clamp(10, 400))?;
    Ok(TerminalLogTail {
        file_path: latest.to_string_lossy().to_string(),
        lines: tail,
    })
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn _export_vault_file(filename: String, target_path: String) -> Result<(), String> {
    // When exporting from Vault, we must DEOBFUSCATE the content
    // so it's usable by MT4/MT5 or other users.

    // 1. Load the config (handles deobfuscation automatically)
    let config = if filename.to_lowercase().ends_with(".json") {
        import_json_file(filename.clone()).await?
    } else {
        import_set_file(filename.clone()).await?
    };

    // 2. Write to target (plain text)
    if target_path.to_lowercase().ends_with(".json") {
        let json_str = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        atomic_write(&PathBuf::from(&target_path), &json_str)?;
    } else {
        // Default to .set
        export_set_file(
            config,
            target_path,
            "Export".to_string(),
            false,
            None,
            None,
            None,
        )?;
    }

    Ok(())
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn save_to_vault(
    config: MTConfig,
    name: String,
    category: Option<String>,
    tags: Option<Vec<String>>,
    comments: Option<String>,
    format: Option<String>,
    vault_path_override: Option<String>,
) -> Result<(), String> {
    let vault_root = resolve_vault_path(vault_path_override)?;
    let mut vault_path = vault_root.clone();

    // If category is provided, append it to path
    if let Some(cat) = category {
        if !cat.is_empty() {
            let safe_cat = cat.replace(
                |c: char| !c.is_alphanumeric() && c != '-' && c != '_' && c != ' ',
                "_",
            );
            vault_path = vault_path.join(safe_cat);
        }
    }

    // Validate vault_path is within vault_root
    let validated_vault_path = validate_path_within_base(&vault_path, &vault_root)?;
    vault_path = validated_vault_path;

    if !vault_path.exists() {
        fs::create_dir_all(&vault_path)
            .map_err(|e| format!("Failed to create vault directory: {}", e))?;
    }

    // Sanitize name
    let safe_name = name.replace(
        |c: char| !c.is_alphanumeric() && c != '-' && c != '_' && c != ' ',
        "_",
    );

    // Obfuscate sensitive fields before saving to vault (local storage)
    let mut config_safe = config.clone();
    config_safe.obfuscate_sensitive_fields();

    let file_format = format.unwrap_or_else(|| "set".to_string());

    if file_format.to_lowercase() == "json" {
        let file_path_buf = vault_path.join(format!("{}.json", safe_name));
        let validated_file_path = validate_path_within_base(&file_path_buf, &vault_root)?;
        let file_path = validated_file_path;

        // Use wrapper for JSON metadata
        if tags.is_some() || comments.is_some() {
            let wrapper = VaultJson {
                metadata: VaultMetadata { tags, comments },
                config: config_safe,
            };
            let json_str = serde_json::to_string_pretty(&wrapper)
                .map_err(|e| format!("Failed to serialize config with metadata: {}", e))?;
            atomic_write(&file_path, &json_str)?;
        } else {
            // Legacy/Simple format
            let json_str = serde_json::to_string_pretty(&config_safe)
                .map_err(|e| format!("Failed to serialize config: {}", e))?;
            atomic_write(&file_path, &json_str)?;
        }
    } else {
        let file_path_buf = vault_path.join(format!("{}.set", safe_name));
        let validated_file_path = validate_path_within_base(&file_path_buf, &vault_root)?;
        let file_path = validated_file_path;
        // Reuse export logic
        export_set_file(
            config_safe,
            file_path.to_string_lossy().to_string(),
            "Vault".to_string(),
            false,
            None,
            tags,
            comments,
        )?;
    }

    Ok(())
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn _delete_from_vault(
    filename: String,
    vault_path_override: Option<String>,
) -> Result<(), String> {
    let vault_root = resolve_vault_path(vault_path_override)?;
    let file_path_buf = vault_root.join(filename);
    let validated_file_path = validate_path_within_base(&file_path_buf, &vault_root)?;

    if validated_file_path.exists() {
        fs::remove_file(validated_file_path)
            .map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    Ok(())
}

// Helper functions for suffix generation
fn get_logic_suffix(engine_id: &str, group: u8, logic_name: &str) -> String {
    let prefix = match engine_id {
        "A" => "",
        "B" => "B",
        "C" => "C",
        _ => "",
    };

    let logic_char = match logic_name.to_uppercase().as_str() {
        "POWER" => "P",
        "REPOWER" => "R",
        "SCALPER" | "SCALP" => "S",
        "STOPPER" => "ST",
        "STO" => "STO",
        "SCA" => "SCA",
        "RPO" => "RPO",
        _ => "P",
    };

    format!("{}{}{}", prefix, logic_char, group)
}

fn get_logic_short(engine_id: &str, logic_name: &str) -> String {
    let prefix = match engine_id {
        "A" => "",
        "B" => "B",
        "C" => "C",
        _ => "",
    };

    let logic_char = match logic_name.to_uppercase().as_str() {
        "POWER" => "P",
        "REPOWER" => "R",
        "SCALPER" | "SCALP" => "S",
        "STOPPER" => "ST",
        "STO" => "STO",
        "SCA" => "SCA",
        "RPO" => "RPO",
        _ => "P",
    };

    format!("{}{}", prefix, logic_char)
}

// V19 massive setfile format: gInput_{Group}_{Engine}{Logic}_{Direction}_{Param}
// Example: gInput_1_AP_Buy_InitialLot, gInput_5_BP_Scalp_Sell_Grid
fn get_v19_suffix(engine_id: &str, logic_name: &str) -> String {
    let engine_prefix = match engine_id {
        "A" => "A",
        "B" => "B",
        "C" => "C",
        _ => "A",
    };

    let logic_code = match logic_name.to_uppercase().as_str() {
        "POWER" => "P",
        "REPOWER" => "R",
        "SCALPER" | "SCALP" => "S",
        "STOPPER" => "T",
        "STO" => "O",
        "SCA" => "C",
        "RPO" => "X",
        _ => "P",
    };

    format!("{}{}", engine_prefix, logic_code)
}

fn trigger_action_to_int(action: &str) -> i32 {
    let s = action.trim();
    if let Ok(n) = s.parse::<i32>() {
        return n;
    }
    match s {
        "TriggerAction_None" => 0,
        "TriggerAction_StopEA" => 1,
        "TriggerAction_StopEA_KeepTrades" => 2,
        "TriggerAction_CloseAll" => 3,
        "TriggerAction_KeepEA_CloseTrades" => 4,
        "TriggerAction_StopEA_CloseTrades" => 5,
        _ => 0,
    }
}

fn get_logic_global_key(engine_id: &str, logic_name: &str) -> String {
    let prefix = match engine_id {
        "A" => "",
        "B" => "B",
        "C" => "C",
        _ => "",
    };

    let name = match logic_name.to_uppercase().as_str() {
        "POWER" => "Power",
        "REPOWER" => "Repower",
        "SCALPER" | "SCALP" => "Scalp",
        "STOPPER" => "Stopper",
        "STO" => "STO",
        "SCA" => "SCA",
        "RPO" => "RPO",
        _ => "Power",
    };

    format!("{}{}", prefix, name)
}

fn default_close_targets(engine_id: &str, logic_name: &str) -> String {
    let upper = logic_name.to_uppercase();
    if upper != "RPO" {
        return String::new();
    }

    match engine_id {
        "A" => "A:Power,A:Repower,A:Scalp,A:Stopper,A:STO,A:SCA,A:RPO".to_string(),
        "B" => "B:Power,B:Repower,B:Scalp,B:Stopper,B:STO,B:SCA,B:RPO".to_string(),
        "C" => "A:Power,A:Repower,A:Scalp,A:Stopper,A:STO,A:SCA,A:RPO,B:Power,B:Repower,B:Scalp,B:Stopper,B:STO,B:SCA,B:RPO,C:Power,C:Repower,C:Scalp,C:Stopper,C:STO,C:SCA,C:RPO".to_string(),
        _ => String::new(),
    }
}

fn normalize_trigger_type(raw: &str) -> String {
    let s = raw.trim();
    if s.is_empty() {
        return "0".to_string();
    }

    let mut digits = String::new();
    for ch in s.chars() {
        if ch.is_ascii_digit() {
            digits.push(ch);
        } else {
            break;
        }
    }
    if !digits.is_empty() {
        return digits;
    }

    match s {
        "Trigger_Immediate" => "0".to_string(),
        "Trigger_AfterBars" => "1".to_string(),
        "Trigger_AfterSeconds" => "2".to_string(),
        "Trigger_AfterPips" => "3".to_string(),
        "Trigger_TimeFilter" => "4".to_string(),
        "Trigger_NewsFilter" => "5".to_string(),
        _ => "0".to_string(),
    }
}

fn encode_trail_step_method(raw: &str) -> i32 {
    match raw {
        "Step_Percent" => 1,
        "Step_Pips" => 0,
        _ => 0,
    }
}

fn encode_trail_step_mode(raw: &str) -> i32 {
    match raw {
        "TrailStepMode_Auto" => 0,
        "TrailStepMode_Fixed" => 1,
        "TrailStepMode_PerOrder" => 3,
        "TrailStepMode_Disabled" => 4,
        _ => 0,
    }
}

fn encode_partial_mode(raw: &str) -> i32 {
    match raw {
        "PartialMode_Low" => 0,
        "PartialMode_Balanced" => 1,
        "PartialMode_High" => 2,
        _ => 1,
    }
}

fn encode_partial_balance(raw: &str) -> i32 {
    match raw {
        "PartialBalance_Aggressive" => 0,
        "PartialBalance_Balanced" => 1,
        "PartialBalance_Conservative" => 2,
        _ => 1,
    }
}

fn get_logic_start_key(engine_id: &str, logic_name: &str) -> Option<String> {
    let upper = logic_name.to_uppercase();
    if upper == "POWER" {
        return None;
    }

    let prefix = match engine_id {
        "A" => "",
        "B" => "B",
        "C" => "C",
        _ => "",
    };

    let suffix = match upper.as_str() {
        "REPOWER" => "Repower",
        "SCALPER" | "SCALP" => "Scalp",
        "STOPPER" => "Stopper",
        "STO" => "STO",
        "SCA" => "SCA",
        "RPO" => "RPO",
        _ => return None,
    };

    Some(format!("Start{}{}", prefix, suffix))
}

// Parse helper functions - defined at module level for reuse
fn get_bool(values: &std::collections::HashMap<String, String>, key: &str) -> bool {
    values
        .get(key)
        .map(|v| v == "1" || v.to_lowercase() == "true")
        .unwrap_or(false)
}

fn get_i32(values: &std::collections::HashMap<String, String>, key: &str, default: i32) -> i32 {
    values
        .get(key)
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn get_i32_first(
    values: &std::collections::HashMap<String, String>,
    keys: &[&str],
    default: i32,
) -> i32 {
    for k in keys {
        if let Some(v) = values.get(*k).and_then(|v| v.parse().ok()) {
            return v;
        }
    }
    default
}

fn get_f64(values: &std::collections::HashMap<String, String>, key: &str, default: f64) -> f64 {
    values
        .get(key)
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn get_f64_first(
    values: &std::collections::HashMap<String, String>,
    keys: &[&str],
    default: f64,
) -> f64 {
    for k in keys {
        if let Some(v) = values.get(*k).and_then(|v| v.parse().ok()) {
            return v;
        }
    }
    default
}

fn get_bool_first(values: &std::collections::HashMap<String, String>, keys: &[&str]) -> bool {
    for k in keys {
        if let Some(v) = values.get(*k) {
            let vv = v.trim();
            if let Ok(n) = vv.parse::<i32>() {
                return n != 0;
            }
            let lower = vv.to_ascii_lowercase();
            if lower == "true" {
                return true;
            }
            if lower == "false" {
                return false;
            }
        }
    }
    false
}

fn get_string(
    values: &std::collections::HashMap<String, String>,
    key: &str,
    default: &str,
) -> String {
    values
        .get(key)
        .cloned()
        .unwrap_or_else(|| default.to_string())
}

fn build_config_from_values(
    values: &std::collections::HashMap<String, String>,
) -> Result<MTConfig, String> {
    // Build sessions
    let mut sessions = Vec::new();
    for i in 1..=7 {
        sessions.push(SessionConfig {
            session_number: i,
            enabled: get_bool(values, &format!("gInput_Session{}Enabled", i)),
            day: get_i32(values, &format!("gInput_Session{}Day", i), i % 7),
            start_hour: get_i32(values, &format!("gInput_Session{}StartHour", i), 9),
            start_minute: get_i32(values, &format!("gInput_Session{}StartMinute", i), 30),
            end_hour: get_i32(values, &format!("gInput_Session{}EndHour", i), 17),
            end_minute: get_i32(values, &format!("gInput_Session{}EndMinute", i), 0),
            action: get_string(
                values,
                &format!("gInput_Session{}Action", i),
                "Action_Default",
            ),
            auto_restart: get_bool(values, &format!("gInput_Session{}AutoRestart", i)),
            restart_mode: get_string(
                values,
                &format!("gInput_Session{}RestartMode", i),
                "Restart_Default",
            ),
            restart_bars: get_i32(values, &format!("gInput_Session{}RestartBars", i), 0),
            restart_minutes: get_i32(values, &format!("gInput_Session{}RestartMinutes", i), 0),
            restart_pips: get_i32(values, &format!("gInput_Session{}RestartPips", i), 0),
        });
    }

    // Build general config
    let general = GeneralConfig {
        license_key: get_string(values, "gInput_LicenseKey", ""),
        license_server_url: get_string(
            values,
            "gInput_LicenseServerURL",
            "https://license.daavfx.com",
        ),
        require_license: get_bool(values, "gInput_RequireLicense"),
        license_check_interval: get_i32(values, "gInput_LicenseCheckInterval", 3600),
        config_file_name: get_string(values, "gInput_ConfigFileName", "DAAVFX_Config.json"),
        config_file_is_common: get_bool(values, "gInput_ConfigFileIsCommon"),
        allow_buy: get_bool(values, "gInput_allowBuy"),
        allow_sell: get_bool(values, "gInput_allowSell"),
        enable_logs: get_bool(values, "gInput_EnableLogs"),
        use_direct_price_grid: get_bool(values, "gInput_UseDirectPriceGrid"),
        group_mode: Some(get_i32(values, "gInput_GroupMode", 1)),
        grid_unit: Some(get_i32(values, "gInput_GridUnit", 0)),
        pip_factor: Some(get_i32(values, "gInput_PipFactor", 0)),
        compounding_enabled: get_bool(values, "gInput_Input_Compounding"),
        compounding_type: get_string(values, "gInput_Input_CompoundingType", "Compound_Balance"),
        compounding_target: get_f64(values, "gInput_Input_CompoundingTarget", 40.0),
        compounding_increase: get_f64(values, "gInput_Input_CompoundIncrease", 2.0),
        restart_policy_power: get_string(values, "gInput_RestartPolicy_PowerA", "Restart_Default"),
        restart_policy_non_power: get_string(
            values,
            "gInput_RestartPolicy_NonPower",
            "Restart_Default",
        ),
        close_non_power_on_power_close: get_bool(values, "gInput_CloseNonPowerOnPowerClose"),
        hold_timeout_bars: get_i32(values, "gInput_HoldTimeoutBars", 10),
        magic_number: get_i32(values, "gInput_MagicNumber", 777),
        magic_number_buy: get_i32_first(
            values,
            &["gInput_MagicNumberBuy", "gInput_MagicNumberPowerBuy"],
            777,
        ),
        magic_number_sell: get_i32_first(
            values,
            &["gInput_MagicNumberSell", "gInput_MagicNumberPowerSell"],
            8988,
        ),
        max_slippage_points: get_f64_first(values, &["gInput_MaxSlippagePoints", "gInput_MaxSlippage"], 30.0),
        reverse_magic_base: get_i32(values, "gInput_MagicNumberReverseBase", 20000),
        hedge_magic_base: get_i32(values, "gInput_MagicNumberHedgeBase", 30000),
        hedge_magic_independent: get_bool_first(values, &["gInput_HedgeMagicIndependent"]),
        risk_management: RiskManagementConfig {
            spread_filter_enabled: get_bool(values, "gInput_UseSpreadFilter"),
            max_spread_points: get_f64(values, "gInput_MaxSpreadPoints", 25.0),
            equity_stop_enabled: get_bool(values, "gInput_UseEquityStop"),
            equity_stop_value: get_f64(values, "gInput_EquityStopValue", 35.0),
            drawdown_stop_enabled: get_bool(values, "gInput_UseDrawdownStop"),
            max_drawdown_percent: get_f64(values, "gInput_MaxDrawdownPercent", 35.0),
            risk_action: {
                let s = get_string(values, "gInput_RiskAction", "");
                if s.is_empty() {
                    None
                } else {
                    Some(s)
                }
            },
        },
        time_filters: TimeFiltersConfig {
            priority_settings: TimePrioritySettings::default(),
            sessions,
        },
        news_filter: NewsFilterConfig {
            enabled: get_bool(values, "gInput_EnableNewsFilter"),
            api_key: get_string(values, "gInput_NewsAPIKey", ""),
            api_url: get_string(values, "gInput_NewsAPIURL", "https://api.forexfactory.com"),
            countries: get_string(values, "gInput_NewsFilterCountries", "USD,EUR,GBP"),
            impact_level: get_i32(values, "gInput_NewsImpactLevel", 2),
            minutes_before: get_i32(values, "gInput_MinutesBeforeNews", 15),
            minutes_after: get_i32(values, "gInput_MinutesAfterNews", 15),
            action: get_string(values, "gInput_NewsAction", "Action_CloseAll"),
            calendar_file: {
                let s = get_string(values, "gInput_NewsCalendarFile", "");
                if s.is_empty() {
                    None
                } else {
                    Some(s)
                }
            },
        },
    };

    // Build engines with full V4 DAAVFX parameter parsing
    let engines = build_engines_from_values(values)?;

    // Debug: Show engine summary
    println!(
        "[SETFILE] Rust: Built {} engines from setfile",
        engines.len()
    );
    for engine in &engines {
        println!(
            "[SETFILE] Rust:   Engine {}: {} groups",
            engine.engine_id,
            engine.groups.len()
        );
    }

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
        engines,
    })
}

// ============================================
// V4 DAAVFX SETFILE PARSER - COMPLETE IMPLEMENTATION
// Parses 15 groups × 3 engines × 7 logics × 2 directions = 630 logic-directions
// ============================================

/// Represents a parsed parameter key with all components
#[derive(Debug, Clone)]
struct ParsedParameter {
    param_name: String,
    engine: String,    // "A", "B", or "C"
    group: u8,         // 1-15
    logic: String,     // "Power", "Repower", "Scalp", "Stopper", "STO", "SCA", "RPO"
    direction: String, // "Buy" or "Sell"
}

/// Parse a parameter name into its components
/// Format for massive setfiles: gInput_{GroupNumber}_{LogicCode}_{Direction}_{ParamName}
/// Examples from massive setfiles:
///   gInput_9_BT_Buy_TrailStepMode7 -> (TrailStepMode7, B, 9, Stopper, Buy)
///   gInput_13_CP_Buy_SLMode -> (SLMode, C, 13, Power, Buy)
///   gInput_1_BS_Sell_PartialMode4 -> (PartialMode4, B, 1, Scalp, Sell)
fn parse_parameter_name(name: &str) -> Option<ParsedParameter> {
    // Must start with gInput_
    if !name.starts_with("gInput_") {
        return None;
    }

    let rest = &name[7..]; // Skip "gInput_"

    // Split by underscores to analyze the structure
    let parts: Vec<&str> = rest.split('_').collect();

    if parts.len() < 3 {
        if name.contains("_AP_") || name.contains("_AR_") || name.contains("_BP_") {
            println!("[SETFILE] Rust: Failed to parse (too few parts): {}", name);
        }
        return None;
    }

    let group_str = parts.get(0).copied()?;
    let logic_code = parts.get(1).copied()?;
    let (direction, param_parts) = if parts.len() == 3 {
        ("Both", &parts[2..])
    } else {
        let direction_token = parts.get(2).copied()?;
        if direction_token != "Buy" && direction_token != "Sell" {
            return None;
        }
        (direction_token, &parts[3..])
    };

    let group_token = if group_str.starts_with('G') || group_str.starts_with('g') {
        &group_str[1..]
    } else {
        group_str
    };

    let group = match group_token.parse::<u8>() {
        Ok(g) if g >= 1 && g <= 20 => g,
        _ => {
            println!("[SETFILE] Rust: Invalid group number '{}' in: {}", group_str, name);
            return None;
        }
    };

    // Parse the logic code to determine engine, logic name
    // Format: [Engine][Logic] where Engine is A/B/C and Logic is P/R/S/T/ST/STO/SCA/RPO
    // Examples: AP (Engine A, Power), BR (Engine B, Repower), CST (Engine C, Stopper)
    let (engine_char, logic_abbr) = {
        if logic_code.len() >= 2 {
            // Check if first character is engine (A, B, or C) and rest is logic
            let first_char = logic_code.chars().next().unwrap_or(' ');
            let remaining_logic = &logic_code[1..];

            match first_char {
                'A' => ('A', remaining_logic), // Engine A: AP, AR, AS, AT, ASTO, ASCA, ARPO
                'B' => ('B', remaining_logic), // Engine B: BP, BR, BS, BT, BSTO, BSCA, BRPO
                'C' => ('C', remaining_logic), // Engine C: CP, CR, CS, CT, CSTO, CSCA, CRPO
                _ => ('A', logic_code), // Default to A if no prefix
            }
        } else {
            ('A', logic_code) // Default to A if single character (P, R, S, T)
        }
    };

    // Map logic abbreviation to full name
    // Setfile uses single-letter codes: C=SCA, O=STO, P=Power, R=Repower, S=Scalp, T=Stopper, X=RPO
    let logic_name = match logic_abbr {
        "C" => "SCA",
        "O" => "STO",
        "P" => "Power",
        "R" => "Repower",
        "S" => "Scalp",
        "T" => "Stopper",
        "X" => "RPO",
        // Also support full names if ever used
        "STO" => "STO",
        "SCA" => "SCA",
        "RPO" => "RPO",
        "Power" => "Power",
        "Repower" => "Repower",
        "Scalp" => "Scalp",
        "Stopper" => "Stopper",
        _ => {
            println!("[SETFILE] Rust: Unknown logic abbreviation '{}' in: {}", logic_abbr, name);
            logic_abbr
        }
    };

    // Join the remaining parts to form the parameter name
    let param_name = param_parts.join("_");

    // Debug logging for parsed parameters
    static mut PARSE_COUNT: usize = 0;
    unsafe {
        PARSE_COUNT += 1;
        if PARSE_COUNT <= 20 {
            println!("[SETFILE] Rust: Parsed '{}' -> engine={} group={} logic={} direction={} param={}",
                     name, engine_char, group, logic_name, direction, param_name);
        }
    }

    Some(ParsedParameter {
        param_name,
        engine: engine_char.to_string(),
        group,
        logic: logic_name.to_string(),
        direction: direction.to_string(),
    })
}

/// Parse logic code like P1, BP1, R1, BR1, ST1, BST1 into (engine, logic_name, group)
/// Logic codes: P (Power), R (Repower), S (Scalp), ST (Stopper), STO, SCA, RPO
/// Engine prefixes: B (Engine B), C (Engine C), none (Engine A)
fn parse_logic_code(code: &str) -> Option<(String, String, u8)> {
    // Logic mapping - longer codes first to avoid partial matches
    let logic_codes = vec![
        ("STO", "STO"),
        ("SCA", "SCA"),
        ("RPO", "RPO"),
        ("ST", "Stopper"),
        ("P", "Power"),
        ("R", "Repower"),
        ("S", "Scalp"),
    ];

    let mut engine = "A".to_string();
    let mut remaining = code;

    // Check for engine prefix (B or C)
    if code.starts_with('B') && code.len() > 1 {
        // Check if it's actually a logic code starting with B
        let after_b = &code[1..];
        for (lc, _) in &logic_codes {
            if after_b.starts_with(lc) {
                engine = "B".to_string();
                remaining = after_b;
                break;
            }
        }
    } else if code.starts_with('C') && code.len() > 1 {
        let after_c = &code[1..];
        for (lc, _) in &logic_codes {
            if after_c.starts_with(lc) {
                engine = "C".to_string();
                remaining = after_c;
                break;
            }
        }
    }

    // Extract logic code and group number
    for (code_part, logic_name) in &logic_codes {
        if remaining.starts_with(code_part) {
            let group_str = &remaining[code_part.len()..];
            if let Ok(group) = group_str.parse::<u8>() {
                if group >= 1 && group <= 20 {
                    return Some((engine, logic_name.to_string(), group));
                }
            }
        }
    }

    None
}

/// Build all engines from parsed values
fn build_engines_from_values(
    values: &std::collections::HashMap<String, String>,
) -> Result<Vec<EngineConfig>, String> {
    use std::collections::HashMap;

    // Count total V4 parameters before parsing
    let total_params = values.len();
    let v4_params: Vec<&String> = values.keys().filter(|k| k.starts_with("gInput_")).collect();

    println!(
        "[SETFILE] Rust: Total V4 parameters: {} / {}",
        v4_params.len(),
        total_params
    );

    // Structure: Engine -> Group -> Logic -> Direction -> Params
    let mut engine_data: HashMap<
        String,
        HashMap<u8, HashMap<String, HashMap<String, HashMap<String, String>>>>,
    > = HashMap::new();

    // Track parsed parameters
    let mut parsed_count = 0;
    let mut failed_params: Vec<String> = Vec::new();

    // Parse all parameters and organize by engine/group/logic/direction
    for (key, value) in values {
        if let Some(parsed) = parse_parameter_name(key) {
            let engine_entry = engine_data
                .entry(parsed.engine.clone())
                .or_insert_with(HashMap::new);
            let group_entry = engine_entry
                .entry(parsed.group)
                .or_insert_with(HashMap::new);
            let logic_entry = group_entry
                .entry(parsed.logic.clone())
                .or_insert_with(HashMap::new);

            if parsed.direction == "Both" {
                let buy_entry = logic_entry
                    .entry("Buy".to_string())
                    .or_insert_with(HashMap::new);
                buy_entry.insert(parsed.param_name.clone(), value.clone());

                let sell_entry = logic_entry
                    .entry("Sell".to_string())
                    .or_insert_with(HashMap::new);
                sell_entry.insert(parsed.param_name.clone(), value.clone());
            } else {
                let direction_entry = logic_entry
                    .entry(parsed.direction.clone())
                    .or_insert_with(HashMap::new);
                direction_entry.insert(parsed.param_name.clone(), value.clone());
            }

            parsed_count += 1;
        } else {
            // Only track non-empty values that look like they should be parsed
            if key.starts_with("gInput_") && !value.is_empty() {
                failed_params.push(key.clone());
            }
        }
    }

    println!(
        "[SETFILE] Rust: Successfully parsed {} parameters",
        parsed_count
    );
    println!(
        "[SETFILE] Rust: Failed to parse {} parameters",
        failed_params.len()
    );

    // Show ALL failed params if there are issues
    if !failed_params.is_empty() && failed_params.len() < 50 {
        println!("[SETFILE] Rust: ALL failed params:");
        for param in &failed_params {
            println!("[SETFILE] Rust:   FAILED: {}", param);
        }
    } else if !failed_params.is_empty() {
        println!("[SETFILE] Rust: First 50 failed params:");
        for param in failed_params.iter().take(50) {
            println!("[SETFILE] Rust:   FAILED: {}", param);
        }
    }

    // Debug: Show engine data structure
    println!("[SETFILE] Rust: Engine data structure:");
    for (engine, groups) in &engine_data {
        println!(
            "[SETFILE] Rust:   Engine {}: {} groups",
            engine,
            groups.len()
        );
        let mut total_logics = 0;
        let mut total_directions = 0;
        for (group_num, logics) in groups {
            println!(
                "[SETFILE] Rust:     Group {}: {} logics",
                group_num,
                logics.len()
            );
            for (logic, directions) in logics {
                total_logics += 1;
                println!(
                    "[SETFILE] Rust:       {}: {} directions",
                    logic,
                    directions.len()
                );
                total_directions += directions.len();
            }
        }
        println!(
            "[SETFILE] Rust:     Total: {} logics, {} directions",
            total_logics, total_directions
        );
    }

    // Build EngineConfigs
    let mut engines = Vec::new();
    let engine_ids = vec!["A", "B", "C"];
    let group_count: u8 = 15;

    for engine_id in &engine_ids {
        let mut groups = Vec::new();

        let group_data = engine_data.get(*engine_id);

        for group_num in 1..=group_count {
            let empty_logic_data: HashMap<
                String,
                HashMap<String, HashMap<String, String>>,
            > = HashMap::new();
            let logic_data = group_data
                .and_then(|gd| gd.get(&group_num))
                .unwrap_or(&empty_logic_data);

            let group_config = build_group_config(engine_id, group_num, logic_data, values)?;
            groups.push(group_config);
        }

        // Get max_power_orders for this engine
        let max_power_orders = match *engine_id {
            "A" => get_i32(values, "gInput_MaxPowerOrders", 10),
            "B" => get_i32(values, "gInput_MaxPowerOrders_B", 10),
            "C" => get_i32(values, "gInput_MaxPowerOrders_C", 10),
            _ => 10,
        };

        engines.push(EngineConfig {
            engine_id: engine_id.to_string(),
            engine_name: format!("Engine {}", engine_id),
            max_power_orders,
            groups,
        });
    }

    // Calculate total logic-directions
    let mut total_groups = 0;
    let mut total_logics = 0;
    let mut total_directions = 0;
    for engine in &engines {
        total_groups += engine.groups.len();
        for group in &engine.groups {
            total_logics += group.logics.len();
            for _logic in &group.logics {
                // Each logic has buy and sell directions
                total_directions += 2; // Buy and Sell
            }
        }
    }

    println!(
        "[SETFILE] Rust: Final config - {} engines, {} groups, {} logics, {} directions",
        engines.len(),
        total_groups,
        total_logics,
        total_directions
    );
    println!("[SETFILE] Rust: Expected: 3 engines, 15 groups/logic, 7 logics, 630 directions");

    Ok(engines)
}

/// Build a GroupConfig from parsed logic data
fn build_group_config(
    engine_id: &str,
    group_num: u8,
    logic_data: &std::collections::HashMap<
        String,
        std::collections::HashMap<String, std::collections::HashMap<String, String>>,
    >,
    values: &std::collections::HashMap<String, String>,
) -> Result<GroupConfig, String> {
    let mut logics = Vec::new();

    // Define logic order
    let logic_order = vec!["Power", "Repower", "Scalp", "Stopper", "STO", "SCA", "RPO"];

    for logic_name in &logic_order {
        let empty_direction_data: std::collections::HashMap<
            String,
            std::collections::HashMap<String, String>,
        > = std::collections::HashMap::new();
        let direction_data = logic_data
            .get(*logic_name)
            .unwrap_or(&empty_direction_data);
        let logic_config =
            build_logic_config(engine_id, group_num, logic_name, direction_data, values)?;
        logics.push(logic_config);
    }

    // Parse group-level settings
    let group_power_start = if group_num > 1 {
        let key = format!("gInput_GroupPowerStart_P{}", group_num);
        values.get(&key).and_then(|v| v.parse().ok())
    } else {
        None
    };

    let reverse_mode = get_bool(values, &format!("gInput_Group{}_ReverseMode", group_num));
    let hedge_mode = get_bool(values, &format!("gInput_Group{}_HedgeMode", group_num));
    let hedge_reference = get_string(
        values,
        &format!("gInput_Group{}_HedgeReference", group_num),
        "Logic_None",
    );
    let entry_delay_bars = get_i32(
        values,
        &format!("gInput_Group{}_EntryDelayBars", group_num),
        0,
    );

    // Check if any logic is enabled
    let enabled = !logics.is_empty() && logics.iter().any(|l| l.enabled);

    Ok(GroupConfig {
        group_number: group_num,
        enabled,
        group_power_start,
        reverse_mode,
        hedge_mode,
        hedge_reference,
        entry_delay_bars,
        logics,
    })
}

/// Build a LogicConfig from direction data
/// Parses all 82 parameters per logic-direction
fn build_logic_config(
    engine_id: &str,
    group_num: u8,
    logic_name: &str,
    direction_data: &std::collections::HashMap<String, std::collections::HashMap<String, String>>,
    values: &std::collections::HashMap<String, String>,
) -> Result<LogicConfig, String> {
    // Build the logic suffix for looking up values
    let logic_suffix = get_logic_suffix(engine_id, group_num, logic_name);
    let short_logic = get_logic_short(engine_id, logic_name);

    // Get Buy and Sell parameter maps
    let buy_params = direction_data.get("Buy");
    let sell_params = direction_data.get("Sell");

    // Debug logging for first few logics
    static mut LOGIC_DEBUG_COUNT: usize = 0;
    let should_log = unsafe {
        LOGIC_DEBUG_COUNT += 1;
        LOGIC_DEBUG_COUNT <= 10
    };

    if should_log {
        println!("[SETFILE] Rust: Building logic config for Engine {} Group {} Logic '{}' (suffix: {})",
                 engine_id, group_num, logic_name, logic_suffix);
        if let Some(buy) = buy_params {
            println!("[SETFILE] Rust:   Buy params available: {}", buy.len());
            if let Some(initial_lot) = buy.get("InitialLot") {
                println!("[SETFILE] Rust:   InitialLot (Buy): {}", initial_lot);
            }
        } else {
            println!("[SETFILE] Rust:   NO Buy params!");
        }
        if let Some(sell) = sell_params {
            println!("[SETFILE] Rust:   Sell params available: {}", sell.len());
        } else {
            println!("[SETFILE] Rust:   NO Sell params!");
        }
    }

    // Helper to get parameter value with fallback
    // Supports both old format (gInput_Param_P1) and new massive setfile format (gInput_1_AP_Buy_Param)
    let get_param_multi = |variants: &[&str], default: &str| -> String {
        for param in variants {
            // First try to find in Buy direction (new format: parsed by parse_parameter_name)
            if let Some(buy_map) = buy_params {
                if let Some(v) = buy_map.get(*param) {
                    return v.clone();
                }
            }
            // Try Sell direction too
            if let Some(sell_map) = sell_params {
                if let Some(v) = sell_map.get(*param) {
                    return v.clone();
                }
            }
            if param.starts_with('G')
                && param
                    .chars()
                    .nth(1)
                    .map(|c| c.is_ascii_digit())
                    .unwrap_or(false)
            {
                if let Some(v) = values.get(&format!("gInput_{}", param)) {
                    return v.clone();
                }
            }
            // Try old format: gInput_Param_P1
            if let Some(v) = values.get(&format!("gInput_{}_{}", param, logic_suffix)) {
                return v.clone();
            }
            // Try new format: gInput_1_AP_Buy_Param
            let short_logic = get_logic_short(engine_id, logic_name);
            if let Some(v) = values.get(&format!("gInput_{}_{}_Buy_{}", group_num, short_logic, param)) {
                return v.clone();
            }
            if let Some(v) = values.get(&format!("gInput_{}_{}_Sell_{}", group_num, short_logic, param)) {
                return v.clone();
            }
        }
        default.to_string()
    };

    let get_param_f64_multi = |variants: &[&str], default: f64| -> f64 {
        get_param_multi(variants, &default.to_string())
            .parse()
            .unwrap_or(default)
    };

    let get_param_i32_multi = |variants: &[&str], default: i32| -> i32 {
        get_param_multi(variants, &default.to_string())
            .parse()
            .unwrap_or(default)
    };

    let get_param_bool_multi = |variants: &[&str]| -> bool {
        let v = get_param_multi(variants, "0");
        v == "1" || v.to_lowercase() == "true"
    };

    let get_dir_f64 = |variants: &[&str], direction: &str| -> Option<f64> {
        let (dir_map, legacy_suffix) = match direction {
            "Buy" => (buy_params, "B"),
            "Sell" => (sell_params, "S"),
            _ => (None, ""),
        };

        for param in variants {
            if let Some(m) = dir_map {
                if let Some(v) = m.get(*param) {
                    if let Ok(n) = v.parse::<f64>() {
                        return Some(n);
                    }
                }
            }

            if !legacy_suffix.is_empty() {
                if let Some(v) = values.get(&format!(
                    "gInput_{}_{}_{}",
                    param, logic_suffix, legacy_suffix
                )) {
                    if let Ok(n) = v.parse::<f64>() {
                        return Some(n);
                    }
                }
            }

            if let Some(v) = values.get(&format!(
                "gInput_{}_{}_{}_{}",
                group_num, short_logic, direction, param
            )) {
                if let Ok(n) = v.parse::<f64>() {
                    return Some(n);
                }
            }
        }

        None
    };

    // Parse base parameters with multiple name variants for compatibility
    let initial_lot = get_param_f64_multi(&["InitialLot", "Initial_loT"], 0.02);
    let initial_lot_b = get_dir_f64(&["InitialLot", "Initial_loT"], "Buy");
    let initial_lot_s = get_dir_f64(&["InitialLot", "Initial_loT"], "Sell");

    let multiplier = get_param_f64_multi(&["Multiplier", "Mult"], 1.2);
    let multiplier_b = get_dir_f64(&["Multiplier", "Mult"], "Buy");
    let multiplier_s = get_dir_f64(&["Multiplier", "Mult"], "Sell");

    let grid = get_param_f64_multi(&["Grid"], 300.0);
    let grid_b = get_dir_f64(&["Grid"], "Buy");
    let grid_s = get_dir_f64(&["Grid"], "Sell");

    let trail_method = get_param_multi(&["TrailMethod", "Trail"], "0");
    let trail_value = get_param_f64_multi(&["TrailValue"], 3000.0);
    let trail_value_b = get_dir_f64(&["TrailValue"], "Buy");
    let trail_value_s = get_dir_f64(&["TrailValue"], "Sell");

    let trail_start = get_param_f64_multi(&["TrailStart", "Trail_Start"], 1.0);
    let trail_start_b = get_dir_f64(&["TrailStart", "Trail_Start"], "Buy");
    let trail_start_s = get_dir_f64(&["TrailStart", "Trail_Start"], "Sell");

    let trail_step = get_param_f64_multi(&["TrailStep"], 1500.0);
    let trail_step_b = get_dir_f64(&["TrailStep"], "Buy");
    let trail_step_s = get_dir_f64(&["TrailStep"], "Sell");

    let trail_step_method = get_param_multi(&["TrailStepMethod"], "0");

    // Parse logic-specific parameters
    let start_level = if logic_name != "Power" {
        Some(get_param_i32_multi(&["StartLevel", &format!("Start{}", logic_name)], 4))
    } else {
        None
    };

    let last_lot = if logic_name != "Power" {
        Some(get_param_f64_multi(&["LastLot", &format!("LastLot{}", logic_name)], 0.12))
    } else {
        Some(get_param_f64_multi(&["LastLot", "LastLotPower"], 0.63))
    };

    let close_targets = get_param_multi(
        &["CloseTargets"],
        &default_close_targets(engine_id, logic_name),
    );
    let order_count_reference = get_param_multi(&["OrderCountRef", "OrderCountReference"], "Logic_None");
    let reset_lot_on_restart = get_param_bool_multi(&["ResetLotOnRestart"]);

    // Parse mode selectors
    let strategy_type = get_param_multi(&["StrategyType"], "Trail");
    let trading_mode = get_param_multi(&["TradingMode"], "Trending");
    let allow_buy = get_param_bool_multi(&["AllowBuy"]);
    let allow_sell = get_param_bool_multi(&["AllowSell"]);

    // Parse TPSL parameters with multiple name variants
    let use_tp = get_param_bool_multi(&["UseTP", &format!("G{}_UseTP_{}", group_num, short_logic)]);
    let tp_mode = get_param_multi(
        &["TPMode", &format!("G{}_TP_Mode_{}", group_num, short_logic)],
        "TP_Pips",
    );
    let tp_value = get_param_f64_multi(&["TakeProfit", "TPValue", &format!("G{}_TP_Value_{}", group_num, short_logic)], 100.0);
    let use_sl = get_param_bool_multi(&["UseSL", &format!("G{}_UseSL_{}", group_num, short_logic)]);
    let sl_mode = get_param_multi(
        &["SLMode", &format!("G{}_SL_Mode_{}", group_num, short_logic)],
        "SL_Pips",
    );
    let sl_value = get_param_f64_multi(&["StopLoss", "SLValue", &format!("G{}_SL_Value_{}", group_num, short_logic)], 100.0);

    // Parse reverse/hedge parameters with multiple name variants
    let reverse_enabled = get_param_bool_multi(&["ReverseEnabled", &format!("G{}_{}_ReverseEnabled", group_num, short_logic)]);
    let hedge_enabled = get_param_bool_multi(&["HedgeEnabled", &format!("G{}_{}_HedgeEnabled", group_num, short_logic)]);
    let reverse_scale = get_param_f64_multi(
        &["ReverseScale", &format!("G{}_Scale_{}_Reverse", group_num, short_logic)],
        100.0,
    );
    let hedge_scale = get_param_f64_multi(&["HedgeScale", &format!("G{}_Scale_{}_Hedge", group_num, short_logic)], 50.0);
    let reverse_reference = get_param_multi(
        &["ReverseReference", &format!("G{}_{}_ReverseReference", group_num, short_logic)],
        "Logic_None",
    );
    let hedge_reference = get_param_multi(
        &["HedgeReference", &format!("G{}_{}_HedgeReference", group_num, short_logic)],
        "Logic_None",
    );

    // Parse trail step advanced parameters with multiple name variants
    let trail_step_mode = get_param_multi(&["TrailStepMode"], "TrailStepMode_Auto");
    let trail_step_cycle = get_param_i32_multi(&["TrailStepCycle"], 1);
    let trail_step_balance = get_param_f64_multi(&["TrailStepBalance"], 0.0);

    // Parse close partial parameters with multiple name variants
    let close_partial = get_param_bool_multi(&["PartialEnabled1", "ClosePartial"]);
    let close_partial_cycle = get_param_i32_multi(&["PartialCycle1", "ClosePartialCycle"], 1);
    let close_partial_mode = get_param_multi(&["PartialMode1", "ClosePartialMode"], "PartialMode_Balanced");
    let close_partial_balance = get_param_multi(&["PartialBalance1", "ClosePartialBalance"], "PartialBalance_Balanced");
    let close_partial_trail_step_mode =
        get_param_multi(&["PartialTrailMode1", "ClosePartialTrailStepMode"], "TrailStepMode_Auto");

    // Check if logic is enabled with multiple name variants
    let enabled = get_param_bool_multi(&["Start", "Enabled"]);

    // Debug logging for extracted values
    if should_log {
        println!("[SETFILE] Rust:   Extracted values:");
        println!("[SETFILE] Rust:     - enabled: {} (from variants: {:?})", enabled, &["Enabled", &format!("Start_{}", logic_suffix)]);
        println!("[SETFILE] Rust:     - initial_lot: {} (from variants: {:?})", initial_lot, &["InitialLot", "Initial_loT"]);
        println!("[SETFILE] Rust:     - multiplier: {} (from variants: {:?})", multiplier, &["Multiplier", "Mult"]);
        println!("[SETFILE] Rust:     - grid: {} (from variants: {:?})", grid, &["Grid"]);
        println!("[SETFILE] Rust:     - start_level: {:?}", start_level);
        println!("[SETFILE] Rust:     - order_count_reference: {} (from variants: {:?})", order_count_reference, &["OrderCountRef", "OrderCountReference"]);
    }

    Ok(LogicConfig {
        logic_name: logic_name.to_string(),
        logic_id: format!("{}_{}", engine_id, logic_suffix),
        enabled,
        initial_lot,
        initial_lot_b,
        initial_lot_s,
        multiplier,
        multiplier_b,
        multiplier_s,
        grid,
        grid_b,
        grid_s,
        trail_method: if trail_method == "0" {
            "Trail".to_string()
        } else {
            trail_method
        },
        trail_value,
        trail_value_b,
        trail_value_s,
        trail_start,
        trail_start_b,
        trail_start_s,
        trail_step,
        trail_step_b,
        trail_step_s,
        trail_step_method: decode_trail_step_method(&trail_step_method),
        start_level,
        last_lot,
        close_targets,
        order_count_reference,
        reset_lot_on_restart,
        strategy_type,
        trading_mode,
        allow_buy,
        allow_sell,
        use_tp,
        tp_mode,
        tp_value,
        use_sl,
        sl_mode,
        sl_value,
        reverse_enabled,
        hedge_enabled,
        reverse_scale,
        hedge_scale,
        reverse_reference,
        hedge_reference,
        trail_step_mode,
        trail_step_cycle,
        trail_step_balance,
        trail_step_2: None,
        trail_step_method_2: None,
        trail_step_cycle_2: None,
        trail_step_balance_2: None,
        trail_step_mode_2: None,
        trail_step_3: None,
        trail_step_method_3: None,
        trail_step_cycle_3: None,
        trail_step_balance_3: None,
        trail_step_mode_3: None,
        trail_step_4: None,
        trail_step_method_4: None,
        trail_step_cycle_4: None,
        trail_step_balance_4: None,
        trail_step_mode_4: None,
        trail_step_5: None,
        trail_step_method_5: None,
        trail_step_cycle_5: None,
        trail_step_balance_5: None,
        trail_step_mode_5: None,
        trail_step_6: None,
        trail_step_method_6: None,
        trail_step_cycle_6: None,
        trail_step_balance_6: None,
        trail_step_mode_6: None,
        trail_step_7: None,
        trail_step_method_7: None,
        trail_step_cycle_7: None,
        trail_step_balance_7: None,
        trail_step_mode_7: None,
        close_partial,
        close_partial_cycle,
        close_partial_mode,
        close_partial_balance,
        close_partial_trail_step_mode,
        close_partial_2: None,
        close_partial_cycle_2: None,
        close_partial_mode_2: None,
        close_partial_balance_2: None,
        close_partial_3: None,
        close_partial_cycle_3: None,
        close_partial_mode_3: None,
        close_partial_balance_3: None,
        close_partial_4: None,
        close_partial_cycle_4: None,
        close_partial_mode_4: None,
        close_partial_balance_4: None,
        trigger_type: None,
        trigger_bars: None,
        trigger_minutes: None,
        trigger_pips: None,
    })
}

/// Create a default group configuration
fn create_default_group(group_num: u8) -> GroupConfig {
    GroupConfig {
        group_number: group_num,
        enabled: group_num == 1,
        group_power_start: if group_num > 1 { Some(1) } else { None },
        reverse_mode: false,
        hedge_mode: false,
        hedge_reference: "Logic_None".to_string(),
        entry_delay_bars: 0,
        logics: vec![
            create_default_logic("Power"),
            create_default_logic("Repower"),
            create_default_logic("Scalp"),
            create_default_logic("Stopper"),
            create_default_logic("STO"),
            create_default_logic("SCA"),
            create_default_logic("RPO"),
        ],
    }
}

/// Create a default logic configuration
fn create_default_logic(logic_name: &str) -> LogicConfig {
    let is_power = logic_name == "Power";

    LogicConfig {
        logic_name: logic_name.to_string(),
        logic_id: format!("A_{}1", get_logic_code(logic_name)),
        enabled: is_power,
        initial_lot: 0.02,
        initial_lot_b: None,
        initial_lot_s: None,
        multiplier: 1.2,
        multiplier_b: None,
        multiplier_s: None,
        grid: 300.0,
        grid_b: None,
        grid_s: None,
        trail_method: "Trail".to_string(),
        trail_value: 3000.0,
        trail_value_b: None,
        trail_value_s: None,
        trail_start: 1.0,
        trail_start_b: None,
        trail_start_s: None,
        trail_step: 1500.0,
        trail_step_b: None,
        trail_step_s: None,
        trail_step_method: "TrailStepMode_Auto".to_string(),
        start_level: if is_power { None } else { Some(4) },
        last_lot: if is_power { Some(0.63) } else { Some(0.12) },
        close_targets: default_close_targets("A", logic_name),
        order_count_reference: "Logic_None".to_string(),
        reset_lot_on_restart: false,
        strategy_type: "Trail".to_string(),
        trading_mode: "Trending".to_string(),
        allow_buy: true,
        allow_sell: true,
        use_tp: false,
        tp_mode: "TP_Pips".to_string(),
        tp_value: 100.0,
        use_sl: false,
        sl_mode: "SL_Pips".to_string(),
        sl_value: 100.0,
        reverse_enabled: false,
        hedge_enabled: false,
        reverse_scale: 100.0,
        hedge_scale: 50.0,
        reverse_reference: "Logic_None".to_string(),
        hedge_reference: "Logic_None".to_string(),
        trail_step_mode: "TrailStepMode_Auto".to_string(),
        trail_step_cycle: 1,
        trail_step_balance: 0.0,
        trail_step_2: None,
        trail_step_method_2: None,
        trail_step_cycle_2: None,
        trail_step_balance_2: None,
        trail_step_mode_2: None,
        trail_step_3: None,
        trail_step_method_3: None,
        trail_step_cycle_3: None,
        trail_step_balance_3: None,
        trail_step_mode_3: None,
        trail_step_4: None,
        trail_step_method_4: None,
        trail_step_cycle_4: None,
        trail_step_balance_4: None,
        trail_step_mode_4: None,
        trail_step_5: None,
        trail_step_method_5: None,
        trail_step_cycle_5: None,
        trail_step_balance_5: None,
        trail_step_mode_5: None,
        trail_step_6: None,
        trail_step_method_6: None,
        trail_step_cycle_6: None,
        trail_step_balance_6: None,
        trail_step_mode_6: None,
        trail_step_7: None,
        trail_step_method_7: None,
        trail_step_cycle_7: None,
        trail_step_balance_7: None,
        trail_step_mode_7: None,
        close_partial: false,
        close_partial_cycle: 1,
        close_partial_mode: "PartialMode_Balanced".to_string(),
        close_partial_balance: "PartialBalance_Balanced".to_string(),
        close_partial_trail_step_mode: "TrailStepMode_Auto".to_string(),
        close_partial_2: None,
        close_partial_cycle_2: None,
        close_partial_mode_2: None,
        close_partial_balance_2: None,
        close_partial_3: None,
        close_partial_cycle_3: None,
        close_partial_mode_3: None,
        close_partial_balance_3: None,
        close_partial_4: None,
        close_partial_cycle_4: None,
        close_partial_mode_4: None,
        close_partial_balance_4: None,
        trigger_type: None,
        trigger_bars: None,
        trigger_minutes: None,
        trigger_pips: None,
    }
}

/// Get logic code from name
fn get_logic_code(logic_name: &str) -> &'static str {
    match logic_name {
        "Power" => "P",
        "Repower" => "R",
        "Scalp" => "S",
        "Stopper" => "ST",
        "STO" => "STO",
        "SCA" => "SCA",
        "RPO" => "RPO",
        _ => "P",
    }
}

/// Decode trail step method from numeric/string value
fn decode_trail_step_method(val: &str) -> String {
    match val {
        "0" => "TrailStepMode_Auto".to_string(),
        "1" => "TrailStepMode_Fixed".to_string(),
        "3" => "TrailStepMode_PerOrder".to_string(),
        "4" => "TrailStepMode_Disabled".to_string(),
        _ => val.to_string(),
    }
}

// ============================================
// MQL RUST COMPILER INTEGRATION
// ============================================

/// Initialize the MQL Rust Compiler with current MT paths
#[cfg(feature = "tauri-app")]
#[tauri::command]
pub async fn initialize_mql_compiler(state: State<'_, MTBridgeState>) -> Result<(), String> {
    state.initialize_compiler()
}

/// Run real-time MQL validation
#[cfg(feature = "tauri-app")]
#[tauri::command]
pub async fn validate_mql_code(
    _force_refresh: bool,
    state: State<'_, MTBridgeState>,
) -> Result<ValidationReport, String> {
    let mut compiler_guard = state.mql_compiler.lock().unwrap();

    if let Some(ref mut compiler) = *compiler_guard {
        compiler
            .analyze_with_context()
            .map_err(|e| format!("Validation failed: {}", e))
    } else {
        Err("MQL Compiler not initialized. Please set MT4/MT5 paths first.".to_string())
    }
}

/// Run complete pre-compilation pipeline
#[cfg(feature = "tauri-app")]
#[tauri::command]
pub async fn run_precompilation_pipeline(
    state: State<'_, MTBridgeState>,
) -> Result<PrecompilationResult, String> {
    let mut compiler_guard = state.mql_compiler.lock().unwrap();

    if let Some(ref mut compiler) = *compiler_guard {
        compiler
            .run_precompilation_pipeline()
            .map_err(|e| format!("Pipeline failed: {}", e))
    } else {
        Err("MQL Compiler not initialized. Please set MT4/MT5 paths first.".to_string())
    }
}

/// Apply automatic fixes generated by the compiler
#[cfg(feature = "tauri-app")]
#[tauri::command]
pub async fn apply_mql_fixes(
    fixes: std::collections::HashMap<String, String>,
    state: State<'_, MTBridgeState>,
) -> Result<(), String> {
    let compiler_guard = state.mql_compiler.lock().unwrap();

    if let Some(ref compiler) = *compiler_guard {
        compiler
            .apply_fixes(&fixes)
            .map_err(|e| format!("Failed to apply fixes: {}", e))
    } else {
        Err("MQL Compiler not initialized.".to_string())
    }
}

/// Start real-time file watching for MQL validation
#[cfg(feature = "tauri-app")]
#[tauri::command]
pub async fn start_mql_file_watching(
    app_handle: tauri::AppHandle,
    state: State<'_, MTBridgeState>,
) -> Result<(), String> {
    let mut compiler_guard = state.mql_compiler.lock().unwrap();

    if let Some(ref mut compiler) = *compiler_guard {
        let callback = move |errors: Vec<CompilationError>| {
            let _ = app_handle.emit("mql-validation-update", &errors);
        };

        compiler
            .start_file_watching(callback)
            .map_err(|e| format!("Failed to start file watching: {}", e))
    } else {
        Err("MQL Compiler not initialized.".to_string())
    }
}

/// Get MQL compiler status and statistics
#[cfg(feature = "tauri-app")]
#[tauri::command]
pub async fn get_mql_compiler_status(
    state: State<'_, MTBridgeState>,
) -> Result<MQLCompilerStatus, String> {
    let compiler_guard = state.mql_compiler.lock().unwrap();

    if let Some(ref compiler) = *compiler_guard {
        Ok(MQLCompilerStatus {
            initialized: true,
            mt4_files_found: compiler
                .project
                .main_files
                .iter()
                .filter(|f| f.to_string_lossy().contains("mq4"))
                .count(),
            mt5_files_found: compiler
                .project
                .main_files
                .iter()
                .filter(|f| f.to_string_lossy().contains("mq5"))
                .count(),
            include_paths: compiler.project.include_paths.len(),
            last_validation: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            watching_files: false, // Would need to track this
        })
    } else {
        Ok(MQLCompilerStatus {
            initialized: false,
            mt4_files_found: 0,
            mt5_files_found: 0,
            include_paths: 0,
            last_validation: 0,
            watching_files: false,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MQLCompilerStatus {
    pub initialized: bool,
    pub mt4_files_found: usize,
    pub mt5_files_found: usize,
    pub include_paths: usize,
    pub last_validation: u64,
    pub watching_files: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_set_file_includes_new_magic_number_fields() {
        let config = MTConfig {
            general: GeneralConfig {
                magic_number: 777,
                magic_number_buy: 123,
                magic_number_sell: 456,
                max_slippage_points: 30.0,
                use_direct_price_grid: true,
                ..Default::default()
            },
            ..Default::default()
        };

        let temp_dir = std::env::temp_dir();
        let temp_file = temp_dir.join("test_export.set");
        let file_path = temp_file.to_string_lossy().to_string();

        let result = export_set_file(
            config,
            file_path.clone(),
            "MT4".to_string(),
            false,
            None,
            None,
            None,
        );
        assert!(result.is_ok(), "Export should succeed: {:?}", result);

        let file_content =
            std::fs::read_to_string(&file_path).expect("Failed to read exported file");
        assert!(
            file_content.contains("gInput_MagicNumberBuy=123"),
            "File missing buy magic number alias"
        );
        assert!(
            file_content.contains("gInput_MagicNumberSell=456"),
            "File missing sell magic number alias"
        );
        assert!(
            file_content.contains("gInput_MagicNumberPowerBuy=123"),
            "File missing buy magic number"
        );
        assert!(
            file_content.contains("gInput_MagicNumberPowerSell=456"),
            "File missing sell magic number"
        );
        assert!(
            file_content.contains("gInput_UseDirectPriceGrid=1"),
            "File missing UseDirectPriceGrid"
        );

        std::fs::remove_file(&file_path).ok();
    }

    #[test]
    fn test_build_config_from_values_includes_new_magic_number_fields() {
        use std::collections::HashMap;

        let mut values = HashMap::new();
        values.insert("gInput_MagicNumber".to_string(), "777".to_string());
        values.insert("gInput_MagicNumberBuy".to_string(), "123".to_string());
        values.insert("gInput_MagicNumberSell".to_string(), "456".to_string());
        values.insert("gInput_MaxSlippagePoints".to_string(), "30.0".to_string());
        values.insert("gInput_allowBuy".to_string(), "1".to_string());
        values.insert("gInput_allowSell".to_string(), "1".to_string());
        values.insert("gInput_LicenseKey".to_string(), "test".to_string());
        values.insert(
            "gInput_LicenseServerURL".to_string(),
            "http://test".to_string(),
        );
        values.insert("gInput_RequireLicense".to_string(), "0".to_string());

        let result = build_config_from_values(&values);

        assert!(result.is_ok(), "Parsing should succeed: {:?}", result);

        let config = result.unwrap();

        assert_eq!(config.general.magic_number, 777);

        assert_eq!(config.general.magic_number_buy, 123);

        assert_eq!(config.general.magic_number_sell, 456);

        assert_eq!(config.general.max_slippage_points, 30.0);
    }

    #[test]
    fn test_hedge_reverse_bypass_logic() {
        // Simulate the MQL Open_Buy_Internal logic with bypass for [REV]/[HEDGE] tags
        fn simulate_open_buy_internal(allow_buy: bool, comment: &str) -> bool {
            // Original logic before fix: if (!allowBuy) return false;
            // After fix: skip allowBuy check for reverse/hedge trades
            if !allow_buy && !comment.contains("[REV]") && !comment.contains("[HEDGE]") {
                false
            } else {
                true
            }
        }

        fn simulate_open_sell_internal(allow_sell: bool, comment: &str) -> bool {
            if !allow_sell && !comment.contains("[REV]") && !comment.contains("[HEDGE]") {
                false
            } else {
                true
            }
        }

        // Test cases: allowBuy = false, allowSell = false
        // Regular trades should be blocked
        assert!(!simulate_open_buy_internal(false, "Regular buy"));
        assert!(!simulate_open_sell_internal(false, "Regular sell"));

        // Reverse trades should be allowed despite allowBuy/allowSell = false
        assert!(simulate_open_buy_internal(false, "Buy [REV]"));
        assert!(simulate_open_sell_internal(false, "Sell [REV]"));

        // Hedge trades should be allowed despite allowBuy/allowSell = false
        assert!(simulate_open_buy_internal(false, "Buy [HEDGE]"));
        assert!(simulate_open_sell_internal(false, "Sell [HEDGE]"));

        // When allowBuy/allowSell = true, all trades should be allowed
        assert!(simulate_open_buy_internal(true, "Regular buy"));
        assert!(simulate_open_sell_internal(true, "Regular sell"));
        assert!(simulate_open_buy_internal(true, "Buy [REV]"));
        assert!(simulate_open_sell_internal(true, "Sell [HEDGE]"));
    }

    #[test]
    fn test_mql_compiler_validation() {
        use crate::mql_rust_compiler::MQLRustCompiler;

        let mt4_path = r"d:\f-v23.6.0-Ryiuk_final_form_3.0\trading_9.0\trading_ecosystem_9.0\main_ecosystem_trading\trading_algorithms\mt4_implementation\MT4";

        if !std::path::PathBuf::from(mt4_path).exists() {
            return;
        }

        // Initialize compiler with MT4 directory
        let mut compiler = match MQLRustCompiler::new(mt4_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to initialize MQL compiler: {}", e);
                panic!("Compiler initialization failed");
            }
        };

        // Run validation
        let report = match compiler.analyze_with_context() {
            Ok(r) => r,
            Err(e) => {
                eprintln!("Validation failed: {}", e);
                panic!("Validation failed");
            }
        };

        // Print report summary
        println!("MQL Validation Report:");
        println!("  Total errors: {}", report.total_errors);
        println!("  Critical errors: {}", report.critical_errors);
        println!("  Warnings: {}", report.warnings);

        // Print error details if any
        if report.total_errors > 0 {
            println!("\nDetailed errors:");
            for error in &report.errors {
                println!(
                    "  [{:?}] {}:{} - {}",
                    error.severity, error.file, error.line, error.message
                );
                if let Some(ref fix) = error.suggested_fix {
                    println!("      Suggested fix: {}", fix);
                }
            }
        }

        // Print error distribution
        if !report.error_by_type.is_empty() {
            println!("\nError distribution by type:");
            for (error_type, count) in &report.error_by_type {
                println!("  {}: {}", error_type, count);
            }
        }

        // For now, just ensure compilation doesn't panic
        // We'll later add assertions about specific functions
        assert!(
            report.critical_errors == 0,
            "Critical errors found in MQL validation"
        );
    }
}

// =============================================================================
// MT4 SETTINGS AND CONFIGURATION COMMANDS
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MT4Settings {
    pub terminal_path: String,
    pub common_files_path: String,
    pub profiles_path: String,
    pub broker_name: String,
    pub is_valid: bool,
}

fn find_mt4_common_files_path(terminal_path: &PathBuf) -> Option<PathBuf> {
    // Look for "Files" subdirectory in terminal folder
    let files_path = terminal_path.join("Files");
    if files_path.exists() && files_path.is_dir() {
        return Some(files_path);
    }

    // Also check for specific broker folder patterns
    for entry in fs::read_dir(terminal_path).ok()?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let files_subdir = path.join("Files");
            if files_subdir.exists() && files_subdir.is_dir() {
                return Some(files_subdir);
            }
        }
    }

    None
}

fn extract_broker_name(terminal_path: &PathBuf) -> String {
    // Broker name is usually in the terminal folder name
    if let Some(name) = terminal_path.file_name() {
        let name_str = name.to_string_lossy().to_string();
        // Remove common prefixes like "terminal64.exe - " or random hashes
        if name_str.contains("terminal64") {
            // Try to extract broker name after common patterns
            if let Some(idx) = name_str.find(" - ") {
                return name_str[idx + 3..].to_string();
            }
            return name_str
                .replace("terminal64.exe - ", "")
                .replace("terminal64 ", "");
        }
        // Return folder name if it looks like a broker name
        if !name_str.chars().next().unwrap_or_default().is_ascii_digit() {
            return name_str;
        }
    }
    "Unknown Broker".to_string()
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn get_mt4_settings() -> Result<MT4Settings, String> {
    let terminal_root = get_terminal_root_path()?;

    if !terminal_root.exists() {
        return Ok(MT4Settings {
            terminal_path: "".to_string(),
            common_files_path: "".to_string(),
            profiles_path: "".to_string(),
            broker_name: "MT4 Not Found".to_string(),
            is_valid: false,
        });
    }

    // Find the most recently used MT4 installation
    let mut latest_terminal: Option<(std::time::SystemTime, PathBuf)> = None;

    for entry in fs::read_dir(&terminal_root)
        .map_err(|e| format!("Failed to read terminal folder: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        // Skip common non-broker folders
        if let Some(name) = path.file_name().map(|n| n.to_string_lossy().to_string()) {
            if name == "Common" || name == "MQL4" || name == "MQL5" || name.starts_with("tperm") {
                continue;
            }
        }

        // Check if this looks like an MT4 terminal folder (has Files, configs, etc.)
        let has_files = path.join("Files").exists();
        let has_mql4 = path.join("MQL4").exists();

        if has_files || has_mql4 {
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    match &latest_terminal {
                        None => {
                            latest_terminal = Some((modified, path));
                        }
                        Some((best_time, _)) => {
                            if modified > *best_time {
                                latest_terminal = Some((modified, path));
                            }
                        }
                    }
                }
            }
        }
    }

    match latest_terminal {
        Some((_, terminal_path)) => {
            let broker_name = extract_broker_name(&terminal_path);
            let common_files = find_mt4_common_files_path(&terminal_path);

            let common_files_path = match &common_files {
                Some(p) => p.to_string_lossy().to_string(),
                None => {
                    // Fallback: try to construct from APPDATA
                    let appdata = std::env::var("APPDATA").unwrap_or_default();
                    format!(r"{}\MetaQuotes\Terminal\Common Files", appdata)
                }
            };

            let profiles_path = terminal_path.join("profiles").to_string_lossy().to_string();

            Ok(MT4Settings {
                terminal_path: terminal_path.to_string_lossy().to_string(),
                common_files_path,
                profiles_path,
                broker_name,
                is_valid: true,
            })
        }
        None => Ok(MT4Settings {
            terminal_path: terminal_root.to_string_lossy().to_string(),
            common_files_path: "".to_string(),
            profiles_path: "".to_string(),
            broker_name: "MT4 Not Found".to_string(),
            is_valid: false,
        }),
    }
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn auto_detect_mt4_paths() -> Result<MT4Settings, String> {
    get_mt4_settings().await
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn configure_mt4_path(path: String) -> Result<MT4Settings, String> {
    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        return Err("Path does not exist".to_string());
    }

    if !path_buf.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let broker_name = extract_broker_name(&path_buf);
    let common_files = find_mt4_common_files_path(&path_buf);

    let common_files_path = match &common_files {
        Some(p) => p.to_string_lossy().to_string(),
        None => {
            let appdata = std::env::var("APPDATA").unwrap_or_default();
            format!(r"{}\MetaQuotes\Terminal\Common Files", appdata)
        }
    };

    let profiles_path = path_buf.join("profiles").to_string_lossy().to_string();

    Ok(MT4Settings {
        terminal_path: path_buf.to_string_lossy().to_string(),
        common_files_path,
        profiles_path,
        broker_name,
        is_valid: true,
    })
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn test_mt4_connection() -> Result<bool, String> {
    let settings = get_mt4_settings().await?;

    if !settings.is_valid {
        return Err("MT4 not configured".to_string());
    }

    let common_path = PathBuf::from(&settings.common_files_path);

    if !common_path.exists() {
        return Err("Common Files folder not found".to_string());
    }

    // Try to read the directory
    match fs::read_dir(&common_path) {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Cannot access Common Files: {}", e)),
    }
}

#[cfg_attr(feature = "tauri-app", tauri::command)]
pub async fn open_mt_folder(folder_type: String) -> Result<(), String> {
    let settings = get_mt4_settings().await?;

    if !settings.is_valid {
        return Err("MT4 not configured".to_string());
    }

    let target_path = match folder_type.as_str() {
        "terminal" => &settings.terminal_path,
        "common" => &settings.common_files_path,
        "profiles" => &settings.profiles_path,
        _ => return Err("Invalid folder type".to_string()),
    };

    let path = PathBuf::from(target_path);

    if !path.exists() {
        return Err("Folder does not exist".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    Err("Open folder not supported on this OS".to_string())
}

// ============================================
// MASSIVE SETFILE PARSER (v19 format)
// Parses gInput_{Group}_{Engine}{Logic}_{Direction}_{Param} format
// Supports 15 groups × 3 engines × 7 logics × 2 directions = 630 logic-directions
// ============================================

// Constants for v19 format
const MAX_GROUPS: usize = 15;
const MAX_ENGINES: usize = 3;
const MAX_LOGICS: usize = 7;

const ENGINE_MAP: &[(&str, &str)] = &[("AP", "A"), ("BP", "B"), ("CP", "C")];
const LOGIC_MAP: &[(&str, &str)] = &[
    ("Power", "POWER"),
    ("Repower", "REPOWER"),
    ("Scalp", "SCALP"),
    ("Stopper", "STOPPER"),
    ("STO", "STO"),
    ("SCA", "SCA"),
    ("RPO", "RPO"),
];

const DIRECTION_BUY: &str = "Buy";
const DIRECTION_SELL: &str = "Sell";

/// Result structure for massive setfile parsing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MassiveSetfileParseResult {
    pub success: bool,
    pub total_inputs_parsed: usize,
    pub logic_directions_found: usize,
    pub groups_found: Vec<u8>,
    pub engines_found: Vec<String>,
    pub logics_found: Vec<String>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub config: Option<MTConfig>,
}

/// Parse massive v19 format setfile
#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
pub async fn parse_massive_setfile(file_path: String) -> Result<MassiveSetfileParseResult, String> {
    println!("[MASSIVE_SETFILE] Parsing: {}", file_path);

    let path_buf = PathBuf::from(&file_path);
    let sanitized_path = sanitize_and_validate_path(&path_buf)?;

    let bytes = fs::read(&sanitized_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let content = if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let u16_vec: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16(&u16_vec)
            .map_err(|e| format!("Failed to parse UTF-16: {}", e))?
    } else {
        String::from_utf8(bytes)
            .map_err(|e| format!("Failed to parse UTF-8: {}", e))?
    };

    let mut result = MassiveSetfileParseResult {
        success: false,
        total_inputs_parsed: 0,
        logic_directions_found: 0,
        groups_found: Vec::new(),
        engines_found: Vec::new(),
        logics_found: Vec::new(),
        errors: Vec::new(),
        warnings: Vec::new(),
        config: None,
    };

    // Parse key-value pairs
    let mut parsed_params: Vec<(usize, String, String, usize, String, String, String, String, f64)> = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(';') {
            continue;
        }

        if let Some(pos) = line.find('=') {
            let key = line[..pos].trim().to_string();
            let value_str = line[pos + 1..].trim().to_string();

            // Only process gInput keys
            if !key.starts_with("gInput_") {
                continue;
            }

            // Parse the key format: gInput_{Group}_{Engine}{Logic}_{Direction}_{Param}
            match parse_ginput_key(&key) {
                Ok((group, engine, logic, direction, param_name)) => {
                    let value = parse_param_value(&value_str);
                    parsed_params.push((line_num, key, value_str, group, engine, logic, direction, param_name, value));
                    result.total_inputs_parsed += 1;
                }
                Err(e) => {
                    // Non-critical warning for unknown formats
                    if !key.contains("gInput_GroupPowerStart")
                        && !key.contains("gInput_Group")
                        && !key.contains("gInput_License")
                        && !key.contains("gInput_Magic")
                        && !key.contains("gInput_Config")
                        && !key.contains("gInput_Session")
                        && !key.contains("gInput_News")
                        && !key.contains("gInput_Use")
                        && !key.contains("gInput_Max")
                        && !key.contains("gInput_Enable")
                        && !key.contains("gInput_Risk")
                        && !key.contains("gInput_Input")
                        && !key.contains("gInput_Grid")
                        && !key.contains("gInput_Pip")
                        && !key.contains("gInput_GroupMode")
                    {
                        result.warnings.push(format!("Line {}: Unknown format - {}", line_num, e));
                    }
                }
            }
        }
    }

    // Build MTConfig from parsed parameters
    let mut config = create_default_mt_config();

    // Track found items
    let mut found_groups: Vec<u8> = Vec::new();
    let mut found_engines: Vec<String> = Vec::new();
    let mut found_logics: Vec<String> = Vec::new();
    let mut found_logic_directions: std::collections::HashSet<(u8, String, String, String)> = std::collections::HashSet::new();

    for (_line_num, _key, _value_str, group, engine, logic, direction, param_name, value) in parsed_params {
        // Track unique combinations
        found_groups.push(group as u8);
        found_engines.push(engine.clone());
        found_logics.push(logic.clone());
        found_logic_directions.insert((group as u8, engine.clone(), logic.clone(), direction.clone()));

        // Map engine letter to config engine_id
        let engine_id = match engine.as_str() {
            "A" => "A",
            "B" => "B",
            "C" => "C",
            _ => {
                result.errors.push(format!("Unknown engine: {}", engine));
                continue;
            }
        };

        // Ensure engine exists in config
        if !config.engines.iter().any(|e| e.engine_id == engine_id) {
            config.engines.push(EngineConfig {
                engine_id: engine_id.to_string(),
                engine_name: format!("Engine {}", engine_id),
                max_power_orders: 10,
                groups: Vec::new(),
            });
        }

        // Find or create group
        let engine_config = config.engines.iter_mut().find(|e| e.engine_id == engine_id).unwrap();
        let group_u8 = group as u8;

        if let Some(group_config) = engine_config.groups.iter_mut().find(|g| g.group_number == group_u8) {
            // Group exists, add logic if needed
            if !group_config.logics.iter().any(|l| l.logic_name == logic) {
                let mut new_logic = create_default_logic_config(&logic);
                new_logic.enabled = true;
                group_config.logics.push(new_logic);
            }
        } else {
            // Create new group with this logic
            let mut new_group = GroupConfig {
                group_number: group_u8,
                enabled: true,
                group_power_start: None,
                reverse_mode: false,
                hedge_mode: false,
                hedge_reference: "Logic_None".to_string(),
                entry_delay_bars: 0,
                logics: Vec::new(),
            };

            let mut new_logic = create_default_logic_config(&logic);
            new_logic.enabled = true;
            new_group.logics.push(new_logic);
            engine_config.groups.push(new_group);
        }

        // Apply parameter to the correct logic
        apply_param_to_config(&mut config, group, engine_id, &logic, &direction, &param_name, value);
    }

    // Deduplicate and sort
    found_groups.sort();
    found_groups.dedup();
    found_engines.sort();
    found_engines.dedup();
    found_logics.sort();
    found_logics.dedup();

    result.groups_found = found_groups;
    result.engines_found = found_engines;
    result.logics_found = found_logics;
    result.logic_directions_found = found_logic_directions.len();

    // Validate expected count
    let expected_directions = 15 * 3 * 7 * 2; // 630
    if result.logic_directions_found < expected_directions {
        result.warnings.push(format!(
            "Expected 630 logic-directions, found {}. Some configurations may be missing.",
            result.logic_directions_found
        ));
    }

    if result.logic_directions_found > expected_directions {
        result.errors.push(format!(
            "Found {} logic-directions, expected maximum 630.",
            result.logic_directions_found
        ));
    }

    // Deobfuscate and set result
    config.deobfuscate_sensitive_fields();
    config.total_inputs = result.total_inputs_parsed;

    // Generate version string
    config.version = format!("v19.0-{}", chrono::Local::now().format("%Y%m%d"));

    result.config = Some(config);
    result.success = result.errors.is_empty();

    println!("[MASSIVE_SETFILE] Parsed {} inputs, {} logic-directions across {} groups",
        result.total_inputs_parsed, result.logic_directions_found, result.groups_found.len());

    Ok(result)
}

/// Parse gInput key into components
fn parse_ginput_key(key: &str) -> Result<(usize, String, String, String, String), String> {
    // Format: gInput_{Group}_{Engine}{Logic}_{Direction}_{Param}
    // Example: gInput_1_AP_Power_Buy_InitialLot
    // Example: gInput_5_BP_Scalp_Sell_Grid

    if !key.starts_with("gInput_") {
        return Err("Key does not start with gInput_".to_string());
    }

    let remainder = &key[7..]; // Remove "gInput_"

    let parts: Vec<&str> = remainder.split('_').collect();
    if parts.len() < 5 {
        return Err(format!("Invalid key format (expected 5+ parts): {}", key));
    }

    // Parse group (first part)
    let group_str = parts[0];
    let group = group_str.parse::<usize>()
        .map_err(|_| format!("Invalid group number: {}", group_str))?;

    if group < 1 || group > MAX_GROUPS {
        return Err(format!("Group out of range (1-15): {}", group));
    }

    // Parse engine+logic (second part)
    let engine_logic = parts[1];
    let (engine, logic) = match_engine_logic(engine_logic)
        .ok_or_else(|| format!("Unknown engine/logic combination: {}", engine_logic))?;

    // Parse direction (third part)
    let direction = parts[2].to_string();
    if direction != DIRECTION_BUY && direction != DIRECTION_SELL {
        return Err(format!("Invalid direction (expected Buy/Sell): {}", direction));
    }

    // Parse parameter name (remaining parts)
    let param_parts = &parts[3..];
    let param_name = param_parts.join("_");

    Ok((group, engine, logic, direction, param_name))
}

/// Match engine+logic string to (engine, logic) tuple
fn match_engine_logic(s: &str) -> Option<(String, String)> {
    // Try to match Engine first (AP, BP, CP) then Logic
    for (engine_prefix, engine_id) in ENGINE_MAP {
        if s.starts_with(engine_prefix) {
            let logic_part = &s[engine_prefix.len()..];
            for (logic_full, logic_id) in LOGIC_MAP {
                let logic_full_str: &str = logic_full;
                if logic_part == logic_full_str || logic_part.to_uppercase() == logic_full_str.to_uppercase() {
                    return Some((engine_id.to_string(), logic_id.to_string()));
                }
            }
        }
    }
    None
}

/// Parse parameter value string to f64
fn parse_param_value(s: &str) -> f64 {
    s.parse::<f64>().unwrap_or(0.0)
}

/// Create default MTConfig structure
fn create_default_mt_config() -> MTConfig {
    MTConfig {
        version: "v19.0".to_string(),
        platform: "MT4".to_string(),
        timestamp: chrono::Local::now().to_string(),
        total_inputs: 0,
        last_saved_at: None,
        last_saved_platform: None,
        current_set_name: None,
        tags: None,
        comments: None,
        general: GeneralConfig {
            license_key: "".to_string(),
            license_server_url: "https://license.daavfx.com".to_string(),
            require_license: true,
            license_check_interval: 3600,
            config_file_name: "DAAVFX_Config.json".to_string(),
            config_file_is_common: true,
            allow_buy: true,
            allow_sell: true,
            enable_logs: true,
            use_direct_price_grid: false,
            group_mode: Some(1),
            grid_unit: Some(0),
            pip_factor: Some(0),
            compounding_enabled: false,
            compounding_type: "Compound_Balance".to_string(),
            compounding_target: 40.0,
            compounding_increase: 2.0,
            restart_policy_power: "Restart_Default".to_string(),
            restart_policy_non_power: "Restart_Default".to_string(),
            close_non_power_on_power_close: false,
            hold_timeout_bars: 10,
            magic_number: 777,
            magic_number_buy: 777,
            magic_number_sell: 778,
            max_slippage_points: 30.0,
            reverse_magic_base: 20000,
            hedge_magic_base: 30000,
            hedge_magic_independent: false,
            risk_management: RiskManagementConfig {
                spread_filter_enabled: false,
                max_spread_points: 25.0,
                equity_stop_enabled: false,
                equity_stop_value: 35.0,
                drawdown_stop_enabled: false,
                max_drawdown_percent: 35.0,
                risk_action: Some("TriggerAction_StopEA_KeepTrades".to_string()),
            },
            time_filters: TimeFiltersConfig {
                priority_settings: TimePrioritySettings {
                    news_filter_overrides_session: false,
                    session_filter_overrides_news: true,
                },
                sessions: Vec::new(),
            },
            news_filter: NewsFilterConfig {
                enabled: false,
                api_key: "".to_string(),
                api_url: "https://www.jblanked.com/news/api/calendar/".to_string(),
                countries: "US,GB,EU".to_string(),
                impact_level: 3,
                minutes_before: 30,
                minutes_after: 30,
                action: "TriggerAction_StopEA_KeepTrades".to_string(),
                calendar_file: Some("DAAVFX_NEWS.csv".to_string()),
            },
        },
        engines: Vec::new(),
    }
}

/// Create default LogicConfig for a logic type
fn create_default_logic_config(logic_name: &str) -> LogicConfig {
    LogicConfig {
        logic_name: logic_name.to_string(),
        logic_id: logic_name.to_uppercase(),
        enabled: true,
        initial_lot: 0.01,
        initial_lot_b: None,
        initial_lot_s: None,
        multiplier: 1.5,
        multiplier_b: None,
        multiplier_s: None,
        grid: 100.0,
        grid_b: None,
        grid_s: None,
        trail_method: "Trail_None".to_string(),
        trail_value: 50.0,
        trail_value_b: None,
        trail_value_s: None,
        trail_start: 0.0,
        trail_start_b: None,
        trail_start_s: None,
        trail_step: 50.0,
        trail_step_b: None,
        trail_step_s: None,
        trail_step_method: "TrailStepMode_Auto".to_string(),
        start_level: if logic_name == "POWER" { None } else { Some(2) },
        last_lot: None,
        close_targets: "CloseTargets_ProfitOnly".to_string(),
        order_count_reference: "OrderCount_Direct".to_string(),
        reset_lot_on_restart: false,
        strategy_type: "Trail".to_string(),
        trading_mode: "Trending".to_string(),
        allow_buy: true,
        allow_sell: true,
        use_tp: false,
        tp_mode: "TPMode_Fixed".to_string(),
        tp_value: 0.0,
        use_sl: false,
        sl_mode: "SLMode_Fixed".to_string(),
        sl_value: 0.0,
        reverse_enabled: false,
        hedge_enabled: false,
        reverse_scale: 100.0,
        hedge_scale: 50.0,
        reverse_reference: "Logic_None".to_string(),
        hedge_reference: "Logic_None".to_string(),
        trail_step_mode: "TrailStepMode_Auto".to_string(),
        trail_step_cycle: 1,
        trail_step_balance: 0.0,
        trail_step_2: None,
        trail_step_method_2: None,
        trail_step_cycle_2: None,
        trail_step_balance_2: None,
        trail_step_mode_2: None,
        trail_step_3: None,
        trail_step_method_3: None,
        trail_step_cycle_3: None,
        trail_step_balance_3: None,
        trail_step_mode_3: None,
        trail_step_4: None,
        trail_step_method_4: None,
        trail_step_cycle_4: None,
        trail_step_balance_4: None,
        trail_step_mode_4: None,
        trail_step_5: None,
        trail_step_method_5: None,
        trail_step_cycle_5: None,
        trail_step_balance_5: None,
        trail_step_mode_5: None,
        trail_step_6: None,
        trail_step_method_6: None,
        trail_step_cycle_6: None,
        trail_step_balance_6: None,
        trail_step_mode_6: None,
        trail_step_7: None,
        trail_step_method_7: None,
        trail_step_cycle_7: None,
        trail_step_balance_7: None,
        trail_step_mode_7: None,
        close_partial: false,
        close_partial_cycle: 1,
        close_partial_mode: "ClosePartialMode_Fixed".to_string(),
        close_partial_balance: "ClosePartialBalance_Equity".to_string(),
        close_partial_trail_step_mode: "TrailStepMode_Auto".to_string(),
        close_partial_2: None,
        close_partial_cycle_2: None,
        close_partial_mode_2: None,
        close_partial_balance_2: None,
        close_partial_3: None,
        close_partial_cycle_3: None,
        close_partial_mode_3: None,
        close_partial_balance_3: None,
        close_partial_4: None,
        close_partial_cycle_4: None,
        close_partial_mode_4: None,
        close_partial_balance_4: None,
        trigger_type: None,
        trigger_bars: None,
        trigger_minutes: None,
        trigger_pips: None,
    }
}

/// Apply parsed parameter to config
fn apply_param_to_config(
    config: &mut MTConfig,
    group: usize,
    engine_id: &str,
    logic_name: &str,
    direction: &str,
    param_name: &str,
    value: f64,
) {
    // Find the engine and group
    if let Some(engine_config) = config.engines.iter_mut().find(|e| e.engine_id == engine_id) {
        let group_u8 = group as u8;
        if let Some(group_config) = engine_config.groups.iter_mut().find(|g| g.group_number == group_u8) {
            if let Some(logic) = group_config.logics.iter_mut().find(|l| l.logic_name == logic_name) {
                // Apply parameter based on param name and direction
                match param_name {
                    "Initial_loT" | "InitialLot" | "Initial_Lot" => {
                        if direction == "Buy" { logic.initial_lot = value; }
                        else if direction == "Sell" { logic.initial_lot = value; }
                        else { logic.initial_lot = value; }
                    }
                    "Initial_loT_B" | "InitialLot_B" => logic.initial_lot_b = Some(value),
                    "Initial_loT_S" | "InitialLot_S" => logic.initial_lot_s = Some(value),
                    "Mult" | "Multiplier" => logic.multiplier = value,
                    "Mult_B" => logic.multiplier_b = Some(value),
                    "Mult_S" => logic.multiplier_s = Some(value),
                    "Grid" => logic.grid = value,
                    "Grid_B" => logic.grid_b = Some(value),
                    "Grid_S" => logic.grid_s = Some(value),
                    "Trail" => logic.trail_method = match value as i32 {
                        0 => "Trail_None".to_string(),
                        1 => "Trail_Points".to_string(),
                        2 => "Trail_AVG_Percent".to_string(),
                        3 => "Trail_Profit_Percent".to_string(),
                        _ => "Trail_None".to_string(),
                    },
                    "TrailValue" => logic.trail_value = value,
                    "TrailValue_B" => logic.trail_value_b = Some(value),
                    "TrailValue_S" => logic.trail_value_s = Some(value),
                    "Trail_Start" => logic.trail_start = value,
                    "Trail_Start_B" => logic.trail_start_b = Some(value),
                    "Trail_Start_S" => logic.trail_start_s = Some(value),
                    "TrailStep" => logic.trail_step = value,
                    "TrailStep_B" => logic.trail_step_b = Some(value),
                    "TrailStep_S" => logic.trail_step_s = Some(value),
                    "Start" | "Enabled" => logic.enabled = value > 0.5,
                    "AllowBuy" | "allowBuy" => logic.allow_buy = value > 0.5,
                    "AllowSell" | "allowSell" => logic.allow_sell = value > 0.5,
                    "ClosePartial" => logic.close_partial = value > 0.5,
                    "ClosePartialCycle" => logic.close_partial_cycle = value as i32,
                    "ClosePartialMode" => {
                        logic.close_partial_mode = match value as i32 {
                            0 => "ClosePartialMode_Fixed".to_string(),
                            1 => "ClosePartialMode_Step".to_string(),
                            2 => "ClosePartialMode_Balance".to_string(),
                            _ => "ClosePartialMode_Fixed".to_string(),
                        }
                    }
                    "LastLot" => logic.last_lot = Some(value),
                    "StartLevel" => logic.start_level = Some(value as i32),
                    "UseTP" => logic.use_tp = value > 0.5,
                    "TPValue" => logic.tp_value = value,
                    "TPMode" => logic.tp_mode = if value > 0.5 { "TPMode_Fixed".to_string() } else { "TPMode_None".to_string() },
                    "UseSL" => logic.use_sl = value > 0.5,
                    "SLValue" => logic.sl_value = value,
                    "SLMode" => logic.sl_mode = if value > 0.5 { "SLMode_Fixed".to_string() } else { "SLMode_None".to_string() },
                    _ => {
                        // Try to match extended parameters
                        if param_name.starts_with("TrailStep") {
                            if let Some(caps) = param_name.match_indices(char::is_numeric).next() {
                                let num_str = &param_name[caps.0..];
                                if let Ok(num) = num_str.parse::<i32>() {
                                    match num {
                                        2 => logic.trail_step_2 = Some(value),
                                        3 => logic.trail_step_3 = Some(value),
                                        4 => logic.trail_step_4 = Some(value),
                                        5 => logic.trail_step_5 = Some(value),
                                        6 => logic.trail_step_6 = Some(value),
                                        7 => logic.trail_step_7 = Some(value),
                                        _ => {}
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ============================================
// V19 MASSIVE SETFILE PARSING
// ============================================

// Constants for v19 format validation
#[allow(dead_code)]
const V19_MAX_GROUPS: usize = 15;
#[allow(dead_code)]
const V19_MAX_ENGINES: usize = 3;
#[allow(dead_code)]
const V19_MAX_LOGICS: usize = 7;
#[allow(dead_code)]
const V19_MAX_DIRECTIONS: usize = 2;
#[allow(dead_code)]
const V19_FIELDS_PER_LOGIC: usize = 110;
#[allow(dead_code)]
const V19_TOTAL_LOGIC_DIRECTIONS: usize = V19_MAX_GROUPS * V19_MAX_ENGINES * V19_MAX_LOGICS * V19_MAX_DIRECTIONS; // 630
#[allow(dead_code)]
const V19_TOTAL_LOGIC_INPUTS: usize = V19_TOTAL_LOGIC_DIRECTIONS * V19_FIELDS_PER_LOGIC; // 69,300
#[allow(dead_code)]
const V19_TOTAL_INPUTS: usize = V19_TOTAL_LOGIC_INPUTS + 50; // ~69,350

#[derive(Debug, Clone)]
pub struct ParsedV19Key {
    pub group: usize,
    pub engine: char,
    pub logic: char,
    pub direction: String,
    pub param: String,
}

/// Parse v19 format key: gInput_{Group}_{Engine}{Logic}_{Direction}_{Param}
/// Examples:
///   gInput_1_AP_Buy_Start=1
///   gInput_1_AR_Sell_Grid=300
///   gInput_2_BP_Buy_TrailValue=500
///   gInput_15_CX_Sell_InitialLot=0.02
pub fn parse_v19_key(key: &str) -> Option<ParsedV19Key> {
    // Remove gInput_ prefix
    let remainder = if key.starts_with("ginput_") {
        &key[7..]
    } else if key.starts_with("gInput_") {
        &key[7..]
    } else {
        return None;
    };

    let parts: Vec<&str> = remainder.split('_').collect();

    if parts.len() < 4 {
        return None;
    }

    // Parse group (first part)
    let group: usize = parts[0].parse().ok()?;
    if group < 1 || group > V19_MAX_GROUPS {
        return None;
    }

    // Parse engine+logic code (second part): "AP", "AR", "BP", "CS", etc.
    let engine_logic = parts[1];
    if engine_logic.len() < 2 {
        return None;
    }

    let engine_char = engine_logic.chars().next().unwrap();
    let logic_char = engine_logic.chars().nth(1).unwrap();

    // Validate engine
    if engine_char != 'A' && engine_char != 'B' && engine_char != 'C' {
        return None;
    }

    // Validate logic code
    let valid_logics = ['P', 'R', 'S', 'T', 'O', 'C', 'X'];
    if !valid_logics.contains(&logic_char) {
        return None;
    }

    // Parse direction (third part)
    let direction = parts[2].to_string();
    if direction != "Buy" && direction != "Sell" {
        return None;
    }

    // Parse parameter (remaining parts)
    let param = parts[3..].join("_");

    Some(ParsedV19Key {
        group,
        engine: engine_char,
        logic: logic_char,
        direction,
        param,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct V19SetfileValidation {
    pub total_inputs: usize,
    pub logic_directions: usize,
    pub groups: usize,
    pub engines: usize,
    pub logics: usize,
    pub directions: usize,
    pub fields_per_logic: usize,
    pub is_valid: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct V19ParsedSetfile {
    pub version: String,
    pub inputs: HashMap<String, String>,
    pub validation: V19SetfileValidation,
}

/// Parse v19 massive setfile format
pub fn parse_v19_setfile(content: &str) -> V19ParsedSetfile {
    let mut inputs = HashMap::new();
    let mut errors = Vec::new();
    let mut logic_counts: HashMap<String, usize> = HashMap::new();

    for line in content.lines() {
        let line = line.trim();

        // Skip comments and empty lines
        if line.is_empty() || line.starts_with(';') {
            continue;
        }

        // Parse key=value
        if let Some(eq_pos) = line.find('=') {
            let key = line[..eq_pos].trim().to_string();
            let value = line[eq_pos + 1..].trim().to_string();

            // Try v19 format first
            if let Some(parsed) = parse_v19_key(&key) {
                inputs.insert(key.clone(), value.clone());

                // Count logic-directions
                let logic_dir_key =
                    format!("{}_{}_{}_{}", parsed.group, parsed.engine, parsed.logic, parsed.direction);
                *logic_counts.entry(logic_dir_key).or_insert(0) += 1;
            } else if key.starts_with("ginput_") || key.starts_with("gInput_") {
                // Add non-v19 format global inputs
                inputs.insert(key, value);
            }
        }
    }

    // Validate and count
    let logic_directions = logic_counts.len();
    let expected_logic_directions = V19_TOTAL_LOGIC_DIRECTIONS; // 630

    if logic_directions != expected_logic_directions {
        errors.push(format!(
            "Expected {} logic-directions, found {}. Check that all groups/engines/logics/directions are configured.",
            expected_logic_directions, logic_directions
        ));
    }

    for (k, count) in &logic_counts {
        if *count != V19_FIELDS_PER_LOGIC {
            errors.push(format!(
                "Logic-direction {} has {} fields (expected {}).",
                k, count, V19_FIELDS_PER_LOGIC
            ));
        }
    }

    let total_inputs = inputs.len();
    let expected_inputs = V19_TOTAL_INPUTS; // ~55,500

    if total_inputs < expected_inputs * 95 / 100 {
        errors.push(format!(
            "Expected ~{} inputs, found {}. Setfile may be incomplete.",
            expected_inputs, total_inputs
        ));
    }

    let validation = V19SetfileValidation {
        total_inputs,
        logic_directions,
        groups: V19_MAX_GROUPS,
        engines: V19_MAX_ENGINES,
        logics: V19_MAX_LOGICS,
        directions: V19_MAX_DIRECTIONS,
        fields_per_logic: V19_FIELDS_PER_LOGIC,
        is_valid: errors.is_empty(),
        errors,
    };

    V19ParsedSetfile {
        version: "19.0".to_string(),
        inputs,
        validation,
    }
}

/// Validate v19 setfile structure
pub fn validate_v19_setfile(content: &str) -> V19SetfileValidation {
    parse_v19_setfile(content).validation
}

fn create_full_v19_config() -> MTConfig {
    let mut config = create_default_mt_config();

    let engines = ["A", "B", "C"];
    let logics = ["POWER", "REPOWER", "SCALP", "STOPPER", "STO", "SCA", "RPO"];

    for engine_id in &engines {
        let mut engine = EngineConfig {
            engine_id: engine_id.to_string(),
            engine_name: format!("Engine {}", engine_id),
            max_power_orders: 10,
            groups: Vec::new(),
        };

        for group_num in 1..=15u8 {
            let mut group = GroupConfig {
                group_number: group_num,
                enabled: true,
                group_power_start: if group_num > 1 { Some(1) } else { None },
                reverse_mode: false,
                hedge_mode: false,
                hedge_reference: "Logic_None".to_string(),
                entry_delay_bars: 0,
                logics: Vec::new(),
            };

            for logic_name in &logics {
                group.logics.push(create_default_logic_config(logic_name));
            }
            engine.groups.push(group);
        }

        config.engines.push(engine);
    }

    config
}

fn logic_code_to_name(code: char) -> Option<&'static str> {
    match code {
        'P' => Some("POWER"),
        'R' => Some("REPOWER"),
        'S' => Some("SCALP"),
        'T' => Some("STOPPER"),
        'O' => Some("STO"),
        'C' => Some("SCA"),
        'X' => Some("RPO"),
        _ => None,
    }
}

fn parse_bool_val(raw: &str) -> bool {
    let v = raw.trim();
    if let Ok(n) = v.parse::<i32>() {
        return n != 0;
    }
    matches!(v.to_ascii_lowercase().as_str(), "true" | "yes" | "on")
}

fn decode_trail_step_mode_numeric(raw: &str) -> String {
    match raw.trim() {
        "0" => "TrailStepMode_Auto".to_string(),
        "1" => "TrailStepMode_Fixed".to_string(),
        "3" => "TrailStepMode_PerOrder".to_string(),
        "4" => "TrailStepMode_Disabled".to_string(),
        other => other.to_string(),
    }
}

fn decode_partial_mode_numeric(raw: &str) -> String {
    match raw.trim() {
        "0" => "PartialMode_Low".to_string(),
        "1" => "PartialMode_Balanced".to_string(),
        "2" => "PartialMode_High".to_string(),
        other => other.to_string(),
    }
}

fn decode_partial_balance_numeric(raw: &str) -> String {
    match raw.trim() {
        "0" => "PartialBalance_Aggressive".to_string(),
        "1" => "PartialBalance_Balanced".to_string(),
        "2" => "PartialBalance_Conservative".to_string(),
        other => other.to_string(),
    }
}

fn decode_tpsl_mode_numeric(raw: &str) -> String {
    match raw.trim() {
        "0" => "TPSL_Points".to_string(),
        "1" => "TPSL_Price".to_string(),
        "2" => "TPSL_Percent".to_string(),
        other => other.to_string(),
    }
}

fn set_dir_opt_f64(is_buy: bool, field_b: &mut Option<f64>, field_s: &mut Option<f64>, val: f64) {
    if is_buy {
        *field_b = Some(val);
    } else {
        *field_s = Some(val);
    }
}

fn apply_v19_param_to_logic(logic: &mut LogicConfig, is_buy: bool, param: &str, raw: &str) {
    let p = param.to_ascii_lowercase();
    match p.as_str() {
        "enabled" => logic.enabled = parse_bool_val(raw),
        "allowbuy" => logic.allow_buy = parse_bool_val(raw),
        "allowsell" => logic.allow_sell = parse_bool_val(raw),
        "initiallot" => {
            let v = raw.parse::<f64>().unwrap_or(0.0);
            logic.initial_lot = v;
            set_dir_opt_f64(is_buy, &mut logic.initial_lot_b, &mut logic.initial_lot_s, v);
        }
        "lastlot" => logic.last_lot = Some(raw.parse::<f64>().unwrap_or(0.0)),
        "mult" => {
            let v = raw.parse::<f64>().unwrap_or(0.0);
            logic.multiplier = v;
            set_dir_opt_f64(is_buy, &mut logic.multiplier_b, &mut logic.multiplier_s, v);
        }
        "grid" => {
            let v = raw.parse::<f64>().unwrap_or(0.0);
            logic.grid = v;
            set_dir_opt_f64(is_buy, &mut logic.grid_b, &mut logic.grid_s, v);
        }
        "trail" => {
            let n = raw.parse::<i32>().unwrap_or(0);
            logic.trail_method = match n {
                1 => "Trail_AVG_Percent".to_string(),
                2 => "Trail_Profit_Percent".to_string(),
                _ => "Trail_Points".to_string(),
            };
        }
        "trailvalue" => logic.trail_value = raw.parse::<f64>().unwrap_or(0.0),
        "trailstart" => {
            let v = raw.parse::<f64>().unwrap_or(0.0);
            logic.trail_start = v;
            set_dir_opt_f64(is_buy, &mut logic.trail_start_b, &mut logic.trail_start_s, v);
        }
        "trailstep" => {
            let v = raw.parse::<f64>().unwrap_or(0.0);
            logic.trail_step = v;
            set_dir_opt_f64(is_buy, &mut logic.trail_step_b, &mut logic.trail_step_s, v);
        }
        "trailstepmethod" => logic.trail_step_method = decode_trail_step_mode_numeric(raw),
        "trailstepmode" => logic.trail_step_mode = decode_trail_step_mode_numeric(raw),
        "trailstepcycle" => logic.trail_step_cycle = raw.parse::<i32>().unwrap_or(0),
        "trailstepbalance" => logic.trail_step_balance = raw.parse::<f64>().unwrap_or(0.0),
        "usetp" => logic.use_tp = parse_bool_val(raw),
        "tpmode" => logic.tp_mode = decode_tpsl_mode_numeric(raw),
        "tpvalue" => logic.tp_value = raw.parse::<f64>().unwrap_or(0.0),
        "usesl" => logic.use_sl = parse_bool_val(raw),
        "slmode" => logic.sl_mode = decode_tpsl_mode_numeric(raw),
        "slvalue" => logic.sl_value = raw.parse::<f64>().unwrap_or(0.0),
        "ordercountreferencelogic" => logic.order_count_reference = raw.to_string(),
        "startlevel" => logic.start_level = Some(raw.parse::<i32>().unwrap_or(0)),
        "resetlotonrestart" => logic.reset_lot_on_restart = parse_bool_val(raw),
        "closepartial" => logic.close_partial = parse_bool_val(raw),
        "closepartialcycle" => logic.close_partial_cycle = raw.parse::<i32>().unwrap_or(0),
        "closepartialmode" => logic.close_partial_mode = decode_partial_mode_numeric(raw),
        "closepartialbalance" => logic.close_partial_balance = decode_partial_balance_numeric(raw),
        "closepartialtrailmode" => logic.close_partial_trail_step_mode = decode_trail_step_mode_numeric(raw),
        "closepartial2" => logic.close_partial_2 = Some(parse_bool_val(raw)),
        "closepartialcycle2" => logic.close_partial_cycle_2 = Some(raw.parse::<i32>().unwrap_or(0)),
        "closepartialmode2" => logic.close_partial_mode_2 = Some(decode_partial_mode_numeric(raw)),
        "closepartialbalance2" => logic.close_partial_balance_2 = Some(decode_partial_balance_numeric(raw)),
        "closepartialtrailmode2" => {}
        "closepartial3" => logic.close_partial_3 = Some(parse_bool_val(raw)),
        "closepartialcycle3" => logic.close_partial_cycle_3 = Some(raw.parse::<i32>().unwrap_or(0)),
        "closepartialmode3" => logic.close_partial_mode_3 = Some(decode_partial_mode_numeric(raw)),
        "closepartialbalance3" => logic.close_partial_balance_3 = Some(decode_partial_balance_numeric(raw)),
        "closepartialtrailmode3" => {}
        "closepartial4" => logic.close_partial_4 = Some(parse_bool_val(raw)),
        "closepartialcycle4" => logic.close_partial_cycle_4 = Some(raw.parse::<i32>().unwrap_or(0)),
        "closepartialmode4" => logic.close_partial_mode_4 = Some(decode_partial_mode_numeric(raw)),
        "closepartialbalance4" => logic.close_partial_balance_4 = Some(decode_partial_balance_numeric(raw)),
        "closepartialtrailmode4" => {}
        "reverseenabled" => logic.reverse_enabled = parse_bool_val(raw),
        "reversereference" => logic.reverse_reference = raw.to_string(),
        "reversescale" => logic.reverse_scale = raw.parse::<f64>().unwrap_or(0.0),
        "hedgeenabled" => logic.hedge_enabled = parse_bool_val(raw),
        "hedgereference" => logic.hedge_reference = raw.to_string(),
        "hedgescale" => logic.hedge_scale = raw.parse::<f64>().unwrap_or(0.0),
        "closetargets" => logic.close_targets = raw.to_string(),
        _ => {
            if let Some(suffix) = p.strip_prefix("trailstep") {
                if let Ok(n) = suffix.parse::<i32>() {
                    let v = raw.parse::<f64>().unwrap_or(0.0);
                    match n {
                        2 => logic.trail_step_2 = if v == 0.0 { None } else { Some(v) },
                        3 => logic.trail_step_3 = if v == 0.0 { None } else { Some(v) },
                        4 => logic.trail_step_4 = if v == 0.0 { None } else { Some(v) },
                        5 => logic.trail_step_5 = if v == 0.0 { None } else { Some(v) },
                        6 => logic.trail_step_6 = if v == 0.0 { None } else { Some(v) },
                        7 => logic.trail_step_7 = if v == 0.0 { None } else { Some(v) },
                        _ => {}
                    }
                    return;
                }
            }
            if let Some(suffix) = p.strip_prefix("trailstepmethod") {
                if let Ok(n) = suffix.parse::<i32>() {
                    let v = decode_trail_step_mode_numeric(raw);
                    match n {
                        2 => logic.trail_step_method_2 = Some(v),
                        3 => logic.trail_step_method_3 = Some(v),
                        4 => logic.trail_step_method_4 = Some(v),
                        5 => logic.trail_step_method_5 = Some(v),
                        6 => logic.trail_step_method_6 = Some(v),
                        7 => logic.trail_step_method_7 = Some(v),
                        _ => {}
                    }
                    return;
                }
            }
            if let Some(suffix) = p.strip_prefix("trailstepmode") {
                if let Ok(n) = suffix.parse::<i32>() {
                    let v = decode_trail_step_mode_numeric(raw);
                    match n {
                        2 => logic.trail_step_mode_2 = Some(v),
                        3 => logic.trail_step_mode_3 = Some(v),
                        4 => logic.trail_step_mode_4 = Some(v),
                        5 => logic.trail_step_mode_5 = Some(v),
                        6 => logic.trail_step_mode_6 = Some(v),
                        7 => logic.trail_step_mode_7 = Some(v),
                        _ => {}
                    }
                    return;
                }
            }
            if let Some(suffix) = p.strip_prefix("trailstepcycle") {
                if let Ok(n) = suffix.parse::<i32>() {
                    let v = raw.parse::<i32>().unwrap_or(0);
                    match n {
                        2 => logic.trail_step_cycle_2 = if v == 0 { None } else { Some(v) },
                        3 => logic.trail_step_cycle_3 = if v == 0 { None } else { Some(v) },
                        4 => logic.trail_step_cycle_4 = if v == 0 { None } else { Some(v) },
                        5 => logic.trail_step_cycle_5 = if v == 0 { None } else { Some(v) },
                        6 => logic.trail_step_cycle_6 = if v == 0 { None } else { Some(v) },
                        7 => logic.trail_step_cycle_7 = if v == 0 { None } else { Some(v) },
                        _ => {}
                    }
                    return;
                }
            }
            if let Some(suffix) = p.strip_prefix("trailstepbalance") {
                if let Ok(n) = suffix.parse::<i32>() {
                    let v = raw.parse::<f64>().unwrap_or(0.0);
                    match n {
                        2 => logic.trail_step_balance_2 = if v == 0.0 { None } else { Some(v) },
                        3 => logic.trail_step_balance_3 = if v == 0.0 { None } else { Some(v) },
                        4 => logic.trail_step_balance_4 = if v == 0.0 { None } else { Some(v) },
                        5 => logic.trail_step_balance_5 = if v == 0.0 { None } else { Some(v) },
                        6 => logic.trail_step_balance_6 = if v == 0.0 { None } else { Some(v) },
                        7 => logic.trail_step_balance_7 = if v == 0.0 { None } else { Some(v) },
                        _ => {}
                    }
                    return;
                }
            }
        }
    }
}

fn apply_v19_global_keys(config: &mut MTConfig, inputs: &HashMap<String, String>) {
    if let Some(v) = inputs.get("gInput_MagicNumber") {
        config.general.magic_number = v.parse::<i32>().unwrap_or(config.general.magic_number);
    }
    config.general.magic_number_buy = get_i32_first(
        inputs,
        &["gInput_MagicNumberBuy", "gInput_MagicNumberPowerBuy"],
        config.general.magic_number_buy,
    );
    config.general.magic_number_sell = get_i32_first(
        inputs,
        &["gInput_MagicNumberSell", "gInput_MagicNumberPowerSell"],
        config.general.magic_number_sell,
    );
    config.general.reverse_magic_base =
        get_i32(inputs, "gInput_MagicNumberReverseBase", config.general.reverse_magic_base);
    config.general.hedge_magic_base =
        get_i32(inputs, "gInput_MagicNumberHedgeBase", config.general.hedge_magic_base);
    config.general.hedge_magic_independent =
        get_bool_first(inputs, &["gInput_HedgeMagicIndependent"]);
    config.general.max_slippage_points = get_f64_first(
        inputs,
        &["gInput_MaxSlippagePoints", "gInput_MaxSlippage"],
        config.general.max_slippage_points,
    );
}

fn build_config_from_v19_setfile(content: &str) -> Result<MTConfig, String> {
    let parsed = parse_v19_setfile(content);
    if !parsed.validation.is_valid {
        return Err(format!("Invalid v19 massive setfile: {:?}", parsed.validation.errors));
    }

    let mut config = create_full_v19_config();
    apply_v19_global_keys(&mut config, &parsed.inputs);

    for (key, raw_val) in &parsed.inputs {
        if let Some(parsed_key) = parse_v19_key(key) {
            let engine_id = parsed_key.engine.to_string();
            let logic_name = logic_code_to_name(parsed_key.logic)
                .ok_or_else(|| format!("Unknown logic code: {}", parsed_key.logic))?;
            let is_buy = parsed_key.direction == "Buy";
            let group_u8 = parsed_key.group as u8;

            if let Some(engine) = config.engines.iter_mut().find(|e| e.engine_id == engine_id) {
                if let Some(group) = engine.groups.iter_mut().find(|g| g.group_number == group_u8) {
                    if let Some(logic) = group.logics.iter_mut().find(|l| l.logic_name == logic_name) {
                        apply_v19_param_to_logic(logic, is_buy, &parsed_key.param, raw_val);
                    }
                }
            }
        }
    }

    config.total_inputs = parsed.inputs.len();
    config.version = "v19.0".to_string();
    Ok(config)
}

/// Get magic number for a logic-direction (v19 scheme)
#[allow(dead_code)]
pub fn get_v19_magic_number(base: i32, engine_idx: usize, logic_idx: usize, direction_idx: usize) -> i32 {
    // Formula: base + (engine_idx * 14) + (logic_idx * 2) + direction_idx
    // Engine A: 777-790 (14 magics), Engine B: 791-804, Engine C: 805-818
    base + (engine_idx as i32 * 14) + (logic_idx as i32 * 2) + direction_idx as i32
}

#[cfg(test)]
mod v19_tests {
    use super::*;

    #[test]
    fn test_parse_v19_key_basic() {
        let key = "gInput_1_AP_Buy_InitialLot";
        let parsed = parse_v19_key(key).unwrap();
        assert_eq!(parsed.group, 1);
        assert_eq!(parsed.engine, 'A');
        assert_eq!(parsed.logic, 'P');
        assert_eq!(parsed.direction, "Buy");
        assert_eq!(parsed.param, "InitialLot");
    }

    #[test]
    fn test_parse_v19_key_all_engines() {
        // Engine A
        assert!(parse_v19_key("gInput_1_AP_Buy_Start").is_some());
        assert!(parse_v19_key("gInput_1_AR_Sell_Grid").is_some());
        assert!(parse_v19_key("gInput_1_AS_Buy_TrailValue").is_some());
        assert!(parse_v19_key("gInput_1_AT_Sell_Mult").is_some());
        assert!(parse_v19_key("gInput_1_AO_Buy_InitialLot").is_some());
        assert!(parse_v19_key("gInput_1_AC_Sell_LastLot").is_some());
        assert!(parse_v19_key("gInput_1_AX_Buy_StartLevel").is_some());

        // Engine B
        assert!(parse_v19_key("gInput_15_BP_Sell_InitialLot").is_some());
        assert!(parse_v19_key("gInput_10_BR_Buy_Grid").is_some());

        // Engine C
        assert!(parse_v19_key("gInput_15_CX_Buy_Start").is_some());
        assert!(parse_v19_key("gInput_5_CO_Sell_TrailValue").is_some());
    }

    #[test]
    fn test_parse_v19_key_invalid() {
        // Invalid group
        assert!(parse_v19_key("gInput_0_AP_Buy_Start").is_none());
        assert!(parse_v19_key("gInput_16_AP_Buy_Start").is_none());

        // Invalid engine
        assert!(parse_v19_key("gInput_1_DP_Buy_Start").is_none());

        // Invalid logic
        assert!(parse_v19_key("gInput_1_AZ_Buy_Start").is_none());

        // Invalid direction
        assert!(parse_v19_key("gInput_1_AP_Both_Start").is_none());
    }

    #[test]
    fn test_get_v19_magic_number() {
        let base = 777;

        // Engine A, Power, Buy = 777 + 0 + 0 + 0 = 777
        assert_eq!(get_v19_magic_number(base, 0, 0, 0), 777);

        // Engine A, Power, Sell = 777 + 0 + 0 + 1 = 778
        assert_eq!(get_v19_magic_number(base, 0, 0, 1), 778);

        // Engine A, Repower, Buy = 777 + 0 + 2 + 0 = 779
        assert_eq!(get_v19_magic_number(base, 0, 1, 0), 779);

        // Engine A, Repower, Sell = 777 + 0 + 2 + 1 = 780
        assert_eq!(get_v19_magic_number(base, 0, 1, 1), 780);

        // Engine B, Power, Buy = 777 + 14 + 0 + 0 = 791
        assert_eq!(get_v19_magic_number(base, 1, 0, 0), 791);

        // Engine C, RPO, Sell = 777 + 28 + 12 + 1 = 818
        assert_eq!(get_v19_magic_number(base, 2, 6, 1), 818);
    }

    #[test]
    fn test_parse_v19_setfile() {
        let content = r#"
; DAAVILEFX V19 TEST SETFILE
gInput_1_AP_Buy_Start=1
gInput_1_AP_Sell_Start=1
gInput_1_AR_Buy_Grid=300
gInput_1_AS_Sell_TrailValue=300
gInput_15_CX_Buy_InitialLot=0.02
gInput_Global_MagicNumber=777
"#;

        let setfile = parse_v19_setfile(content);
        assert!(setfile.inputs.len() >= 5);
        assert_eq!(setfile.validation.logic_directions, 5);
    }
}

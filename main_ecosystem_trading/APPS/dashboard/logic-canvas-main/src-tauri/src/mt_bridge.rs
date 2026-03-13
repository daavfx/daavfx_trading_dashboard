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
    #[serde(default)]
    pub risk_management_b: Option<RiskManagementConfig>,
    #[serde(default)]
    pub risk_management_s: Option<RiskManagementConfig>,

    // Time Filters
    pub time_filters: TimeFiltersConfig,
    #[serde(default)]
    pub time_filters_b: Option<TimeFiltersConfig>,
    #[serde(default)]
    pub time_filters_s: Option<TimeFiltersConfig>,

    // News Filter
    pub news_filter: NewsFilterConfig,
    #[serde(default)]
    pub news_filter_b: Option<NewsFilterConfig>,
    #[serde(default)]
    pub news_filter_s: Option<NewsFilterConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RiskManagementConfig {
    #[serde(default)]
    pub enabled: bool,
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
    pub enabled: bool,
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
    #[serde(default)]
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
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub api_url: String,
    #[serde(default)]
    pub countries: String,
    #[serde(default)]
    pub impact_level: i32,
    #[serde(default)]
    pub minutes_before: i32,
    #[serde(default)]
    pub minutes_after: i32,
    #[serde(default = "default_true")]
    pub stop_ea: bool,
    #[serde(default)]
    pub close_trades: bool,
    #[serde(default = "default_true")]
    pub auto_restart: bool,
    #[serde(default)]
    pub calendar_file: String,
    #[serde(default)]
    pub check_interval: i32,
    #[serde(default)]
    pub alert_minutes: i32,
    #[serde(default = "default_true")]
    pub filter_high_only: bool,
    #[serde(default)]
    pub filter_weekends: bool,
    #[serde(default = "default_true")]
    pub use_local_cache: bool,
    #[serde(default = "default_3600")]
    pub cache_duration: i32,
    #[serde(default)]
    pub fallback_on_error: String,
    #[serde(default)]
    pub filter_currencies: String,
    #[serde(default = "default_true")]
    pub include_speeches: bool,
    #[serde(default = "default_true")]
    pub include_reports: bool,
    #[serde(default = "default_true")]
    pub visual_indicator: bool,
    #[serde(default)]
    pub alert_before_news: bool,
}

fn default_3600() -> i32 { 3600 }

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
    #[serde(default)]
    pub enabled: bool,

    // ===== GROUP TRIGGER (Groups 2-20 only) =====
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_power_start: Option<i32>, // DEPRECATED: Use group_power_start_b and group_power_start_s
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_power_start_b: Option<i32>, // gInput_GroupPowerStart_{P|BP|CP}{N}_Buy - Buy side threshold
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_power_start_s: Option<i32>, // gInput_GroupPowerStart_{P|BP|CP}{N}_Sell - Sell side threshold

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
fn default_mode_counter_trend() -> String {
    "Counter Trend".to_string()
}
fn default_tpsl_points() -> String {
    "TPSL_Points".to_string()
}
fn default_close_partial_cycle() -> i32 {
    1
}
fn default_partial_mode() -> String {
    "PartialMode_Mid".to_string()
}
fn default_partial_balance() -> String {
    "PartialBalance_Balanced".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogicConfig {
    // METADATA (3 fields)
    pub logic_name: String,
    pub logic_id: String,
    #[serde(default)]
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

    // ===== LOGIC-SPECIFIC (5 fields + Buy/Sell variants) =====
    #[serde(alias = "startLevel", skip_serializing_if = "Option::is_none")]
    pub start_level: Option<i32>, // Not for Power
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_level_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_level_s: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_lot: Option<f64>, // Not for Power
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_lot_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_lot_s: Option<f64>,
    pub close_targets: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_targets_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_targets_s: Option<String>,
    pub order_count_reference: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order_count_reference_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order_count_reference_s: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "groupOrderCountReferenceLogic")]
    pub group_order_count_reference: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_order_count_reference_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_order_count_reference_s: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_level_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_level_ref_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_level_ref_s: Option<String>,
    pub reset_lot_on_restart: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reset_lot_on_restart_b: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reset_lot_on_restart_s: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub restart_policy_power: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub restart_policy_non_power: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_non_power_on_power_close: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hold_timeout_seconds: Option<i32>,

    // ===== TPSL SETTINGS (6 fields + Buy/Sell variants) =====
    #[serde(default)]
    pub use_tp: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub use_tp_b: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub use_tp_s: Option<bool>,
    #[serde(default = "default_tpsl_points")]
    pub tp_mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tp_mode_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tp_mode_s: Option<String>,
    #[serde(default)]
    pub tp_value: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tp_value_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tp_value_s: Option<f64>,
    #[serde(default)]
    pub use_sl: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub use_sl_b: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub use_sl_s: Option<bool>,
    #[serde(default = "default_tpsl_points")]
    pub sl_mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sl_mode_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sl_mode_s: Option<String>,
    #[serde(default)]
    pub sl_value: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sl_value_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sl_value_s: Option<f64>,
    #[serde(default = "default_true")]
    pub continue_tp_hit: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub continue_tp_hit_b: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub continue_tp_hit_s: Option<bool>,
    #[serde(default = "default_true")]
    pub continue_sl_hit: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub continue_sl_hit_b: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub continue_sl_hit_s: Option<bool>,

    // ===== MODE SELECTORS (Dashboard Only / Mapped) =====
    #[serde(default = "default_strategy_trail")]
    pub strategy_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strategy_type_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strategy_type_s: Option<String>,
    #[serde(default = "default_mode_counter_trend")]
    pub trading_mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trading_mode_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trading_mode_s: Option<String>,
    #[serde(default = "default_true")]
    pub allow_buy: bool, // gInput_AllowBuy_{suffix}
    #[serde(default = "default_true")]
    pub allow_sell: bool, // gInput_AllowSell_{suffix}

    // ===== REVERSE/HEDGE PER-LOGIC (8 fields + Buy/Sell variants) =====
    #[serde(default)]
    pub reverse_enabled: bool, // gInput_G{group}_{logic}_ReverseEnabled
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reverse_enabled_b: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reverse_enabled_s: Option<bool>,
    #[serde(default)]
    pub hedge_enabled: bool, // gInput_G{group}_{logic}_HedgeEnabled
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hedge_enabled_b: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hedge_enabled_s: Option<bool>,
    #[serde(default = "default_scale")]
    pub reverse_scale: f64, // gInput_G{group}_Scale_{logic}_Reverse (100.0 = 100%)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reverse_scale_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reverse_scale_s: Option<f64>,
    #[serde(default = "default_half_scale")]
    pub hedge_scale: f64, // gInput_G{group}_Scale_{logic}_Hedge (50.0 = 50%)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hedge_scale_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hedge_scale_s: Option<f64>,
    #[serde(default = "default_logic_none")]
    pub reverse_reference: String, // gInput_G{group}_{logic}_ReverseReference
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reverse_reference_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reverse_reference_s: Option<String>,
    #[serde(default = "default_logic_none")]
    pub hedge_reference: String, // gInput_G{group}_{logic}_HedgeReference
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hedge_reference_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hedge_reference_s: Option<String>,

    // ===== TRAIL STEP ADVANCED (3 fields + Buy/Sell variants) =====
    #[serde(default = "default_trail_step_mode")]
    pub trail_step_mode: String, // gInput_TrailStepMode_{suffix}
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_mode_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_mode_s: Option<String>,
    #[serde(default = "default_one")]
    pub trail_step_cycle: i32, // gInput_TrailStepCycle_{suffix} (1=always)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_cycle_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_cycle_s: Option<i32>,
    #[serde(default)]
    pub trail_step_balance: f64, // gInput_TrailStepBalance_{suffix} (0=disabled)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_balance_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_balance_s: Option<f64>,

    // ===== TRAIL STEP EXTENDED (Levels 2-7) + Buy/Sell variants =====
    #[serde(default)]
    pub trail_step_2: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_2_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_2_s: Option<f64>,
    #[serde(default)]
    pub trail_step_method_2: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_method_2_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_method_2_s: Option<String>,
    #[serde(default)]
    pub trail_step_cycle_2: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_cycle_2_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_cycle_2_s: Option<i32>,
    #[serde(default)]
    pub trail_step_balance_2: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_balance_2_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_balance_2_s: Option<f64>,
    #[serde(default)]
    pub trail_step_mode_2: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_mode_2_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_mode_2_s: Option<String>,

    #[serde(default)]
    pub trail_step_3: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_3_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_3_s: Option<f64>,
    #[serde(default)]
    pub trail_step_method_3: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_method_3_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_method_3_s: Option<String>,
    #[serde(default)]
    pub trail_step_cycle_3: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_cycle_3_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_cycle_3_s: Option<i32>,
    #[serde(default)]
    pub trail_step_balance_3: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_balance_3_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_balance_3_s: Option<f64>,
    #[serde(default)]
    pub trail_step_mode_3: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_mode_3_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_mode_3_s: Option<String>,

    #[serde(default)]
    pub trail_step_4: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_4_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_4_s: Option<f64>,
    #[serde(default)]
    pub trail_step_method_4: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_method_4_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_method_4_s: Option<String>,
    #[serde(default)]
    pub trail_step_cycle_4: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_cycle_4_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_cycle_4_s: Option<i32>,
    #[serde(default)]
    pub trail_step_balance_4: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_balance_4_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_balance_4_s: Option<f64>,
    #[serde(default)]
    pub trail_step_mode_4: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_mode_4_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_mode_4_s: Option<String>,

    #[serde(default)]
    pub trail_step_5: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_5_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_5_s: Option<f64>,
    #[serde(default)]
    pub trail_step_method_5: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_method_5_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_method_5_s: Option<String>,
    #[serde(default)]
    pub trail_step_cycle_5: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_cycle_5_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_cycle_5_s: Option<i32>,
    #[serde(default)]
    pub trail_step_balance_5: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_balance_5_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_balance_5_s: Option<f64>,
    #[serde(default)]
    pub trail_step_mode_5: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_mode_5_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_mode_5_s: Option<String>,

    #[serde(default)]
    pub trail_step_6: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_6_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_6_s: Option<f64>,
    #[serde(default)]
    pub trail_step_method_6: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_method_6_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_method_6_s: Option<String>,
    #[serde(default)]
    pub trail_step_cycle_6: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_cycle_6_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_cycle_6_s: Option<i32>,
    #[serde(default)]
    pub trail_step_balance_6: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_balance_6_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_balance_6_s: Option<f64>,
    #[serde(default)]
    pub trail_step_mode_6: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_mode_6_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_mode_6_s: Option<String>,

    #[serde(default)]
    pub trail_step_7: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_7_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_7_s: Option<f64>,
    #[serde(default)]
    pub trail_step_method_7: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_method_7_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_method_7_s: Option<String>,
    #[serde(default)]
    pub trail_step_cycle_7: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_cycle_7_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_cycle_7_s: Option<i32>,
    #[serde(default)]
    pub trail_step_balance_7: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_balance_7_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_balance_7_s: Option<f64>,
    #[serde(default)]
    pub trail_step_mode_7: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_mode_7_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_step_mode_7_s: Option<String>,

    // ===== CLOSE PARTIAL (active contract + legacy compatibility) + Buy/Sell variants =====
    pub close_partial: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_b: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_s: Option<bool>,
    #[serde(default = "default_close_partial_cycle")]
    pub close_partial_cycle: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_cycle_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_cycle_s: Option<i32>,
    #[serde(default = "default_partial_mode")]
    pub close_partial_mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_mode_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_mode_s: Option<String>,
    #[serde(default = "default_partial_balance")]
    pub close_partial_balance: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_balance_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_balance_s: Option<String>,
    #[serde(default = "default_trail_step_mode")]
    pub close_partial_trail_step_mode: String, // gInput_ClosePartialTrailStepMode_{suffix}
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_trail_step_mode_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_trail_step_mode_s: Option<String>,
    #[serde(default)]
    pub close_partial_profit_threshold: f64, // gInput_ClosePartialProfitThreshold_{suffix}
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_profit_threshold_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_profit_threshold_s: Option<f64>,

    // ===== CLOSE PARTIAL EXTENDED (Levels 2-4) + Buy/Sell variants =====
    #[serde(default)]
    pub close_partial_2: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_2_b: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_2_s: Option<bool>,
    #[serde(default)]
    pub close_partial_cycle_2: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_cycle_2_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_cycle_2_s: Option<i32>,
    #[serde(default)]
    pub close_partial_mode_2: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_mode_2_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_mode_2_s: Option<String>,
    #[serde(default)]
    pub close_partial_balance_2: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_balance_2_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_balance_2_s: Option<String>,
    #[serde(default)]
    pub close_partial_profit_threshold_2: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_profit_threshold_2_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_profit_threshold_2_s: Option<f64>,

    #[serde(default)]
    pub close_partial_3: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_3_b: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_3_s: Option<bool>,
    #[serde(default)]
    pub close_partial_cycle_3: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_cycle_3_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_cycle_3_s: Option<i32>,
    #[serde(default)]
    pub close_partial_mode_3: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_mode_3_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_mode_3_s: Option<String>,
    #[serde(default)]
    pub close_partial_balance_3: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_balance_3_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_balance_3_s: Option<String>,
    #[serde(default)]
    pub close_partial_profit_threshold_3: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_profit_threshold_3_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_profit_threshold_3_s: Option<f64>,

    #[serde(default)]
    pub close_partial_4: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_4_b: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_4_s: Option<bool>,
    #[serde(default)]
    pub close_partial_cycle_4: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_cycle_4_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_cycle_4_s: Option<i32>,
    #[serde(default)]
    pub close_partial_mode_4: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_mode_4_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_mode_4_s: Option<String>,
    #[serde(default)]
    pub close_partial_balance_4: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_balance_4_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_balance_4_s: Option<String>,
    #[serde(default)]
    pub close_partial_profit_threshold_4: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_profit_threshold_4_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_partial_profit_threshold_4_s: Option<f64>,

    // ===== TRIGGERS (optional) + Buy/Sell variants =====
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_type_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_type_s: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_mode_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_mode_s: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_bars: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_bars_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_bars_s: Option<i32>,
    // Legacy payload compatibility field; normalized into trigger_seconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_minutes: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_minutes_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_minutes_s: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_seconds: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_seconds_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_seconds_s: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_pips: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_pips_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_pips_s: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_points: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_points_b: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_points_s: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opcount_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opcount_ref_b: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opcount_ref_s: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_op_count: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_op_count_b: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_op_count_s: Option<i32>,
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
        let mut consecutive_errors = 0;
        loop {
            match rx.recv() {
                Ok(_) => {
                    consecutive_errors = 0;
                    let _ = app_handle.emit("config-changed", platform.clone());
                }
                Err(_) => {
                    consecutive_errors += 1;
                    if consecutive_errors >= 3 {
                        println!("[WATCHER] File watcher channel closed, exiting thread");
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
            }
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
        "gInput_GridUnit={}",
        config
            .general
            .grid_unit
            .map(|v| v.to_string())
            .unwrap_or_default()
    ));
    lines.push(format!(
        "gInput_PipFactor={}",
        config
            .general
            .pip_factor
            .map(|v| v.to_string())
            .unwrap_or_default()
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
    // Convert 3 boolean fields to news action enum
    let nf = &config.general.news_filter;
    let news_action = if !nf.stop_ea {
        0
    } else if nf.close_trades && nf.auto_restart {
        6
    } else if nf.close_trades && !nf.auto_restart {
        5
    } else if !nf.close_trades && nf.auto_restart {
        7
    } else {
        2
    };
    lines.push(format!("gInput_NewsAction={}", news_action));
    lines.push(format!("gInput_NewsStopEA={}", if nf.stop_ea { 1 } else { 0 }));
    lines.push(format!("gInput_NewsCloseTrades={}", if nf.close_trades { 1 } else { 0 }));
    lines.push(format!("gInput_NewsAutoRestart={}", if nf.auto_restart { 1 } else { 0 }));
    lines.push(format!(
        "gInput_NewsCheckInterval={}",
        config.general.news_filter.check_interval
    ));
    lines.push(format!(
        "gInput_FilterHighImpactOnly={}",
        if config.general.news_filter.filter_high_only { 1 } else { 0 }
    ));
    lines.push(format!(
        "gInput_FilterWeekendNews={}",
        if config.general.news_filter.filter_weekends { 1 } else { 0 }
    ));
    lines.push(format!(
        "gInput_UseLocalNewsCache={}",
        if config.general.news_filter.use_local_cache { 1 } else { 0 }
    ));
    lines.push(format!(
        "gInput_NewsCacheDuration={}",
        config.general.news_filter.cache_duration
    ));
    lines.push(format!(
        "gInput_NewsFallbackOnError={}",
        config.general.news_filter.fallback_on_error
    ));
    lines.push(format!(
        "gInput_FilterCurrencies={}",
        config.general.news_filter.filter_currencies
    ));
    lines.push(format!(
        "gInput_IncludeSpeeches={}",
        if config.general.news_filter.include_speeches { 1 } else { 0 }
    ));
    lines.push(format!(
        "gInput_IncludeReports={}",
        if config.general.news_filter.include_reports { 1 } else { 0 }
    ));
    lines.push(format!(
        "gInput_NewsVisualIndicator={}",
        if config.general.news_filter.visual_indicator { 1 } else { 0 }
    ));
    lines.push(format!(
        "gInput_AlertBeforeNews={}",
        if config.general.news_filter.alert_before_news { 1 } else { 0 }
    ));
    lines.push(format!(
        "gInput_AlertMinutesBefore={}",
        config.general.news_filter.alert_minutes
    ));
    let cf = &config.general.news_filter.calendar_file;
    if !cf.is_empty() {
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
    eprintln!("[EXPORT DEBUG] Starting engine loop, engines count: {}", config.engines.len());
    for engine in &config.engines {
        lines.push(format!(";"));
        lines.push(format!("; === ENGINE {} ===", engine.engine_id));
        eprintln!("[EXPORT DEBUG] Processing engine: {}, groups count: {}", engine.engine_id, engine.groups.len());

        for group in &engine.groups {
            eprintln!("[EXPORT DEBUG] Processing group: {}, group_number: {}", group.group_number, group.group_number);
            lines.push(format!("; --- Group {} ---", group.group_number));

            // GroupPowerStart thresholds (groups 2-20): ONLY Engine A Power controls group progression (V3 behavior).
            // B/C engines always mirror A's group at EA runtime, so no BP/CP thresholds are needed.
            if group.group_number > 1 && engine.engine_id == "A" {
                let base_key = format!("P{}", group.group_number);
                    
                // Use new Buy/Sell specific fields, fallback to legacy group_power_start
                let gps_b = group.group_power_start_b.or(group.group_power_start);
                let gps_s = group.group_power_start_s.or(group.group_power_start);
                    
                if let Some(v) = gps_b {
                    lines.push(format!("gInput_GroupPowerStart_{}_Buy={}", base_key, v));
                }
                if let Some(v) = gps_s {
                    lines.push(format!("gInput_GroupPowerStart_{}_Sell={}", base_key, v));
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

                // No _Enabled/_Start key — all logics always enabled.
                // Trading is controlled by StartLevel, trigger type, risk management, etc.

                // Base params: Initial/Last lot are Group 1-only by contract.
                if group.group_number == 1 {
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

                if include_optimization_hints && group.group_number == 1 {
                    let initial_key = format!("gInput_Initial_loT_{}", suffix);
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
                    // Export EXACTLY what the frontend provides - NO defaults
                    lines.push(format!(
                        "gInput_CloseTargets_{}={}",
                        logic_key, logic.close_targets
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

                lines.push(format!(
                    "gInput_UseTP_{}={}",
                    suffix,
                    if logic.use_tp { 1 } else { 0 }
                ));
                lines.push(format!(
                    "gInput_TPMode_{}={}",
                    suffix,
                    encode_tpsl_mode(&logic.tp_mode)
                ));
                lines.push(format!(
                    "gInput_TPValue_{}={:.1}",
                    suffix,
                    logic.tp_value
                ));
                if let Some(v) = logic.use_tp_b {
                    lines.push(format!(
                        "gInput_UseTP_{}_B={}",
                        suffix,
                        if v { 1 } else { 0 }
                    ));
                }
                if let Some(v) = logic.use_tp_s {
                    lines.push(format!(
                        "gInput_UseTP_{}_S={}",
                        suffix,
                        if v { 1 } else { 0 }
                    ));
                }
                if let Some(ref v) = logic.tp_mode_b {
                    lines.push(format!(
                        "gInput_TPMode_{}_B={}",
                        suffix,
                        encode_tpsl_mode(v)
                    ));
                }
                if let Some(ref v) = logic.tp_mode_s {
                    lines.push(format!(
                        "gInput_TPMode_{}_S={}",
                        suffix,
                        encode_tpsl_mode(v)
                    ));
                }
                if let Some(v) = logic.tp_value_b {
                    lines.push(format!("gInput_TPValue_{}_B={:.1}", suffix, v));
                }
                if let Some(v) = logic.tp_value_s {
                    lines.push(format!("gInput_TPValue_{}_S={:.1}", suffix, v));
                }

                lines.push(format!(
                    "gInput_UseSL_{}={}",
                    suffix,
                    if logic.use_sl { 1 } else { 0 }
                ));
                lines.push(format!(
                    "gInput_SLMode_{}={}",
                    suffix,
                    encode_tpsl_mode(&logic.sl_mode)
                ));
                lines.push(format!(
                    "gInput_SLValue_{}={:.1}",
                    suffix,
                    logic.sl_value
                ));
                if let Some(v) = logic.use_sl_b {
                    lines.push(format!(
                        "gInput_UseSL_{}_B={}",
                        suffix,
                        if v { 1 } else { 0 }
                    ));
                }
                if let Some(v) = logic.use_sl_s {
                    lines.push(format!(
                        "gInput_UseSL_{}_S={}",
                        suffix,
                        if v { 1 } else { 0 }
                    ));
                }
                if let Some(ref v) = logic.sl_mode_b {
                    lines.push(format!(
                        "gInput_SLMode_{}_B={}",
                        suffix,
                        encode_tpsl_mode(v)
                    ));
                }
                if let Some(ref v) = logic.sl_mode_s {
                    lines.push(format!(
                        "gInput_SLMode_{}_S={}",
                        suffix,
                        encode_tpsl_mode(v)
                    ));
                }
                if let Some(v) = logic.sl_value_b {
                    lines.push(format!("gInput_SLValue_{}_B={:.1}", suffix, v));
                }
                if let Some(v) = logic.sl_value_s {
                    lines.push(format!("gInput_SLValue_{}_S={:.1}", suffix, v));
                }

                lines.push(format!(
                    "gInput_ContinueTPHit_{}={}",
                    suffix,
                    if logic.continue_tp_hit { 1 } else { 0 }
                ));
                if let Some(v) = logic.continue_tp_hit_b {
                    lines.push(format!(
                        "gInput_ContinueTPHit_{}_B={}",
                        suffix,
                        if v { 1 } else { 0 }
                    ));
                }
                if let Some(v) = logic.continue_tp_hit_s {
                    lines.push(format!(
                        "gInput_ContinueTPHit_{}_S={}",
                        suffix,
                        if v { 1 } else { 0 }
                    ));
                }
                lines.push(format!(
                    "gInput_ContinueSLHit_{}={}",
                    suffix,
                    if logic.continue_sl_hit { 1 } else { 0 }
                ));
                if let Some(v) = logic.continue_sl_hit_b {
                    lines.push(format!(
                        "gInput_ContinueSLHit_{}_B={}",
                        suffix,
                        if v { 1 } else { 0 }
                    ));
                }
                if let Some(v) = logic.continue_sl_hit_s {
                    lines.push(format!(
                        "gInput_ContinueSLHit_{}_S={}",
                        suffix,
                        if v { 1 } else { 0 }
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

                // Close Partial (active simplified contract)
                lines.push(format!(
                    "gInput_ClosePartial_{}={}",
                    suffix,
                    if logic.close_partial { 1 } else { 0 }
                ));
                lines.push(format!(
                    "gInput_ClosePartialMode_{}={}",
                    suffix,
                    encode_partial_mode(&logic.close_partial_mode)
                ));
                lines.push(format!(
                    "gInput_ClosePartialProfitThreshold_{}={:.2}",
                    suffix, logic.close_partial_profit_threshold
                ));

                // Close Partial Extended (Levels 2-4)
                if let Some(v) = logic.close_partial_2 {
                    lines.push(format!(
                        "gInput_ClosePartial2_{}={}",
                        suffix,
                        if v { 1 } else { 0 }
                    ));
                }
                if let Some(ref v) = logic.close_partial_mode_2 {
                    lines.push(format!(
                        "gInput_ClosePartialMode2_{}={}",
                        suffix,
                        encode_partial_mode(v)
                    ));
                }
                if let Some(v) = logic.close_partial_profit_threshold_2 {
                    lines.push(format!(
                        "gInput_ClosePartialProfitThreshold2_{}={:.2}",
                        suffix, v
                    ));
                }

                if let Some(v) = logic.close_partial_3 {
                    lines.push(format!(
                        "gInput_ClosePartial3_{}={}",
                        suffix,
                        if v { 1 } else { 0 }
                    ));
                }
                if let Some(ref v) = logic.close_partial_mode_3 {
                    lines.push(format!(
                        "gInput_ClosePartialMode3_{}={}",
                        suffix,
                        encode_partial_mode(v)
                    ));
                }
                if let Some(v) = logic.close_partial_profit_threshold_3 {
                    lines.push(format!(
                        "gInput_ClosePartialProfitThreshold3_{}={:.2}",
                        suffix, v
                    ));
                }

                if let Some(v) = logic.close_partial_4 {
                    lines.push(format!(
                        "gInput_ClosePartial4_{}={}",
                        suffix,
                        if v { 1 } else { 0 }
                    ));
                }
                if let Some(ref v) = logic.close_partial_mode_4 {
                    lines.push(format!(
                        "gInput_ClosePartialMode4_{}={}",
                        suffix,
                        encode_partial_mode(v)
                    ));
                }
                if let Some(v) = logic.close_partial_profit_threshold_4 {
                    lines.push(format!(
                        "gInput_ClosePartialProfitThreshold4_{}={:.2}",
                        suffix, v
                    ));
                }

                if let Some(tt) = &logic.trigger_type {
                    lines.push(format!(
                        "gInput_TriggerType_{}={}",
                        suffix,
                        normalize_trigger_type(tt)
                    ));
                }
                let trigger_mode_out = logic
                    .trigger_mode
                    .as_deref()
                    .unwrap_or("TriggerMode_OnTick");
                lines.push(format!(
                    "gInput_TriggerMode_{}={}",
                    suffix,
                    encode_trigger_mode(trigger_mode_out)
                ));
                if let Some(tb) = logic.trigger_bars {
                    lines.push(format!("gInput_TriggerBars_{}={}", suffix, tb));
                }
                if let Some(tm) = logic.trigger_seconds {
                    lines.push(format!("gInput_TriggerSeconds_{}={}", suffix, tm));
                }
                if let Some(tp) = logic.trigger_pips {
                    lines.push(format!("gInput_TriggerPips_{}={:.1}", suffix, tp));
                }
                if let Some(tp) = logic.trigger_points {
                    lines.push(format!("gInput_TriggerPoints_{}={:.1}", suffix, tp));
                }
                if let Some(soc) = logic.start_op_count {
                    lines.push(format!("gInput_StartOpCount_{}={}", suffix, soc));
                }
                if let Some(ocr) = &logic.opcount_ref {
                    if !ocr.is_empty() {
                        lines.push(format!("gInput_OpCountRef_{}={}", suffix, ocr));
                    }
                }
                if let Some(slr) = &logic.start_level_ref {
                    if !slr.is_empty() {
                        lines.push(format!("gInput_StartLevelRef_{}={}", suffix, slr));
                    }
                }

                lines.push(String::new());
            }
        }
    }

    // Write file
    let legacy_content = lines.join("\n");
    atomic_write(&sanitized_path, &legacy_content)?;
    mirror_setfile_to_mt_common_files(&sanitized_path, &legacy_content, None);

    Ok(())
}

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
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
#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
pub fn export_massive_v19_setfile(
    mut config: MTConfig,
    file_path: String,
    platform: String,
    export_keymap_json: Option<bool>,
) -> Result<(), String> {
    // DEBUG: Log what we received immediately
    eprintln!("[EXPORT DEBUG] ========== EXPORT MASSIVE V19 SETFILE ==========");
    eprintln!("[EXPORT DEBUG] Number of engines: {}", config.engines.len());
    for (ei, engine) in config.engines.iter().enumerate() {
        eprintln!("[EXPORT DEBUG] Engine {}: ID={}, groups={}", ei, engine.engine_id, engine.groups.len());
        for (gi, group) in engine.groups.iter().enumerate() {
            eprintln!("[EXPORT DEBUG]   Group {}: number={}, gps={:?}, gps_b={:?}, gps_s={:?}",
                gi, group.group_number, group.group_power_start, group.group_power_start_b, group.group_power_start_s);
        }
    }
    eprintln!("[EXPORT DEBUG] ==============================================");

    let path_buf = PathBuf::from(&file_path);
    let sanitized_path = sanitize_and_validate_path(&path_buf)?;

    let mut lines: Vec<String> = Vec::new();
    // Temporary export diagnostics for start-level rewrite tracing.
    let mut missing_scope_count: usize = 0;
    let mut missing_scope_samples: Vec<String> = Vec::new();
    let mut start_level_under4_count: usize = 0;
    let mut start_level_under4_samples: Vec<String> = Vec::new();
    let mut start_level_missing_count: usize = 0;
    let mut start_level_missing_samples: Vec<String> = Vec::new();
    let mut enabled_rows_count: usize = 0;
    let mut trigger_type_immediate_count: usize = 0;
    let mut trigger_mode_ontick_count: usize = 0;
    let mut group_power_start_values: Vec<i32> = Vec::new();

    // Enforce canonical mode contract before serialization.
    normalize_config_mode_contract(&mut config);

    let mut any_reverse_mode = false;
    let mut any_hedge_mode = false;
    for engine in &config.engines {
        for group in &engine.groups {
            if group.reverse_mode {
                any_reverse_mode = true;
            }
            if group.hedge_mode {
                any_hedge_mode = true;
            }
            for logic in &group.logics {
                let mode = normalize_trading_mode(&logic.trading_mode);
                if mode == "Reverse" {
                    any_reverse_mode = true;
                }
                if mode == "Hedge" {
                    any_hedge_mode = true;
                }
            }
        }
    }

    // Header
    lines.push(format!("; DAAVFX MASSIVE v19 Configuration"));
    lines.push(format!("; Platform: {}", platform));
    lines.push(format!("; Generated: {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S")));
    lines.push(format!("; Format: gInput_{{Group}}_{{Engine}}{{Logic}}_{{Direction}}_{{Param}}"));
    lines.push(format!("; Total Logic Inputs: {}", V19_TOTAL_LOGIC_INPUTS));
    lines.push(format!(
        "; Contract: 630 logic-directions, ~49,260 logic inputs total, Group 1 Power=80 fields, other Group 1 rows=81, Groups 2-15=78"
    ));
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
    
    // Trading Permissions - allowBuy/allowSell controlled in terminal only
    lines.push(format!(
        "gInput_EnableReverseMode={}",
        if any_reverse_mode { 1 } else { 0 }
    ));
    lines.push(format!(
        "gInput_EnableHedgeMode={}",
        if any_hedge_mode { 1 } else { 0 }
    ));
    
    // Logging
    lines.push(format!("gInput_EnableLogs={}", if config.general.enable_logs { 1 } else { 0 }));
    
    // Slippage
    lines.push(format!(
        "gInput_MaxSlippage={}",
        (config.general.max_slippage_points.round() as i32)
    ));
    lines.push(format!("gInput_MaxSlippagePoints={:.1}", config.general.max_slippage_points));
    
    // Config File
    
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
    lines.push(format!(
        "gInput_UseCompounding={}",
        if config.general.compounding_enabled { 1 } else { 0 }
    ));
    let comp_type_int = match config.general.compounding_type.as_str() {
        "Compound_Equity" => 1,
        _ => 0,
    };
    lines.push(format!("gInput_CompoundingType={}", comp_type_int));
    
    // ===== CLEAN MATH =====
    lines.push(String::new());
    lines.push("; === CLEAN MATH ===".to_string());
    let key_grid_unit = "gInput_GridUnit".to_string();
    let grid_unit_fallback = config
        .general
        .grid_unit
        .map(|v| v.to_string())
        .unwrap_or_else(|| "".to_string());
    lines.push(format!("{}={}", key_grid_unit, grid_unit_fallback));
    let key_pip_factor = "gInput_PipFactor".to_string();
    let pip_factor_fallback = config
        .general
        .pip_factor
        .map(|v| v.to_string())
        .unwrap_or_else(|| "".to_string());
    lines.push(format!("{}={}", key_pip_factor, pip_factor_fallback));
    
    // ===== GROUP THRESHOLDS =====
    lines.push(String::new());
    lines.push("; === GROUP THRESHOLDS ===".to_string());
    for engine in &config.engines {
        // V3 behavior: Only Engine A Power controls group progression.
        // B/C engines always mirror A's group at EA runtime.
        if engine.engine_id != "A" { continue; }

        for group in &engine.groups {
            if group.group_number > 1 {
                let base_key = format!("P{}", group.group_number);
                
                let gps_b = group.group_power_start_b.or(group.group_power_start);
                let gps_s = group.group_power_start_s.or(group.group_power_start);
                
                if let Some(v) = gps_b {
                    lines.push(format!("gInput_GroupPowerStart_{}_Buy={}", base_key, v));
                    group_power_start_values.push(v);
                }
                if let Some(v) = gps_s {
                    lines.push(format!("gInput_GroupPowerStart_{}_Sell={}", base_key, v));
                    group_power_start_values.push(v);
                }
            }
        }
    }
    
    // ===== RISK MANAGEMENT =====
    lines.push(String::new());
    lines.push("; === RISK MANAGEMENT ===".to_string());
    let rm = &config.general.risk_management;
    lines.push(format!("gInput_RiskManagementEnabled={}", if rm.enabled { 1 } else { 0 }));
    lines.push(format!("gInput_UseSpreadFilter={}", if rm.spread_filter_enabled { 1 } else { 0 }));
    lines.push(format!("gInput_MaxSpreadPoints={:.1}", rm.max_spread_points));
    lines.push(format!("gInput_UseEquityStop={}", if rm.equity_stop_enabled { 1 } else { 0 }));
    lines.push(format!("gInput_EquityStopValue={:.1}", rm.equity_stop_value));
    lines.push(format!("gInput_UseDrawdownStop={}", if rm.drawdown_stop_enabled { 1 } else { 0 }));
    lines.push(format!("gInput_MaxDrawdownPercent={:.1}", rm.max_drawdown_percent));
    let risk_action_raw = rm
        .risk_action
        .as_ref()
        .map(|s| trigger_action_to_int(s).to_string())
        .unwrap_or_else(|| "".to_string());
    let key_risk_action = "gInput_RiskAction".to_string();
    lines.push(format!("{}={}", key_risk_action, risk_action_raw));
    
    // ===== RISK MANAGEMENT BUY/SELL =====
    if let Some(rm_b) = &config.general.risk_management_b {
        lines.push(String::new());
        lines.push("; === RISK MANAGEMENT BUY ===".to_string());
        lines.push(format!("gInput_RiskManagementEnabled_Buy={}", if rm_b.enabled { 1 } else { 0 }));
        lines.push(format!("gInput_UseSpreadFilter_Buy={}", if rm_b.spread_filter_enabled { 1 } else { 0 }));
        lines.push(format!("gInput_MaxSpreadPoints_Buy={:.1}", rm_b.max_spread_points));
        lines.push(format!("gInput_UseEquityStop_Buy={}", if rm_b.equity_stop_enabled { 1 } else { 0 }));
        lines.push(format!("gInput_EquityStopValue_Buy={:.1}", rm_b.equity_stop_value));
        lines.push(format!("gInput_UseDrawdownStop_Buy={}", if rm_b.drawdown_stop_enabled { 1 } else { 0 }));
        lines.push(format!("gInput_MaxDrawdownPercent_Buy={:.1}", rm_b.max_drawdown_percent));
    }
    if let Some(rm_s) = &config.general.risk_management_s {
        lines.push(String::new());
        lines.push("; === RISK MANAGEMENT SELL ===".to_string());
        lines.push(format!("gInput_RiskManagementEnabled_Sell={}", if rm_s.enabled { 1 } else { 0 }));
        lines.push(format!("gInput_UseSpreadFilter_Sell={}", if rm_s.spread_filter_enabled { 1 } else { 0 }));
        lines.push(format!("gInput_MaxSpreadPoints_Sell={:.1}", rm_s.max_spread_points));
        lines.push(format!("gInput_UseEquityStop_Sell={}", if rm_s.equity_stop_enabled { 1 } else { 0 }));
        lines.push(format!("gInput_EquityStopValue_Sell={:.1}", rm_s.equity_stop_value));
        lines.push(format!("gInput_UseDrawdownStop_Sell={}", if rm_s.drawdown_stop_enabled { 1 } else { 0 }));
        lines.push(format!("gInput_MaxDrawdownPercent_Sell={:.1}", rm_s.max_drawdown_percent));
    }
    
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
    // Convert 3 boolean fields to news action enum
    // stop_ea=false -> 0 (None)
    // stop_ea=true, close=false, restart=false -> 2 (StopEA_KeepTrades)
    // stop_ea=true, close=false, restart=true -> 7 (PauseEA_KeepTrades)
    // stop_ea=true, close=true, restart=false -> 5 (StopEA_CloseTrades)
    // stop_ea=true, close=true, restart=true -> 6 (PauseEA_CloseTrades)
    let news_action = if !nf.stop_ea {
        0 // TriggerAction_None
    } else if nf.close_trades && nf.auto_restart {
        6 // TriggerAction_PauseEA_CloseTrades
    } else if nf.close_trades && !nf.auto_restart {
        5 // TriggerAction_StopEA_CloseTrades
    } else if !nf.close_trades && nf.auto_restart {
        7 // TriggerAction_PauseEA_KeepTrades
    } else {
        2 // TriggerAction_StopEA_KeepTrades (default)
    };
    lines.push(format!("gInput_NewsAction={}", news_action));
    lines.push(format!("gInput_NewsStopEA={}", if nf.stop_ea { 1 } else { 0 }));
    lines.push(format!("gInput_NewsCloseTrades={}", if nf.close_trades { 1 } else { 0 }));
    lines.push(format!("gInput_NewsAutoRestart={}", if nf.auto_restart { 1 } else { 0 }));
    lines.push(format!("gInput_NewsCheckInterval={}", nf.check_interval));
    lines.push(format!("gInput_FilterHighImpactOnly={}", if nf.filter_high_only { 1 } else { 0 }));
    lines.push(format!("gInput_FilterWeekendNews={}", if nf.filter_weekends { 1 } else { 0 }));
    lines.push(format!("gInput_UseLocalNewsCache={}", if nf.use_local_cache { 1 } else { 0 }));
    lines.push(format!("gInput_NewsCacheDuration={}", nf.cache_duration));
    lines.push(format!("gInput_NewsFallbackOnError={}", nf.fallback_on_error));
    lines.push(format!("gInput_FilterCurrencies={}", nf.filter_currencies));
    lines.push(format!("gInput_IncludeSpeeches={}", if nf.include_speeches { 1 } else { 0 }));
    lines.push(format!("gInput_IncludeReports={}", if nf.include_reports { 1 } else { 0 }));
    lines.push(format!("gInput_NewsVisualIndicator={}", if nf.visual_indicator { 1 } else { 0 }));
    lines.push(format!("gInput_AlertBeforeNews={}", if nf.alert_before_news { 1 } else { 0 }));
    lines.push(format!("gInput_AlertMinutesBefore={}", nf.alert_minutes));
    let key_news_calendar = "gInput_NewsCalendarFile".to_string();
    let news_calendar_fallback = nf.calendar_file.clone();
    lines.push(format!("{}={}", key_news_calendar, news_calendar_fallback));
    
    // ===== NEWS FILTER BUY/SELL =====
    if let Some(nf_b) = &config.general.news_filter_b {
        lines.push(String::new());
        lines.push("; === NEWS FILTER BUY ===".to_string());
        lines.push(format!("gInput_NewsFilterEnabled_Buy={}", if nf_b.enabled { 1 } else { 0 }));
        lines.push(format!("gInput_MinutesBeforeNews_Buy={}", nf_b.minutes_before));
        lines.push(format!("gInput_MinutesAfterNews_Buy={}", nf_b.minutes_after));
        lines.push(format!("gInput_NewsImpactLevel_Buy={}", nf_b.impact_level));
        lines.push(format!("gInput_NewsStopEA_Buy={}", if nf_b.stop_ea { 1 } else { 0 }));
        lines.push(format!("gInput_NewsCloseTrades_Buy={}", if nf_b.close_trades { 1 } else { 0 }));
        lines.push(format!("gInput_NewsAutoRestart_Buy={}", if nf_b.auto_restart { 1 } else { 0 }));
        lines.push(format!("gInput_IncludeReports_Buy={}", if nf_b.include_reports { 1 } else { 0 }));
        lines.push(format!("gInput_NewsVisualIndicator_Buy={}", if nf_b.visual_indicator { 1 } else { 0 }));
        lines.push(format!("gInput_AlertBeforeNews_Buy={}", if nf_b.alert_before_news { 1 } else { 0 }));
        lines.push(format!("gInput_AlertMinutesBefore_Buy={}", nf_b.alert_minutes));
        let news_calendar_b = nf_b.calendar_file.clone();
        lines.push(format!("gInput_NewsCalendarFile_Buy={}", news_calendar_b));
    }
    if let Some(nf_s) = &config.general.news_filter_s {
        lines.push(String::new());
        lines.push("; === NEWS FILTER SELL ===".to_string());
        lines.push(format!("gInput_NewsFilterEnabled_Sell={}", if nf_s.enabled { 1 } else { 0 }));
        lines.push(format!("gInput_MinutesBeforeNews_Sell={}", nf_s.minutes_before));
        lines.push(format!("gInput_MinutesAfterNews_Sell={}", nf_s.minutes_after));
        lines.push(format!("gInput_NewsImpactLevel_Sell={}", nf_s.impact_level));
        lines.push(format!("gInput_NewsStopEA_Sell={}", if nf_s.stop_ea { 1 } else { 0 }));
        lines.push(format!("gInput_NewsCloseTrades_Sell={}", if nf_s.close_trades { 1 } else { 0 }));
        lines.push(format!("gInput_NewsAutoRestart_Sell={}", if nf_s.auto_restart { 1 } else { 0 }));
        lines.push(format!("gInput_IncludeReports_Sell={}", if nf_s.include_reports { 1 } else { 0 }));
        lines.push(format!("gInput_NewsVisualIndicator_Sell={}", if nf_s.visual_indicator { 1 } else { 0 }));
        lines.push(format!("gInput_AlertBeforeNews_Sell={}", if nf_s.alert_before_news { 1 } else { 0 }));
        lines.push(format!("gInput_AlertMinutesBefore_Sell={}", nf_s.alert_minutes));
        let news_calendar_s = nf_s.calendar_file.clone();
        lines.push(format!("gInput_NewsCalendarFile_Sell={}", news_calendar_s));
    }
    
    // ===== TIME FILTERS =====
    lines.push(String::new());
    lines.push("; === TIME FILTERS ===".to_string());
    let tf = &config.general.time_filters;
    lines.push(format!("gInput_TimeFiltersEnabled={}", if tf.enabled { 1 } else { 0 }));
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
        lines.push(format!(
            "gInput_Session{}Action={}",
            s.session_number,
            trigger_action_to_int(&s.action)
        ));
    }
    
    // ===== TIME FILTERS BUY/SELL =====
    if let Some(tf_b) = &config.general.time_filters_b {
        lines.push(String::new());
        lines.push("; === TIME FILTERS BUY ===".to_string());
        lines.push(format!("gInput_TimeFiltersEnabled_Buy={}", if tf_b.enabled { 1 } else { 0 }));
        lines.push(format!(
            "gInput_NewsFilterOverridesSession_Buy={}",
            if tf_b.priority_settings.news_filter_overrides_session { 1 } else { 0 }
        ));
        lines.push(format!(
            "gInput_SessionFilterOverridesNews_Buy={}",
            if tf_b.priority_settings.session_filter_overrides_news { 1 } else { 0 }
        ));
        lines.push(format!(
            "gInput_SessionFilterEnabled_Buy={}",
            if !tf_b.sessions.is_empty() { 1 } else { 0 }
        ));
        for session in &tf_b.sessions {
            let s = session;
            lines.push(format!("gInput_Session{}Enabled_Buy={}", s.session_number, if s.enabled { 1 } else { 0 }));
            lines.push(format!("gInput_Session{}Day_Buy={}", s.session_number, s.day));
            lines.push(format!("gInput_Session{}StartHour_Buy={}", s.session_number, s.start_hour));
            lines.push(format!("gInput_Session{}StartMinute_Buy={}", s.session_number, s.start_minute));
            lines.push(format!("gInput_Session{}EndHour_Buy={}", s.session_number, s.end_hour));
            lines.push(format!("gInput_Session{}EndMinute_Buy={}", s.session_number, s.end_minute));
            lines.push(format!(
                "gInput_Session{}Action_Buy={}",
                s.session_number,
                trigger_action_to_int(&s.action)
            ));
        }
    }
    if let Some(tf_s) = &config.general.time_filters_s {
        lines.push(String::new());
        lines.push("; === TIME FILTERS SELL ===".to_string());
        lines.push(format!("gInput_TimeFiltersEnabled_Sell={}", if tf_s.enabled { 1 } else { 0 }));
        lines.push(format!(
            "gInput_NewsFilterOverridesSession_Sell={}",
            if tf_s.priority_settings.news_filter_overrides_session { 1 } else { 0 }
        ));
        lines.push(format!(
            "gInput_SessionFilterOverridesNews_Sell={}",
            if tf_s.priority_settings.session_filter_overrides_news { 1 } else { 0 }
        ));
        lines.push(format!(
            "gInput_SessionFilterEnabled_Sell={}",
            if !tf_s.sessions.is_empty() { 1 } else { 0 }
        ));
        for session in &tf_s.sessions {
            let s = session;
            lines.push(format!("gInput_Session{}Enabled_Sell={}", s.session_number, if s.enabled { 1 } else { 0 }));
            lines.push(format!("gInput_Session{}Day_Sell={}", s.session_number, s.day));
            lines.push(format!("gInput_Session{}StartHour_Sell={}", s.session_number, s.start_hour));
            lines.push(format!("gInput_Session{}StartMinute_Sell={}", s.session_number, s.start_minute));
            lines.push(format!("gInput_Session{}EndHour_Sell={}", s.session_number, s.end_hour));
            lines.push(format!("gInput_Session{}EndMinute_Sell={}", s.session_number, s.end_minute));
            lines.push(format!(
                "gInput_Session{}Action_Sell={}",
                s.session_number,
                trigger_action_to_int(&s.action)
            ));
        }
    }
    
    lines.push(String::new());

    let encode_trail_method = |raw: &str| -> i32 {
        let upper = raw.to_uppercase();
        if upper.contains("AVG") {
            1
        } else {
            0
        }
    };

    let logic_names = ["POWER", "REPOWER", "SCALPER", "STOPPER", "STO", "SCA", "RPO"];
    let directions = ["Buy", "Sell"];

    let engine_ids = ["A", "B", "C"];
    for engine_id in &engine_ids {
        let Some(engine) = config.engines.iter().find(|e| e.engine_id == *engine_id) else {
            missing_scope_count += 1;
            if missing_scope_samples.len() < 24 {
                missing_scope_samples.push(format!("missing engine {}", engine_id));
            }
            continue;
        };
        for group_num in 1..=15 {
            let group_num_u8 = group_num as u8;
            let Some(group) = engine.groups.iter().find(|g| g.group_number == group_num_u8) else {
                missing_scope_count += 1;
                if missing_scope_samples.len() < 24 {
                    missing_scope_samples.push(format!("missing group E{} G{}", engine.engine_id, group_num));
                }
                continue;
            };

            for logic_name in &logic_names {
                let matching_logics_all: Vec<&LogicConfig> = group
                    .logics
                    .iter()
                    .filter(|l| {
                        let logic_upper = l.logic_name.trim().to_uppercase();
                        let normalized = if logic_upper == "SCALP" {
                            "SCALPER"
                        } else {
                            logic_upper.as_str()
                        };
                        normalized == *logic_name
                    })
                    .collect();
                let matching_logics: Vec<&LogicConfig> = {
                    let exact: Vec<&LogicConfig> = matching_logics_all
                        .iter()
                        .copied()
                        .filter(|l| l.logic_name.trim().to_uppercase() == *logic_name)
                        .collect();
                    if exact.is_empty() {
                        matching_logics_all
                    } else {
                        exact
                    }
                };
                if matching_logics.is_empty() {
                    missing_scope_count += 1;
                    if missing_scope_samples.len() < 24 {
                        missing_scope_samples.push(format!(
                            "missing logic E{} G{} {}",
                            engine.engine_id, group_num, logic_name
                        ));
                    }
                    continue;
                }

                let infer_row_direction = |l: &LogicConfig| -> Option<&'static str> {
                    let logic_id_upper = l.logic_id.to_uppercase();
                    if logic_id_upper.contains("_B_") || logic_id_upper.ends_with("_B") {
                        return Some("Buy");
                    }
                    if logic_id_upper.contains("_S_") || logic_id_upper.ends_with("_S") {
                        return Some("Sell");
                    }
                    if l.allow_buy && !l.allow_sell {
                        return Some("Buy");
                    }
                    if l.allow_sell && !l.allow_buy {
                        return Some("Sell");
                    }
                    None
                };

                let base_logic = *matching_logics
                    .first()
                    .expect("matching_logics is non-empty");
                let buy_logic = matching_logics
                    .iter()
                    .find(|l| infer_row_direction(l) == Some("Buy"))
                    .copied();
                let sell_logic = matching_logics
                    .iter()
                    .find(|l| infer_row_direction(l) == Some("Sell"))
                    .copied();

                let v19_suffix = get_v19_suffix(&engine.engine_id, logic_name);

                let has_any_directional_rows = buy_logic.is_some() || sell_logic.is_some();
                for direction in &directions {
                    let is_buy = *direction == "Buy";
                    let logic_opt = if has_any_directional_rows {
                        if is_buy {
                            buy_logic
                        } else {
                            sell_logic
                        }
                    } else {
                        Some(base_logic)
                    };
                    let Some(logic) = logic_opt else {
                        missing_scope_count += 1;
                        if missing_scope_samples.len() < 24 {
                            missing_scope_samples.push(format!(
                                "missing directional row E{} G{} {} {}",
                                engine.engine_id, group_num, logic_name, direction
                            ));
                        }
                        continue;
                    };
                    let pick_directional_value = |base: f64, b: Option<f64>, s: Option<f64>| -> f64 {
                        // Always use Buy/Sell specific values if present, regardless of row structure
                        if is_buy {
                            b.unwrap_or(base)
                        } else {
                            s.unwrap_or(base)
                        }
                    };

                    let enabled = if is_buy { logic.allow_buy } else { logic.allow_sell };
                    if enabled {
                        enabled_rows_count += 1;
                    }
                    let effective_mode = if is_engine_a_power(&engine.engine_id, logic_name) {
                        "Counter Trend".to_string()
                    } else {
                        normalize_trading_mode(&logic.trading_mode)
                    };

                    let (
                        export_reverse_enabled,
                        export_hedge_enabled,
                        export_reverse_reference,
                        export_hedge_reference,
                        export_reverse_scale,
                        export_hedge_scale,
                    ) = match effective_mode.as_str() {
                        "Hedge" => (
                            false,
                            true,
                            "Logic_None".to_string(),
                            if logic.hedge_reference.trim().is_empty() {
                                "Logic_None".to_string()
                            } else {
                                logic.hedge_reference.clone()
                            },
                            100.0,
                            logic.hedge_scale,
                        ),
                        "Reverse" => (
                            true,
                            false,
                            if logic.reverse_reference.trim().is_empty() {
                                "Logic_None".to_string()
                            } else {
                                logic.reverse_reference.clone()
                            },
                            "Logic_None".to_string(),
                            logic.reverse_scale,
                            50.0,
                        ),
                        _ => (
                            false,
                            false,
                            "Logic_None".to_string(),
                            "Logic_None".to_string(),
                            100.0,
                            50.0,
                        ),
                    };

                    // No _Enabled key — all logics always enabled.

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



                    // InitialLot/LastLot are Group 1-only by contract.
                    if group_num == 1 {
                        lines.push(format!(
                            "gInput_{}_{}_{}_InitialLot={:.2}",
                            group_num,
                            v19_suffix,
                            direction,
                            pick_directional_value(logic.initial_lot, logic.initial_lot_b, logic.initial_lot_s)
                        ));

                        let key_last_lot =
                            format!("gInput_{}_{}_{}_LastLot", group_num, v19_suffix, direction);
                        let last_lot_fallback = logic
                            .last_lot
                            .map(|v| format!("{:.2}", v))
                            .unwrap_or_else(|| "".to_string());
                        lines.push(format!(
                            "{}={}",
                            key_last_lot,
                            last_lot_fallback
                        ));
                    }

                    lines.push(format!(
                        "gInput_{}_{}_{}_Mult={:.2}",
                        group_num,
                        v19_suffix,
                        direction,
                        pick_directional_value(logic.multiplier, logic.multiplier_b, logic.multiplier_s)
                    ));

                    let grid_value = pick_directional_value(logic.grid, logic.grid_b, logic.grid_s);
                    
                    lines.push(format!(
                        "gInput_{}_{}_{}_Grid={:.1}",
                        group_num,
                        v19_suffix,
                        direction,
                        grid_value
                    ));

                    let key_grid_behavior =
                        format!("gInput_{}_{}_{}_GridBehavior", group_num, v19_suffix, direction);
                    let behavior_val = match effective_mode.as_str() {
                        "Hedge" => 1,
                        "Reverse" => 2,
                        _ => 0, // "Counter Trend" or default
                    };
                    lines.push(format!(
                        "{}={}",
                        key_grid_behavior,
                        behavior_val
                    ));

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
                        pick_directional_value(logic.trail_start, logic.trail_start_b, logic.trail_start_s)
                    ));

                    lines.push(format!(
                        "gInput_{}_{}_{}_TrailStep={:.1}",
                        group_num,
                        v19_suffix,
                        direction,
                        pick_directional_value(logic.trail_step, logic.trail_step_b, logic.trail_step_s)
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
                        let key_step =
                            format!("gInput_{}_{}_{}_TrailStep{}", group_num, v19_suffix, direction, n);
                        let step_fallback = step_values[i]
                            .map(|v| format!("{:.1}", v))
                            .unwrap_or_else(|| "".to_string());
                        lines.push(format!("{}={}", key_step, step_fallback));
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
                        let key_step_cycle = format!(
                            "gInput_{}_{}_{}_TrailStepCycle{}",
                            group_num, v19_suffix, direction, n
                        );
                        let step_cycle_fallback = step_cycles[i]
                            .map(|v| v.to_string())
                            .unwrap_or_else(|| "".to_string());
                        lines.push(format!(
                            "{}={}",
                            key_step_cycle,
                            step_cycle_fallback
                        ));
                        let key_step_balance = format!(
                            "gInput_{}_{}_{}_TrailStepBalance{}",
                            group_num, v19_suffix, direction, n
                        );
                        let step_balance_fallback = step_balances[i]
                            .map(|v| format!("{:.1}", v))
                            .unwrap_or_else(|| "".to_string());
                        lines.push(format!(
                            "{}={}",
                            key_step_balance,
                            step_balance_fallback
                        ));
                    }



                    let key_trigger_type =
                        format!("gInput_{}_{}_{}_TriggerType", group_num, v19_suffix, direction);
                    let trigger_type_fallback = logic
                        .trigger_type
                        .as_deref()
                        .map(normalize_trigger_type)
                        .unwrap_or_else(|| "".to_string());
                    if trigger_type_fallback == "0" {
                        trigger_type_immediate_count += 1;
                    }
                    lines.push(format!(
                        "{}={}",
                        key_trigger_type,
                        trigger_type_fallback
                    ));
                    let key_trigger_mode =
                        format!("gInput_{}_{}_{}_TriggerMode", group_num, v19_suffix, direction);
                    let trigger_mode_fallback = logic
                        .trigger_mode
                        .as_deref()
                        .map(encode_trigger_mode)
                        .map(|v| v.to_string())
                        .unwrap_or_else(|| encode_trigger_mode("TriggerMode_OnTick").to_string());
                    if trigger_mode_fallback == "0" {
                        trigger_mode_ontick_count += 1;
                    }
                    lines.push(format!(
                        "{}={}",
                        key_trigger_mode,
                        trigger_mode_fallback
                    ));
                    let key_trigger_bars =
                        format!("gInput_{}_{}_{}_TriggerBars", group_num, v19_suffix, direction);
                    let trigger_bars_fallback = logic
                        .trigger_bars
                        .map(|v| v.to_string())
                        .unwrap_or_else(|| "".to_string());
                    lines.push(format!(
                        "{}={}",
                        key_trigger_bars,
                        trigger_bars_fallback
                    ));
                    let key_trigger_seconds =
                        format!("gInput_{}_{}_{}_TriggerSeconds", group_num, v19_suffix, direction);
                    let trigger_seconds_fallback = logic
                        .trigger_seconds
                        .map(|v| v.to_string())
                        .unwrap_or_else(|| "".to_string());
                    lines.push(format!(
                        "{}={}",
                        key_trigger_seconds,
                        trigger_seconds_fallback
                    ));
                    let key_trigger_pips =
                        format!("gInput_{}_{}_{}_TriggerPips", group_num, v19_suffix, direction);
                    let trigger_pips_fallback = logic
                        .trigger_pips
                        .map(|v| format!("{:.1}", v))
                        .unwrap_or_else(|| "".to_string());
                    lines.push(format!(
                        "{}={}",
                        key_trigger_pips,
                        trigger_pips_fallback
                    ));
                    let key_trigger_points =
                        format!("gInput_{}_{}_{}_TriggerPoints", group_num, v19_suffix, direction);
                    let trigger_points_fallback = logic
                        .trigger_points
                        .map(|v| format!("{:.1}", v))
                        .unwrap_or_else(|| "".to_string());
                    lines.push(format!(
                        "{}={}",
                        key_trigger_points,
                        trigger_points_fallback
                    ));
                    let key_start_op_count =
                        format!("gInput_{}_{}_{}_StartOpCount", group_num, v19_suffix, direction);
                    let start_op_count_fallback = logic
                        .start_op_count
                        .map(|v| v.to_string())
                        .unwrap_or_else(|| "".to_string());
                    lines.push(format!(
                        "{}={}",
                        key_start_op_count,
                        start_op_count_fallback
                    ));
                    let key_opcount_ref =
                        format!("gInput_{}_{}_{}_OpCountRef", group_num, v19_suffix, direction);
                    let opcount_ref_fallback = logic
                        .opcount_ref
                        .clone()
                        .unwrap_or_else(|| "".to_string());
                    lines.push(format!(
                        "{}={}",
                        key_opcount_ref,
                        opcount_ref_fallback
                    ));
                    let key_start_level_ref =
                        format!("gInput_{}_{}_{}_StartLevelRef", group_num, v19_suffix, direction);
                    let start_level_ref_fallback = logic
                        .start_level_ref
                        .clone()
                        .unwrap_or_else(|| "".to_string());
                    lines.push(format!(
                        "{}={}",
                        key_start_level_ref,
                        start_level_ref_fallback
                    ));

                    let order_count_reference_export = if group_num == 1 {
                        logic.order_count_reference.clone()
                    } else {
                        "".to_string()
                    };
                    lines.push(format!(
                        "gInput_{}_{}_{}_OrderCountReferenceLogic={}",
                        group_num, v19_suffix, direction, order_count_reference_export
                    ));
                    // StartLevel is a Group 1-only field for NON-POWER logics.
                    // Power logics use TriggerType only - they do NOT use StartLevel.
                    // Single source of truth: only export StartLevel for non-Power logics when explicitly present.
                    if group_num == 1 && *logic_name != "POWER" {
                        if let Some(start_level) = logic.start_level {
                            if start_level < 4 {
                                start_level_under4_count += 1;
                                if start_level_under4_samples.len() < 30 {
                                    start_level_under4_samples.push(format!(
                                        "E{} G{} {} {} id={} start={}",
                                        engine.engine_id,
                                        group_num,
                                        logic_name,
                                        direction,
                                        logic.logic_id,
                                        start_level
                                    ));
                                }
                            }
                            lines.push(format!(
                                "gInput_{}_{}_{}_StartLevel={}",
                                group_num, v19_suffix, direction, start_level
                            ));
                        } else {
                            start_level_missing_count += 1;
                            if start_level_missing_samples.len() < 30 {
                                start_level_missing_samples.push(format!(
                                    "E{} G{} {} {} id={} start=<missing>",
                                    engine.engine_id, group_num, logic_name, direction, logic.logic_id
                                ));
                            }
                        }
                    }
                    lines.push(format!(
                        "gInput_{}_{}_{}_ResetLotOnRestart={}",
                        group_num,
                        v19_suffix,
                        direction,
                        if logic.reset_lot_on_restart { 1 } else { 0 }
                    ));

                    let dir_use_tp = if *direction == "Buy" {
                        logic.use_tp_b.unwrap_or(logic.use_tp)
                    } else {
                        logic.use_tp_s.unwrap_or(logic.use_tp)
                    };
                    let dir_tp_mode = if *direction == "Buy" {
                        logic.tp_mode_b.clone().unwrap_or_else(|| logic.tp_mode.clone())
                    } else {
                        logic.tp_mode_s.clone().unwrap_or_else(|| logic.tp_mode.clone())
                    };
                    let dir_tp_value = if *direction == "Buy" {
                        logic.tp_value_b.unwrap_or(logic.tp_value)
                    } else {
                        logic.tp_value_s.unwrap_or(logic.tp_value)
                    };
                    let dir_use_sl = if *direction == "Buy" {
                        logic.use_sl_b.unwrap_or(logic.use_sl)
                    } else {
                        logic.use_sl_s.unwrap_or(logic.use_sl)
                    };
                    let dir_sl_mode = if *direction == "Buy" {
                        logic.sl_mode_b.clone().unwrap_or_else(|| logic.sl_mode.clone())
                    } else {
                        logic.sl_mode_s.clone().unwrap_or_else(|| logic.sl_mode.clone())
                    };
                    let dir_sl_value = if *direction == "Buy" {
                        logic.sl_value_b.unwrap_or(logic.sl_value)
                    } else {
                        logic.sl_value_s.unwrap_or(logic.sl_value)
                    };

                    lines.push(format!(
                        "gInput_{}_{}_{}_UseTP={}",
                        group_num,
                        v19_suffix,
                        direction,
                        if dir_use_tp { 1 } else { 0 }
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_TPMode={}",
                        group_num,
                        v19_suffix,
                        direction,
                        encode_tpsl_mode(&dir_tp_mode)
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_TPValue={:.1}",
                        group_num,
                        v19_suffix,
                        direction,
                        dir_tp_value
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_UseSL={}",
                        group_num,
                        v19_suffix,
                        direction,
                        if dir_use_sl { 1 } else { 0 }
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_SLMode={}",
                        group_num,
                        v19_suffix,
                        direction,
                        encode_tpsl_mode(&dir_sl_mode)
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_SLValue={:.1}",
                        group_num,
                        v19_suffix,
                        direction,
                        dir_sl_value
                    ));

                    let dir_continue_tp_hit = if *direction == "Buy" {
                        logic.continue_tp_hit_b.unwrap_or(logic.continue_tp_hit)
                    } else {
                        logic.continue_tp_hit_s.unwrap_or(logic.continue_tp_hit)
                    };
                    let dir_continue_sl_hit = if *direction == "Buy" {
                        logic.continue_sl_hit_b.unwrap_or(logic.continue_sl_hit)
                    } else {
                        logic.continue_sl_hit_s.unwrap_or(logic.continue_sl_hit)
                    };
                    lines.push(format!(
                        "gInput_{}_{}_{}_ContinueTPHit={}",
                        group_num,
                        v19_suffix,
                        direction,
                        if dir_continue_tp_hit { 1 } else { 0 }
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_ContinueSLHit={}",
                        group_num,
                        v19_suffix,
                        direction,
                        if dir_continue_sl_hit { 1 } else { 0 }
                    ));

                    let partial_enabled = [Some(logic.close_partial), logic.close_partial_2, logic.close_partial_3, logic.close_partial_4];
                    let partial_modes = [
                        Some(logic.close_partial_mode.as_str()),
                        logic.close_partial_mode_2.as_deref(),
                        logic.close_partial_mode_3.as_deref(),
                        logic.close_partial_mode_4.as_deref(),
                    ];
                    let partial_profit_thresholds = [
                        Some(logic.close_partial_profit_threshold),
                        logic.close_partial_profit_threshold_2,
                        logic.close_partial_profit_threshold_3,
                        logic.close_partial_profit_threshold_4,
                    ];

                    for idx in 0..4 {
                        let n = idx + 1;
                        let base = if n == 1 { "".to_string() } else { n.to_string() };
                        let key_partial_enabled =
                            format!("gInput_{}_{}_{}_ClosePartial{}", group_num, v19_suffix, direction, base);
                        let key_partial_mode =
                            format!("gInput_{}_{}_{}_ClosePartialMode{}", group_num, v19_suffix, direction, base);
                        let key_partial_profit_threshold =
                            format!("gInput_{}_{}_{}_ClosePartialProfitThreshold{}", group_num, v19_suffix, direction, base);

                        let enabled_value = partial_enabled[idx]
                            .map(|v| if v { "1".to_string() } else { "0".to_string() })
                            .unwrap_or_else(|| "".to_string());
                        let mode_value = partial_modes[idx]
                            .map(|v| encode_partial_mode(v).to_string())
                            .unwrap_or_else(|| "".to_string());
                        let threshold_value = partial_profit_thresholds[idx]
                            .map(|v| format!("{:.2}", v))
                            .unwrap_or_else(|| "".to_string());

                        lines.push(format!("{}={}", key_partial_enabled, enabled_value));
                        lines.push(format!("{}={}", key_partial_mode, mode_value));
                        lines.push(format!("{}={}", key_partial_profit_threshold, threshold_value));
                    }

                    let key_profit_enabled = format!(
                        "gInput_{}_{}_{}_ProfitTrailEnabled",
                        group_num, v19_suffix, direction
                    );
                    lines.push(format!(
                        "{}={}",
                        key_profit_enabled,
                        "".to_string()
                    ));
                    let key_profit_peak_drop = format!(
                        "gInput_{}_{}_{}_ProfitTrailPeakDropPercent",
                        group_num, v19_suffix, direction
                    );
                    lines.push(format!(
                        "{}={}",
                        key_profit_peak_drop,
                        "".to_string()
                    ));
                    let key_profit_lock_percent = format!(
                        "gInput_{}_{}_{}_ProfitTrailLockPercent",
                        group_num, v19_suffix, direction
                    );
                    lines.push(format!(
                        "{}={}",
                        key_profit_lock_percent,
                        "".to_string()
                    ));
                    let key_profit_close_on_trigger = format!(
                        "gInput_{}_{}_{}_ProfitTrailCloseOnTrigger",
                        group_num, v19_suffix, direction
                    );
                    lines.push(format!(
                        "{}={}",
                        key_profit_close_on_trigger,
                        "".to_string()
                    ));


                    lines.push(format!(
                        "gInput_{}_{}_{}_ReverseEnabled={}",
                        group_num,
                        v19_suffix,
                        direction,
                        if export_reverse_enabled { 1 } else { 0 }
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_ReverseReference={}",
                        group_num,
                        v19_suffix,
                        direction,
                        export_reverse_reference
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_ReverseScale={:.2}",
                        group_num,
                        v19_suffix,
                        direction,
                        export_reverse_scale
                    ));

                    lines.push(format!(
                        "gInput_{}_{}_{}_HedgeEnabled={}",
                        group_num,
                        v19_suffix,
                        direction,
                        if export_hedge_enabled { 1 } else { 0 }
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_HedgeReference={}",
                        group_num,
                        v19_suffix,
                        direction,
                        export_hedge_reference
                    ));
                    lines.push(format!(
                        "gInput_{}_{}_{}_HedgeScale={:.2}",
                        group_num,
                        v19_suffix,
                        direction,
                        export_hedge_scale
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

    let key_lines = lines
        .iter()
        .filter(|line| {
            let s = line.trim();
            !s.is_empty() && !s.starts_with(';') && s.contains('=')
        })
        .count();
    let group_power_start_min = group_power_start_values.iter().min().copied().unwrap_or(0);
    let group_power_start_max = group_power_start_values.iter().max().copied().unwrap_or(0);
    let total_directional_rows: usize = 15 * 3 * 7 * 2;
    println!(
        "[SETFILE][EXPORT] Massive v19 diagnostics: missing_scope={}, start_under4_non_power={}, start_missing_non_power={}, enabled_rows={}/{}, trigger_immediate={}/{}, trigger_ontick={}/{}, gps_count={}, gps_min={}, gps_max={}, key_lines={}",
        missing_scope_count,
        start_level_under4_count,
        start_level_missing_count,
        enabled_rows_count,
        total_directional_rows,
        trigger_type_immediate_count,
        total_directional_rows,
        trigger_mode_ontick_count,
        total_directional_rows,
        group_power_start_values.len(),
        group_power_start_min,
        group_power_start_max,
        key_lines
    );
    if !missing_scope_samples.is_empty() {
        println!(
            "[SETFILE][EXPORT] missing-scope samples: {}",
            missing_scope_samples.join(" | ")
        );
    }
    if !start_level_under4_samples.is_empty() {
        println!(
            "[SETFILE][EXPORT] start<4 samples: {}",
            start_level_under4_samples.join(" | ")
        );
    }
    if !start_level_missing_samples.is_empty() {
        println!(
            "[SETFILE][EXPORT] start missing samples: {}",
            start_level_missing_samples.join(" | ")
        );
    }
    // Write to file
    let content = lines.join("\n");
    atomic_write(&sanitized_path, &content)?;

    let mut keymap_json_for_mirror: Option<String> = None;
    if export_keymap_json.unwrap_or(true) {
        use std::collections::BTreeMap;

        let keymap_path = PathBuf::from(format!("{}.keymap.json", file_path));
        let sanitized_keymap_path = sanitize_and_validate_path(&keymap_path)?;

        let mut map: BTreeMap<String, String> = BTreeMap::new();
        let mut dup_keys: u32 = 0;
        for line in &lines {
            let s = line.trim();
            if s.is_empty() || s.starts_with(';') {
                continue;
            }
            if let Some((k, v)) = s.split_once('=') {
                if map.insert(k.to_string(), v.to_string()).is_some() {
                    dup_keys += 1;
                }
            }
        }
        if dup_keys > 0 {
            return Err(format!(
                "export_massive_v19_setfile: duplicate keys detected in output (dup_keys={})",
                dup_keys
            ));
        }
        let json = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
        atomic_write(&sanitized_keymap_path, &json)?;
        keymap_json_for_mirror = Some(json);
    }

    mirror_setfile_to_mt_common_files(
        &sanitized_path,
        &content,
        keymap_json_for_mirror.as_deref(),
    );

    Ok(())
}

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
pub fn export_massive_v19_setfile_to_mt_common_files(
    config: MTConfig,
    platform: String,
    file_name: Option<String>,
) -> Result<String, String> {
    let common_dir = get_mt_common_files_dir()?;
    let setfile_name = normalize_common_setfile_name(file_name)?;
    let file_path = common_dir.join(&setfile_name);
    let path_str = file_path.to_string_lossy().to_string();
    export_massive_v19_setfile(config, path_str.clone(), platform, Some(true))?;
    Ok(path_str)
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

fn mirror_setfile_to_mt_common_files(
    source_set_path: &PathBuf,
    set_content: &str,
    keymap_json: Option<&str>,
) {
    let common_dir = match get_mt_common_files_dir() {
        Ok(dir) => dir,
        Err(err) => {
            println!("[SETFILE][MIRROR] WARN: cannot resolve MT common files dir: {}", err);
            return;
        }
    };

    if let Err(err) = fs::create_dir_all(&common_dir) {
        println!(
            "[SETFILE][MIRROR] WARN: cannot create common files dir '{}': {}",
            common_dir.display(),
            err
        );
        return;
    }

    let source_name = source_set_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("config.set")
        .to_string();

    let mut target_names: Vec<String> = vec![source_name.clone()];
    if !source_name.eq_ignore_ascii_case("ACTIVE.set") {
        target_names.push("ACTIVE.set".to_string());
    }

    for target_name in target_names {
        let target_set = common_dir.join(&target_name);
        match atomic_write(&target_set, set_content) {
            Ok(_) => println!(
                "[SETFILE][MIRROR] set mirrored to '{}'",
                target_set.display()
            ),
            Err(err) => {
                println!(
                    "[SETFILE][MIRROR] WARN: failed to mirror '{}' to '{}': {}",
                    source_set_path.display(),
                    target_set.display(),
                    err
                );
                continue;
            }
        }

        if let Some(json) = keymap_json {
            let target_keymap = common_dir.join(format!("{}.keymap.json", target_name));
            if let Err(err) = atomic_write(&target_keymap, json) {
                println!(
                    "[SETFILE][MIRROR] WARN: failed to mirror keymap '{}': {}",
                    target_keymap.display(),
                    err
                );
            } else {
                println!(
                    "[SETFILE][MIRROR] keymap mirrored to '{}'",
                    target_keymap.display()
                );
            }
        }
    }
}

fn normalize_common_setfile_name(file_name: Option<String>) -> Result<String, String> {
    let raw = file_name.unwrap_or_else(|| "config.set".to_string());
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Setfile name cannot be empty".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains(':') || trimmed.contains("..")
    {
        return Err(format!(
            "Invalid setfile name '{}': only plain file names are allowed",
            trimmed
        ));
    }

    let mut name = trimmed.to_string();
    if !name.to_ascii_lowercase().ends_with(".set") {
        name.push_str(".set");
    }
    Ok(name)
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

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
pub fn export_active_set_file_to_mt_common_files(
    config: MTConfig,
    platform: String,
    include_optimization_hints: bool,
    file_name: Option<String>,
) -> Result<String, String> {
    let common_dir = get_mt_common_files_dir()?;
    let setfile_name = normalize_common_setfile_name(file_name)?;
    let file_path = common_dir.join(&setfile_name);
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

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
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
pub fn get_active_set_status(file_name: Option<String>) -> Result<ActiveSetStatus, String> {
    let common_dir = get_mt_common_files_dir()?;
    let setfile_name = normalize_common_setfile_name(file_name)?;
    let file_path = common_dir.join(&setfile_name);
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

    let bytes =
        fs::read(&file_path).map_err(|e| format!("Failed to read {}: {}", setfile_name, e))?;
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
            return Err(format!(
                "Invalid v19 massive setfile. Current full v19 exports are about 45,480 logic inputs across 630 logic-directions. {}",
                v19_validation.errors.join(" ")
            ));
        }

        let mut config = build_config_from_v19_setfile(&content)?;
        if let Ok(legacy_overlay) = build_config_from_values(&values) {
            // Preserve full global metadata and group trigger thresholds from the same source file.
            // v19 parser remains authoritative for directional logic rows.
            config.general = legacy_overlay.general;
            for engine in &mut config.engines {
                if let Some(legacy_engine) = legacy_overlay
                    .engines
                    .iter()
                    .find(|e| e.engine_id == engine.engine_id)
                {
                    for group in &mut engine.groups {
                        if let Some(legacy_group) = legacy_engine
                            .groups
                            .iter()
                            .find(|g| g.group_number == group.group_number)
                        {
                            group.group_power_start = legacy_group.group_power_start;
                        }
                    }
                }
            }
        }
        normalize_config_mode_contract(&mut config);
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
#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
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
#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
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

    sanitize_and_validate_path(&get_vault_path())
}

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
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

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
pub async fn open_vault_folder(vault_path_override: Option<String>) -> Result<(), String> {
    let vault_path = resolve_vault_path(vault_path_override)?;
    if !vault_path.exists() {
        return Err("Vault folder does not exist".to_string());
    }
    if !vault_path.is_dir() {
        return Err("Vault path is not a folder".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&vault_path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Open folder not supported on this OS".to_string())
}

struct VaultSizeCache {
    last_size: u64,
    last_calculated_at: Option<std::time::Instant>,
}

static VAULT_SIZE_CACHE: std::sync::OnceLock<std::sync::Mutex<VaultSizeCache>> =
    std::sync::OnceLock::new();

fn get_vault_size_cache() -> &'static std::sync::Mutex<VaultSizeCache> {
    VAULT_SIZE_CACHE.get_or_init(|| std::sync::Mutex::new(VaultSizeCache {
        last_size: 0,
        last_calculated_at: None,
    }))
}

fn calculate_dir_size_bounded(
    root: &PathBuf,
    time_budget: std::time::Duration,
    max_entries: usize,
) -> u64 {
    let start = std::time::Instant::now();
    let mut size = 0u64;
    let mut scanned = 0usize;
    let mut stack = vec![root.clone()];

    while let Some(dir) = stack.pop() {
        if start.elapsed() > time_budget || scanned >= max_entries {
            break;
        }

        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            scanned += 1;
            if start.elapsed() > time_budget || scanned >= max_entries {
                break;
            }

            let path = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            if meta.is_file() {
                size = size.saturating_add(meta.len());
            } else if meta.is_dir() {
                stack.push(path);
            }
        }
    }

    size
}

#[derive(Debug, Clone, Serialize)]
pub struct VaultSizeResult {
    pub total_size: u64,
}

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
pub async fn get_vault_size(
    vault_path_override: Option<String>,
) -> Result<VaultSizeResult, String> {
    let vault_path = resolve_vault_path(vault_path_override)?;
    if !vault_path.exists() {
        let mut cache = get_vault_size_cache()
            .lock()
            .map_err(|_| "Vault size cache poisoned".to_string())?;
        cache.last_size = 0;
        cache.last_calculated_at = None;
        return Ok(VaultSizeResult { total_size: 0 });
    }

    {
        let cache = get_vault_size_cache()
            .lock()
            .map_err(|_| "Vault size cache poisoned".to_string())?;
        if let Some(last) = cache.last_calculated_at {
            if last.elapsed() < std::time::Duration::from_secs(60) {
                return Ok(VaultSizeResult {
                    total_size: cache.last_size,
                });
            }
        }
    }

    let vault_path_for_task = vault_path.clone();
    let total_size = tokio::task::spawn_blocking(move || {
        calculate_dir_size_bounded(
            &vault_path_for_task,
            std::time::Duration::from_millis(250),
            30_000,
        )
    })
    .await
    .map_err(|e| format!("Failed to calculate vault size: {}", e))?;

    let mut cache = get_vault_size_cache()
        .lock()
        .map_err(|_| "Vault size cache poisoned".to_string())?;
    cache.last_size = total_size;
    cache.last_calculated_at = Some(std::time::Instant::now());

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
            .arg(&root)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Open folder not supported on this OS".to_string())
}

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
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

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
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

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
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

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
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
        "STOPPER" => "ST",
        "STO" => "STO",
        "SCA" => "SCA",
        "RPO" => "RPO",
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
        "TriggerAction_PauseEA_CloseTrades" => 6,
        "TriggerAction_PauseEA_KeepTrades" => 7,
        "Action_Default" => 2,
        "Action_CloseAll" => 3,
        _ => 2,
    }
}

fn trigger_action_from_int(n: i32) -> &'static str {
    match n {
        0 => "TriggerAction_None",
        1 => "TriggerAction_StopEA",
        2 => "TriggerAction_StopEA_KeepTrades",
        3 => "TriggerAction_CloseAll",
        4 => "TriggerAction_KeepEA_CloseTrades",
        5 => "TriggerAction_StopEA_CloseTrades",
        6 => "TriggerAction_PauseEA_CloseTrades",
        7 => "TriggerAction_PauseEA_KeepTrades",
        _ => "TriggerAction_StopEA_KeepTrades",
    }
}

fn trigger_action_from_raw(raw: &str) -> String {
    let s = raw.trim();
    if s.is_empty() {
        return "TriggerAction_StopEA_KeepTrades".to_string();
    }
    if let Ok(n) = s.parse::<i32>() {
        return trigger_action_from_int(n).to_string();
    }
    let lower = s.to_ascii_lowercase();
    match lower.as_str() {
        "triggeraction_none" => "TriggerAction_None".to_string(),
        "triggeraction_stopea" => "TriggerAction_StopEA".to_string(),
        "triggeraction_stopea_keeptrades" => "TriggerAction_StopEA_KeepTrades".to_string(),
        "triggeraction_closeall" => "TriggerAction_CloseAll".to_string(),
        "triggeraction_keepea_closetrades" => "TriggerAction_KeepEA_CloseTrades".to_string(),
        "triggeraction_stopea_closetrades" => "TriggerAction_StopEA_CloseTrades".to_string(),
        "triggeraction_pauseea_closetrades" => "TriggerAction_PauseEA_CloseTrades".to_string(),
        "triggeraction_pauseea_keeptrades" => "TriggerAction_PauseEA_KeepTrades".to_string(),
        "action_default" => "TriggerAction_StopEA_KeepTrades".to_string(),
        "action_closeall" => "TriggerAction_CloseAll".to_string(),
        _ => "TriggerAction_StopEA_KeepTrades".to_string(),
    }
}

fn news_flags_from_action_int(action: i32) -> (bool, bool, bool) {
    match action {
        0 => (false, false, false),
        1 | 2 => (true, false, false),
        3 | 5 => (true, true, false),
        4 | 6 => (true, true, true),
        7 => (true, false, true),
        _ => (true, false, true),
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
        "Trigger_AfterPoints" => "3".to_string(),
        "Trigger_OpCount" => "7".to_string(),
        "Trigger_TimeFilter" => "4".to_string(),
        "Trigger_NewsFilter" => "5".to_string(),
        "Trigger_PowerAOppositeCount" => "6".to_string(),
        // Legacy mappings (with numeric prefixes)
        "0 Trigger_Immediate" => "0".to_string(),
        "1 Trigger_AfterBars" => "1".to_string(),
        "2 Trigger_AfterSeconds" => "2".to_string(),
        "3 Trigger_AfterPips" => "3".to_string(),
        _ => "0".to_string(),
    }
}

fn trigger_type_code(raw: &str) -> i32 {
    normalize_trigger_type(raw)
        .parse::<i32>()
        .ok()
        .unwrap_or(0)
}

fn normalize_trigger_mode(raw: &str) -> String {
    let mode = raw.trim().to_ascii_lowercase();
    match mode.as_str() {
        "1" | "triggermode_firsttick" | "firsttick" | "first_tick" => {
            "TriggerMode_FirstTick".to_string()
        }
        "2" | "triggermode_waitbar" | "waitbar" | "wait_bar" => {
            "TriggerMode_WaitBar".to_string()
        }
        _ => "TriggerMode_OnTick".to_string(),
    }
}

fn encode_trigger_mode(raw: &str) -> i32 {
    match normalize_trigger_mode(raw).as_str() {
        "TriggerMode_FirstTick" => 1,
        "TriggerMode_WaitBar" => 2,
        _ => 0,
    }
}

fn encode_tpsl_mode(raw: &str) -> i32 {
    match raw {
        "TPSL_Price" => 1,
        "TPSL_Percent" => 2,
        _ => 0,
    }
}

fn encode_trail_step_method(raw: &str) -> i32 {
    match raw {
        "Step_Percent" => 1,
        _ => 0,
    }
}

fn encode_trail_step_mode(raw: &str) -> i32 {
    match raw {
        "TrailStepMode_Auto" => 0,
        "TrailStepMode_Fixed" => 1,
        "TrailStepMode_PerOrder" => 3,
        _ => 0,
    }
}

fn encode_partial_mode(raw: &str) -> i32 {
    match raw {
        "PartialMode_Low" => 0,
        "PartialMode_Mid" | "PartialMode_Balanced" => 1,
        "PartialMode_Aggressive" | "PartialMode_High" => 2,
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

fn get_bool_with_default(
    values: &std::collections::HashMap<String, String>,
    key: &str,
    default: bool,
) -> bool {
    values
        .get(key)
        .map(|v| {
            let t = v.trim().to_ascii_lowercase();
            t == "1" || t == "true"
        })
        .unwrap_or(default)
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
    let legacy_trigger_minute_keys = values
        .keys()
        .filter(|k| k.contains("TriggerMinutes"))
        .count();
    if legacy_trigger_minute_keys > 0 {
        println!(
            "[SETFILE] WARN: Detected {} legacy TriggerMinutes key(s); mapping to trigger_seconds.",
            legacy_trigger_minute_keys
        );
    }

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

    let news_action_flags = values
        .get("gInput_NewsAction")
        .and_then(|v| v.trim().parse::<i32>().ok())
        .map(news_flags_from_action_int)
        .unwrap_or((true, false, true));

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
        grid_unit: Some(get_i32(values, "gInput_GridUnit", 10)),
        pip_factor: Some(get_i32(values, "gInput_PipFactor", 1)),
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
            enabled: get_bool(values, "gInput_RiskManagementEnabled"),
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
            enabled: get_bool(values, "gInput_TimeFiltersEnabled"),
            priority_settings: TimePrioritySettings {
                news_filter_overrides_session: get_bool(values, "gInput_NewsFilterOverridesSession"),
                session_filter_overrides_news: get_bool(values, "gInput_SessionFilterOverridesNews"),
            },
            sessions,
        },
        news_filter: NewsFilterConfig {
            enabled: get_bool_first(values, &["gInput_EnableNewsFilter", "gInput_NewsFilterEnabled"]),
            api_key: get_string(values, "gInput_NewsAPIKey", ""),
            api_url: get_string(values, "gInput_NewsAPIURL", "https://www.jblanked.com/news/api/calendar/"),
            countries: get_string(values, "gInput_NewsFilterCountries", "US,GB,EU"),
            impact_level: get_i32(values, "gInput_NewsImpactLevel", 3),
            minutes_before: get_i32(values, "gInput_MinutesBeforeNews", 30),
            minutes_after: get_i32(values, "gInput_MinutesAfterNews", 30),
            // Convert action enum to 3 boolean fields
            stop_ea: get_bool_with_default(values, "gInput_NewsStopEA", news_action_flags.0),
            close_trades: get_bool_with_default(values, "gInput_NewsCloseTrades", news_action_flags.1),
            auto_restart: get_bool_with_default(values, "gInput_NewsAutoRestart", news_action_flags.2),
            check_interval: get_i32(values, "gInput_NewsCheckInterval", 60),
            alert_minutes: get_i32(values, "gInput_AlertMinutesBefore", 5),
            filter_high_only: get_bool_with_default(values, "gInput_FilterHighImpactOnly", true),
            filter_weekends: get_bool_with_default(values, "gInput_FilterWeekendNews", false),
            use_local_cache: get_bool_with_default(values, "gInput_UseLocalNewsCache", true),
            cache_duration: get_i32(values, "gInput_NewsCacheDuration", 3600),
            fallback_on_error: get_string(values, "gInput_NewsFallbackOnError", "Fallback_Continue"),
            filter_currencies: get_string(values, "gInput_FilterCurrencies", ""),
            include_speeches: get_bool_with_default(values, "gInput_IncludeSpeeches", true),
            include_reports: get_bool_with_default(values, "gInput_IncludeReports", true),
            visual_indicator: get_bool_with_default(values, "gInput_NewsVisualIndicator", true),
            alert_before_news: get_bool_with_default(values, "gInput_AlertBeforeNews", false),
            calendar_file: get_string(values, "gInput_NewsCalendarFile", ""),
        },
        // ===== RISK MANAGEMENT BUY/SELL =====
        risk_management_b: if values.contains_key("gInput_RiskManagementEnabled_Buy") {
            Some(RiskManagementConfig {
                enabled: get_bool(values, "gInput_RiskManagementEnabled_Buy"),
                spread_filter_enabled: get_bool(values, "gInput_UseSpreadFilter_Buy"),
                max_spread_points: get_f64(values, "gInput_MaxSpreadPoints_Buy", 25.0),
                equity_stop_enabled: get_bool(values, "gInput_UseEquityStop_Buy"),
                equity_stop_value: get_f64(values, "gInput_EquityStopValue_Buy", 35.0),
                drawdown_stop_enabled: get_bool(values, "gInput_UseDrawdownStop_Buy"),
                max_drawdown_percent: get_f64(values, "gInput_MaxDrawdownPercent_Buy", 35.0),
                risk_action: {
                    let s = get_string(values, "gInput_RiskAction_Buy", "");
                    if s.is_empty() { None } else { Some(s) }
                },
            })
        } else { None },
        risk_management_s: if values.contains_key("gInput_RiskManagementEnabled_Sell") {
            Some(RiskManagementConfig {
                enabled: get_bool(values, "gInput_RiskManagementEnabled_Sell"),
                spread_filter_enabled: get_bool(values, "gInput_UseSpreadFilter_Sell"),
                max_spread_points: get_f64(values, "gInput_MaxSpreadPoints_Sell", 25.0),
                equity_stop_enabled: get_bool(values, "gInput_UseEquityStop_Sell"),
                equity_stop_value: get_f64(values, "gInput_EquityStopValue_Sell", 35.0),
                drawdown_stop_enabled: get_bool(values, "gInput_UseDrawdownStop_Sell"),
                max_drawdown_percent: get_f64(values, "gInput_MaxDrawdownPercent_Sell", 35.0),
                risk_action: {
                    let s = get_string(values, "gInput_RiskAction_Sell", "");
                    if s.is_empty() { None } else { Some(s) }
                },
            })
        } else { None },
        // ===== NEWS FILTER BUY/SELL =====
        news_filter_b: if values.contains_key("gInput_NewsFilterEnabled_Buy") {
            Some(NewsFilterConfig {
                enabled: get_bool(values, "gInput_NewsFilterEnabled_Buy"),
                api_key: get_string(values, "gInput_NewsAPIKey_Buy", ""),
                api_url: get_string(values, "gInput_NewsAPIURL_Buy", "https://www.jblanked.com/news/api/calendar/"),
                countries: get_string(values, "gInput_NewsFilterCountries_Buy", "US,GB,EU"),
                impact_level: get_i32(values, "gInput_NewsImpactLevel_Buy", 3),
                minutes_before: get_i32(values, "gInput_MinutesBeforeNews_Buy", 30),
                minutes_after: get_i32(values, "gInput_MinutesAfterNews_Buy", 30),
                stop_ea: get_bool(values, "gInput_NewsStopEA_Buy"),
                close_trades: get_bool(values, "gInput_NewsCloseTrades_Buy"),
                auto_restart: get_bool(values, "gInput_NewsAutoRestart_Buy"),
                check_interval: get_i32(values, "gInput_NewsCheckInterval_Buy", 60),
                alert_minutes: get_i32(values, "gInput_AlertMinutesBefore_Buy", 5),
                filter_high_only: get_bool(values, "gInput_FilterHighImpactOnly_Buy"),
                filter_weekends: get_bool(values, "gInput_FilterWeekendNews_Buy"),
                use_local_cache: get_bool(values, "gInput_UseLocalNewsCache_Buy"),
                cache_duration: get_i32(values, "gInput_NewsCacheDuration_Buy", 3600),
                fallback_on_error: get_string(values, "gInput_NewsFallbackOnError_Buy", "Fallback_Continue"),
                filter_currencies: get_string(values, "gInput_FilterCurrencies_Buy", ""),
                include_speeches: get_bool(values, "gInput_IncludeSpeeches_Buy"),
                include_reports: get_bool(values, "gInput_IncludeReports_Buy"),
                visual_indicator: get_bool(values, "gInput_NewsVisualIndicator_Buy"),
                alert_before_news: get_bool(values, "gInput_AlertBeforeNews_Buy"),
                calendar_file: get_string(values, "gInput_NewsCalendarFile_Buy", ""),
            })
        } else { None },
        news_filter_s: if values.contains_key("gInput_NewsFilterEnabled_Sell") {
            Some(NewsFilterConfig {
                enabled: get_bool(values, "gInput_NewsFilterEnabled_Sell"),
                api_key: get_string(values, "gInput_NewsAPIKey_Sell", ""),
                api_url: get_string(values, "gInput_NewsAPIURL_Sell", "https://www.jblanked.com/news/api/calendar/"),
                countries: get_string(values, "gInput_NewsFilterCountries_Sell", "US,GB,EU"),
                impact_level: get_i32(values, "gInput_NewsImpactLevel_Sell", 3),
                minutes_before: get_i32(values, "gInput_MinutesBeforeNews_Sell", 30),
                minutes_after: get_i32(values, "gInput_MinutesAfterNews_Sell", 30),
                stop_ea: get_bool(values, "gInput_NewsStopEA_Sell"),
                close_trades: get_bool(values, "gInput_NewsCloseTrades_Sell"),
                auto_restart: get_bool(values, "gInput_NewsAutoRestart_Sell"),
                check_interval: get_i32(values, "gInput_NewsCheckInterval_Sell", 60),
                alert_minutes: get_i32(values, "gInput_AlertMinutesBefore_Sell", 5),
                filter_high_only: get_bool(values, "gInput_FilterHighImpactOnly_Sell"),
                filter_weekends: get_bool(values, "gInput_FilterWeekendNews_Sell"),
                use_local_cache: get_bool(values, "gInput_UseLocalNewsCache_Sell"),
                cache_duration: get_i32(values, "gInput_NewsCacheDuration_Sell", 3600),
                fallback_on_error: get_string(values, "gInput_NewsFallbackOnError_Sell", "Fallback_Continue"),
                filter_currencies: get_string(values, "gInput_FilterCurrencies_Sell", ""),
                include_speeches: get_bool(values, "gInput_IncludeSpeeches_Sell"),
                include_reports: get_bool(values, "gInput_IncludeReports_Sell"),
                visual_indicator: get_bool(values, "gInput_NewsVisualIndicator_Sell"),
                alert_before_news: get_bool(values, "gInput_AlertBeforeNews_Sell"),
                calendar_file: get_string(values, "gInput_NewsCalendarFile_Sell", ""),
            })
        } else { None },
        // ===== TIME FILTERS BUY/SELL =====
        time_filters_b: if values.contains_key("gInput_TimeFiltersEnabled_Buy") {
            Some({
                let mut sessions_b = Vec::new();
                for i in 1..=7 {
                    sessions_b.push(SessionConfig {
                        session_number: i,
                        enabled: get_bool(values, &format!("gInput_Session{}Enabled_Buy", i)),
                        day: get_i32(values, &format!("gInput_Session{}Day_Buy", i), i % 7),
                        start_hour: get_i32(values, &format!("gInput_Session{}StartHour_Buy", i), 9),
                        start_minute: get_i32(values, &format!("gInput_Session{}StartMinute_Buy", i), 30),
                        end_hour: get_i32(values, &format!("gInput_Session{}EndHour_Buy", i), 17),
                        end_minute: get_i32(values, &format!("gInput_Session{}EndMinute_Buy", i), 0),
                        action: get_string(values, &format!("gInput_Session{}Action_Buy", i), "Action_Default"),
                        auto_restart: get_bool(values, &format!("gInput_Session{}AutoRestart_Buy", i)),
                        restart_mode: get_string(values, &format!("gInput_Session{}RestartMode_Buy", i), "Restart_Default"),
                        restart_bars: get_i32(values, &format!("gInput_Session{}RestartBars_Buy", i), 0),
                        restart_minutes: get_i32(values, &format!("gInput_Session{}RestartMinutes_Buy", i), 0),
                        restart_pips: get_i32(values, &format!("gInput_Session{}RestartPips_Buy", i), 0),
                    });
                }
                TimeFiltersConfig {
                    enabled: get_bool(values, "gInput_TimeFiltersEnabled_Buy"),
                    priority_settings: TimePrioritySettings {
                        news_filter_overrides_session: get_bool(values, "gInput_NewsFilterOverridesSession_Buy"),
                        session_filter_overrides_news: get_bool(values, "gInput_SessionFilterOverridesNews_Buy"),
                    },
                    sessions: sessions_b,
                }
            })
        } else { None },
        time_filters_s: if values.contains_key("gInput_TimeFiltersEnabled_Sell") {
            Some({
                let mut sessions_s = Vec::new();
                for i in 1..=7 {
                    sessions_s.push(SessionConfig {
                        session_number: i,
                        enabled: get_bool(values, &format!("gInput_Session{}Enabled_Sell", i)),
                        day: get_i32(values, &format!("gInput_Session{}Day_Sell", i), i % 7),
                        start_hour: get_i32(values, &format!("gInput_Session{}StartHour_Sell", i), 9),
                        start_minute: get_i32(values, &format!("gInput_Session{}StartMinute_Sell", i), 30),
                        end_hour: get_i32(values, &format!("gInput_Session{}EndHour_Sell", i), 17),
                        end_minute: get_i32(values, &format!("gInput_Session{}EndMinute_Sell", i), 0),
                        action: get_string(values, &format!("gInput_Session{}Action_Sell", i), "Action_Default"),
                        auto_restart: get_bool(values, &format!("gInput_Session{}AutoRestart_Sell", i)),
                        restart_mode: get_string(values, &format!("gInput_Session{}RestartMode_Sell", i), "Restart_Default"),
                        restart_bars: get_i32(values, &format!("gInput_Session{}RestartBars_Sell", i), 0),
                        restart_minutes: get_i32(values, &format!("gInput_Session{}RestartMinutes_Sell", i), 0),
                        restart_pips: get_i32(values, &format!("gInput_Session{}RestartPips_Sell", i), 0),
                    });
                }
                TimeFiltersConfig {
                    enabled: get_bool(values, "gInput_TimeFiltersEnabled_Sell"),
                    priority_settings: TimePrioritySettings {
                        news_filter_overrides_session: get_bool(values, "gInput_NewsFilterOverridesSession_Sell"),
                        session_filter_overrides_news: get_bool(values, "gInput_SessionFilterOverridesNews_Sell"),
                    },
                    sessions: sessions_s,
                }
            })
        } else { None },
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

    let mut config = MTConfig {
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
    };
    normalize_config_mode_contract(&mut config);
    Ok(config)
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

    // Special case: GroupPowerStart parameters are handled separately
    if name.contains("GroupPowerStart") {
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
    // Setfile uses single-letter codes: C=SCA, O=STO, P=Power, R=Repower, S=Scalper, T=Stopper/ST, X=RPO
    let logic_name = match logic_abbr {
        "C" => "SCA",
        "O" => "STO",
        "P" => "Power",
        "R" => "Repower",
        "S" => "Scalper",
        "T" => "Stopper",
        "ST" => "Stopper",  // Support both T and ST for Stopper
        "X" => "RPO",
        // Also support full names if ever used
        "STO" => "STO",
        "SCA" => "SCA",
        "RPO" => "RPO",
        "Power" => "Power",
        "Repower" => "Repower",
        "Scalp" => "Scalper",
        "Scalper" => "Scalper",
        "Stopper" => "Stopper",
        _ => {
            println!("[SETFILE] Rust: Unknown logic abbreviation '{}' in: {}", logic_abbr, name);
            logic_abbr
        }
    };

    // Join the remaining parts to form the parameter name
    let param_name = param_parts.join("_");

    // Debug logging for parsed parameters - using AtomicUsize for thread safety
    use std::sync::atomic::{AtomicUsize, Ordering};
    static PARSE_COUNT: AtomicUsize = AtomicUsize::new(0);
    let count = PARSE_COUNT.fetch_add(1, Ordering::SeqCst);
    if count < 20 {
        println!("[SETFILE] Rust: Parsed '{}' -> engine={} group={} logic={} direction={} param={}",
                 name, engine_char, group, logic_name, direction, param_name);
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
/// Logic codes: P (Power), R (Repower), S (Scalper), ST (Stopper), STO, SCA, RPO
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
        ("S", "Scalper"),
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

    // Logic names in config are base names (engine is modeled separately).
    let logic_order = vec!["Power", "Repower", "Scalper", "Stopper", "STO", "SCA", "RPO"];

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

    // GroupPowerStart thresholds (groups 2+) are per-engine:
    // A -> GroupPowerStart_P{N}, B -> GroupPowerStart_BP{N}, C -> GroupPowerStart_CP{N}.
    // B/C keep fallback-to-P compatibility when their dedicated key is missing.
    let group_power_start = if group_num > 1 {
        let key_primary = match engine_id {
            "A" => format!("gInput_GroupPowerStart_P{}", group_num),
            "B" => format!("gInput_GroupPowerStart_BP{}", group_num),
            "C" => format!("gInput_GroupPowerStart_CP{}", group_num),
            _ => format!("gInput_GroupPowerStart_P{}", group_num),
        };
        let key_fallback_p = format!("gInput_GroupPowerStart_P{}", group_num);
        let primary_value = values.get(&key_primary).and_then(|v| v.parse().ok());
        let fallback_value = values.get(&key_fallback_p).and_then(|v| v.parse().ok());
        if primary_value.is_none()
            && fallback_value.is_some()
            && (engine_id == "B" || engine_id == "C")
        {
            println!(
                "[SETFILE] WARN: {} missing; using {} fallback for Engine {} Group {}.",
                key_primary, key_fallback_p, engine_id, group_num
            );
        }
        primary_value.or(fallback_value)
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
        group_power_start_b: group_power_start, // Use legacy value as both Buy and Sell
        group_power_start_s: group_power_start, // Use legacy value as both Buy and Sell
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

    // Debug logging for first few logics - using AtomicUsize for thread safety
    use std::sync::atomic::{AtomicUsize, Ordering};
    static LOGIC_DEBUG_COUNT: AtomicUsize = AtomicUsize::new(0);
    let count = LOGIC_DEBUG_COUNT.fetch_add(1, Ordering::SeqCst);
    let should_log = count < 10;

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

    // Helper for directional i32 parameters (Buy/Sell variants)
    let get_dir_i32 = |variants: &[&str], direction: &str| -> Option<i32> {
        let (dir_map, legacy_suffix) = match direction {
            "Buy" => (buy_params, "B"),
            "Sell" => (sell_params, "S"),
            _ => (None, ""),
        };

        for param in variants {
            if let Some(m) = dir_map {
                if let Some(v) = m.get(*param) {
                    if let Ok(n) = v.parse::<i32>() {
                        return Some(n);
                    }
                }
            }

            if !legacy_suffix.is_empty() {
                if let Some(v) = values.get(&format!("gInput_{}_{}_{}", param, logic_suffix, legacy_suffix)) {
                    if let Ok(n) = v.parse::<i32>() {
                        return Some(n);
                    }
                }
            }

            let short_logic = get_logic_short(engine_id, logic_name);
            if let Some(v) = values.get(&format!("gInput_{}_{}_{}_{}", group_num, short_logic, direction, param)) {
                if let Ok(n) = v.parse::<i32>() {
                    return Some(n);
                }
            }
        }
        None
    };

    // Helper for directional bool parameters (Buy/Sell variants)
    let get_dir_bool = |variants: &[&str], direction: &str| -> Option<bool> {
        let (dir_map, legacy_suffix) = match direction {
            "Buy" => (buy_params, "B"),
            "Sell" => (sell_params, "S"),
            _ => (None, ""),
        };

        for param in variants {
            if let Some(m) = dir_map {
                if let Some(v) = m.get(*param) {
                    return Some(v == "1" || v.to_lowercase() == "true");
                }
            }

            if !legacy_suffix.is_empty() {
                if let Some(v) = values.get(&format!("gInput_{}_{}_{}", param, logic_suffix, legacy_suffix)) {
                    return Some(v == "1" || v.to_lowercase() == "true");
                }
            }

            let short_logic = get_logic_short(engine_id, logic_name);
            if let Some(v) = values.get(&format!("gInput_{}_{}_{}_{}", group_num, short_logic, direction, param)) {
                return Some(v == "1" || v.to_lowercase() == "true");
            }
        }
        None
    };

    // Helper for directional String parameters (Buy/Sell variants)
    let get_dir_string = |variants: &[&str], direction: &str| -> Option<String> {
        let (dir_map, legacy_suffix) = match direction {
            "Buy" => (buy_params, "B"),
            "Sell" => (sell_params, "S"),
            _ => (None, ""),
        };

        for param in variants {
            if let Some(m) = dir_map {
                if let Some(v) = m.get(*param) {
                    return Some(v.clone());
                }
            }

            if !legacy_suffix.is_empty() {
                if let Some(v) = values.get(&format!("gInput_{}_{}_{}", param, logic_suffix, legacy_suffix)) {
                    return Some(v.clone());
                }
            }

            let short_logic = get_logic_short(engine_id, logic_name);
            if let Some(v) = values.get(&format!("gInput_{}_{}_{}_{}", group_num, short_logic, direction, param)) {
                return Some(v.clone());
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
    let is_power_logic = logic_name.eq_ignore_ascii_case("power");
    let start_level = if !is_power_logic {
        Some(get_param_i32_multi(&["StartLevel", &format!("Start{}", logic_name)], 100))
    } else {
        None
    };
    let start_level_b = if !is_power_logic { get_dir_i32(&["StartLevel", &format!("Start{}", logic_name)], "Buy") } else { None };
    let start_level_s = if !is_power_logic { get_dir_i32(&["StartLevel", &format!("Start{}", logic_name)], "Sell") } else { None };

    let last_lot = if !is_power_logic {
        Some(get_param_f64_multi(&["LastLot", &format!("LastLot{}", logic_name)], 0.12))
    } else {
        Some(get_param_f64_multi(&["LastLot", "LastLotPower"], 0.63))
    };
    let last_lot_b = get_dir_f64(&["LastLot", &format!("LastLot{}", logic_name)], "Buy");
    let last_lot_s = get_dir_f64(&["LastLot", &format!("LastLot{}", logic_name)], "Sell");

    // Parse close_targets - NO default fallback, use empty string if not found
    let close_targets = get_param_multi(&["CloseTargets"], "");
    let close_targets_b = get_dir_string(&["CloseTargets"], "Buy");
    let close_targets_s = get_dir_string(&["CloseTargets"], "Sell");
    let order_count_reference = get_param_multi(
        &["OrderCountRef", "OrderCountReference", "OrderCountReferenceLogic"],
        "Logic_None",
    );
    let order_count_reference_b = get_dir_string(&["OrderCountRef", "OrderCountReference", "OrderCountReferenceLogic"], "Buy");
    let order_count_reference_s = get_dir_string(&["OrderCountRef", "OrderCountReference", "OrderCountReferenceLogic"], "Sell");
    let mut group_order_count_reference: Option<String> = None;
    if group_num == 1 && is_power_logic && (engine_id == "B" || engine_id == "C") {
        let group_ref_raw = get_param_multi(
            &[
                "GroupOrderCountRef",
                "GroupOrderCountReference",
                "GroupOrderCountReferenceLogic",
            ],
            "",
        );
        let group_ref_norm = group_ref_raw.trim().to_ascii_lowercase();
        if !(group_ref_norm.is_empty()
            || group_ref_norm == "logic_none"
            || group_ref_norm == "none"
            || group_ref_norm == "0")
        {
            group_order_count_reference = Some(group_ref_raw);
        }
    }
    let group_order_count_reference_b = get_dir_string(&["GroupOrderCountRef", "GroupOrderCountReference", "GroupOrderCountReferenceLogic"], "Buy");
    let group_order_count_reference_s = get_dir_string(&["GroupOrderCountRef", "GroupOrderCountReference", "GroupOrderCountReferenceLogic"], "Sell");
    let start_level_ref_val = get_param_multi(&["StartLevelRef"], "");
    let start_level_ref = if start_level_ref_val.is_empty() { None } else { Some(start_level_ref_val) };
    let start_level_ref_b = get_dir_string(&["StartLevelRef"], "Buy");
    let start_level_ref_s = get_dir_string(&["StartLevelRef"], "Sell");
    let reset_lot_on_restart = get_param_bool_multi(&["ResetLotOnRestart"]);
    let reset_lot_on_restart_b = get_dir_bool(&["ResetLotOnRestart"], "Buy");
    let reset_lot_on_restart_s = get_dir_bool(&["ResetLotOnRestart"], "Sell");
    let restart_policy_power = get_string(values, "gInput_RestartPolicy_PowerA", "Restart_Default");
    let restart_policy_non_power = get_string(values, "gInput_RestartPolicy_NonPower", "Restart_Default");
    let close_non_power_on_power_close = get_bool(values, "gInput_CloseNonPowerOnPowerClose");
    let hold_timeout_seconds = get_i32(values, "gInput_HoldTimeoutBars", 0);

    // TPSL (points-only)
    let use_tp = get_param_bool_multi(&["UseTP", "UseTp"]);
    let use_tp_b = get_dir_bool(&["UseTP", "UseTp"], "Buy");
    let use_tp_s = get_dir_bool(&["UseTP", "UseTp"], "Sell");
    let tp_mode_raw = get_param_multi(&["TPMode", "TP_Mode"], "");
    let tp_mode = decode_tpsl_mode_numeric(&tp_mode_raw);
    let tp_mode_b = get_dir_string(&["TPMode", "TP_Mode"], "Buy")
        .map(|v| decode_tpsl_mode_numeric(&v));
    let tp_mode_s = get_dir_string(&["TPMode", "TP_Mode"], "Sell")
        .map(|v| decode_tpsl_mode_numeric(&v));
    let tp_value = get_param_f64_multi(&["TPValue", "TP_Value"], 0.0);
    let tp_value_b = get_dir_f64(&["TPValue", "TP_Value"], "Buy");
    let tp_value_s = get_dir_f64(&["TPValue", "TP_Value"], "Sell");

    let use_sl = get_param_bool_multi(&["UseSL", "UseSl"]);
    let use_sl_b = get_dir_bool(&["UseSL", "UseSl"], "Buy");
    let use_sl_s = get_dir_bool(&["UseSL", "UseSl"], "Sell");
    let sl_mode_raw = get_param_multi(&["SLMode", "SL_Mode"], "");
    let sl_mode = decode_tpsl_mode_numeric(&sl_mode_raw);
    let sl_mode_b = get_dir_string(&["SLMode", "SL_Mode"], "Buy")
        .map(|v| decode_tpsl_mode_numeric(&v));
    let sl_mode_s = get_dir_string(&["SLMode", "SL_Mode"], "Sell")
        .map(|v| decode_tpsl_mode_numeric(&v));
    let sl_value = get_param_f64_multi(&["SLValue", "SL_Value"], 0.0);
    let sl_value_b = get_dir_f64(&["SLValue", "SL_Value"], "Buy");
    let sl_value_s = get_dir_f64(&["SLValue", "SL_Value"], "Sell");
    let continue_tp_hit = get_param_bool_multi(&[
        "ContinueTPHit",
        "ContinueTPAfterHit",
        "ContinueTradingTPHit",
    ]);
    let continue_tp_hit_b =
        get_dir_bool(&["ContinueTPHit", "ContinueTPAfterHit", "ContinueTradingTPHit"], "Buy");
    let continue_tp_hit_s =
        get_dir_bool(&["ContinueTPHit", "ContinueTPAfterHit", "ContinueTradingTPHit"], "Sell");
    let continue_sl_hit = get_param_bool_multi(&[
        "ContinueSLHit",
        "ContinueSLAfterHit",
        "ContinueTradingSLHit",
    ]);
    let continue_sl_hit_b =
        get_dir_bool(&["ContinueSLHit", "ContinueSLAfterHit", "ContinueTradingSLHit"], "Buy");
    let continue_sl_hit_s =
        get_dir_bool(&["ContinueSLHit", "ContinueSLAfterHit", "ContinueTradingSLHit"], "Sell");

    // Parse mode selectors
    let strategy_type = get_param_multi(&["StrategyType"], "Trail");
    let strategy_type_b = get_dir_string(&["StrategyType"], "Buy");
    let strategy_type_s = get_dir_string(&["StrategyType"], "Sell");
    let trading_mode = get_param_multi(&["TradingMode"], "Counter Trend");
    let trading_mode_b = get_dir_string(&["TradingMode"], "Buy");
    let trading_mode_s = get_dir_string(&["TradingMode"], "Sell");
    let allow_buy = get_param_bool_multi(&["AllowBuy"]);
    let allow_sell = get_param_bool_multi(&["AllowSell"]);

    // Parse reverse/hedge parameters with multiple name variants
    let reverse_enabled = get_param_bool_multi(&["ReverseEnabled", &format!("G{}_{}_ReverseEnabled", group_num, short_logic)]);
    let reverse_enabled_b = get_dir_bool(&["ReverseEnabled", &format!("G{}_{}_ReverseEnabled", group_num, short_logic)], "Buy");
    let reverse_enabled_s = get_dir_bool(&["ReverseEnabled", &format!("G{}_{}_ReverseEnabled", group_num, short_logic)], "Sell");
    let hedge_enabled = get_param_bool_multi(&["HedgeEnabled", &format!("G{}_{}_HedgeEnabled", group_num, short_logic)]);
    let hedge_enabled_b = get_dir_bool(&["HedgeEnabled", &format!("G{}_{}_HedgeEnabled", group_num, short_logic)], "Buy");
    let hedge_enabled_s = get_dir_bool(&["HedgeEnabled", &format!("G{}_{}_HedgeEnabled", group_num, short_logic)], "Sell");
    let reverse_scale = get_param_f64_multi(
        &["ReverseScale", &format!("G{}_Scale_{}_Reverse", group_num, short_logic)],
        100.0,
    );
    let reverse_scale_b = get_dir_f64(&["ReverseScale", &format!("G{}_Scale_{}_Reverse", group_num, short_logic)], "Buy");
    let reverse_scale_s = get_dir_f64(&["ReverseScale", &format!("G{}_Scale_{}_Reverse", group_num, short_logic)], "Sell");
    let hedge_scale = get_param_f64_multi(&["HedgeScale", &format!("G{}_Scale_{}_Hedge", group_num, short_logic)], 50.0);
    let hedge_scale_b = get_dir_f64(&["HedgeScale", &format!("G{}_Scale_{}_Hedge", group_num, short_logic)], "Buy");
    let hedge_scale_s = get_dir_f64(&["HedgeScale", &format!("G{}_Scale_{}_Hedge", group_num, short_logic)], "Sell");
    let reverse_reference = get_param_multi(
        &["ReverseReference", &format!("G{}_{}_ReverseReference", group_num, short_logic)],
        "Logic_None",
    );
    let reverse_reference_b = get_dir_string(&["ReverseReference", &format!("G{}_{}_ReverseReference", group_num, short_logic)], "Buy");
    let reverse_reference_s = get_dir_string(&["ReverseReference", &format!("G{}_{}_ReverseReference", group_num, short_logic)], "Sell");
    let hedge_reference = get_param_multi(
        &["HedgeReference", &format!("G{}_{}_HedgeReference", group_num, short_logic)],
        "Logic_None",
    );
    let hedge_reference_b = get_dir_string(&["HedgeReference", &format!("G{}_{}_HedgeReference", group_num, short_logic)], "Buy");
    let hedge_reference_s = get_dir_string(&["HedgeReference", &format!("G{}_{}_HedgeReference", group_num, short_logic)], "Sell");

    // Parse trail step advanced parameters with multiple name variants
    let trail_step_mode = get_param_multi(&["TrailStepMode"], "TrailStepMode_Auto");
    let trail_step_mode_b = get_dir_string(&["TrailStepMode"], "Buy");
    let trail_step_mode_s = get_dir_string(&["TrailStepMode"], "Sell");
    let trail_step_cycle = get_param_i32_multi(&["TrailStepCycle"], 1);
    let trail_step_cycle_b = get_dir_i32(&["TrailStepCycle"], "Buy");
    let trail_step_cycle_s = get_dir_i32(&["TrailStepCycle"], "Sell");
    let trail_step_balance = get_param_f64_multi(&["TrailStepBalance"], 0.0);
    let trail_step_balance_b = get_dir_f64(&["TrailStepBalance"], "Buy");
    let trail_step_balance_s = get_dir_f64(&["TrailStepBalance"], "Sell");

    // Parse close partial parameters with multiple name variants
    let close_partial = get_param_bool_multi(&["PartialEnabled1", "ClosePartial"]);
    let close_partial_b = get_dir_bool(&["PartialEnabled1", "ClosePartial"], "Buy");
    let close_partial_s = get_dir_bool(&["PartialEnabled1", "ClosePartial"], "Sell");
    let close_partial_cycle = get_param_i32_multi(&["PartialCycle1", "ClosePartialCycle"], 1);
    let close_partial_cycle_b = get_dir_i32(&["PartialCycle1", "ClosePartialCycle"], "Buy");
    let close_partial_cycle_s = get_dir_i32(&["PartialCycle1", "ClosePartialCycle"], "Sell");
    let close_partial_mode = get_param_multi(&["PartialMode1", "ClosePartialMode"], "PartialMode_Mid");
    let close_partial_mode_b = get_dir_string(&["PartialMode1", "ClosePartialMode"], "Buy");
    let close_partial_mode_s = get_dir_string(&["PartialMode1", "ClosePartialMode"], "Sell");
    let close_partial_balance = get_param_multi(&["PartialBalance1", "ClosePartialBalance"], "PartialBalance_Balanced");
    let close_partial_balance_b = get_dir_string(&["PartialBalance1", "ClosePartialBalance"], "Buy");
    let close_partial_balance_s = get_dir_string(&["PartialBalance1", "ClosePartialBalance"], "Sell");
    let close_partial_trail_step_mode =
        get_param_multi(&["PartialTrailMode1", "ClosePartialTrailStepMode"], "TrailStepMode_Auto");
    let close_partial_trail_step_mode_b = get_dir_string(&["PartialTrailMode1", "ClosePartialTrailStepMode"], "Buy");
    let close_partial_trail_step_mode_s = get_dir_string(&["PartialTrailMode1", "ClosePartialTrailStepMode"], "Sell");
    let close_partial_profit_threshold = get_param_f64_multi(
        &["PartialProfitThreshold1", "ClosePartialProfitThreshold"],
        0.0,
    );
    let close_partial_profit_threshold_b = get_dir_f64(&["PartialProfitThreshold1", "ClosePartialProfitThreshold"], "Buy");
    let close_partial_profit_threshold_s = get_dir_f64(&["PartialProfitThreshold1", "ClosePartialProfitThreshold"], "Sell");

    // Parse Trail Step 2-7 parameters with Buy/Sell variants
    let trail_step_2 = get_param_f64_multi(&["TrailStep2", "Trail_Step_2"], 0.0);
    let trail_step_2_b = get_dir_f64(&["TrailStep2", "Trail_Step_2"], "Buy");
    let trail_step_2_s = get_dir_f64(&["TrailStep2", "Trail_Step_2"], "Sell");
    let trail_step_method_2 = get_param_multi(&["TrailStepMethod2", "Trail_Step_Method_2"], "");
    let trail_step_method_2_b = get_dir_string(&["TrailStepMethod2", "Trail_Step_Method_2"], "Buy");
    let trail_step_method_2_s = get_dir_string(&["TrailStepMethod2", "Trail_Step_Method_2"], "Sell");
    let trail_step_cycle_2 = get_param_i32_multi(&["TrailStepCycle2", "Trail_Step_Cycle_2"], 1);
    let trail_step_cycle_2_b = get_dir_i32(&["TrailStepCycle2", "Trail_Step_Cycle_2"], "Buy");
    let trail_step_cycle_2_s = get_dir_i32(&["TrailStepCycle2", "Trail_Step_Cycle_2"], "Sell");
    let trail_step_balance_2 = get_param_f64_multi(&["TrailStepBalance2", "Trail_Step_Balance_2"], 0.0);
    let trail_step_balance_2_b = get_dir_f64(&["TrailStepBalance2", "Trail_Step_Balance_2"], "Buy");
    let trail_step_balance_2_s = get_dir_f64(&["TrailStepBalance2", "Trail_Step_Balance_2"], "Sell");
    let trail_step_mode_2 = get_param_multi(&["TrailStepMode2", "Trail_Step_Mode_2"], "TrailStepMode_Auto");
    let trail_step_mode_2_b = get_dir_string(&["TrailStepMode2", "Trail_Step_Mode_2"], "Buy");
    let trail_step_mode_2_s = get_dir_string(&["TrailStepMode2", "Trail_Step_Mode_2"], "Sell");

    let trail_step_3 = get_param_f64_multi(&["TrailStep3", "Trail_Step_3"], 0.0);
    let trail_step_3_b = get_dir_f64(&["TrailStep3", "Trail_Step_3"], "Buy");
    let trail_step_3_s = get_dir_f64(&["TrailStep3", "Trail_Step_3"], "Sell");
    let trail_step_method_3 = get_param_multi(&["TrailStepMethod3", "Trail_Step_Method_3"], "");
    let trail_step_method_3_b = get_dir_string(&["TrailStepMethod3", "Trail_Step_Method_3"], "Buy");
    let trail_step_method_3_s = get_dir_string(&["TrailStepMethod3", "Trail_Step_Method_3"], "Sell");
    let trail_step_cycle_3 = get_param_i32_multi(&["TrailStepCycle3", "Trail_Step_Cycle_3"], 1);
    let trail_step_cycle_3_b = get_dir_i32(&["TrailStepCycle3", "Trail_Step_Cycle_3"], "Buy");
    let trail_step_cycle_3_s = get_dir_i32(&["TrailStepCycle3", "Trail_Step_Cycle_3"], "Sell");
    let trail_step_balance_3 = get_param_f64_multi(&["TrailStepBalance3", "Trail_Step_Balance_3"], 0.0);
    let trail_step_balance_3_b = get_dir_f64(&["TrailStepBalance3", "Trail_Step_Balance_3"], "Buy");
    let trail_step_balance_3_s = get_dir_f64(&["TrailStepBalance3", "Trail_Step_Balance_3"], "Sell");
    let trail_step_mode_3 = get_param_multi(&["TrailStepMode3", "Trail_Step_Mode_3"], "TrailStepMode_Auto");
    let trail_step_mode_3_b = get_dir_string(&["TrailStepMode3", "Trail_Step_Mode_3"], "Buy");
    let trail_step_mode_3_s = get_dir_string(&["TrailStepMode3", "Trail_Step_Mode_3"], "Sell");

    let trail_step_4 = get_param_f64_multi(&["TrailStep4", "Trail_Step_4"], 0.0);
    let trail_step_4_b = get_dir_f64(&["TrailStep4", "Trail_Step_4"], "Buy");
    let trail_step_4_s = get_dir_f64(&["TrailStep4", "Trail_Step_4"], "Sell");
    let trail_step_method_4 = get_param_multi(&["TrailStepMethod4", "Trail_Step_Method_4"], "");
    let trail_step_method_4_b = get_dir_string(&["TrailStepMethod4", "Trail_Step_Method_4"], "Buy");
    let trail_step_method_4_s = get_dir_string(&["TrailStepMethod4", "Trail_Step_Method_4"], "Sell");
    let trail_step_cycle_4 = get_param_i32_multi(&["TrailStepCycle4", "Trail_Step_Cycle_4"], 1);
    let trail_step_cycle_4_b = get_dir_i32(&["TrailStepCycle4", "Trail_Step_Cycle_4"], "Buy");
    let trail_step_cycle_4_s = get_dir_i32(&["TrailStepCycle4", "Trail_Step_Cycle_4"], "Sell");
    let trail_step_balance_4 = get_param_f64_multi(&["TrailStepBalance4", "Trail_Step_Balance_4"], 0.0);
    let trail_step_balance_4_b = get_dir_f64(&["TrailStepBalance4", "Trail_Step_Balance_4"], "Buy");
    let trail_step_balance_4_s = get_dir_f64(&["TrailStepBalance4", "Trail_Step_Balance_4"], "Sell");
    let trail_step_mode_4 = get_param_multi(&["TrailStepMode4", "Trail_Step_Mode_4"], "TrailStepMode_Auto");
    let trail_step_mode_4_b = get_dir_string(&["TrailStepMode4", "Trail_Step_Mode_4"], "Buy");
    let trail_step_mode_4_s = get_dir_string(&["TrailStepMode4", "Trail_Step_Mode_4"], "Sell");

    let trail_step_5 = get_param_f64_multi(&["TrailStep5", "Trail_Step_5"], 0.0);
    let trail_step_5_b = get_dir_f64(&["TrailStep5", "Trail_Step_5"], "Buy");
    let trail_step_5_s = get_dir_f64(&["TrailStep5", "Trail_Step_5"], "Sell");
    let trail_step_method_5 = get_param_multi(&["TrailStepMethod5", "Trail_Step_Method_5"], "");
    let trail_step_method_5_b = get_dir_string(&["TrailStepMethod5", "Trail_Step_Method_5"], "Buy");
    let trail_step_method_5_s = get_dir_string(&["TrailStepMethod5", "Trail_Step_Method_5"], "Sell");
    let trail_step_cycle_5 = get_param_i32_multi(&["TrailStepCycle5", "Trail_Step_Cycle_5"], 1);
    let trail_step_cycle_5_b = get_dir_i32(&["TrailStepCycle5", "Trail_Step_Cycle_5"], "Buy");
    let trail_step_cycle_5_s = get_dir_i32(&["TrailStepCycle5", "Trail_Step_Cycle_5"], "Sell");
    let trail_step_balance_5 = get_param_f64_multi(&["TrailStepBalance5", "Trail_Step_Balance_5"], 0.0);
    let trail_step_balance_5_b = get_dir_f64(&["TrailStepBalance5", "Trail_Step_Balance_5"], "Buy");
    let trail_step_balance_5_s = get_dir_f64(&["TrailStepBalance5", "Trail_Step_Balance_5"], "Sell");
    let trail_step_mode_5 = get_param_multi(&["TrailStepMode5", "Trail_Step_Mode_5"], "TrailStepMode_Auto");
    let trail_step_mode_5_b = get_dir_string(&["TrailStepMode5", "Trail_Step_Mode_5"], "Buy");
    let trail_step_mode_5_s = get_dir_string(&["TrailStepMode5", "Trail_Step_Mode_5"], "Sell");

    let trail_step_6 = get_param_f64_multi(&["TrailStep6", "Trail_Step_6"], 0.0);
    let trail_step_6_b = get_dir_f64(&["TrailStep6", "Trail_Step_6"], "Buy");
    let trail_step_6_s = get_dir_f64(&["TrailStep6", "Trail_Step_6"], "Sell");
    let trail_step_method_6 = get_param_multi(&["TrailStepMethod6", "Trail_Step_Method_6"], "");
    let trail_step_method_6_b = get_dir_string(&["TrailStepMethod6", "Trail_Step_Method_6"], "Buy");
    let trail_step_method_6_s = get_dir_string(&["TrailStepMethod6", "Trail_Step_Method_6"], "Sell");
    let trail_step_cycle_6 = get_param_i32_multi(&["TrailStepCycle6", "Trail_Step_Cycle_6"], 1);
    let trail_step_cycle_6_b = get_dir_i32(&["TrailStepCycle6", "Trail_Step_Cycle_6"], "Buy");
    let trail_step_cycle_6_s = get_dir_i32(&["TrailStepCycle6", "Trail_Step_Cycle_6"], "Sell");
    let trail_step_balance_6 = get_param_f64_multi(&["TrailStepBalance6", "Trail_Step_Balance_6"], 0.0);
    let trail_step_balance_6_b = get_dir_f64(&["TrailStepBalance6", "Trail_Step_Balance_6"], "Buy");
    let trail_step_balance_6_s = get_dir_f64(&["TrailStepBalance6", "Trail_Step_Balance_6"], "Sell");
    let trail_step_mode_6 = get_param_multi(&["TrailStepMode6", "Trail_Step_Mode_6"], "TrailStepMode_Auto");
    let trail_step_mode_6_b = get_dir_string(&["TrailStepMode6", "Trail_Step_Mode_6"], "Buy");
    let trail_step_mode_6_s = get_dir_string(&["TrailStepMode6", "Trail_Step_Mode_6"], "Sell");

    let trail_step_7 = get_param_f64_multi(&["TrailStep7", "Trail_Step_7"], 0.0);
    let trail_step_7_b = get_dir_f64(&["TrailStep7", "Trail_Step_7"], "Buy");
    let trail_step_7_s = get_dir_f64(&["TrailStep7", "Trail_Step_7"], "Sell");
    let trail_step_method_7 = get_param_multi(&["TrailStepMethod7", "Trail_Step_Method_7"], "");
    let trail_step_method_7_b = get_dir_string(&["TrailStepMethod7", "Trail_Step_Method_7"], "Buy");
    let trail_step_method_7_s = get_dir_string(&["TrailStepMethod7", "Trail_Step_Method_7"], "Sell");
    let trail_step_cycle_7 = get_param_i32_multi(&["TrailStepCycle7", "Trail_Step_Cycle_7"], 1);
    let trail_step_cycle_7_b = get_dir_i32(&["TrailStepCycle7", "Trail_Step_Cycle_7"], "Buy");
    let trail_step_cycle_7_s = get_dir_i32(&["TrailStepCycle7", "Trail_Step_Cycle_7"], "Sell");
    let trail_step_balance_7 = get_param_f64_multi(&["TrailStepBalance7", "Trail_Step_Balance_7"], 0.0);
    let trail_step_balance_7_b = get_dir_f64(&["TrailStepBalance7", "Trail_Step_Balance_7"], "Buy");
    let trail_step_balance_7_s = get_dir_f64(&["TrailStepBalance7", "Trail_Step_Balance_7"], "Sell");
    let trail_step_mode_7 = get_param_multi(&["TrailStepMode7", "Trail_Step_Mode_7"], "TrailStepMode_Auto");
    let trail_step_mode_7_b = get_dir_string(&["TrailStepMode7", "Trail_Step_Mode_7"], "Buy");
    let trail_step_mode_7_s = get_dir_string(&["TrailStepMode7", "Trail_Step_Mode_7"], "Sell");

    // Parse Close Partial 2-4 parameters with Buy/Sell variants
    let close_partial_2_val = get_param_multi(&["PartialEnabled2", "ClosePartial2"], "");
    let close_partial_2 = if close_partial_2_val.is_empty() { None } else { Some(close_partial_2_val == "1" || close_partial_2_val.to_lowercase() == "true") };
    let close_partial_2_b = get_dir_bool(&["PartialEnabled2", "ClosePartial2"], "Buy");
    let close_partial_2_s = get_dir_bool(&["PartialEnabled2", "ClosePartial2"], "Sell");
    let close_partial_cycle_2_val = get_param_multi(&["PartialCycle2", "ClosePartialCycle2"], "");
    let close_partial_cycle_2 = if close_partial_cycle_2_val.is_empty() { None } else { close_partial_cycle_2_val.parse().ok() };
    let close_partial_cycle_2_b = get_dir_i32(&["PartialCycle2", "ClosePartialCycle2"], "Buy");
    let close_partial_cycle_2_s = get_dir_i32(&["PartialCycle2", "ClosePartialCycle2"], "Sell");
    let close_partial_mode_2_val = get_param_multi(&["PartialMode2", "ClosePartialMode2"], "");
    let close_partial_mode_2 = if close_partial_mode_2_val.is_empty() { None } else { Some(close_partial_mode_2_val) };
    let close_partial_mode_2_b = get_dir_string(&["PartialMode2", "ClosePartialMode2"], "Buy");
    let close_partial_mode_2_s = get_dir_string(&["PartialMode2", "ClosePartialMode2"], "Sell");
    let close_partial_balance_2_val = get_param_multi(&["PartialBalance2", "ClosePartialBalance2"], "");
    let close_partial_balance_2 = if close_partial_balance_2_val.is_empty() { None } else { Some(close_partial_balance_2_val) };
    let close_partial_balance_2_b = get_dir_string(&["PartialBalance2", "ClosePartialBalance2"], "Buy");
    let close_partial_balance_2_s = get_dir_string(&["PartialBalance2", "ClosePartialBalance2"], "Sell");
    let close_partial_profit_threshold_2_val = get_param_multi(&["PartialProfitThreshold2", "ClosePartialProfitThreshold2"], "");
    let close_partial_profit_threshold_2 = if close_partial_profit_threshold_2_val.is_empty() { None } else { close_partial_profit_threshold_2_val.parse().ok() };
    let close_partial_profit_threshold_2_b = get_dir_f64(&["PartialProfitThreshold2", "ClosePartialProfitThreshold2"], "Buy");
    let close_partial_profit_threshold_2_s = get_dir_f64(&["PartialProfitThreshold2", "ClosePartialProfitThreshold2"], "Sell");

    let close_partial_3_val = get_param_multi(&["PartialEnabled3", "ClosePartial3"], "");
    let close_partial_3 = if close_partial_3_val.is_empty() { None } else { Some(close_partial_3_val == "1" || close_partial_3_val.to_lowercase() == "true") };
    let close_partial_3_b = get_dir_bool(&["PartialEnabled3", "ClosePartial3"], "Buy");
    let close_partial_3_s = get_dir_bool(&["PartialEnabled3", "ClosePartial3"], "Sell");
    let close_partial_cycle_3_val = get_param_multi(&["PartialCycle3", "ClosePartialCycle3"], "");
    let close_partial_cycle_3 = if close_partial_cycle_3_val.is_empty() { None } else { close_partial_cycle_3_val.parse().ok() };
    let close_partial_cycle_3_b = get_dir_i32(&["PartialCycle3", "ClosePartialCycle3"], "Buy");
    let close_partial_cycle_3_s = get_dir_i32(&["PartialCycle3", "ClosePartialCycle3"], "Sell");
    let close_partial_mode_3_val = get_param_multi(&["PartialMode3", "ClosePartialMode3"], "");
    let close_partial_mode_3 = if close_partial_mode_3_val.is_empty() { None } else { Some(close_partial_mode_3_val) };
    let close_partial_mode_3_b = get_dir_string(&["PartialMode3", "ClosePartialMode3"], "Buy");
    let close_partial_mode_3_s = get_dir_string(&["PartialMode3", "ClosePartialMode3"], "Sell");
    let close_partial_balance_3_val = get_param_multi(&["PartialBalance3", "ClosePartialBalance3"], "");
    let close_partial_balance_3 = if close_partial_balance_3_val.is_empty() { None } else { Some(close_partial_balance_3_val) };
    let close_partial_balance_3_b = get_dir_string(&["PartialBalance3", "ClosePartialBalance3"], "Buy");
    let close_partial_balance_3_s = get_dir_string(&["PartialBalance3", "ClosePartialBalance3"], "Sell");
    let close_partial_profit_threshold_3_val = get_param_multi(&["PartialProfitThreshold3", "ClosePartialProfitThreshold3"], "");
    let close_partial_profit_threshold_3 = if close_partial_profit_threshold_3_val.is_empty() { None } else { close_partial_profit_threshold_3_val.parse().ok() };
    let close_partial_profit_threshold_3_b = get_dir_f64(&["PartialProfitThreshold3", "ClosePartialProfitThreshold3"], "Buy");
    let close_partial_profit_threshold_3_s = get_dir_f64(&["PartialProfitThreshold3", "ClosePartialProfitThreshold3"], "Sell");

    let close_partial_4_val = get_param_multi(&["PartialEnabled4", "ClosePartial4"], "");
    let close_partial_4 = if close_partial_4_val.is_empty() { None } else { Some(close_partial_4_val == "1" || close_partial_4_val.to_lowercase() == "true") };
    let close_partial_4_b = get_dir_bool(&["PartialEnabled4", "ClosePartial4"], "Buy");
    let close_partial_4_s = get_dir_bool(&["PartialEnabled4", "ClosePartial4"], "Sell");
    let close_partial_cycle_4_val = get_param_multi(&["PartialCycle4", "ClosePartialCycle4"], "");
    let close_partial_cycle_4 = if close_partial_cycle_4_val.is_empty() { None } else { close_partial_cycle_4_val.parse().ok() };
    let close_partial_cycle_4_b = get_dir_i32(&["PartialCycle4", "ClosePartialCycle4"], "Buy");
    let close_partial_cycle_4_s = get_dir_i32(&["PartialCycle4", "ClosePartialCycle4"], "Sell");
    let close_partial_mode_4_val = get_param_multi(&["PartialMode4", "ClosePartialMode4"], "");
    let close_partial_mode_4 = if close_partial_mode_4_val.is_empty() { None } else { Some(close_partial_mode_4_val) };
    let close_partial_mode_4_b = get_dir_string(&["PartialMode4", "ClosePartialMode4"], "Buy");
    let close_partial_mode_4_s = get_dir_string(&["PartialMode4", "ClosePartialMode4"], "Sell");
    let close_partial_balance_4_val = get_param_multi(&["PartialBalance4", "ClosePartialBalance4"], "");
    let close_partial_balance_4 = if close_partial_balance_4_val.is_empty() { None } else { Some(close_partial_balance_4_val) };
    let close_partial_balance_4_b = get_dir_string(&["PartialBalance4", "ClosePartialBalance4"], "Buy");
    let close_partial_balance_4_s = get_dir_string(&["PartialBalance4", "ClosePartialBalance4"], "Sell");
    let close_partial_profit_threshold_4_val = get_param_multi(&["PartialProfitThreshold4", "ClosePartialProfitThreshold4"], "");
    let close_partial_profit_threshold_4 = if close_partial_profit_threshold_4_val.is_empty() { None } else { close_partial_profit_threshold_4_val.parse().ok() };
    let close_partial_profit_threshold_4_b = get_dir_f64(&["PartialProfitThreshold4", "ClosePartialProfitThreshold4"], "Buy");
    let close_partial_profit_threshold_4_s = get_dir_f64(&["PartialProfitThreshold4", "ClosePartialProfitThreshold4"], "Sell");

    // Parse Trigger parameters with Buy/Sell variants
    let trigger_type_val = get_param_multi(&["TriggerType"], "");
    let trigger_type = if trigger_type_val.is_empty() { None } else { Some(trigger_type_val) };
    let trigger_type_b = get_dir_string(&["TriggerType"], "Buy");
    let trigger_type_s = get_dir_string(&["TriggerType"], "Sell");
    let trigger_mode_val = get_param_multi(&["TriggerMode"], "");
    let trigger_mode = if trigger_mode_val.is_empty() { None } else { Some(trigger_mode_val) };
    let trigger_mode_b = get_dir_string(&["TriggerMode"], "Buy");
    let trigger_mode_s = get_dir_string(&["TriggerMode"], "Sell");
    let trigger_bars_val = get_param_multi(&["TriggerBars"], "");
    let trigger_bars = if trigger_bars_val.is_empty() { None } else { trigger_bars_val.parse().ok() };
    let trigger_bars_b = get_dir_i32(&["TriggerBars"], "Buy");
    let trigger_bars_s = get_dir_i32(&["TriggerBars"], "Sell");
    let trigger_minutes_val = get_param_multi(&["TriggerMinutes"], "");
    let trigger_minutes = if trigger_minutes_val.is_empty() { None } else { trigger_minutes_val.parse().ok() };
    let trigger_minutes_b = get_dir_i32(&["TriggerMinutes"], "Buy");
    let trigger_minutes_s = get_dir_i32(&["TriggerMinutes"], "Sell");
    let trigger_seconds_val = get_param_multi(&["TriggerSeconds"], "");
    let trigger_seconds = if trigger_seconds_val.is_empty() { None } else { trigger_seconds_val.parse().ok() };
    let trigger_seconds_b = get_dir_i32(&["TriggerSeconds"], "Buy");
    let trigger_seconds_s = get_dir_i32(&["TriggerSeconds"], "Sell");
    let trigger_pips_val = get_param_multi(&["TriggerPips"], "");
    let trigger_pips = if trigger_pips_val.is_empty() { None } else { trigger_pips_val.parse().ok() };
    let trigger_pips_b = get_dir_f64(&["TriggerPips"], "Buy");
    let trigger_pips_s = get_dir_f64(&["TriggerPips"], "Sell");
    let trigger_points_val = get_param_multi(&["TriggerPoints"], "");
    let trigger_points = if trigger_points_val.is_empty() { None } else { trigger_points_val.parse().ok() };
    let trigger_points_b = get_dir_f64(&["TriggerPoints"], "Buy");
    let trigger_points_s = get_dir_f64(&["TriggerPoints"], "Sell");
    let opcount_ref_val = get_param_multi(&["OpCountRef"], "");
    let opcount_ref = if opcount_ref_val.is_empty() { None } else { Some(opcount_ref_val) };
    let opcount_ref_b = get_dir_string(&["OpCountRef"], "Buy");
    let opcount_ref_s = get_dir_string(&["OpCountRef"], "Sell");
    let start_op_count_val = get_param_multi(&["StartOpCount"], "");
    let start_op_count = if start_op_count_val.is_empty() { None } else { start_op_count_val.parse().ok() };
    let start_op_count_b = get_dir_i32(&["StartOpCount"], "Buy");
    let start_op_count_s = get_dir_i32(&["StartOpCount"], "Sell");

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
        trail_method: decode_trail_method_numeric(&trail_method),
        trail_value,
        trail_value_b,
        trail_value_s,
        trail_start,
        trail_start_b,
        trail_start_s,
        trail_step,
        trail_step_b,
        trail_step_s,
        trail_step_method: decode_trail_step_method_numeric(&trail_step_method),
        start_level,
        start_level_b,
        start_level_s,
        last_lot,
        last_lot_b,
        last_lot_s,
        close_targets,
        close_targets_b,
        close_targets_s,
        order_count_reference,
        order_count_reference_b,
        order_count_reference_s,
        group_order_count_reference,
        group_order_count_reference_b,
        group_order_count_reference_s,
        start_level_ref,
        start_level_ref_b,
        start_level_ref_s,
        reset_lot_on_restart,
        reset_lot_on_restart_b,
        reset_lot_on_restart_s,
        restart_policy_power: Some(restart_policy_power),
        restart_policy_non_power: Some(restart_policy_non_power),
        close_non_power_on_power_close: Some(close_non_power_on_power_close),
        hold_timeout_seconds: Some(hold_timeout_seconds),
        use_tp,
        use_tp_b,
        use_tp_s,
        tp_mode,
        tp_mode_b,
        tp_mode_s,
        tp_value,
        tp_value_b,
        tp_value_s,
        use_sl,
        use_sl_b,
        use_sl_s,
        sl_mode,
        sl_mode_b,
        sl_mode_s,
        sl_value,
        sl_value_b,
        sl_value_s,
        continue_tp_hit,
        continue_tp_hit_b,
        continue_tp_hit_s,
        continue_sl_hit,
        continue_sl_hit_b,
        continue_sl_hit_s,
        strategy_type,
        strategy_type_b,
        strategy_type_s,
        trading_mode,
        trading_mode_b,
        trading_mode_s,
        allow_buy,
        allow_sell,
        reverse_enabled,
        reverse_enabled_b,
        reverse_enabled_s,
        hedge_enabled,
        hedge_enabled_b,
        hedge_enabled_s,
        reverse_scale,
        reverse_scale_b,
        reverse_scale_s,
        hedge_scale,
        hedge_scale_b,
        hedge_scale_s,
        reverse_reference,
        reverse_reference_b,
        reverse_reference_s,
        hedge_reference,
        hedge_reference_b,
        hedge_reference_s,
        trail_step_mode,
        trail_step_mode_b,
        trail_step_mode_s,
        trail_step_cycle,
        trail_step_cycle_b,
        trail_step_cycle_s,
        trail_step_balance,
        trail_step_balance_b,
        trail_step_balance_s,
        trail_step_2: Some(trail_step_2),
        trail_step_2_b,
        trail_step_2_s,
        trail_step_method_2: if trail_step_method_2.is_empty() { None } else { Some(trail_step_method_2) },
        trail_step_method_2_b,
        trail_step_method_2_s,
        trail_step_cycle_2: Some(trail_step_cycle_2),
        trail_step_cycle_2_b,
        trail_step_cycle_2_s,
        trail_step_balance_2: Some(trail_step_balance_2),
        trail_step_balance_2_b,
        trail_step_balance_2_s,
        trail_step_mode_2: if trail_step_mode_2.is_empty() { None } else { Some(trail_step_mode_2) },
        trail_step_mode_2_b,
        trail_step_mode_2_s,
        trail_step_3: Some(trail_step_3),
        trail_step_3_b,
        trail_step_3_s,
        trail_step_method_3: if trail_step_method_3.is_empty() { None } else { Some(trail_step_method_3) },
        trail_step_method_3_b,
        trail_step_method_3_s,
        trail_step_cycle_3: Some(trail_step_cycle_3),
        trail_step_cycle_3_b,
        trail_step_cycle_3_s,
        trail_step_balance_3: Some(trail_step_balance_3),
        trail_step_balance_3_b,
        trail_step_balance_3_s,
        trail_step_mode_3: if trail_step_mode_3.is_empty() { None } else { Some(trail_step_mode_3) },
        trail_step_mode_3_b,
        trail_step_mode_3_s,
        trail_step_4: Some(trail_step_4),
        trail_step_4_b,
        trail_step_4_s,
        trail_step_method_4: if trail_step_method_4.is_empty() { None } else { Some(trail_step_method_4) },
        trail_step_method_4_b,
        trail_step_method_4_s,
        trail_step_cycle_4: Some(trail_step_cycle_4),
        trail_step_cycle_4_b,
        trail_step_cycle_4_s,
        trail_step_balance_4: Some(trail_step_balance_4),
        trail_step_balance_4_b,
        trail_step_balance_4_s,
        trail_step_mode_4: if trail_step_mode_4.is_empty() { None } else { Some(trail_step_mode_4) },
        trail_step_mode_4_b,
        trail_step_mode_4_s,
        trail_step_5: Some(trail_step_5),
        trail_step_5_b,
        trail_step_5_s,
        trail_step_method_5: if trail_step_method_5.is_empty() { None } else { Some(trail_step_method_5) },
        trail_step_method_5_b,
        trail_step_method_5_s,
        trail_step_cycle_5: Some(trail_step_cycle_5),
        trail_step_cycle_5_b,
        trail_step_cycle_5_s,
        trail_step_balance_5: Some(trail_step_balance_5),
        trail_step_balance_5_b,
        trail_step_balance_5_s,
        trail_step_mode_5: if trail_step_mode_5.is_empty() { None } else { Some(trail_step_mode_5) },
        trail_step_mode_5_b,
        trail_step_mode_5_s,
        trail_step_6: Some(trail_step_6),
        trail_step_6_b,
        trail_step_6_s,
        trail_step_method_6: if trail_step_method_6.is_empty() { None } else { Some(trail_step_method_6) },
        trail_step_method_6_b,
        trail_step_method_6_s,
        trail_step_cycle_6: Some(trail_step_cycle_6),
        trail_step_cycle_6_b,
        trail_step_cycle_6_s,
        trail_step_balance_6: Some(trail_step_balance_6),
        trail_step_balance_6_b,
        trail_step_balance_6_s,
        trail_step_mode_6: if trail_step_mode_6.is_empty() { None } else { Some(trail_step_mode_6) },
        trail_step_mode_6_b,
        trail_step_mode_6_s,
        trail_step_7: Some(trail_step_7),
        trail_step_7_b,
        trail_step_7_s,
        trail_step_method_7: if trail_step_method_7.is_empty() { None } else { Some(trail_step_method_7) },
        trail_step_method_7_b,
        trail_step_method_7_s,
        trail_step_cycle_7: Some(trail_step_cycle_7),
        trail_step_cycle_7_b,
        trail_step_cycle_7_s,
        trail_step_balance_7: Some(trail_step_balance_7),
        trail_step_balance_7_b,
        trail_step_balance_7_s,
        trail_step_mode_7: if trail_step_mode_7.is_empty() { None } else { Some(trail_step_mode_7) },
        trail_step_mode_7_b,
        trail_step_mode_7_s,
        close_partial,
        close_partial_b,
        close_partial_s,
        close_partial_cycle,
        close_partial_cycle_b,
        close_partial_cycle_s,
        close_partial_mode,
        close_partial_mode_b,
        close_partial_mode_s,
        close_partial_balance,
        close_partial_balance_b,
        close_partial_balance_s,
        close_partial_trail_step_mode,
        close_partial_trail_step_mode_b,
        close_partial_trail_step_mode_s,
        close_partial_profit_threshold,
        close_partial_profit_threshold_b,
        close_partial_profit_threshold_s,
        close_partial_2,
        close_partial_2_b,
        close_partial_2_s,
        close_partial_cycle_2,
        close_partial_cycle_2_b,
        close_partial_cycle_2_s,
        close_partial_mode_2,
        close_partial_mode_2_b,
        close_partial_mode_2_s,
        close_partial_balance_2,
        close_partial_balance_2_b,
        close_partial_balance_2_s,
        close_partial_profit_threshold_2,
        close_partial_profit_threshold_2_b,
        close_partial_profit_threshold_2_s,
        close_partial_3,
        close_partial_3_b,
        close_partial_3_s,
        close_partial_cycle_3,
        close_partial_cycle_3_b,
        close_partial_cycle_3_s,
        close_partial_mode_3,
        close_partial_mode_3_b,
        close_partial_mode_3_s,
        close_partial_balance_3,
        close_partial_balance_3_b,
        close_partial_balance_3_s,
        close_partial_profit_threshold_3,
        close_partial_profit_threshold_3_b,
        close_partial_profit_threshold_3_s,
        close_partial_4,
        close_partial_4_b,
        close_partial_4_s,
        close_partial_cycle_4,
        close_partial_cycle_4_b,
        close_partial_cycle_4_s,
        close_partial_mode_4,
        close_partial_mode_4_b,
        close_partial_mode_4_s,
        close_partial_balance_4,
        close_partial_balance_4_b,
        close_partial_balance_4_s,
        close_partial_profit_threshold_4,
        close_partial_profit_threshold_4_b,
        close_partial_profit_threshold_4_s,
        trigger_type,
        trigger_type_b,
        trigger_type_s,
        trigger_mode,
        trigger_mode_b,
        trigger_mode_s,
        trigger_bars,
        trigger_bars_b,
        trigger_bars_s,
        trigger_minutes,
        trigger_minutes_b,
        trigger_minutes_s,
        trigger_seconds,
        trigger_seconds_b,
        trigger_seconds_s,
        trigger_pips,
        trigger_pips_b,
        trigger_pips_s,
        trigger_points,
        trigger_points_b,
        trigger_points_s,
        opcount_ref,
        opcount_ref_b,
        opcount_ref_s,
        start_op_count,
        start_op_count_b,
        start_op_count_s,
    })
}

/// Create a default group configuration
fn create_default_group(group_num: u8) -> GroupConfig {
    GroupConfig {
        group_number: group_num,
        enabled: group_num == 1,
        group_power_start: None,
        group_power_start_b: None,
        group_power_start_s: None,
        reverse_mode: false,
        hedge_mode: false,
        hedge_reference: "Logic_None".to_string(),
        entry_delay_bars: 0,
        logics: vec![
            create_default_logic("Power"),
            create_default_logic("Repower"),
            create_default_logic("Scalper"),
            create_default_logic("Stopper"),
            create_default_logic("STO"),
            create_default_logic("SCA"),
            create_default_logic("RPO"),
        ],
    }
}

/// Create a default logic configuration
fn create_default_logic(logic_name: &str) -> LogicConfig {
    let is_power = logic_name.eq_ignore_ascii_case("power");

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
        trail_method: "Points".to_string(),
        trail_value: 3000.0,
        trail_value_b: None,
        trail_value_s: None,
        trail_start: 1.0,
        trail_start_b: None,
        trail_start_s: None,
        trail_step: 1500.0,
        trail_step_b: None,
        trail_step_s: None,
        trail_step_method: "Step_Points".to_string(),
        // Preserve source-of-truth semantics: missing StartLevel stays missing.
        start_level: None,
        start_level_b: None,
        start_level_s: None,
        last_lot: if is_power { Some(0.63) } else { Some(0.12) },
        last_lot_b: None,
        last_lot_s: None,
        close_targets: String::new(), // NO default - use empty string
        close_targets_b: None,
        close_targets_s: None,
        order_count_reference: "Logic_None".to_string(),
        order_count_reference_b: None,
        order_count_reference_s: None,
        group_order_count_reference: None,
        group_order_count_reference_b: None,
        group_order_count_reference_s: None,
        start_level_ref: None,
        start_level_ref_b: None,
        start_level_ref_s: None,
        reset_lot_on_restart: false,
        reset_lot_on_restart_b: None,
        reset_lot_on_restart_s: None,
        restart_policy_power: Some("Restart_Default".to_string()),
        restart_policy_non_power: Some("Restart_Default".to_string()),
        close_non_power_on_power_close: Some(false),
        hold_timeout_seconds: Some(0),
        use_tp: false,
        use_tp_b: None,
        use_tp_s: None,
        tp_mode: "TPSL_Points".to_string(),
        tp_mode_b: None,
        tp_mode_s: None,
        tp_value: 0.0,
        tp_value_b: None,
        tp_value_s: None,
        use_sl: false,
        use_sl_b: None,
        use_sl_s: None,
        sl_mode: "TPSL_Points".to_string(),
        sl_mode_b: None,
        sl_mode_s: None,
        sl_value: 0.0,
        sl_value_b: None,
        sl_value_s: None,
        continue_tp_hit: true,
        continue_tp_hit_b: None,
        continue_tp_hit_s: None,
        continue_sl_hit: true,
        continue_sl_hit_b: None,
        continue_sl_hit_s: None,
        strategy_type: "Trail".to_string(),
        strategy_type_b: None,
        strategy_type_s: None,
        trading_mode: "Counter Trend".to_string(),
        trading_mode_b: None,
        trading_mode_s: None,
        allow_buy: true,
        allow_sell: true,
        reverse_enabled: false,
        reverse_enabled_b: None,
        reverse_enabled_s: None,
        hedge_enabled: false,
        hedge_enabled_b: None,
        hedge_enabled_s: None,
        reverse_scale: 100.0,
        reverse_scale_b: None,
        reverse_scale_s: None,
        hedge_scale: 50.0,
        hedge_scale_b: None,
        hedge_scale_s: None,
        reverse_reference: "Logic_None".to_string(),
        reverse_reference_b: None,
        reverse_reference_s: None,
        hedge_reference: "Logic_None".to_string(),
        hedge_reference_b: None,
        hedge_reference_s: None,
        trail_step_mode: "TrailStepMode_Auto".to_string(),
        trail_step_mode_b: None,
        trail_step_mode_s: None,
        trail_step_cycle: 1,
        trail_step_cycle_b: None,
        trail_step_cycle_s: None,
        trail_step_balance: 0.0,
        trail_step_balance_b: None,
        trail_step_balance_s: None,
        trail_step_2: None,
        trail_step_2_b: None,
        trail_step_2_s: None,
        trail_step_method_2: None,
        trail_step_method_2_b: None,
        trail_step_method_2_s: None,
        trail_step_cycle_2: None,
        trail_step_cycle_2_b: None,
        trail_step_cycle_2_s: None,
        trail_step_balance_2: None,
        trail_step_balance_2_b: None,
        trail_step_balance_2_s: None,
        trail_step_mode_2: None,
        trail_step_mode_2_b: None,
        trail_step_mode_2_s: None,
        trail_step_3: None,
        trail_step_3_b: None,
        trail_step_3_s: None,
        trail_step_method_3: None,
        trail_step_method_3_b: None,
        trail_step_method_3_s: None,
        trail_step_cycle_3: None,
        trail_step_cycle_3_b: None,
        trail_step_cycle_3_s: None,
        trail_step_balance_3: None,
        trail_step_balance_3_b: None,
        trail_step_balance_3_s: None,
        trail_step_mode_3: None,
        trail_step_mode_3_b: None,
        trail_step_mode_3_s: None,
        trail_step_4: None,
        trail_step_4_b: None,
        trail_step_4_s: None,
        trail_step_method_4: None,
        trail_step_method_4_b: None,
        trail_step_method_4_s: None,
        trail_step_cycle_4: None,
        trail_step_cycle_4_b: None,
        trail_step_cycle_4_s: None,
        trail_step_balance_4: None,
        trail_step_balance_4_b: None,
        trail_step_balance_4_s: None,
        trail_step_mode_4: None,
        trail_step_mode_4_b: None,
        trail_step_mode_4_s: None,
        trail_step_5: None,
        trail_step_5_b: None,
        trail_step_5_s: None,
        trail_step_method_5: None,
        trail_step_method_5_b: None,
        trail_step_method_5_s: None,
        trail_step_cycle_5: None,
        trail_step_cycle_5_b: None,
        trail_step_cycle_5_s: None,
        trail_step_balance_5: None,
        trail_step_balance_5_b: None,
        trail_step_balance_5_s: None,
        trail_step_mode_5: None,
        trail_step_mode_5_b: None,
        trail_step_mode_5_s: None,
        trail_step_6: None,
        trail_step_6_b: None,
        trail_step_6_s: None,
        trail_step_method_6: None,
        trail_step_method_6_b: None,
        trail_step_method_6_s: None,
        trail_step_cycle_6: None,
        trail_step_cycle_6_b: None,
        trail_step_cycle_6_s: None,
        trail_step_balance_6: None,
        trail_step_balance_6_b: None,
        trail_step_balance_6_s: None,
        trail_step_mode_6: None,
        trail_step_mode_6_b: None,
        trail_step_mode_6_s: None,
        trail_step_7: None,
        trail_step_7_b: None,
        trail_step_7_s: None,
        trail_step_method_7: None,
        trail_step_method_7_b: None,
        trail_step_method_7_s: None,
        trail_step_cycle_7: None,
        trail_step_cycle_7_b: None,
        trail_step_cycle_7_s: None,
        trail_step_balance_7: None,
        trail_step_balance_7_b: None,
        trail_step_balance_7_s: None,
        trail_step_mode_7: None,
        trail_step_mode_7_b: None,
        trail_step_mode_7_s: None,
        close_partial: false,
        close_partial_b: None,
        close_partial_s: None,
        close_partial_cycle: 1,
        close_partial_cycle_b: None,
        close_partial_cycle_s: None,
        close_partial_mode: "PartialMode_Mid".to_string(),
        close_partial_mode_b: None,
        close_partial_mode_s: None,
        close_partial_balance: "PartialBalance_Balanced".to_string(),
        close_partial_balance_b: None,
        close_partial_balance_s: None,
        close_partial_trail_step_mode: "TrailStepMode_Auto".to_string(),
        close_partial_trail_step_mode_b: None,
        close_partial_trail_step_mode_s: None,
        close_partial_profit_threshold: 0.0,
        close_partial_profit_threshold_b: None,
        close_partial_profit_threshold_s: None,
        close_partial_2: None,
        close_partial_2_b: None,
        close_partial_2_s: None,
        close_partial_cycle_2: None,
        close_partial_cycle_2_b: None,
        close_partial_cycle_2_s: None,
        close_partial_mode_2: None,
        close_partial_mode_2_b: None,
        close_partial_mode_2_s: None,
        close_partial_balance_2: None,
        close_partial_balance_2_b: None,
        close_partial_balance_2_s: None,
        close_partial_profit_threshold_2: None,
        close_partial_profit_threshold_2_b: None,
        close_partial_profit_threshold_2_s: None,
        close_partial_3: None,
        close_partial_3_b: None,
        close_partial_3_s: None,
        close_partial_cycle_3: None,
        close_partial_cycle_3_b: None,
        close_partial_cycle_3_s: None,
        close_partial_mode_3: None,
        close_partial_mode_3_b: None,
        close_partial_mode_3_s: None,
        close_partial_balance_3: None,
        close_partial_balance_3_b: None,
        close_partial_balance_3_s: None,
        close_partial_profit_threshold_3: None,
        close_partial_profit_threshold_3_b: None,
        close_partial_profit_threshold_3_s: None,
        close_partial_4: None,
        close_partial_4_b: None,
        close_partial_4_s: None,
        close_partial_cycle_4: None,
        close_partial_cycle_4_b: None,
        close_partial_cycle_4_s: None,
        close_partial_mode_4: None,
        close_partial_mode_4_b: None,
        close_partial_mode_4_s: None,
        close_partial_balance_4: None,
        close_partial_balance_4_b: None,
        close_partial_balance_4_s: None,
        close_partial_profit_threshold_4: None,
        close_partial_profit_threshold_4_b: None,
        close_partial_profit_threshold_4_s: None,
        trigger_type: None,
        trigger_type_b: None,
        trigger_type_s: None,
        trigger_mode: None,
        trigger_mode_b: None,
        trigger_mode_s: None,
        trigger_bars: None,
        trigger_bars_b: None,
        trigger_bars_s: None,
        trigger_minutes: None,
        trigger_minutes_b: None,
        trigger_minutes_s: None,
        trigger_seconds: None,
        trigger_seconds_b: None,
        trigger_seconds_s: None,
        trigger_pips: None,
        trigger_pips_b: None,
        trigger_pips_s: None,
        trigger_points: None,
        trigger_points_b: None,
        trigger_points_s: None,
        opcount_ref: None,
        opcount_ref_b: None,
        opcount_ref_s: None,
        start_op_count: None,
        start_op_count_b: None,
        start_op_count_s: None,
    }
}

/// Get logic code from name
fn get_logic_code(logic_name: &str) -> &'static str {
    match logic_name {
        "Power" => "P",
        "Repower" => "R",
        "Scalp" | "Scalper" => "S",
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
        "0" => "Step_Points".to_string(),
        "1" => "Step_Percent".to_string(),
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

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
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

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
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
    if !path.is_dir() {
        return Err("Path is not a folder".to_string());
    }
    let path = sanitize_and_validate_path(&path)?;

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
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
    ("Scalp", "SCALPER"),
    ("Scalper", "SCALPER"),
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

    // Parse directional gInput keys using the v19 parser.
    let mut parsed_keys: Vec<ParsedV19Key> = Vec::new();
    for (_line_num, line) in content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(';') {
            continue;
        }

        if let Some(pos) = line.find('=') {
            let key = line[..pos].trim().to_string();
            let _value_str = line[pos + 1..].trim().to_string();

            // Only process gInput keys
            if !key.starts_with("gInput_") {
                continue;
            }

            if let Some(parsed) = parse_v19_key(&key) {
                parsed_keys.push(parsed);
                result.total_inputs_parsed += 1;
            }
        }
    }

    // Track found items
    let mut found_groups: Vec<u8> = Vec::new();
    let mut found_engines: Vec<String> = Vec::new();
    let mut found_logics: Vec<String> = Vec::new();
    let mut found_logic_directions: std::collections::HashSet<(u8, String, String, String)> = std::collections::HashSet::new();

    for parsed in &parsed_keys {
        found_groups.push(parsed.group as u8);
        found_engines.push(parsed.engine.to_string());
        let logic_name = logic_code_to_name(parsed.logic.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| parsed.logic.to_string());
        found_logics.push(logic_name.clone());
        found_logic_directions.insert((
            parsed.group as u8,
            parsed.engine.to_string(),
            logic_name,
            parsed.direction.clone(),
        ));
    }

    // Build config from the authoritative v19 parser.
    // This preserves independent Buy/Sell rows and avoids collapsing values.
    let mut config = build_config_from_v19_setfile(&content)?;

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
            grid_unit: Some(10),
            pip_factor: Some(1),
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
                enabled: false,
                spread_filter_enabled: false,
                max_spread_points: 25.0,
                equity_stop_enabled: false,
                equity_stop_value: 35.0,
                drawdown_stop_enabled: false,
                max_drawdown_percent: 35.0,
                risk_action: Some("TriggerAction_StopEA_KeepTrades".to_string()),
            },
            risk_management_b: None,
            risk_management_s: None,
            time_filters: TimeFiltersConfig {
                enabled: false,
                priority_settings: TimePrioritySettings {
                    news_filter_overrides_session: false,
                    session_filter_overrides_news: true,
                },
                sessions: Vec::new(),
            },
            time_filters_b: None,
            time_filters_s: None,
            news_filter_b: None,
            news_filter_s: None,
            news_filter: NewsFilterConfig {
                enabled: false,
                api_key: "".to_string(),
                api_url: "https://www.jblanked.com/news/api/calendar/".to_string(),
                countries: "US,GB,EU".to_string(),
                impact_level: 3,
                minutes_before: 30,
                minutes_after: 30,
                stop_ea: true,
                close_trades: false,
                auto_restart: true,
                check_interval: 60,
                alert_minutes: 5,
                filter_high_only: true,
                filter_weekends: false,
                use_local_cache: true,
                cache_duration: 3600,
                fallback_on_error: "Fallback_Continue".to_string(),
                filter_currencies: "".to_string(),
                include_speeches: true,
                include_reports: true,
                visual_indicator: true,
                alert_before_news: false,
                calendar_file: "DAAVFX_NEWS.csv".to_string(),
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
        trail_method: "Points".to_string(),
        trail_value: 50.0,
        trail_value_b: None,
        trail_value_s: None,
        trail_start: 0.0,
        trail_start_b: None,
        trail_start_s: None,
        trail_step: 50.0,
        trail_step_b: None,
        trail_step_s: None,
        trail_step_method: "Step_Points".to_string(),
        // Preserve source values as-is. Missing StartLevel stays missing.
        start_level: None,
        start_level_b: None,
        start_level_s: None,
        last_lot: None,
        last_lot_b: None,
        last_lot_s: None,
        close_targets: "CloseTargets_ProfitOnly".to_string(),
        close_targets_b: None,
        close_targets_s: None,
        order_count_reference: "OrderCount_Direct".to_string(),
        order_count_reference_b: None,
        order_count_reference_s: None,
        group_order_count_reference: None,
        group_order_count_reference_b: None,
        group_order_count_reference_s: None,
        start_level_ref: None,
        start_level_ref_b: None,
        start_level_ref_s: None,
        reset_lot_on_restart: false,
        reset_lot_on_restart_b: None,
        reset_lot_on_restart_s: None,
        restart_policy_power: Some("Restart_Default".to_string()),
        restart_policy_non_power: Some("Restart_Default".to_string()),
        close_non_power_on_power_close: Some(false),
        hold_timeout_seconds: Some(0),
        use_tp: false,
        use_tp_b: None,
        use_tp_s: None,
        tp_mode: "TPSL_Points".to_string(),
        tp_mode_b: None,
        tp_mode_s: None,
        tp_value: 0.0,
        tp_value_b: None,
        tp_value_s: None,
        use_sl: false,
        use_sl_b: None,
        use_sl_s: None,
        sl_mode: "TPSL_Points".to_string(),
        sl_mode_b: None,
        sl_mode_s: None,
        sl_value: 0.0,
        sl_value_b: None,
        sl_value_s: None,
        continue_tp_hit: true,
        continue_tp_hit_b: None,
        continue_tp_hit_s: None,
        continue_sl_hit: true,
        continue_sl_hit_b: None,
        continue_sl_hit_s: None,
        strategy_type: "Trail".to_string(),
        strategy_type_b: None,
        strategy_type_s: None,
        trading_mode: "Counter Trend".to_string(),
        trading_mode_b: None,
        trading_mode_s: None,
        allow_buy: true,
        allow_sell: true,
        reverse_enabled: false,
        reverse_enabled_b: None,
        reverse_enabled_s: None,
        hedge_enabled: false,
        hedge_enabled_b: None,
        hedge_enabled_s: None,
        reverse_scale: 100.0,
        reverse_scale_b: None,
        reverse_scale_s: None,
        hedge_scale: 50.0,
        hedge_scale_b: None,
        hedge_scale_s: None,
        reverse_reference: "Logic_None".to_string(),
        reverse_reference_b: None,
        reverse_reference_s: None,
        hedge_reference: "Logic_None".to_string(),
        hedge_reference_b: None,
        hedge_reference_s: None,
        trail_step_mode: "TrailStepMode_Auto".to_string(),
        trail_step_mode_b: None,
        trail_step_mode_s: None,
        trail_step_cycle: 1,
        trail_step_cycle_b: None,
        trail_step_cycle_s: None,
        trail_step_balance: 0.0,
        trail_step_balance_b: None,
        trail_step_balance_s: None,
        // Trail Step 2
        trail_step_2: None,
        trail_step_2_b: None,
        trail_step_2_s: None,
        trail_step_method_2: None,
        trail_step_method_2_b: None,
        trail_step_method_2_s: None,
        trail_step_cycle_2: None,
        trail_step_cycle_2_b: None,
        trail_step_cycle_2_s: None,
        trail_step_balance_2: None,
        trail_step_balance_2_b: None,
        trail_step_balance_2_s: None,
        trail_step_mode_2: None,
        trail_step_mode_2_b: None,
        trail_step_mode_2_s: None,
        // Trail Step 3
        trail_step_3: None,
        trail_step_3_b: None,
        trail_step_3_s: None,
        trail_step_method_3: None,
        trail_step_method_3_b: None,
        trail_step_method_3_s: None,
        trail_step_cycle_3: None,
        trail_step_cycle_3_b: None,
        trail_step_cycle_3_s: None,
        trail_step_balance_3: None,
        trail_step_balance_3_b: None,
        trail_step_balance_3_s: None,
        trail_step_mode_3: None,
        trail_step_mode_3_b: None,
        trail_step_mode_3_s: None,
        // Trail Step 4
        trail_step_4: None,
        trail_step_4_b: None,
        trail_step_4_s: None,
        trail_step_method_4: None,
        trail_step_method_4_b: None,
        trail_step_method_4_s: None,
        trail_step_cycle_4: None,
        trail_step_cycle_4_b: None,
        trail_step_cycle_4_s: None,
        trail_step_balance_4: None,
        trail_step_balance_4_b: None,
        trail_step_balance_4_s: None,
        trail_step_mode_4: None,
        trail_step_mode_4_b: None,
        trail_step_mode_4_s: None,
        // Trail Step 5
        trail_step_5: None,
        trail_step_5_b: None,
        trail_step_5_s: None,
        trail_step_method_5: None,
        trail_step_method_5_b: None,
        trail_step_method_5_s: None,
        trail_step_cycle_5: None,
        trail_step_cycle_5_b: None,
        trail_step_cycle_5_s: None,
        trail_step_balance_5: None,
        trail_step_balance_5_b: None,
        trail_step_balance_5_s: None,
        trail_step_mode_5: None,
        trail_step_mode_5_b: None,
        trail_step_mode_5_s: None,
        // Trail Step 6
        trail_step_6: None,
        trail_step_6_b: None,
        trail_step_6_s: None,
        trail_step_method_6: None,
        trail_step_method_6_b: None,
        trail_step_method_6_s: None,
        trail_step_cycle_6: None,
        trail_step_cycle_6_b: None,
        trail_step_cycle_6_s: None,
        trail_step_balance_6: None,
        trail_step_balance_6_b: None,
        trail_step_balance_6_s: None,
        trail_step_mode_6: None,
        trail_step_mode_6_b: None,
        trail_step_mode_6_s: None,
        // Trail Step 7
        trail_step_7: None,
        trail_step_7_b: None,
        trail_step_7_s: None,
        trail_step_method_7: None,
        trail_step_method_7_b: None,
        trail_step_method_7_s: None,
        trail_step_cycle_7: None,
        trail_step_cycle_7_b: None,
        trail_step_cycle_7_s: None,
        trail_step_balance_7: None,
        trail_step_balance_7_b: None,
        trail_step_balance_7_s: None,
        trail_step_mode_7: None,
        trail_step_mode_7_b: None,
        trail_step_mode_7_s: None,
        // Close Partial 1
        close_partial: false,
        close_partial_b: None,
        close_partial_s: None,
        close_partial_cycle: 1,
        close_partial_cycle_b: None,
        close_partial_cycle_s: None,
        close_partial_mode: "PartialMode_Mid".to_string(),
        close_partial_mode_b: None,
        close_partial_mode_s: None,
        close_partial_balance: "PartialBalance_Balanced".to_string(),
        close_partial_balance_b: None,
        close_partial_balance_s: None,
        close_partial_trail_step_mode: "TrailStepMode_Auto".to_string(),
        close_partial_trail_step_mode_b: None,
        close_partial_trail_step_mode_s: None,
        close_partial_profit_threshold: 0.0,
        close_partial_profit_threshold_b: None,
        close_partial_profit_threshold_s: None,
        // Close Partial 2
        close_partial_2: None,
        close_partial_2_b: None,
        close_partial_2_s: None,
        close_partial_cycle_2: None,
        close_partial_cycle_2_b: None,
        close_partial_cycle_2_s: None,
        close_partial_mode_2: None,
        close_partial_mode_2_b: None,
        close_partial_mode_2_s: None,
        close_partial_balance_2: None,
        close_partial_balance_2_b: None,
        close_partial_balance_2_s: None,
        close_partial_profit_threshold_2: None,
        close_partial_profit_threshold_2_b: None,
        close_partial_profit_threshold_2_s: None,
        // Close Partial 3
        close_partial_3: None,
        close_partial_3_b: None,
        close_partial_3_s: None,
        close_partial_cycle_3: None,
        close_partial_cycle_3_b: None,
        close_partial_cycle_3_s: None,
        close_partial_mode_3: None,
        close_partial_mode_3_b: None,
        close_partial_mode_3_s: None,
        close_partial_balance_3: None,
        close_partial_balance_3_b: None,
        close_partial_balance_3_s: None,
        close_partial_profit_threshold_3: None,
        close_partial_profit_threshold_3_b: None,
        close_partial_profit_threshold_3_s: None,
        // Close Partial 4
        close_partial_4: None,
        close_partial_4_b: None,
        close_partial_4_s: None,
        close_partial_cycle_4: None,
        close_partial_cycle_4_b: None,
        close_partial_cycle_4_s: None,
        close_partial_mode_4: None,
        close_partial_mode_4_b: None,
        close_partial_mode_4_s: None,
        close_partial_balance_4: None,
        close_partial_balance_4_b: None,
        close_partial_balance_4_s: None,
        close_partial_profit_threshold_4: None,
        close_partial_profit_threshold_4_b: None,
        close_partial_profit_threshold_4_s: None,
        // Triggers
        trigger_type: None,
        trigger_type_b: None,
        trigger_type_s: None,
        trigger_mode: None,
        trigger_mode_b: None,
        trigger_mode_s: None,
        trigger_bars: None,
        trigger_bars_b: None,
        trigger_bars_s: None,
        trigger_minutes: None,
        trigger_minutes_b: None,
        trigger_minutes_s: None,
        trigger_seconds: None,
        trigger_seconds_b: None,
        trigger_seconds_s: None,
        trigger_pips: None,
        trigger_pips_b: None,
        trigger_pips_s: None,
        trigger_points: None,
        trigger_points_b: None,
        trigger_points_s: None,
        opcount_ref: None,
        opcount_ref_b: None,
        opcount_ref_s: None,
        start_op_count: None,
        start_op_count_b: None,
        start_op_count_s: None,
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
            if let Some(logic) = group_config.logics.iter_mut().find(|l| l.logic_name.to_uppercase() == logic_name.to_uppercase()) {
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
                        1 => "AVG_Percent".to_string(),
                        _ => "Points".to_string(),
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
                            0 => "PartialMode_Low".to_string(),
                            1 => "PartialMode_Mid".to_string(),
                            2 => "PartialMode_Aggressive".to_string(),
                            _ => "PartialMode_Mid".to_string(),
                        }
                    }
                    "LastLot" => logic.last_lot = Some(value),
                    "StartLevel" => logic.start_level = Some(value as i32),
                    "TriggerType" => {
                        logic.trigger_type =
                            Some(decode_trigger_type_numeric(&format!("{}", value as i32)))
                    }
                    "TriggerMode" => {
                        logic.trigger_mode =
                            Some(decode_trigger_mode_numeric(&format!("{}", value as i32)))
                    }
                    "TriggerBars" => logic.trigger_bars = Some(value as i32),
                    "TriggerMinutes" | "TriggerSeconds" => logic.trigger_seconds = Some(value as i32),
                    "TriggerPips" => logic.trigger_pips = Some(value),
                    "TriggerPoints" => logic.trigger_points = Some(value),
                    "StartOpCount" => logic.start_op_count = Some(value as i32),
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
const V19_FIELDS_PER_LOGIC_GROUP1: usize = 81;
#[allow(dead_code)]
const V19_FIELDS_PER_LOGIC_OTHER_GROUPS: usize = 78;
#[allow(dead_code)]
const V19_FIELDS_PER_LOGIC_GROUP1_LEGACY: usize = 87;
#[allow(dead_code)]
const V19_FIELDS_PER_LOGIC_OTHER_GROUPS_LEGACY: usize = 84;
#[allow(dead_code)]
const V19_FIELDS_PER_LOGIC_GROUP1_POWER: usize = 80;
#[allow(dead_code)]
const V19_FIELDS_PER_LOGIC_OTHER_GROUPS_LEGACY_MAX: usize = 87;
#[allow(dead_code)]
const V19_TOTAL_LOGIC_DIRECTIONS: usize = V19_MAX_GROUPS * V19_MAX_ENGINES * V19_MAX_LOGICS * V19_MAX_DIRECTIONS; // 630
#[allow(dead_code)]
const V19_GROUP1_LOGIC_DIRECTIONS: usize = V19_MAX_ENGINES * V19_MAX_LOGICS * V19_MAX_DIRECTIONS; // 42
#[allow(dead_code)]
const V19_NON_GROUP1_LOGIC_DIRECTIONS: usize = V19_TOTAL_LOGIC_DIRECTIONS - V19_GROUP1_LOGIC_DIRECTIONS; // 588
#[allow(dead_code)]
const V19_TOTAL_LOGIC_INPUTS: usize = (V19_MAX_ENGINES * V19_MAX_DIRECTIONS) * V19_FIELDS_PER_LOGIC_GROUP1_POWER
    + (V19_GROUP1_LOGIC_DIRECTIONS - (V19_MAX_ENGINES * V19_MAX_DIRECTIONS)) * V19_FIELDS_PER_LOGIC_GROUP1
    + V19_NON_GROUP1_LOGIC_DIRECTIONS * V19_FIELDS_PER_LOGIC_OTHER_GROUPS; // 49,260
#[allow(dead_code)]
const V19_MIN_TOTAL_INPUTS: usize = 45000;

#[derive(Debug, Clone)]
pub struct ParsedV19Key {
    pub group: usize,
    pub engine: char,
    pub logic: String,
    pub direction: String,
    pub param: String,
}

/// Parse v19 format key: gInput_{Group}_{Engine}{Logic}_{Direction}_{Param}
/// Examples:
///   gInput_1_AP_Buy_Start=1
///   gInput_1_AR_Sell_Grid=300
///   gInput_2_BP_Buy_TrailValue=500
///   gInput_15_CRPO_Sell_InitialLot=0.02
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
    let logic_code = engine_logic[1..].to_string();

    // Validate engine
    if engine_char != 'A' && engine_char != 'B' && engine_char != 'C' {
        return None;
    }

    // Validate the full logic code so multi-letter logics don't collapse together.
    let valid_logics = ["P", "R", "S", "ST", "STO", "SCA", "RPO"];
    if !valid_logics.contains(&logic_code.as_str()) {
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
        logic: logic_code,
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
        let group = k
            .split('_')
            .next()
            .and_then(|v| v.parse::<usize>().ok())
            .unwrap_or(0);
        if group == 1 {
            let logic_code = k.split('_').nth(2).unwrap_or("");
            let expected_current = if logic_code == "P" {
                V19_FIELDS_PER_LOGIC_GROUP1_POWER
            } else {
                V19_FIELDS_PER_LOGIC_GROUP1
            };
            if *count != expected_current
                && *count != V19_FIELDS_PER_LOGIC_GROUP1
                && *count != V19_FIELDS_PER_LOGIC_GROUP1_LEGACY
                && *count != 74
                && *count != 75
                && *count != 86
            {
                errors.push(format!(
                    "Logic-direction {} has {} fields (expected one of {}, {}, {}, 74, 75, 86).",
                    k,
                    count,
                    expected_current,
                    V19_FIELDS_PER_LOGIC_GROUP1,
                    V19_FIELDS_PER_LOGIC_GROUP1_LEGACY
                ));
            }
        } else {
            if *count != V19_FIELDS_PER_LOGIC_OTHER_GROUPS
                && *count != V19_FIELDS_PER_LOGIC_OTHER_GROUPS_LEGACY
                && *count != 72
                && *count != 85
                && *count != 86
                && *count != V19_FIELDS_PER_LOGIC_OTHER_GROUPS_LEGACY_MAX {
                errors.push(format!(
                    "Logic-direction {} has {} fields (expected one of 72, 78, 84, 85, 86, 87).",
                    k, count
                ));
            }
        }
    }

    let total_inputs = inputs.len();
    if total_inputs < V19_MIN_TOTAL_INPUTS {
        errors.push(format!(
            "Expected at least {} inputs for the current v19 contract (full export is about 45,480 logic inputs across 630 logic-directions), found {}. Setfile may be incomplete.",
            V19_MIN_TOTAL_INPUTS, total_inputs
        ));
    }

    let validation = V19SetfileValidation {
        total_inputs,
        logic_directions,
        groups: V19_MAX_GROUPS,
        engines: V19_MAX_ENGINES,
        logics: V19_MAX_LOGICS,
        directions: V19_MAX_DIRECTIONS,
        fields_per_logic: V19_FIELDS_PER_LOGIC_GROUP1,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct V19StartLevelAuditRow {
    pub engine: String,
    pub logic: String,
    pub direction: String,
    pub start_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct V19ContractAuditReport {
    pub file_path: String,
    pub total_inputs: usize,
    pub enabled_rows: usize,
    pub group_power_start: std::collections::BTreeMap<String, Option<i32>>,
    pub start_levels_group1: Vec<V19StartLevelAuditRow>,
    pub trigger_type_distribution: std::collections::BTreeMap<String, usize>,
    pub trigger_mode_distribution: std::collections::BTreeMap<String, usize>,
    pub banned_bp_keys: usize,
    pub banned_cp_keys: usize,
    pub violations: Vec<String>,
}

#[cfg_attr(feature = "tauri-app", tauri::command(rename_all = "camelCase"))]
pub fn audit_v19_setfile_contract(file_path: String) -> Result<V19ContractAuditReport, String> {
    let path_buf = PathBuf::from(&file_path);
    let sanitized_path = sanitize_and_validate_path(&path_buf)?;
    let bytes = fs::read(&sanitized_path).map_err(|e| format!("Failed to read .set file: {}", e))?;
    let content = decode_setfile_bytes(bytes)?;
    let parsed = parse_v19_setfile(&content);

    let mut enabled_rows: usize = 0;
    let mut trigger_type_distribution: std::collections::BTreeMap<String, usize> =
        std::collections::BTreeMap::new();
    let mut trigger_mode_distribution: std::collections::BTreeMap<String, usize> =
        std::collections::BTreeMap::new();
    let mut start_levels_group1: Vec<V19StartLevelAuditRow> = Vec::new();
    let mut banned_bp_keys: usize = 0;
    let mut banned_cp_keys: usize = 0;

    let mut group_power_start: std::collections::BTreeMap<String, Option<i32>> =
        std::collections::BTreeMap::new();
    for g in 2..=15usize {
        let key_p = format!("gInput_GroupPowerStart_P{}", g);
        let key_bp = format!("gInput_GroupPowerStart_BP{}", g);
        let key_cp = format!("gInput_GroupPowerStart_CP{}", g);
        let value_p = parsed
            .inputs
            .get(&key_p)
            .and_then(|v| v.trim().parse::<i32>().ok());
        let value_bp = parsed
            .inputs
            .get(&key_bp)
            .and_then(|v| v.trim().parse::<i32>().ok())
            .or(value_p);
        let value_cp = parsed
            .inputs
            .get(&key_cp)
            .and_then(|v| v.trim().parse::<i32>().ok())
            .or(value_p);
        group_power_start.insert(format!("P{}", g), value_p);
        group_power_start.insert(format!("BP{}", g), value_bp);
        group_power_start.insert(format!("CP{}", g), value_cp);
    }

    for (key, value) in &parsed.inputs {
        let key_lower = key.to_ascii_lowercase();
        if key_lower.starts_with("ginput_grouppowerstart_bp") {
            banned_bp_keys += 1;
        }
        if key_lower.starts_with("ginput_grouppowerstart_cp") {
            banned_cp_keys += 1;
        }

        if let Some(pk) = parse_v19_key(key) {
            if pk.param.eq_ignore_ascii_case("Enabled") {
                if value.trim() == "1" || value.trim().eq_ignore_ascii_case("true") {
                    enabled_rows += 1;
                }
            } else if pk.param.eq_ignore_ascii_case("TriggerType") {
                *trigger_type_distribution
                    .entry(value.trim().to_string())
                    .or_insert(0) += 1;
            } else if pk.param.eq_ignore_ascii_case("TriggerMode") {
                *trigger_mode_distribution
                    .entry(value.trim().to_string())
                    .or_insert(0) += 1;
            } else if pk.group == 1 && pk.param.eq_ignore_ascii_case("StartLevel") {
                start_levels_group1.push(V19StartLevelAuditRow {
                    engine: pk.engine.to_string(),
                    logic: logic_code_to_name(pk.logic.as_str()).unwrap_or("UNKNOWN").to_string(),
                    direction: pk.direction,
                    start_level: value.trim().to_string(),
                });
            }
        }
    }

    start_levels_group1.sort_by(|a, b| {
        (a.engine.as_str(), a.logic.as_str(), a.direction.as_str())
            .cmp(&(b.engine.as_str(), b.logic.as_str(), b.direction.as_str()))
    });

    let violations = parsed.validation.errors.clone();

    Ok(V19ContractAuditReport {
        file_path: sanitized_path.to_string_lossy().to_string(),
        total_inputs: parsed.inputs.len(),
        enabled_rows,
        group_power_start,
        start_levels_group1,
        trigger_type_distribution,
        trigger_mode_distribution,
        banned_bp_keys,
        banned_cp_keys,
        violations,
    })
}

fn create_full_v19_config() -> MTConfig {
    let mut config = create_default_mt_config();

    let engines = ["A", "B", "C"];
    let logics = ["POWER", "REPOWER", "SCALPER", "STOPPER", "STO", "SCA", "RPO"];

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
                group_power_start: None,
                group_power_start_b: None,
                group_power_start_s: None,
                reverse_mode: false,
                hedge_mode: false,
                hedge_reference: "Logic_None".to_string(),
                entry_delay_bars: 0,
                logics: Vec::new(),
            };

            for logic_name in &logics {
                // Build distinct Buy/Sell rows so directional values stay fully independent.
                let mut buy_logic = create_default_logic_config(logic_name);
                buy_logic.logic_id = format!("{}_{}_B_G{}", engine_id, logic_name, group_num);
                buy_logic.allow_buy = true;
                buy_logic.allow_sell = false;

                let mut sell_logic = create_default_logic_config(logic_name);
                sell_logic.logic_id = format!("{}_{}_S_G{}", engine_id, logic_name, group_num);
                sell_logic.allow_buy = false;
                sell_logic.allow_sell = true;

                group.logics.push(buy_logic);
                group.logics.push(sell_logic);
            }
            engine.groups.push(group);
        }

        config.engines.push(engine);
    }

    config
}

fn logic_code_to_name(code: &str) -> Option<&'static str> {
    match code {
        "P" => Some("POWER"),
        "R" => Some("REPOWER"),
        "S" => Some("SCALPER"),
        "ST" => Some("STOPPER"),
        "STO" => Some("STO"),
        "SCA" => Some("SCA"),
        "RPO" => Some("RPO"),
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
        "4" => "TrailStepMode_Auto".to_string(),
        other => other.to_string(),
    }
}

fn decode_trail_step_method_numeric(raw: &str) -> String {
    match raw.trim() {
        "0" => "Step_Points".to_string(),
        "1" => "Step_Percent".to_string(),
        "2" => "Step_Points".to_string(),
        "Step_Pips" | "step_pips" => "Step_Points".to_string(),
        "Step_Points" | "step_points" => "Step_Points".to_string(),
        "Step_Percent" | "step_percent" => "Step_Percent".to_string(),
        other => other.to_string(),
    }
}

fn decode_partial_mode_numeric(raw: &str) -> String {
    match raw.trim() {
        "0" => "PartialMode_Low".to_string(),
        "1" => "PartialMode_Mid".to_string(),
        "2" => "PartialMode_Aggressive".to_string(),
        // Legacy aliases -> canonical
        "3" => "PartialMode_Aggressive".to_string(),
        "4" => "PartialMode_Mid".to_string(),
        "PartialMode_Low" | "partialmode_low" => "PartialMode_Low".to_string(),
        "PartialMode_Mid" | "partialmode_mid" => "PartialMode_Mid".to_string(),
        "PartialMode_Aggressive" | "partialmode_aggressive" => {
            "PartialMode_Aggressive".to_string()
        }
        "PartialMode_High" | "partialmode_high" => "PartialMode_Aggressive".to_string(),
        "PartialMode_Balanced" | "partialmode_balanced" => "PartialMode_Mid".to_string(),
        _ => "PartialMode_Mid".to_string(),
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

fn normalize_tpsl_mode(raw: &str) -> String {
    let mode = raw.trim().to_ascii_lowercase();
    if mode.is_empty() {
        return "TPSL_Points".to_string();
    }
    if mode == "0" || mode.contains("points") || mode.contains("pips") {
        return "TPSL_Points".to_string();
    }
    if mode == "1" || mode.contains("price") {
        return "TPSL_Points".to_string();
    }
    if mode == "2" || mode.contains("percent") {
        return "TPSL_Points".to_string();
    }
    "TPSL_Points".to_string()
}

fn decode_tpsl_mode_numeric(raw: &str) -> String {
    normalize_tpsl_mode(raw)
}

fn decode_trail_method_numeric(raw: &str) -> String {
    match raw.trim() {
        "0" => "Points".to_string(),
        "1" => "AVG_Percent".to_string(),
        "2" => "Points".to_string(),
        "Trail" | "trail" => "Points".to_string(),
        "Trail_Points" | "Points" => "Points".to_string(),
        "Trail_AVG_Percent" | "AVG_Percent" => "AVG_Percent".to_string(),
        "Trail_AVG_Points" | "AVG_Points" => "Points".to_string(),
        "Trail_Profit_Percent" | "Percent" => "Points".to_string(),
        other => other.to_string(),
    }
}

fn decode_trigger_type_numeric(raw: &str) -> String {
    match raw.trim() {
        "0" => "0 Trigger_Immediate".to_string(),
        "1" => "1 Trigger_AfterBars".to_string(),
        "2" => "2 Trigger_AfterSeconds".to_string(),
        "3" => "3 Trigger_AfterPips".to_string(),
        "4" => "4 Trigger_TimeFilter".to_string(),
        "5" => "5 Trigger_NewsFilter".to_string(),
        "6" => "6 Trigger_PowerAOppositeCount".to_string(),
        other => other.to_string(),
    }
}

fn decode_trigger_mode_numeric(raw: &str) -> String {
    normalize_trigger_mode(raw)
}

fn normalize_trading_mode(raw: &str) -> String {
    let mode = raw.trim().to_ascii_lowercase();
    match mode.as_str() {
        "hedge" => "Hedge".to_string(),
        "reverse" => "Reverse".to_string(),
        "counter trend"
        | "countertrend"
        | "counter_trend"
        | "counter-trend"
        | "trend following"
        | "trend_following"
        | "trending"
        | "" => "Counter Trend".to_string(),
        _ => "Counter Trend".to_string(),
    }
}

fn is_engine_a_power(engine_id: &str, logic_name: &str) -> bool {
    engine_id.eq_ignore_ascii_case("A") && logic_name.eq_ignore_ascii_case("POWER")
}

fn is_missing_logic_reference(raw: &str) -> bool {
    let norm = raw.trim().to_ascii_lowercase();
    norm.is_empty() || norm == "logic_none" || norm == "none" || norm == "0"
}

fn normalize_logic_mode_and_flags(logic: &mut LogicConfig, engine_id: &str) {
    logic.trail_method = decode_trail_method_numeric(&logic.trail_method);
    logic.trail_step_method = decode_trail_step_method_numeric(&logic.trail_step_method);
    logic.trail_step_mode = decode_trail_step_mode_numeric(&logic.trail_step_mode);
    logic.tp_mode = normalize_tpsl_mode(&logic.tp_mode);
    logic.sl_mode = normalize_tpsl_mode(&logic.sl_mode);
    if let Some(curr) = logic.tp_mode_b.clone() {
        logic.tp_mode_b = Some(normalize_tpsl_mode(&curr));
    }
    if let Some(curr) = logic.tp_mode_s.clone() {
        logic.tp_mode_s = Some(normalize_tpsl_mode(&curr));
    }
    if let Some(curr) = logic.sl_mode_b.clone() {
        logic.sl_mode_b = Some(normalize_tpsl_mode(&curr));
    }
    if let Some(curr) = logic.sl_mode_s.clone() {
        logic.sl_mode_s = Some(normalize_tpsl_mode(&curr));
    }
    if logic.trigger_seconds.is_none() && logic.trigger_minutes.is_some() {
        logic.trigger_seconds = logic.trigger_minutes;
    }
    logic.trigger_minutes = None;

    let normalize_opt_step =
        |slot: &mut Option<String>, decoder: fn(&str) -> String| {
            if let Some(curr) = slot.clone() {
                let next = decoder(&curr);
                if next.trim().is_empty() {
                    *slot = None;
                } else {
                    *slot = Some(next);
                }
            }
        };

    normalize_opt_step(&mut logic.trail_step_method_2, decode_trail_step_method_numeric);
    normalize_opt_step(&mut logic.trail_step_method_3, decode_trail_step_method_numeric);
    normalize_opt_step(&mut logic.trail_step_method_4, decode_trail_step_method_numeric);
    normalize_opt_step(&mut logic.trail_step_method_5, decode_trail_step_method_numeric);
    normalize_opt_step(&mut logic.trail_step_method_6, decode_trail_step_method_numeric);
    normalize_opt_step(&mut logic.trail_step_method_7, decode_trail_step_method_numeric);
    normalize_opt_step(&mut logic.trail_step_mode_2, decode_trail_step_mode_numeric);
    normalize_opt_step(&mut logic.trail_step_mode_3, decode_trail_step_mode_numeric);
    normalize_opt_step(&mut logic.trail_step_mode_4, decode_trail_step_mode_numeric);
    normalize_opt_step(&mut logic.trail_step_mode_5, decode_trail_step_mode_numeric);
    normalize_opt_step(&mut logic.trail_step_mode_6, decode_trail_step_mode_numeric);
    normalize_opt_step(&mut logic.trail_step_mode_7, decode_trail_step_mode_numeric);

    if let Some(tt) = logic.trigger_type.clone() {
        let normalized = decode_trigger_type_numeric(&tt);
        logic.trigger_type = Some(normalized.clone());
        let code = trigger_type_code(&normalized);
        if code != 1 {
            logic.trigger_bars = Some(0);
        }
        if code != 2 {
            logic.trigger_seconds = Some(0);
        }
        if code != 3 {
            logic.trigger_pips = Some(0.0);
        }
        if code == 0 {
            let mode_raw = logic
                .trigger_mode
                .clone()
                .unwrap_or_else(|| "TriggerMode_OnTick".to_string());
            logic.trigger_mode = Some(normalize_trigger_mode(&mode_raw));
        } else {
            logic.trigger_mode = None;
        }
    } else {
        logic.trigger_mode = None;
    }

    let explicit_mode = if logic.trading_mode.trim().is_empty() {
        None
    } else {
        Some(normalize_trading_mode(&logic.trading_mode))
    };

    let mut mode = if let Some(m) = explicit_mode.clone() {
        m
    } else if logic.hedge_enabled && !logic.reverse_enabled {
        "Hedge".to_string()
    } else if logic.reverse_enabled && !logic.hedge_enabled {
        "Reverse".to_string()
    } else {
        "Counter Trend".to_string()
    };

    // Invalid legacy conflict: no explicit mode and both flags enabled.
    if explicit_mode.is_none() && logic.hedge_enabled && logic.reverse_enabled {
        mode = "Counter Trend".to_string();
    }

    // Engine A POWER is always Counter Trend.
    if is_engine_a_power(engine_id, &logic.logic_name) {
        mode = "Counter Trend".to_string();
    }

    logic.trading_mode = mode.clone();

    match mode.as_str() {
        "Hedge" => {
            logic.hedge_enabled = true;
            logic.reverse_enabled = false;
            if logic.hedge_reference.trim().is_empty() {
                logic.hedge_reference = "Logic_None".to_string();
            }
            logic.reverse_reference = "Logic_None".to_string();
            logic.reverse_scale = 100.0;
        }
        "Reverse" => {
            logic.reverse_enabled = true;
            logic.hedge_enabled = false;
            if logic.reverse_reference.trim().is_empty() {
                logic.reverse_reference = "Logic_None".to_string();
            }
            logic.hedge_reference = "Logic_None".to_string();
            logic.hedge_scale = 50.0;
        }
        _ => {
            logic.reverse_enabled = false;
            logic.hedge_enabled = false;
            logic.reverse_reference = "Logic_None".to_string();
            logic.hedge_reference = "Logic_None".to_string();
            logic.reverse_scale = 100.0;
            logic.hedge_scale = 50.0;
            logic.trading_mode = "Counter Trend".to_string();
        }
    }
}

fn normalize_config_mode_contract(config: &mut MTConfig) {
    for engine in &mut config.engines {
        for group in &mut engine.groups {
            for logic in &mut group.logics {
                normalize_logic_mode_and_flags(logic, &engine.engine_id);
            }
        }
    }
}

fn set_dir_opt_f64(is_buy: bool, field_b: &mut Option<f64>, field_s: &mut Option<f64>, val: f64) {
    if is_buy {
        *field_b = Some(val);
    } else {
        *field_s = Some(val);
    }
}

fn set_dir_opt_bool(is_buy: bool, field_b: &mut Option<bool>, field_s: &mut Option<bool>, val: bool) {
    if is_buy {
        *field_b = Some(val);
    } else {
        *field_s = Some(val);
    }
}

fn set_dir_opt_string(is_buy: bool, field_b: &mut Option<String>, field_s: &mut Option<String>, val: String) {
    if is_buy {
        *field_b = Some(val);
    } else {
        *field_s = Some(val);
    }
}

fn apply_v19_param_to_logic(logic: &mut LogicConfig, is_buy: bool, param: &str, raw: &str) {
    let p = param.to_ascii_lowercase();
    let raw_trimmed = raw.trim();
    match p.as_str() {
        "enabled" => logic.enabled = parse_bool_val(raw),
        "allowbuy" => logic.allow_buy = parse_bool_val(raw),
        "allowsell" => logic.allow_sell = parse_bool_val(raw),
        "tradingmode" => {
            logic.trading_mode = normalize_trading_mode(raw);
        }
        "initiallot" => {
            if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.initial_lot = v;
                set_dir_opt_f64(is_buy, &mut logic.initial_lot_b, &mut logic.initial_lot_s, v);
            }
        }
        "lastlot" => {
            if raw_trimmed.is_empty() {
                logic.last_lot = None;
            } else if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.last_lot = Some(v);
            }
        }
        "mult" => {
            if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.multiplier = v;
                set_dir_opt_f64(is_buy, &mut logic.multiplier_b, &mut logic.multiplier_s, v);
            }
        }
        "grid" => {
            if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.grid = v;
                set_dir_opt_f64(is_buy, &mut logic.grid_b, &mut logic.grid_s, v);
            }
        }
        "trail" => {
            if let Ok(n) = raw_trimmed.parse::<i32>() {
                logic.trail_method = match n {
                    1 => "AVG_Percent".to_string(),
                    _ => "Points".to_string(),
                };
            }
        }
        "trailvalue" => {
            if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.trail_value = v;
            }
        }
        "trailstart" => {
            if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.trail_start = v;
                set_dir_opt_f64(is_buy, &mut logic.trail_start_b, &mut logic.trail_start_s, v);
            }
        }
        "trailstep" => {
            if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.trail_step = v;
                set_dir_opt_f64(is_buy, &mut logic.trail_step_b, &mut logic.trail_step_s, v);
            }
        }
        "trailstepmethod" => logic.trail_step_method = decode_trail_step_method_numeric(raw),
        "trailstepmode" => logic.trail_step_mode = decode_trail_step_mode_numeric(raw),
        "trailstepcycle" => {
            if let Ok(v) = raw_trimmed.parse::<i32>() {
                logic.trail_step_cycle = v;
            }
        }
        "trailstepbalance" => {
            if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.trail_step_balance = v;
            }
        }
        "triggertype" => {
            if raw_trimmed.is_empty() {
                logic.trigger_type = None;
            } else {
                logic.trigger_type = Some(decode_trigger_type_numeric(raw));
            }
        }
        "triggermode" => {
            if raw_trimmed.is_empty() {
                logic.trigger_mode = None;
            } else {
                logic.trigger_mode = Some(decode_trigger_mode_numeric(raw));
            }
        }
        "triggerbars" => {
            if let Ok(v) = raw_trimmed.parse::<i32>() {
                logic.trigger_bars = Some(v);
            }
        }
        "triggerminutes" | "triggerseconds" => {
            if let Ok(v) = raw_trimmed.parse::<i32>() {
                logic.trigger_seconds = Some(v);
            }
        }
        "triggerpips" => {
            if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.trigger_pips = Some(v);
            }
        }
        "ordercountreferencelogic" | "ordercountreference" => {
            if raw_trimmed.is_empty() {
                logic.order_count_reference = "Logic_None".to_string();
            } else {
                logic.order_count_reference = raw.to_string();
            }
        }
        "groupordercountreferencelogic" | "groupordercountreference" | "groupordercountref" => {
            if raw_trimmed.is_empty() {
                logic.group_order_count_reference = None;
            } else {
                logic.group_order_count_reference = Some(raw.to_string());
            }
        }
        // ARCHIVE (disabled fallback):
        // previous parser used unwrap_or(0), which rewrote malformed/missing values to 0.
        "startlevel" => {
            if let Ok(v) = raw_trimmed.parse::<i32>() {
                logic.start_level = Some(v);
            }
        }
        "resetlotonrestart" => logic.reset_lot_on_restart = parse_bool_val(raw),
        "usetp" => {
            let val = parse_bool_val(raw);
            logic.use_tp = val;
            set_dir_opt_bool(is_buy, &mut logic.use_tp_b, &mut logic.use_tp_s, val);
        }
        "tpmode" => {
            let mode = normalize_tpsl_mode(raw);
            logic.tp_mode = mode.clone();
            set_dir_opt_string(is_buy, &mut logic.tp_mode_b, &mut logic.tp_mode_s, mode);
        }
        "tpvalue" => {
            if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.tp_value = v;
                set_dir_opt_f64(is_buy, &mut logic.tp_value_b, &mut logic.tp_value_s, v);
            }
        }
        "usesl" => {
            let val = parse_bool_val(raw);
            logic.use_sl = val;
            set_dir_opt_bool(is_buy, &mut logic.use_sl_b, &mut logic.use_sl_s, val);
        }
        "slmode" => {
            let mode = normalize_tpsl_mode(raw);
            logic.sl_mode = mode.clone();
            set_dir_opt_string(is_buy, &mut logic.sl_mode_b, &mut logic.sl_mode_s, mode);
        }
        "slvalue" => {
            if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.sl_value = v;
                set_dir_opt_f64(is_buy, &mut logic.sl_value_b, &mut logic.sl_value_s, v);
            }
        }
        "continuetphit" => {
            let val = parse_bool_val(raw);
            logic.continue_tp_hit = val;
            set_dir_opt_bool(is_buy, &mut logic.continue_tp_hit_b, &mut logic.continue_tp_hit_s, val);
        }
        "continueslhit" => {
            let val = parse_bool_val(raw);
            logic.continue_sl_hit = val;
            set_dir_opt_bool(is_buy, &mut logic.continue_sl_hit_b, &mut logic.continue_sl_hit_s, val);
        }
        "closepartial" => logic.close_partial = parse_bool_val(raw),
        // Deprecated in active contract: ignored on import.
        "closepartialcycle" => {}
        "closepartialmode" => logic.close_partial_mode = decode_partial_mode_numeric(raw),
        // Deprecated in active contract: ignored on import.
        "closepartialbalance" => {}
        "closepartialtrailmode" => {}
        "closepartialprofitthreshold" => {
            if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.close_partial_profit_threshold = v;
            }
        }
        "closepartial2" => {
            if raw_trimmed.is_empty() {
                logic.close_partial_2 = None;
            } else {
                logic.close_partial_2 = Some(parse_bool_val(raw));
            }
        }
        // Deprecated in active contract: ignored on import.
        "closepartialcycle2" => {}
        "closepartialmode2" => {
            if raw_trimmed.is_empty() {
                logic.close_partial_mode_2 = None;
            } else {
                logic.close_partial_mode_2 = Some(decode_partial_mode_numeric(raw));
            }
        }
        // Deprecated in active contract: ignored on import.
        "closepartialbalance2" => {}
        "closepartialtrailmode2" => {}
        "closepartialprofitthreshold2" => {
            if raw_trimmed.is_empty() {
                logic.close_partial_profit_threshold_2 = None;
            } else if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.close_partial_profit_threshold_2 = Some(v);
            }
        }
        "closepartial3" => {
            if raw_trimmed.is_empty() {
                logic.close_partial_3 = None;
            } else {
                logic.close_partial_3 = Some(parse_bool_val(raw));
            }
        }
        // Deprecated in active contract: ignored on import.
        "closepartialcycle3" => {}
        "closepartialmode3" => {
            if raw_trimmed.is_empty() {
                logic.close_partial_mode_3 = None;
            } else {
                logic.close_partial_mode_3 = Some(decode_partial_mode_numeric(raw));
            }
        }
        // Deprecated in active contract: ignored on import.
        "closepartialbalance3" => {}
        "closepartialtrailmode3" => {}
        "closepartialprofitthreshold3" => {
            if raw_trimmed.is_empty() {
                logic.close_partial_profit_threshold_3 = None;
            } else if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.close_partial_profit_threshold_3 = Some(v);
            }
        }
        "closepartial4" => {
            if raw_trimmed.is_empty() {
                logic.close_partial_4 = None;
            } else {
                logic.close_partial_4 = Some(parse_bool_val(raw));
            }
        }
        // Deprecated in active contract: ignored on import.
        "closepartialcycle4" => {}
        "closepartialmode4" => {
            if raw_trimmed.is_empty() {
                logic.close_partial_mode_4 = None;
            } else {
                logic.close_partial_mode_4 = Some(decode_partial_mode_numeric(raw));
            }
        }
        // Deprecated in active contract: ignored on import.
        "closepartialbalance4" => {}
        "closepartialtrailmode4" => {}
        "closepartialprofitthreshold4" => {
            if raw_trimmed.is_empty() {
                logic.close_partial_profit_threshold_4 = None;
            } else if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.close_partial_profit_threshold_4 = Some(v);
            }
        }
        "reverseenabled" => logic.reverse_enabled = parse_bool_val(raw),
        "reversereference" => logic.reverse_reference = raw.to_string(),
        "reversescale" => {
            if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.reverse_scale = v;
            }
        }
        "hedgeenabled" => logic.hedge_enabled = parse_bool_val(raw),
        "hedgereference" => logic.hedge_reference = raw.to_string(),
        "hedgescale" => {
            if let Ok(v) = raw_trimmed.parse::<f64>() {
                logic.hedge_scale = v;
            }
        }
        "closetargets" => logic.close_targets = raw.to_string(),
        _ => {
            if let Some(suffix) = p.strip_prefix("trailstep") {
                if let Ok(n) = suffix.parse::<i32>() {
                    if raw_trimmed.is_empty() {
                        match n {
                            2 => logic.trail_step_2 = None,
                            3 => logic.trail_step_3 = None,
                            4 => logic.trail_step_4 = None,
                            5 => logic.trail_step_5 = None,
                            6 => logic.trail_step_6 = None,
                            7 => logic.trail_step_7 = None,
                            _ => {}
                        }
                        return;
                    }
                    let Ok(v) = raw_trimmed.parse::<f64>() else {
                        return;
                    };
                    match n {
                        2 => logic.trail_step_2 = Some(v),
                        3 => logic.trail_step_3 = Some(v),
                        4 => logic.trail_step_4 = Some(v),
                        5 => logic.trail_step_5 = Some(v),
                        6 => logic.trail_step_6 = Some(v),
                        7 => logic.trail_step_7 = Some(v),
                        _ => {}
                    }
                    return;
                }
            }
            if let Some(suffix) = p.strip_prefix("trailstepmethod") {
                if let Ok(n) = suffix.parse::<i32>() {
                    if raw_trimmed.is_empty() {
                        match n {
                            2 => logic.trail_step_method_2 = None,
                            3 => logic.trail_step_method_3 = None,
                            4 => logic.trail_step_method_4 = None,
                            5 => logic.trail_step_method_5 = None,
                            6 => logic.trail_step_method_6 = None,
                            7 => logic.trail_step_method_7 = None,
                            _ => {}
                        }
                        return;
                    }
                    let v = decode_trail_step_method_numeric(raw);
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
                    if raw_trimmed.is_empty() {
                        match n {
                            2 => logic.trail_step_mode_2 = None,
                            3 => logic.trail_step_mode_3 = None,
                            4 => logic.trail_step_mode_4 = None,
                            5 => logic.trail_step_mode_5 = None,
                            6 => logic.trail_step_mode_6 = None,
                            7 => logic.trail_step_mode_7 = None,
                            _ => {}
                        }
                        return;
                    }
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
                    if raw_trimmed.is_empty() {
                        match n {
                            2 => logic.trail_step_cycle_2 = None,
                            3 => logic.trail_step_cycle_3 = None,
                            4 => logic.trail_step_cycle_4 = None,
                            5 => logic.trail_step_cycle_5 = None,
                            6 => logic.trail_step_cycle_6 = None,
                            7 => logic.trail_step_cycle_7 = None,
                            _ => {}
                        }
                        return;
                    }
                    let Ok(v) = raw_trimmed.parse::<i32>() else {
                        return;
                    };
                    match n {
                        2 => logic.trail_step_cycle_2 = Some(v),
                        3 => logic.trail_step_cycle_3 = Some(v),
                        4 => logic.trail_step_cycle_4 = Some(v),
                        5 => logic.trail_step_cycle_5 = Some(v),
                        6 => logic.trail_step_cycle_6 = Some(v),
                        7 => logic.trail_step_cycle_7 = Some(v),
                        _ => {}
                    }
                    return;
                }
            }
            if let Some(suffix) = p.strip_prefix("trailstepbalance") {
                if let Ok(n) = suffix.parse::<i32>() {
                    if raw_trimmed.is_empty() {
                        match n {
                            2 => logic.trail_step_balance_2 = None,
                            3 => logic.trail_step_balance_3 = None,
                            4 => logic.trail_step_balance_4 = None,
                            5 => logic.trail_step_balance_5 = None,
                            6 => logic.trail_step_balance_6 = None,
                            7 => logic.trail_step_balance_7 = None,
                            _ => {}
                        }
                        return;
                    }
                    let Ok(v) = raw_trimmed.parse::<f64>() else {
                        return;
                    };
                    match n {
                        2 => logic.trail_step_balance_2 = Some(v),
                        3 => logic.trail_step_balance_3 = Some(v),
                        4 => logic.trail_step_balance_4 = Some(v),
                        5 => logic.trail_step_balance_5 = Some(v),
                        6 => logic.trail_step_balance_6 = Some(v),
                        7 => logic.trail_step_balance_7 = Some(v),
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

    // Grid Unit and Pip Factor - MISSING in original implementation!
    let grid_unit_default = config.general.grid_unit.unwrap_or(10);
    let pip_factor_default = config.general.pip_factor.unwrap_or(1);
    config.general.grid_unit = Some(get_i32(inputs, "gInput_GridUnit", grid_unit_default));
    config.general.pip_factor = Some(get_i32(inputs, "gInput_PipFactor", pip_factor_default));

    let nf = &mut config.general.news_filter;
    nf.enabled = get_bool_first(inputs, &["gInput_EnableNewsFilter", "gInput_NewsFilterEnabled"]);
    nf.api_key = get_string(inputs, "gInput_NewsAPIKey", &nf.api_key);
    nf.api_url = get_string(inputs, "gInput_NewsAPIURL", &nf.api_url);
    nf.countries = get_string(inputs, "gInput_NewsFilterCountries", &nf.countries);
    nf.impact_level = get_i32(inputs, "gInput_NewsImpactLevel", nf.impact_level);
    nf.minutes_before = get_i32(inputs, "gInput_MinutesBeforeNews", nf.minutes_before);
    nf.minutes_after = get_i32(inputs, "gInput_MinutesAfterNews", nf.minutes_after);
    if let Some(raw_action) = inputs.get("gInput_NewsAction") {
        if let Ok(action_num) = raw_action.trim().parse::<i32>() {
            let flags = news_flags_from_action_int(action_num);
            nf.stop_ea = flags.0;
            nf.close_trades = flags.1;
            nf.auto_restart = flags.2;
        }
    }
    // Parse 3 boolean fields
    nf.stop_ea = get_bool_with_default(inputs, "gInput_NewsStopEA", nf.stop_ea);
    nf.close_trades = get_bool_with_default(inputs, "gInput_NewsCloseTrades", nf.close_trades);
    nf.auto_restart = get_bool_with_default(inputs, "gInput_NewsAutoRestart", nf.auto_restart);
    nf.check_interval = get_i32(inputs, "gInput_NewsCheckInterval", nf.check_interval);
    nf.alert_minutes = get_i32(inputs, "gInput_AlertMinutesBefore", nf.alert_minutes);
    nf.filter_high_only = get_bool_with_default(inputs, "gInput_FilterHighImpactOnly", nf.filter_high_only);
    nf.filter_weekends = get_bool_with_default(inputs, "gInput_FilterWeekendNews", nf.filter_weekends);
    nf.use_local_cache = get_bool_with_default(inputs, "gInput_UseLocalNewsCache", nf.use_local_cache);
    nf.cache_duration = get_i32(inputs, "gInput_NewsCacheDuration", nf.cache_duration);
    nf.fallback_on_error = get_string(inputs, "gInput_NewsFallbackOnError", &nf.fallback_on_error);
    nf.filter_currencies = get_string(inputs, "gInput_FilterCurrencies", &nf.filter_currencies);
    nf.include_speeches = get_bool_with_default(inputs, "gInput_IncludeSpeeches", nf.include_speeches);
    nf.include_reports = get_bool_with_default(inputs, "gInput_IncludeReports", nf.include_reports);
    nf.visual_indicator = get_bool_with_default(inputs, "gInput_NewsVisualIndicator", nf.visual_indicator);
    nf.alert_before_news = get_bool_with_default(inputs, "gInput_AlertBeforeNews", nf.alert_before_news);
    nf.calendar_file = get_string(inputs, "gInput_NewsCalendarFile", "");

    // Group thresholds (groups 2-15):
    // NEW: Support separate Buy/Sell values: gInput_GroupPowerStart_{P|BP|CP}{N}_{Buy|Sell}
    // Fallback to legacy: gInput_GroupPowerStart_{P|BP|CP}{N}
    for engine in &mut config.engines {
        for g in 2..=15 {
            let base_key = match engine.engine_id.as_str() {
                "A" => format!("P{}", g),
                "B" => format!("BP{}", g),
                "C" => format!("CP{}", g),
                _ => format!("P{}", g),
            };
            
            // Try new Buy/Sell specific keys first
            let key_b = format!("gInput_GroupPowerStart_{}_Buy", base_key);
            let key_s = format!("gInput_GroupPowerStart_{}_Sell", base_key);
            let key_legacy = format!("gInput_GroupPowerStart_{}", base_key);
            
            let parsed_b = inputs.get(&key_b).and_then(|v| v.trim().parse::<i32>().ok());
            let parsed_s = inputs.get(&key_s).and_then(|v| v.trim().parse::<i32>().ok());
            let parsed_legacy = inputs.get(&key_legacy).and_then(|v| v.trim().parse::<i32>().ok());
            
            if let Some(group) = engine.groups.iter_mut().find(|grp| grp.group_number == g as u8) {
                // Use new Buy/Sell fields if present, fallback to legacy
                group.group_power_start_b = parsed_b.or(parsed_legacy);
                group.group_power_start_s = parsed_s.or(parsed_legacy);
                // Keep legacy field for backward compatibility
                group.group_power_start = parsed_legacy;
            }
        }
    }
}

fn build_config_from_v19_setfile(content: &str) -> Result<MTConfig, String> {
    let parsed = parse_v19_setfile(content);
    if !parsed.validation.is_valid {
        return Err(format!("Invalid v19 massive setfile: {:?}", parsed.validation.errors));
    }

    let legacy_trigger_minute_keys = parsed
        .inputs
        .keys()
        .filter(|k| k.contains("TriggerMinutes"))
        .count();
    if legacy_trigger_minute_keys > 0 {
        println!(
            "[SETFILE] WARN: Detected {} legacy TriggerMinutes key(s) in v19 import; mapping to trigger_seconds.",
            legacy_trigger_minute_keys
        );
    }

    let mut config = create_full_v19_config();
    apply_v19_global_keys(&mut config, &parsed.inputs);

    for (key, raw_val) in &parsed.inputs {
        if let Some(parsed_key) = parse_v19_key(key) {
            // StartLevel is Group 1-only. Ignore legacy repeated keys from Groups 2-15.
            if parsed_key.group != 1 && parsed_key.param.eq_ignore_ascii_case("StartLevel") {
                continue;
            }
            let engine_id = parsed_key.engine.to_string();
            let logic_name = logic_code_to_name(parsed_key.logic.as_str())
                .ok_or_else(|| format!("Unknown logic code: {}", parsed_key.logic))?;
            let is_buy = parsed_key.direction == "Buy";
            let group_u8 = parsed_key.group as u8;

            if let Some(engine) = config.engines.iter_mut().find(|e| e.engine_id == engine_id) {
                if let Some(group) = engine.groups.iter_mut().find(|g| g.group_number == group_u8) {
                    let dir_token = if is_buy { "_B_" } else { "_S_" };
                    let mut maybe_logic = group.logics.iter_mut().find(|l| {
                        l.logic_name.to_uppercase() == logic_name.to_uppercase()
                            && l.logic_id.to_uppercase().contains(dir_token)
                    });
                    if maybe_logic.is_none() {
                        maybe_logic = group
                            .logics
                            .iter_mut()
                            .find(|l| l.logic_name.to_uppercase() == logic_name.to_uppercase());
                    }
                    if let Some(logic) = maybe_logic {
                        apply_v19_param_to_logic(logic, is_buy, &parsed_key.param, raw_val);
                    }
                }
            }
        }
    }

    normalize_config_mode_contract(&mut config);
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
    use std::fs;

    #[test]
    fn test_parse_v19_key_basic() {
        let key = "gInput_1_AP_Buy_InitialLot";
        let parsed = parse_v19_key(key).unwrap();
        assert_eq!(parsed.group, 1);
        assert_eq!(parsed.engine, 'A');
        assert_eq!(parsed.logic, "P");
        assert_eq!(parsed.direction, "Buy");
        assert_eq!(parsed.param, "InitialLot");
    }

    #[test]
    fn test_parse_v19_key_all_engines() {
        // Engine A - valid logic codes: P (Power), R (Repower), S (Scalper), ST (Stopper), STO, SCA, RPO
        assert!(parse_v19_key("gInput_1_AP_Buy_Start").is_some());
        assert!(parse_v19_key("gInput_1_AR_Sell_Grid").is_some());
        assert!(parse_v19_key("gInput_1_AS_Buy_TrailValue").is_some());
        assert!(parse_v19_key("gInput_1_AST_Sell_Mult").is_some());
        assert!(parse_v19_key("gInput_1_ASTO_Buy_InitialLot").is_some());
        assert!(parse_v19_key("gInput_1_ASCA_Sell_LastLot").is_some());
        assert!(parse_v19_key("gInput_1_ARPO_Buy_StartLevel").is_some());

        // Engine B
        assert!(parse_v19_key("gInput_15_BP_Sell_InitialLot").is_some());
        assert!(parse_v19_key("gInput_10_BR_Buy_Grid").is_some());

        // Engine C - valid logic codes only
        assert!(parse_v19_key("gInput_15_CP_Buy_Start").is_some());
        assert!(parse_v19_key("gInput_5_CST_Sell_TrailValue").is_some());
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

    #[test]
    fn test_parse_v19_setfile_accepts_bp_cp_threshold_keys() {
        let config = create_full_v19_config();
        let tmp_path = std::env::temp_dir().join(format!(
            "daavfx_v19_bp_cp_threshold_{}_{}.set",
            std::process::id(),
            chrono::Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let tmp_str = tmp_path.to_string_lossy().to_string();
        let _ = fs::remove_file(&tmp_path);

        export_massive_v19_setfile(config, tmp_str.clone(), "MT5".to_string(), Some(false))
            .expect("export should succeed");

        let mut content = fs::read_to_string(&tmp_path).expect("should read exported setfile");
        content.push_str(
            "\ngInput_GroupPowerStart_P2=2\ngInput_GroupPowerStart_BP2=2\ngInput_GroupPowerStart_CP2=2\n",
        );

        let setfile = parse_v19_setfile(&content);
        assert!(setfile.validation.is_valid);
        assert!(setfile.validation.errors.is_empty());
        assert_eq!(
            setfile
                .inputs
                .get("gInput_GroupPowerStart_BP2")
                .map(|v| v.as_str()),
            Some("2")
        );
        assert_eq!(
            setfile
                .inputs
                .get("gInput_GroupPowerStart_CP2")
                .map(|v| v.as_str()),
            Some("2")
        );

        let _ = fs::remove_file(&tmp_path);
    }

    #[test]
    fn test_parse_v19_key_preserves_multi_letter_logic_codes() {
        let parsed = parse_v19_key("gInput_15_CRPO_Sell_InitialLot")
            .expect("RPO logic should parse as a distinct logic code");
        assert_eq!(parsed.group, 15);
        assert_eq!(parsed.engine, 'C');
        assert_eq!(parsed.logic, "RPO");
        assert_eq!(parsed.direction, "Sell");
        assert_eq!(parsed.param, "InitialLot");

        let parsed = parse_v19_key("gInput_2_BSCA_Buy_TrailValue")
            .expect("SCA logic should parse as a distinct logic code");
        assert_eq!(parsed.group, 2);
        assert_eq!(parsed.engine, 'B');
        assert_eq!(parsed.logic, "SCA");
        assert_eq!(parsed.direction, "Buy");
        assert_eq!(parsed.param, "TrailValue");
    }

    #[test]
    fn test_parse_v19_setfile_keeps_multi_letter_logic_directions_separate() {
        let content = r#"
gInput_1_AS_Buy_Start=1
gInput_1_AST_Buy_Start=2
gInput_1_ASTO_Buy_Start=3
gInput_1_ASCA_Buy_Start=4
gInput_1_AR_Buy_Start=5
gInput_1_ARPO_Buy_Start=6
"#;

        let setfile = parse_v19_setfile(content);
        assert_eq!(setfile.validation.logic_directions, 6);
        assert!(setfile.inputs.contains_key("gInput_1_AS_Buy_Start"));
        assert!(setfile.inputs.contains_key("gInput_1_AST_Buy_Start"));
        assert!(setfile.inputs.contains_key("gInput_1_ASTO_Buy_Start"));
        assert!(setfile.inputs.contains_key("gInput_1_ASCA_Buy_Start"));
        assert!(setfile.inputs.contains_key("gInput_1_AR_Buy_Start"));
        assert!(setfile.inputs.contains_key("gInput_1_ARPO_Buy_Start"));
    }

    #[test]
    fn test_create_full_v19_config_has_directional_rows() {
        let config = create_full_v19_config();
        let engine_a = config.engines.iter().find(|e| e.engine_id == "A").unwrap();
        let group_1 = engine_a.groups.iter().find(|g| g.group_number == 1).unwrap();

        // 7 logic names x 2 directional rows each.
        assert_eq!(group_1.logics.len(), 14);
        assert!(group_1.logics.iter().any(|l| l.logic_name == "POWER" && l.logic_id.contains("_B_")));
        assert!(group_1.logics.iter().any(|l| l.logic_name == "POWER" && l.logic_id.contains("_S_")));
    }

    #[test]
    fn test_export_and_import_keep_buy_sell_independent() {
        let mut config = create_full_v19_config();
        let engine = config.engines.iter_mut().find(|e| e.engine_id == "A").unwrap();
        let group = engine.groups.iter_mut().find(|g| g.group_number == 1).unwrap();

        let buy_logic = group
            .logics
            .iter_mut()
            .find(|l| l.logic_name == "POWER" && l.logic_id.contains("_B_"))
            .unwrap();
        buy_logic.initial_lot = 0.11;
        buy_logic.grid = 111.0;
        buy_logic.allow_buy = true;
        buy_logic.allow_sell = false;

        let sell_logic = group
            .logics
            .iter_mut()
            .find(|l| l.logic_name == "POWER" && l.logic_id.contains("_S_"))
            .unwrap();
        sell_logic.initial_lot = 0.22;
        sell_logic.grid = 222.0;
        sell_logic.allow_buy = false;
        sell_logic.allow_sell = true;

        let tmp_path = std::env::temp_dir().join(format!(
            "daavfx_v19_directional_{}_{}.set",
            std::process::id(),
            chrono::Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let tmp_str = tmp_path.to_string_lossy().to_string();
        let _ = fs::remove_file(&tmp_path);

        export_massive_v19_setfile(config, tmp_str.clone(), "MT5".to_string(), Some(false))
            .expect("export should succeed");

        let content = fs::read_to_string(&tmp_path).expect("should read exported setfile");
        assert!(content.contains("gInput_1_AP_Buy_InitialLot=0.11"));
        assert!(content.contains("gInput_1_AP_Sell_InitialLot=0.22"));
        assert!(content.contains("gInput_1_AP_Buy_Grid=111.0"));
        assert!(content.contains("gInput_1_AP_Sell_Grid=222.0"));

        let imported = build_config_from_v19_setfile(&content).expect("import should succeed");
        let imported_engine = imported.engines.iter().find(|e| e.engine_id == "A").unwrap();
        let imported_group = imported_engine.groups.iter().find(|g| g.group_number == 1).unwrap();
        let imported_buy = imported_group
            .logics
            .iter()
            .find(|l| l.logic_name == "POWER" && l.logic_id.contains("_B_"))
            .unwrap();
        let imported_sell = imported_group
            .logics
            .iter()
            .find(|l| l.logic_name == "POWER" && l.logic_id.contains("_S_"))
            .unwrap();

        assert_eq!(imported_buy.initial_lot, 0.11);
        assert_eq!(imported_sell.initial_lot, 0.22);
        assert_eq!(imported_buy.grid, 111.0);
        assert_eq!(imported_sell.grid, 222.0);

        let _ = fs::remove_file(&tmp_path);
    }

    #[test]
    fn test_export_order_count_reference_logic_group1_only_values_others_empty() {
        let config = create_full_v19_config();
        let tmp_path = std::env::temp_dir().join(format!(
            "daavfx_v19_order_count_ref_{}_{}.set",
            std::process::id(),
            chrono::Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let tmp_str = tmp_path.to_string_lossy().to_string();
        let _ = fs::remove_file(&tmp_path);

        export_massive_v19_setfile(config, tmp_str.clone(), "MT5".to_string(), Some(false))
            .expect("export should succeed");

        let content = fs::read_to_string(&tmp_path).expect("should read exported setfile");
        let mut group1_non_empty = 0usize;
        let mut group2_15_empty = 0usize;

        for line in content.lines() {
            if !line.contains("_OrderCountReferenceLogic=") {
                continue;
            }
            let key = match line.split('=').next() {
                Some(k) => k,
                None => continue,
            };
            let value = match line.split('=').nth(1) {
                Some(v) => v,
                None => "",
            };
            let group_num = key
                .strip_prefix("gInput_")
                .and_then(|rest| rest.split('_').next())
                .and_then(|g| g.parse::<u8>().ok())
                .unwrap_or(0);

            if group_num == 1 {
                assert!(
                    !value.trim().is_empty(),
                    "Group 1 key must be non-empty: {}",
                    line
                );
                group1_non_empty += 1;
            } else if (2..=15).contains(&group_num) {
                assert!(
                    value.trim().is_empty(),
                    "Group {} key must be empty: {}",
                    group_num,
                    line
                );
                group2_15_empty += 1;
            }
        }

        // 3 engines * 7 logics * 2 directions = 42 rows for Group 1.
        assert_eq!(group1_non_empty, 42);
        // 14 groups (2-15) * 3 engines * 7 logics * 2 directions = 588 rows.
        assert_eq!(group2_15_empty, 588);

        let _ = fs::remove_file(&tmp_path);
    }

    #[tokio::test]
    async fn test_parse_massive_setfile_keeps_directional_values_independent() {
        let mut config = create_full_v19_config();
        let engine = config.engines.iter_mut().find(|e| e.engine_id == "A").unwrap();
        let group = engine.groups.iter_mut().find(|g| g.group_number == 1).unwrap();

        let buy_logic = group
            .logics
            .iter_mut()
            .find(|l| l.logic_name == "POWER" && l.logic_id.contains("_B_"))
            .unwrap();
        buy_logic.initial_lot = 0.11;
        buy_logic.grid = 111.0;

        let sell_logic = group
            .logics
            .iter_mut()
            .find(|l| l.logic_name == "POWER" && l.logic_id.contains("_S_"))
            .unwrap();
        sell_logic.initial_lot = 0.22;
        sell_logic.grid = 222.0;

        let tmp_path = std::env::temp_dir().join(format!(
            "daavfx_massive_parse_directional_{}_{}.set",
            std::process::id(),
            chrono::Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let tmp_str = tmp_path.to_string_lossy().to_string();

        let _ = fs::remove_file(&tmp_path);
        export_massive_v19_setfile(config, tmp_str.clone(), "MT5".to_string(), Some(false))
            .expect("export should succeed");

        let parsed = parse_massive_setfile(tmp_str.clone())
            .await
            .expect("parse_massive_setfile should succeed");
        assert!(parsed.success, "parser returned errors: {:?}", parsed.errors);

        let config = parsed.config.expect("config should be present");
        let engine = config.engines.iter().find(|e| e.engine_id == "A").unwrap();
        let group = engine.groups.iter().find(|g| g.group_number == 1).unwrap();
        let buy_logic = group
            .logics
            .iter()
            .find(|l| l.logic_name == "POWER" && l.logic_id.contains("_B_"))
            .unwrap();
        let sell_logic = group
            .logics
            .iter()
            .find(|l| l.logic_name == "POWER" && l.logic_id.contains("_S_"))
            .unwrap();

        assert_eq!(buy_logic.initial_lot, 0.11);
        assert_eq!(sell_logic.initial_lot, 0.22);
        assert_eq!(buy_logic.grid, 111.0);
        assert_eq!(sell_logic.grid, 222.0);

        let _ = fs::remove_file(&tmp_path);
    }

    #[test]
    fn test_export_massive_v19_gps_omission() {
        let mut config = create_full_v19_config();
        
        // Ensure Engine B Power logic G1 references Logic_Power (Power A)
        // (create_full_v19_config likely already does this by default or uses Logic_None)
        {
            let engine_b = config.engines.iter_mut().find(|e| e.engine_id == "B").unwrap();
            let group_1 = engine_b.groups.iter_mut().find(|g| g.group_number == 1).unwrap();
            let power_logic = group_1.logics.iter_mut().find(|l| {
                let name = l.logic_name.trim().to_uppercase();
                name == "POWER" || name == "SCALPER"
            }).unwrap();
            power_logic.group_order_count_reference = Some("Logic_Power".to_string());
        }

        // Set high thresholds for A
        {
            let engine_a = config.engines.iter_mut().find(|e| e.engine_id == "A").unwrap();
            for group in &mut engine_a.groups {
                if group.group_number > 1 {
                    group.group_power_start_b = Some(group.group_number as i32 * 2);
                    group.group_power_start_s = Some(group.group_number as i32 * 2);
                }
            }
        }

        let tmp_path = std::env::temp_dir().join(format!(
            "v19_gps_omission_{}.set",
            std::process::id()
        ));
        let tmp_str = tmp_path.to_string_lossy().to_string();
        let _ = fs::remove_file(&tmp_path);

        export_massive_v19_setfile(config, tmp_str.clone(), "MT5".to_string(), Some(false))
            .expect("export should succeed");

        let content = fs::read_to_string(&tmp_path).expect("should read exported setfile");
        
        // Verify Engine A keys EXIST
        assert!(content.contains("gInput_GroupPowerStart_P2_Buy=4"));
        
        // Verify Engine B keys DO NOT EXIST (omitted because references Power A)
        // These keys should NOT be in the set file to allow EA's fallback to copy A's values
        assert!(!content.contains("gInput_GroupPowerStart_BP2_Buy"));
        assert!(!content.contains("gInput_GroupPowerStart_BP2_Sell"));
        
        let _ = fs::remove_file(&tmp_path);
    }
}

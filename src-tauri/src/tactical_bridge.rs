use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

const SYNC_STATE_FILE: &str = "DAAVFX_SyncState.json";
const SYNC_COMMANDS_FILE: &str = "DAAVFX_SyncCommands.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncGlobalBuySell {
  pub allow_buy: bool,
  pub allow_sell: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncLogicState {
  pub group: i32,
  pub logic: String,
  pub allow_buy: bool,
  pub allow_sell: bool,
  pub reverse_enabled: bool,
  pub hedge_enabled: bool,
  pub scale_reverse: f64,
  pub scale_hedge: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncAccount {
  pub balance: f64,
  pub equity: f64,
  pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncState {
  pub version: String,
  pub timestamp: String,
  pub symbol: String,
  pub magic_number: i32,
  pub global_buy_sell: SyncGlobalBuySell,
  pub logic_states: Vec<SyncLogicState>,
  pub account: SyncAccount,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncPaths {
  pub state_path: String,
  pub commands_path: String,
  pub state_exists: bool,
  pub state_last_modified_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncCommandPayload {
  pub command: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub group: Option<i32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub logic: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub allow_buy: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub allow_sell: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub param_name: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub param_value: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub command_id: Option<String>,
}

fn get_mt4_common_files_dir() -> Result<PathBuf, String> {
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

fn get_mt5_common_files_dir() -> Result<PathBuf, String> {
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

fn common_files_dir_for_platform(platform: &str) -> Result<PathBuf, String> {
  let p = platform.trim().to_uppercase();
  if p == "MT5" {
    get_mt5_common_files_dir()
  } else {
    get_mt4_common_files_dir()
  }
}

fn safe_overwrite(path: &PathBuf, content: &str) -> Result<(), String> {
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

  fs::write(&tmp_path, content).map_err(|e| format!("Failed to write temp file: {}", e))?;
  if path.exists() {
    let _ = fs::remove_file(path);
  }
  fs::rename(&tmp_path, path).map_err(|e| {
    let _ = fs::remove_file(&tmp_path);
    format!("Failed to commit file: {}", e)
  })?;
  Ok(())
}

#[tauri::command]
pub fn get_sync_paths(platform: String) -> Result<SyncPaths, String> {
  let common_dir = common_files_dir_for_platform(&platform)?;
  let state_path = common_dir.join(SYNC_STATE_FILE);
  let commands_path = common_dir.join(SYNC_COMMANDS_FILE);

  let state_exists = state_path.exists();
  let state_last_modified_ms = if state_exists {
    fs::metadata(&state_path)
      .ok()
      .and_then(|m| m.modified().ok())
      .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
      .map(|d| d.as_millis() as u64)
  } else {
    None
  };

  Ok(SyncPaths {
    state_path: state_path.to_string_lossy().to_string(),
    commands_path: commands_path.to_string_lossy().to_string(),
    state_exists,
    state_last_modified_ms,
  })
}

#[tauri::command]
pub fn read_sync_state(platform: String) -> Result<Option<SyncState>, String> {
  let common_dir = common_files_dir_for_platform(&platform)?;
  let state_path = common_dir.join(SYNC_STATE_FILE);
  if !state_path.exists() {
    return Ok(None);
  }

  let content = fs::read_to_string(&state_path)
    .map_err(|e| format!("Failed to read sync state: {}", e))?;
  let parsed: SyncState =
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse sync state JSON: {}", e))?;
  Ok(Some(parsed))
}

#[tauri::command]
pub fn write_sync_commands(
  platform: String,
  mut commands: Vec<SyncCommandPayload>,
) -> Result<String, String> {
  let common_dir = common_files_dir_for_platform(&platform)?;
  let commands_path = common_dir.join(SYNC_COMMANDS_FILE);

  for cmd in commands.iter_mut() {
    if cmd.command_id.as_deref().unwrap_or("").is_empty() {
      cmd.command_id = Some(Uuid::new_v4().to_string());
    }
  }

  let json = serde_json::to_string_pretty(&commands)
    .map_err(|e| format!("Failed to serialize sync commands: {}", e))?;

  safe_overwrite(&commands_path, &json)?;
  Ok(commands_path.to_string_lossy().to_string())
}


mod mt_bridge;
pub mod mql_rust_compiler;
mod mql_compiler;
pub mod headless;

#[cfg(feature = "tauri-app")]
use mt_bridge::MTBridgeState;

// Re-export headless API for CLI
pub use headless::handle_message_headless;

pub use mt_bridge::{
  export_set_file,
  import_set_file,
  export_json_file,
  import_json_file,
  write_text_file,
  export_massive_v19_setfile,
  validate_v19_setfile,
  MTConfig,
  GeneralConfig,
  RiskManagementConfig,
  TimeFiltersConfig,
  TimePrioritySettings,
  SessionConfig,
  NewsFilterConfig,
  EngineConfig,
  GroupConfig,
  LogicConfig,
};

#[cfg(feature = "tauri-app")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(MTBridgeState::new())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      mt_bridge::export_set_file,
      mt_bridge::import_set_file,
      mt_bridge::export_json_file,
      mt_bridge::import_json_file,
      mt_bridge::write_text_file,
      mt_bridge::parse_massive_setfile,
      mt_bridge::list_vault_files,
      mt_bridge::open_vault_folder,
      mt_bridge::save_to_vault,
      mt_bridge::_export_vault_file,
      mt_bridge::_delete_from_vault,
      mt_bridge::get_vault_size,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

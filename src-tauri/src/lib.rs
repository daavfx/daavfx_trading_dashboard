mod mt_bridge;
mod tactical_bridge;
pub mod mql_rust_compiler;
mod mql_compiler;
pub mod headless;

#[cfg(feature = "tauri-app")]
use mt_bridge::MTBridgeState;

// Re-export headless API for CLI
pub use headless::handle_message_headless;

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
      mt_bridge::load_mt_config,
      mt_bridge::save_mt_config,
      mt_bridge::set_mt_path,
      mt_bridge::start_file_watcher,
      mt_bridge::get_default_mt4_path,
      mt_bridge::get_default_mt5_path,
      mt_bridge::export_set_file,
      mt_bridge::export_set_file_to_mt_common_files,
      mt_bridge::export_active_set_file_to_mt_common_files,
      mt_bridge::get_active_set_status,
      mt_bridge::import_set_file,
      mt_bridge::export_json_file,
      mt_bridge::import_json_file,
      mt_bridge::write_text_file,
      mt_bridge::list_vault_files,
      mt_bridge::open_vault_folder,
      mt_bridge::save_to_vault,
      mt_bridge::get_vault_size,
      mt_bridge::get_mt_terminal_root,
      mt_bridge::open_mt_terminal_root,
      mt_bridge::read_recent_terminal_log,
      mt_bridge::initialize_mql_compiler,
      mt_bridge::validate_mql_code,
      mt_bridge::run_precompilation_pipeline,
      mt_bridge::apply_mql_fixes,
      mt_bridge::start_mql_file_watching,
      mt_bridge::get_mql_compiler_status,
      mt_bridge::get_mt4_settings,
      mt_bridge::auto_detect_mt4_paths,
      mt_bridge::configure_mt4_path,
      mt_bridge::test_mt4_connection,
      mt_bridge::open_mt_folder,
      tactical_bridge::get_sync_paths,
      tactical_bridge::read_sync_state,
      tactical_bridge::write_sync_commands,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

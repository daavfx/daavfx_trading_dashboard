mod mt_bridge;
pub mod mql_rust_compiler;
mod mql_compiler;
pub mod headless;
mod chat_neural;
mod chat_commands;
mod chat_preprocessor;
mod trading_transformer;
mod diffusion_refine;

#[cfg(feature = "tauri-app")]
use mt_bridge::MTBridgeState;

use chat_commands::{ChatNeuralState, TransformerState, DiffusionState};

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
    .manage(ChatNeuralState::default())
    .manage(TransformerState::default())
    .manage(DiffusionState::default())
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
      mt_bridge::export_massive_v19_setfile,
      // Chat neural network commands
      chat_commands::train_chat_neural,
      chat_commands::predict_intent,
      chat_commands::learn_correction,
      chat_commands::is_trained,
      // Transformer commands
      chat_commands::train_transformer,
      chat_commands::predict_transformer,
      chat_commands::is_transformer_trained,
      // Diffusion commands
      chat_commands::train_diffusion_pipeline,
      chat_commands::predict_with_diffusion,
      chat_commands::extract_parameter,
      // Chat preprocessor commands
      chat_preprocessor::preprocess_command,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

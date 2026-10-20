pub mod command;
pub mod commands;
pub mod catalog;
pub mod config;
pub mod error;
pub mod help_parser;
pub mod launch;
pub mod locale;
pub mod paths;
pub mod seed;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::get_config,
            commands::save_config,
            commands::system_locale,
            commands::export_config,
            commands::import_config,
            commands::get_catalog,
            commands::build_command,
            commands::launch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

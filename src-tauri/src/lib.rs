pub mod command;
pub mod commands;
pub mod catalog;
pub mod config;
pub mod error;
pub mod folderinfo;
pub mod fstree;
pub mod help_parser;
pub mod launch;
pub mod locale;
pub mod paths;
pub mod secrets;
pub mod project;
pub mod seed;
pub mod skills;
pub mod sessions;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::CatalogCache::default())
        .setup(|_| {
            launch::sweep_stale(&paths::local_dir().join("launch"));
            Ok(())
        })
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
            commands::launch,
            commands::list_dir,
            commands::list_roots,
            commands::folder_info,
            commands::list_sessions,
            commands::secret_set,
            commands::secret_has,
            commands::secret_delete,
            commands::skills_sync,
            commands::skills_list,
            commands::templates_list,
            commands::skills_installed,
            commands::skills_install,
            commands::create_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

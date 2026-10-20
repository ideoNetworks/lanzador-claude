pub mod command;
pub mod commands;
pub mod catalog;
pub mod config;
pub mod error;
pub mod folderinfo;
pub mod fstree;
pub mod integration;
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
        // Must be the first plugin: a second launch forwards its args here and exits.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| integration::handle_args(app, &args)))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::CatalogCache::default())
        .manage(integration::PendingOpen::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event
                && window.label() == integration::MAIN && config::load().close_to_tray
            {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            launch::sweep_stale(&paths::local_dir().join("launch"));
            let handle = app.handle().clone();
            let args: Vec<String> = std::env::args().collect();
            // A fresh process started only to show a toast: no window, no tray, exit afterwards.
            if integration::parse_args(&args).iter().any(|a| matches!(a, integration::Arg::Notify(_))) {
                integration::handle_args(&handle, &args);
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(4));
                    handle.exit(0);
                });
                return Ok(());
            }
            let cfg = config::load_or_init_from(&paths::config_dir(), seed::read_seed()).unwrap_or_else(|_| config::load());
            integration::ensure_autostart(&handle, &cfg);
            let _ = integration::tray::create(&handle);
            integration::shortcut::register_from_config(&handle);
            integration::handle_args(&handle, &args);
            integration::updater::check_on_startup(handle);
            Ok(())
        })
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
            commands::create_project,
            commands::open_vscode,
            commands::open_explorer,
            integration::set_autostart,
            integration::take_pending_open,
            integration::tray::refresh_tray,
            integration::shortcut::set_shortcut,
            integration::explorer::set_explorer_menu,
            integration::notify::notify,
            integration::updater::update_install
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

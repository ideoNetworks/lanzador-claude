//! Windows integration: tray, global shortcut, Explorer menu, notifications, updater, autostart.
pub mod explorer;
pub mod notify;
pub mod shortcut;
pub mod tray;
pub mod updater;

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

use crate::config;
use crate::error::{AppError, AppResult};

/// Recognised command-line arguments.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Arg {
    Open(String),
    Notify(String),
    Minimized,
}

/// Parses `--open <path>`, `--notify <text>` and `--minimized`; everything else (exe path, unknown flags) is ignored.
pub fn parse_args(args: &[String]) -> Vec<Arg> {
    let mut out = Vec::new();
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--open" => {
                if let Some(p) = it.next() {
                    out.push(Arg::Open(p.clone()));
                }
            }
            "--notify" => out.push(Arg::Notify(it.next().cloned().unwrap_or_default())),
            "--minimized" => out.push(Arg::Minimized),
            _ => {}
        }
    }
    out
}

/// Path received through `--open` before the UI was able to listen (taken once by the UI on mount).
#[derive(Default)]
pub struct PendingOpen(pub Mutex<Option<String>>);

#[tauri::command]
pub fn take_pending_open(app: AppHandle) -> Option<String> {
    app.state::<PendingOpen>().0.lock().ok().and_then(|mut g| g.take())
}

pub const MAIN: &str = "main";

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn toggle_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN) {
        if w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false) {
            let _ = w.hide();
        } else {
            show_main(app);
        }
    }
}

/// Applies arguments in a running instance (second launch or startup).
pub fn handle_args(app: &AppHandle, args: &[String]) {
    let parsed = parse_args(args);
    let quiet = parsed.iter().any(|a| matches!(a, Arg::Minimized | Arg::Notify(_)));
    let mut shown = false;
    for a in parsed {
        match a {
            Arg::Open(path) => {
                show_main(app);
                shown = true;
                if let Ok(mut g) = app.state::<PendingOpen>().0.lock() {
                    *g = Some(path.clone());
                }
                let _ = app.emit("open-path", path);
            }
            Arg::Notify(text) => notify::show(app, "Lanzador Claude", &text),
            Arg::Minimized => {}
        }
    }
    // A plain second launch just brings the window forward.
    if !shown && !quiet {
        show_main(app);
    }
}

/// Language used for tray and Explorer menu text: config, else system locale.
pub fn current_lang() -> String {
    config::load().language.unwrap_or_else(crate::locale::detect)
}

/// Enables/disables Windows autostart and persists `config.autostart`.
pub fn apply_autostart(app: &AppHandle, enabled: bool) -> AppResult<()> {
    use tauri_plugin_autostart::ManagerExt;
    let mgr = app.autolaunch();
    let res = if enabled { mgr.enable() } else { mgr.disable() };
    res.map_err(|e| AppError::new("autostart_failed", e.to_string()))?;
    let mut cfg = config::load();
    cfg.autostart = enabled;
    config::save(&cfg)
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> AppResult<()> {
    apply_autostart(&app, enabled)?;
    tray::rebuild(&app);
    Ok(())
}

/// First run with seed Autostart=1: make the OS state match `config.autostart` when it is on.
pub fn ensure_autostart(app: &AppHandle, cfg: &config::AppConfig) {
    use tauri_plugin_autostart::ManagerExt;
    if cfg.autostart && !app.autolaunch().is_enabled().unwrap_or(false) {
        let _ = app.autolaunch().enable();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parse_args_variants() {
        assert_eq!(parse_args(&v(&["app.exe"])), vec![]);
        assert_eq!(parse_args(&v(&["app.exe", "--open", "C:\\a b"])), vec![Arg::Open("C:\\a b".into())]);
        assert_eq!(
            parse_args(&v(&["app.exe", "--notify", "Hola; mundo", "--minimized"])),
            vec![Arg::Notify("Hola; mundo".into()), Arg::Minimized]
        );
        assert_eq!(parse_args(&v(&["--open"])), vec![]);
        assert_eq!(parse_args(&v(&["--notify"])), vec![Arg::Notify(String::new())]);
    }
}

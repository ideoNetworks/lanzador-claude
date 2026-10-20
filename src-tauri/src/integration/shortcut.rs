//! Global shortcut that toggles the main window.
use std::str::FromStr;

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::config;
use crate::error::{AppError, AppResult};

/// Parses a combo such as `Ctrl+Alt+I` (the plugin accepts Ctrl/Alt/Shift/Super + key).
pub fn parse(combo: &str) -> AppResult<Shortcut> {
    Shortcut::from_str(combo.trim()).map_err(|e| AppError::new("shortcut_invalid", e.to_string()))
}

fn register(app: &AppHandle, combo: &str) -> AppResult<()> {
    let sc = parse(combo)?;
    app.global_shortcut()
        .on_shortcut(sc, |app, _, ev| {
            if ev.state() == ShortcutState::Pressed {
                super::toggle_main(app);
            }
        })
        .map_err(|e| AppError::new("shortcut_taken", e.to_string()))
}

/// Registers the configured shortcut at startup; failure is non-fatal.
pub fn register_from_config(app: &AppHandle) {
    let _ = register(app, &config::load().shortcut);
}

#[tauri::command]
pub fn set_shortcut(app: AppHandle, shortcut: String) -> AppResult<()> {
    let mut cfg = config::load();
    let old = cfg.shortcut.clone();
    let gs = app.global_shortcut();
    if let Ok(o) = parse(&old) {
        let _ = gs.unregister(o);
    }
    if let Err(e) = register(&app, &shortcut) {
        let _ = register(&app, &old);
        return Err(if e.code == "shortcut_invalid" { e } else { AppError::new("shortcut_taken", e.message) });
    }
    cfg.shortcut = shortcut;
    super::save_and_notify(&app, &cfg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_combo_parses() {
        assert!(parse("Ctrl+Alt+I").is_ok());
        assert!(parse("Ctrl+Shift+F12").is_ok());
        assert!(parse("not a combo").is_err());
    }
}

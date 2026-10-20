//! Global shortcut that toggles the main window.
use std::str::FromStr;

use tauri::{AppHandle, Emitter, Manager};
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

/// Error reported for a failed startup registration: the combo travels in `message`.
pub fn startup_error(combo: &str, e: AppError) -> AppError {
    let code = if e.code == "shortcut_invalid" { "shortcut_invalid" } else { "shortcut_taken" };
    AppError::new(code, combo.to_string())
}

/// Registers the configured shortcut at startup. Failure is non-fatal but not silent: it is
/// kept for `take_shortcut_error` and announced with `shortcut-failed`.
pub fn register_from_config(app: &AppHandle) {
    let combo = config::load().shortcut;
    if let Err(e) = register(app, &combo) {
        let err = startup_error(&combo, e);
        if let Ok(mut g) = app.state::<super::ShortcutError>().0.lock() {
            *g = Some(err.clone());
        }
        let _ = app.emit("shortcut-failed", err);
    }
}

#[tauri::command]
pub fn set_shortcut(app: AppHandle, shortcut: String) -> AppResult<()> {
    let old = config::load().shortcut;
    let gs = app.global_shortcut();
    // This app registers only this one shortcut. After an import the config already holds the
    // new combo while the previous one is still registered, so clear everything, not just `old`.
    let _ = gs.unregister_all();
    if let Err(e) = register(&app, &shortcut) {
        let _ = register(&app, &old);
        return Err(if e.code == "shortcut_invalid" { e } else { AppError::new("shortcut_taken", e.message) });
    }
    if let Ok(mut g) = app.state::<super::ShortcutError>().0.lock() {
        *g = None;
    }
    super::update_and_notify(&app, |cfg| {
        cfg.shortcut = shortcut;
        Ok(())
    })
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

    #[test]
    fn startup_error_keeps_kind_and_names_the_combo() {
        let e = startup_error("Ctrl+Alt+I", AppError::new("shortcut_taken", "HotKey already registered"));
        assert_eq!((e.code.as_str(), e.message.as_str()), ("shortcut_taken", "Ctrl+Alt+I"));
        let e = startup_error("nope", parse("nope").unwrap_err());
        assert_eq!(e.code, "shortcut_invalid");
    }
}

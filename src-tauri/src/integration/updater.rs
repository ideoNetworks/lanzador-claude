//! Update check / install (tauri-plugin-updater). Failures (offline, no release) are silent.
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::config;
use crate::error::{AppError, AppResult};

#[derive(Clone, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

/// What to do at startup for a given `updates.mode`.
#[derive(Debug, PartialEq, Eq)]
pub enum Action {
    Skip,
    Notify,
    Install,
}

pub fn action_for(mode: &str) -> Action {
    match mode {
        "manual" => Action::Skip,
        "auto" => Action::Install,
        _ => Action::Notify,
    }
}

fn updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, tauri_plugin_updater::Error> {
    let mut b = app.updater_builder();
    let ep = config::load().updates.endpoint.filter(|e| !e.trim().is_empty());
    if let Some(url) = ep.and_then(|e| e.parse().ok()) {
        b = b.endpoints(vec![url])?;
    }
    b.build()
}

/// Startup check, run on the async runtime. Never reports errors.
pub fn check_on_startup(app: AppHandle) {
    let action = action_for(&config::load().updates.mode);
    if action == Action::Skip {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let Ok(u) = updater(&app) else { return };
        let Ok(Some(update)) = u.check().await else { return };
        match action {
            Action::Notify => {
                let info = UpdateInfo { version: update.version.clone(), notes: update.body.clone() };
                if let Ok(mut g) = app.state::<super::PendingUpdate>().0.lock() {
                    *g = Some(info.clone());
                }
                let _ = app.emit("update-available", info);
            }
            Action::Install => {
                if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                    app.restart();
                }
            }
            Action::Skip => {}
        }
    });
}

/// Manual check ("Buscar actualizaciones", any mode): reports the update, never installs it.
#[tauri::command]
pub async fn update_check(app: AppHandle) -> AppResult<Option<UpdateInfo>> {
    let fail = |e: tauri_plugin_updater::Error| AppError::new("update_failed", e.to_string());
    let update = updater(&app).map_err(fail)?.check().await.map_err(fail)?;
    Ok(update.map(|u| UpdateInfo { version: u.version.clone(), notes: u.body.clone() }))
}

/// Downloads, installs and restarts.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> AppResult<()> {
    let fail = |e: tauri_plugin_updater::Error| AppError::new("update_failed", e.to_string());
    let update = updater(&app).map_err(fail)?.check().await.map_err(fail)?;
    let Some(update) = update else { return Err(AppError::new("update_failed", "no update available")) };
    update.download_and_install(|_, _| {}, || {}).await.map_err(fail)?;
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_mode_actions() {
        assert_eq!(action_for("manual"), Action::Skip);
        assert_eq!(action_for("notify"), Action::Notify);
        assert_eq!(action_for("auto"), Action::Install);
        assert_eq!(action_for("???"), Action::Notify);
    }
}

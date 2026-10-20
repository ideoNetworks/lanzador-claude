//! System notifications.
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::error::{AppError, AppResult};

pub fn show(app: &AppHandle, title: &str, body: &str) {
    let _ = try_show(app, title, body);
}

fn try_show(app: &AppHandle, title: &str, body: &str) -> AppResult<()> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| AppError::new("notify_failed", e.to_string()))
}

#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) -> AppResult<()> {
    try_show(&app, &title, &body)
}

//! Tauri command wrappers.
use serde::Serialize;

use crate::config::{self, AppConfig};
use crate::error::{AppError, AppResult};
use crate::{locale, seed};

#[derive(Serialize)]
pub struct Pong {
    pub ok: bool,
    pub version: String,
}

#[tauri::command]
pub fn ping() -> Pong {
    Pong { ok: true, version: env!("CARGO_PKG_VERSION").to_string() }
}

/// First run (no config file): apply installer seed, mark first run done, save.
#[tauri::command]
pub fn get_config() -> AppResult<AppConfig> {
    let first_run = !config::exists();
    let mut cfg = config::load();
    if first_run {
        if let Some(s) = seed::read_seed() {
            seed::apply(&mut cfg, s);
        }
        cfg.first_run_done = true;
        config::save(&cfg)?;
    }
    Ok(cfg)
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> AppResult<()> {
    config::save(&config)
}

#[tauri::command]
pub fn system_locale() -> String {
    locale::detect()
}

#[tauri::command]
pub fn export_config(path: String) -> AppResult<()> {
    let json = serde_json::to_string_pretty(&config::load()).map_err(|e| AppError::new("config", e.to_string()))?;
    std::fs::write(path, json)?;
    Ok(())
}

#[tauri::command]
pub fn import_config(path: String) -> AppResult<AppConfig> {
    let text = std::fs::read_to_string(path)?;
    let cfg: AppConfig = serde_json::from_str(&text).map_err(|e| AppError::new("config_invalid", e.to_string()))?;
    config::save(&cfg)?;
    Ok(cfg)
}

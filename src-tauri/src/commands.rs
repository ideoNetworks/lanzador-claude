//! Tauri command wrappers.
use serde::Serialize;

use crate::config::{self, AppConfig};
use crate::error::{AppError, AppResult};
use crate::catalog::{self, CatalogItem};
use crate::{help_parser, locale, seed};

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

/// Runs `claude --help` (5 s limit, no console window). Tries `claude` directly, then via `cmd /C`.
fn run_claude_help() -> Option<String> {
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    fn attempt(mut cmd: Command) -> Option<String> {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let mut child = cmd
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        // Drain stdout on a thread so a full pipe cannot stall the child.
        let mut out = child.stdout.take()?;
        let reader = std::thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = std::io::Read::read_to_end(&mut out, &mut buf);
            buf
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        let ok = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status.success(),
                Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break false;
                }
            }
        };
        let text = String::from_utf8_lossy(&reader.join().ok()?).into_owned();
        (ok && !text.trim().is_empty()).then_some(text)
    }

    let mut direct = Command::new("claude");
    direct.arg("--help");
    attempt(direct).or_else(|| {
        let mut via_cmd = Command::new("cmd");
        via_cmd.args(["/C", "claude", "--help"]);
        attempt(via_cmd)
    })
}

/// Embedded catalog, plus flags discovered in `claude --help` when `include_help` is set.
/// Any problem running claude falls back to the embedded catalog only.
#[tauri::command]
pub async fn get_catalog(include_help: bool) -> Vec<CatalogItem> {
    let items = catalog::load_embedded();
    if !include_help {
        return items;
    }
    // Blocking process work stays off the UI/main thread.
    let help = tauri::async_runtime::spawn_blocking(run_claude_help).await.ok().flatten();
    match help {
        Some(help) => catalog::merge_help(items, help_parser::parse(&help)),
        None => items,
    }
}

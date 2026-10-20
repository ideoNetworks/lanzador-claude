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

/// First run (missing/recovered config): apply installer seed, mark first run done, save.
#[tauri::command]
pub fn get_config() -> AppResult<AppConfig> {
    config::load_or_init_from(&crate::paths::config_dir(), seed::read_seed())
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

/// Total time allowed for finding and running `claude --help` (both attempts share it).
const HELP_BUDGET: std::time::Duration = std::time::Duration::from_secs(5);

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Kills `child` and everything it spawned (npm shims leave a node grandchild holding the pipe).
fn kill_tree(child: &mut std::process::Child) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/T", "/F", "/PID", &child.id().to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Runs `program args` and returns its stdout if it exits successfully before `deadline`.
/// Never blocks past the deadline: output is read on a detached thread and awaited with a timeout.
fn run_capture(program: &str, args: &[&str], deadline: std::time::Instant) -> Option<String> {
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    let mut cmd = Command::new(program);
    cmd.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().ok()?;
    let mut out = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = std::io::Read::read_to_end(&mut out, &mut buf);
        let _ = tx.send(buf);
    });
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(_)) => return None,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            _ => {
                kill_tree(&mut child);
                return None;
            }
        }
    }
    // The child exited; a surviving grandchild may still hold the pipe, so wait only until the deadline.
    let wait = deadline.saturating_duration_since(Instant::now());
    let buf = rx.recv_timeout(wait).ok()?;
    let text = String::from_utf8_lossy(&buf).into_owned();
    (!text.trim().is_empty()).then_some(text)
}

/// Runs `claude --help` (5 s total, no console window). Tries `claude`, then `cmd /C claude`.
fn run_claude_help() -> Option<String> {
    let deadline = std::time::Instant::now() + HELP_BUDGET;
    run_capture("claude", &["--help"], deadline)
        .or_else(|| run_capture("cmd", &["/C", "claude", "--help"], deadline))
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

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn runner_times_out_and_kills_process_tree() {
        let start = Instant::now();
        let r = run_capture("cmd", &["/C", "ping -n 30 127.0.0.1"], start + Duration::from_secs(1));
        assert!(r.is_none());
        assert!(start.elapsed() < Duration::from_secs(3), "took {:?}", start.elapsed());
    }

    #[test]
    fn runner_captures_output() {
        let r = run_capture("cmd", &["/C", "echo hola"], Instant::now() + Duration::from_secs(5));
        assert!(r.is_some_and(|t| t.contains("hola")));
    }

    #[test]
    fn runner_missing_program_is_none() {
        let r = run_capture("definitely-not-a-program-xyz", &[], Instant::now() + Duration::from_secs(1));
        assert!(r.is_none());
    }
}

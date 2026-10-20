//! Tauri command wrappers.
use serde::Serialize;

use crate::command::{self, LaunchPlan, LaunchRequest};
use crate::config::{self, AppConfig, HistoryEntry};
use crate::error::{AppError, AppResult};
use crate::catalog::{self, CatalogItem};
use crate::{folderinfo, fstree, help_parser, launch, locale, secrets, seed, sessions};

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
pub async fn get_catalog(app: tauri::AppHandle, include_help: bool) -> Vec<CatalogItem> {
    use tauri::Manager;
    let mut items = catalog::load_embedded();
    if include_help {
        // Blocking process work stays off the UI/main thread.
        let help = tauri::async_runtime::spawn_blocking(run_claude_help).await.ok().flatten();
        if let Some(help) = help {
            items = catalog::merge_help(items, help_parser::parse(&help));
        }
    }
    if let Ok(mut cache) = app.state::<CatalogCache>().0.lock() {
        *cache = Some(items.clone());
    }
    items
}

/// Last catalog returned by `get_catalog` (including `--help` flags); previews plan against it.
#[derive(Default)]
pub struct CatalogCache(pub std::sync::Mutex<Option<Vec<CatalogItem>>>);

impl CatalogCache {
    fn items(&self) -> Vec<CatalogItem> {
        self.0.lock().ok().and_then(|g| g.clone()).unwrap_or_else(catalog::load_embedded)
    }
}

/// Resolves the plan for `req` against the cached (merged) catalog, else the embedded one.
/// Previews never read secret values: a placeholder stands in for stored ones (always rendered masked).
fn make_plan(cache: &CatalogCache, req: &LaunchRequest, reveal: bool) -> AppResult<LaunchPlan> {
    let items = cache.items();
    if reveal {
        command::plan(req, &items, &|k| secrets::get(k), command::detect_pwsh())
    } else {
        command::plan(req, &items, &|k| secrets::has(k).then(String::new), command::detect_pwsh())
    }
}

#[tauri::command]
pub fn build_command(cache: tauri::State<CatalogCache>, req: LaunchRequest) -> AppResult<String> {
    Ok(make_plan(&cache, &req, false)?.preview)
}

#[tauri::command]
pub fn launch(cache: tauri::State<CatalogCache>, req: LaunchRequest) -> AppResult<HistoryEntry> {
    let plan = make_plan(&cache, &req, true)?;
    launch::run(&plan)?;
    let mut cfg = config::load();
    let entry = HistoryEntry {
        at: chrono::Local::now().to_rfc3339(),
        path: req.path.clone(),
        profile: cfg.active_profile.clone(),
        target: req.target,
        selection: req.selection.clone(),
        preview: plan.preview,
    };
    config::push_recent(&mut cfg, &req.path);
    config::push_history(&mut cfg, entry.clone());
    config::save(&cfg)?;
    Ok(entry)
}

// Filesystem commands run on the blocking pool so a slow or disconnected network drive
// never stalls the UI thread.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| AppError::new("io", e.to_string()))
}

#[tauri::command]
pub async fn list_dir(path: String, show_hidden: bool) -> AppResult<Vec<fstree::DirEntry>> {
    blocking(move || fstree::list_dir(&path, show_hidden)).await?
}

#[tauri::command]
pub async fn list_roots() -> AppResult<Vec<fstree::DriveEntry>> {
    blocking(fstree::list_roots).await
}

#[tauri::command]
pub async fn folder_info(path: String) -> AppResult<folderinfo::FolderInfo> {
    blocking(move || folderinfo::info(&path)).await
}

#[tauri::command]
pub async fn list_sessions(path: String) -> AppResult<Vec<sessions::SessionSummary>> {
    blocking(move || sessions::list(&path)).await
}

#[tauri::command]
pub fn secret_set(key: String, value: String) -> AppResult<()> {
    secrets::set(&key, &value)
}

#[tauri::command]
pub fn secret_has(key: String) -> bool {
    secrets::has(&key)
}

#[tauri::command]
pub fn secret_delete(key: String) -> AppResult<()> {
    secrets::delete(&key)
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

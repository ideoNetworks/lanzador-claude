//! Tauri command wrappers.
use serde::Serialize;

use crate::command::{self, LaunchPlan, LaunchRequest};
use crate::config::{self, AppConfig, HistoryEntry};
use crate::error::{AppError, AppResult};
use crate::catalog::{self, CatalogItem};
use crate::{folderinfo, fstree, help_parser, launch, locale, project, secrets, seed, sessions, skills};

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
/// An existing but unreadable file is reported as `config_unreadable` (and saves stay refused
/// until a later call reads it fine).
#[tauri::command]
pub fn get_config() -> AppResult<AppConfig> {
    config::load_or_init(seed::read_seed())
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> AppResult<()> {
    config::save(&config)
}

/// Largest image `read_image_data_url` accepts.
pub const MAX_IMAGE_BYTES: u64 = 2 * 1024 * 1024;

/// MIME type for the image extensions branding accepts.
pub fn image_mime(path: &std::path::Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "ico" => "image/x-icon",
        "jpg" | "jpeg" => "image/jpeg",
        _ => return None,
    })
}

/// Reads a branding image into a `data:` URL (svg/png/ico/jpg, at most 2 MB).
pub fn image_data_url(path: &str) -> AppResult<String> {
    let p = std::path::Path::new(path);
    let mime = image_mime(p).ok_or_else(|| AppError::new("image_type", path.to_string()))?;
    let meta = std::fs::metadata(p).map_err(|_| AppError::new("path_not_found", path.to_string()))?;
    if !meta.is_file() {
        return Err(AppError::new("path_not_found", path.to_string()));
    }
    if meta.len() > MAX_IMAGE_BYTES {
        return Err(AppError::new("image_too_large", path.to_string()));
    }
    let bytes = std::fs::read(p)?;
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err(AppError::new("image_too_large", path.to_string()));
    }
    Ok(format!("data:{mime};base64,{}", skills::base64(&bytes)))
}

/// Custom logo for the UI without the asset protocol (the CSP only allows `data:` images).
#[tauri::command]
pub async fn read_image_data_url(path: String) -> AppResult<String> {
    blocking(move || image_data_url(&path)).await?
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
    let mut cfg: AppConfig = serde_json::from_str(&text).map_err(|e| AppError::new("config_invalid", e.to_string()))?;
    config::migrate(&mut cfg);
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

/// Resolves the plan for `req` against `items` (the cached merged catalog, else the embedded one).
/// Previews never read secret values: a placeholder stands in for stored ones (always rendered masked).
fn make_plan(items: &[CatalogItem], req: &LaunchRequest, reveal: bool) -> AppResult<LaunchPlan> {
    if reveal {
        command::plan(req, items, &|k| secrets::get(k), command::detect_pwsh())
    } else {
        command::plan(req, items, &|k| secrets::has(k).then(String::new), command::detect_pwsh())
    }
}

/// Spec anti-goal: never launch something other than what the user saw. `expected` is the
/// preview on screen; a different freshly planned preview means the UI must re-preview first.
pub fn check_preview(expected: Option<&str>, actual: &str) -> AppResult<()> {
    match expected {
        Some(e) if e != actual => Err(AppError::new("preview_stale", actual.to_string())),
        _ => Ok(()),
    }
}

// Path checks, keyring reads and `where pwsh` can take seconds on a disconnected network drive:
// planning and launching run on the blocking pool, never on the UI/main thread.
#[tauri::command]
pub async fn build_command(cache: tauri::State<'_, CatalogCache>, req: LaunchRequest) -> AppResult<String> {
    let items = cache.items();
    blocking(move || make_plan(&items, &req, false).map(|p| p.preview)).await?
}

#[tauri::command]
pub async fn launch(
    app: tauri::AppHandle,
    cache: tauri::State<'_, CatalogCache>,
    req: LaunchRequest,
    expected_preview: Option<String>,
) -> AppResult<HistoryEntry> {
    let items = cache.items();
    blocking(move || {
        // Recents/history must be storable before anything is started.
        config::ensure_readable()?;
        let plan = make_plan(&items, &req, true)?;
        check_preview(expected_preview.as_deref(), &plan.preview)?;
        launch::run(&plan)?;
        let entry = crate::integration::update_and_notify(&app, |cfg| {
            let entry = HistoryEntry {
                at: chrono::Local::now().to_rfc3339(),
                path: req.path.clone(),
                profile: cfg.active_profile.clone(),
                target: req.target,
                selection: req.selection.clone(),
                preview: plan.preview.clone(),
            };
            config::push_recent(cfg, &req.path);
            config::push_history(cfg, entry.clone());
            Ok(entry)
        })?;
        crate::integration::tray::rebuild(&app);
        Ok(entry)
    })
    .await?
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

#[tauri::command]
pub async fn skills_sync() -> AppResult<String> {
    let url = config::load().skills_repo_url;
    let token = secrets::get(skills::TOKEN_KEY);
    blocking(move || skills::sync(&url, token)).await?
}

#[tauri::command]
pub async fn skills_list() -> AppResult<Vec<skills::SkillInfo>> {
    blocking(|| skills::list_synced_in(&skills::repo_dir())).await?
}

#[tauri::command]
pub async fn templates_list() -> Vec<skills::TemplateInfo> {
    blocking(skills::templates).await.unwrap_or_default()
}

#[tauri::command]
pub async fn skills_installed(path: String) -> Vec<skills::InstalledSkill> {
    blocking(move || skills::installed(std::path::Path::new(&path))).await.unwrap_or_default()
}

/// `path = None` installs globally into `~/.claude/skills`; otherwise into `<path>/.claude/skills`.
#[tauri::command]
pub async fn skills_install(path: Option<String>, names: Vec<String>) -> AppResult<()> {
    blocking(move || {
        let dest = match path {
            Some(p) => std::path::PathBuf::from(p).join(".claude").join("skills"),
            None => crate::paths::claude_home().join("skills"),
        };
        skills::install(&names, &dest)
    })
    .await?
}

#[tauri::command]
pub async fn create_project(req: project::NewProjectRequest) -> AppResult<project::CreateResult> {
    let exe = std::env::current_exe()?;
    blocking(move || project::create(&req, &exe)).await?
}

/// Raw `cmd.exe` command line for `code "<path>"`. With `/S`, cmd strips the outer quotes and
/// keeps the inner quoted path literal, so `&`, `;` and spaces in the path stay inert.
/// Trailing separators are trimmed (`\"` would escape the quote); a bare drive becomes `C:\.`.
pub fn vscode_cmdline(path: &str) -> String {
    let clean = path.replace('"', "");
    let trimmed = clean.trim_end_matches(['\\', '/']);
    let arg = if trimmed.len() == 2 && trimmed.ends_with(':') { format!(r"{trimmed}\.") } else { trimmed.to_string() };
    format!(r#"/D /S /C "code "{arg}"""#)
}

/// Raw argument for `explorer.exe`: quoted path without trailing separators (a `\"` would
/// escape the quote); bare drive roots like `C:\` are passed as they are.
pub fn explorer_arg(path: &str) -> String {
    let clean = path.replace('"', "");
    let trimmed = clean.trim_end_matches(['\\', '/']);
    if trimmed.len() <= 2 && trimmed.ends_with(':') {
        return format!("{trimmed}\\");
    }
    format!("\"{trimmed}\"")
}

fn require_dir(path: &str) -> AppResult<()> {
    if std::path::Path::new(path).is_dir() {
        Ok(())
    } else {
        Err(AppError::new("path_not_found", path.to_string()))
    }
}

/// Opens VS Code on `path` through `cmd /C code` (the `code` shim is a batch file), no console window.
#[tauri::command]
pub async fn open_vscode(path: String) -> AppResult<()> {
    blocking(move || {
        require_dir(&path)?;
        let mut cmd = std::process::Command::new("cmd");
        cmd.stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.raw_arg(vscode_cmdline(&path)).creation_flags(CREATE_NO_WINDOW);
        }
        #[cfg(not(windows))]
        cmd.args(["-c", "code \"$0\"", &path]);
        match cmd.status() {
            Ok(s) if s.success() => Ok(()),
            Ok(s) => Err(AppError::new("vscode_not_found", format!("code exited with {s}"))),
            Err(e) => Err(AppError::new("vscode_not_found", e.to_string())),
        }
    })
    .await?
}

/// Opens `path` in Windows Explorer (explorer.exe always exits with 1, so only spawn errors count).
#[tauri::command]
pub async fn open_explorer(path: String) -> AppResult<()> {
    blocking(move || {
        require_dir(&path)?;
        let mut cmd = std::process::Command::new("explorer.exe");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.raw_arg(explorer_arg(&path));
        }
        #[cfg(not(windows))]
        cmd.arg(&path);
        cmd.spawn().map(|_| ()).map_err(|e| AppError::new("launch_failed", e.to_string()))
    })
    .await?
}

/// Options the project keeps in Claude Code's settings files (project, local and user).
#[tauri::command]
pub async fn project_settings(
    cache: tauri::State<'_, CatalogCache>,
    path: String,
) -> AppResult<crate::claude_settings::ProjectSettings> {
    let items = cache.items();
    blocking(move || {
        require_dir(&path)?;
        Ok(crate::claude_settings::read(std::path::Path::new(&path), &crate::paths::claude_home(), &items))
    })
    .await?
}

/// Pins `set` into the project's `settings.local.json` and unpins `remove` (also from the
/// shared `settings.json` when `remove_shared`); returns the settings as now read.
#[tauri::command]
pub async fn project_settings_apply(
    cache: tauri::State<'_, CatalogCache>,
    path: String,
    set: config::Selection,
    remove: Vec<String>,
    remove_shared: bool,
) -> AppResult<crate::claude_settings::ProjectSettings> {
    let items = cache.items();
    blocking(move || {
        require_dir(&path)?;
        let home = crate::paths::claude_home();
        crate::claude_settings::apply(std::path::Path::new(&path), &home, &items, &set, &remove, remove_shared)
    })
    .await?
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

#[cfg(test)]
mod open_tests {
    use super::*;

    #[test]
    fn vscode_cmdline_quotes_path_for_cmd() {
        assert_eq!(vscode_cmdline(r"C:\Proyectos\José's app; v2"), r#"/D /S /C "code "C:\Proyectos\José's app; v2"""#);
        assert_eq!(vscode_cmdline(r"C:\a&b"), r#"/D /S /C "code "C:\a&b"""#);
    }

    #[test]
    fn vscode_cmdline_trims_trailing_separator_but_keeps_drive_roots() {
        // A trailing `\` before the closing quote would be read as an escaped quote.
        assert_eq!(vscode_cmdline(r"C:\Desarrollo\x\"), r#"/D /S /C "code "C:\Desarrollo\x"""#);
        assert_eq!(vscode_cmdline(r"C:\Desarrollo\x/"), r#"/D /S /C "code "C:\Desarrollo\x"""#);
        assert_eq!(vscode_cmdline(r"C:\"), r#"/D /S /C "code "C:\."""#);
        assert_eq!(vscode_cmdline("D:"), r#"/D /S /C "code "D:\."""#);
    }

    #[test]
    fn stale_preview_is_refused() {
        assert!(check_preview(None, "PS C:\\x> claude").is_ok());
        assert!(check_preview(Some("PS C:\\x> claude"), "PS C:\\x> claude").is_ok());
        let e = check_preview(Some("PS C:\\x> claude"), "PS C:\\x> $env:ANTHROPIC_API_KEY = '••••'; claude").unwrap_err();
        assert_eq!(e.code, "preview_stale");
    }

    #[test]
    fn secret_saved_after_preview_makes_it_stale() {
        // The row was previewed while no key was stored; the key is saved before Launch.
        let tmp = tempfile::tempdir().unwrap();
        let req = LaunchRequest {
            path: tmp.path().to_string_lossy().into_owned(),
            target: crate::config::Target::Powershell,
            selection: [("env.ANTHROPIC_API_KEY".to_string(), None)].into_iter().collect(),
            resume_id: None,
        };
        let items = catalog::load_embedded();
        let shown = command::plan_in(tmp.path(), &req, &items, &|_| None, "pwsh").unwrap().preview;
        let now = command::plan_in(tmp.path(), &req, &items, &|_| Some("sk-x".into()), "pwsh").unwrap().preview;
        assert_eq!(check_preview(Some(&shown), &now).unwrap_err().code, "preview_stale");
        assert!(check_preview(Some(&now), &now).is_ok());
    }

    #[test]
    fn image_data_url_rules() {
        let d = tempfile::tempdir().unwrap();
        let svg = d.path().join("logo.SVG");
        std::fs::write(&svg, "<svg/>").unwrap();
        assert_eq!(image_data_url(&svg.to_string_lossy()).unwrap(), "data:image/svg+xml;base64,PHN2Zy8+");
        let png = d.path().join("a.png");
        std::fs::write(&png, [0x89, b'P', b'N', b'G']).unwrap();
        assert!(image_data_url(&png.to_string_lossy()).unwrap().starts_with("data:image/png;base64,"));
        assert_eq!(image_mime(std::path::Path::new("x.ico")), Some("image/x-icon"));
        assert_eq!(image_mime(std::path::Path::new("x.jpg")), Some("image/jpeg"));
        let exe = d.path().join("a.exe");
        std::fs::write(&exe, "MZ").unwrap();
        assert_eq!(image_data_url(&exe.to_string_lossy()).unwrap_err().code, "image_type");
        assert_eq!(image_data_url(&d.path().join("missing.png").to_string_lossy()).unwrap_err().code, "path_not_found");
        let big = d.path().join("big.png");
        std::fs::write(&big, vec![0u8; (MAX_IMAGE_BYTES + 1) as usize]).unwrap();
        assert_eq!(image_data_url(&big.to_string_lossy()).unwrap_err().code, "image_too_large");
    }

    #[test]
    fn explorer_arg_quotes_and_trims_trailing_separator() {
        assert_eq!(explorer_arg(r"C:\Proyectos\José's app; v2"), r#""C:\Proyectos\José's app; v2""#);
        assert_eq!(explorer_arg(r"C:\Desarrollo\x\"), r#""C:\Desarrollo\x""#);
        assert_eq!(explorer_arg(r"C:\"), r"C:\");
    }
}

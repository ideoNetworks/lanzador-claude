//! Script writing and detached process spawning for a [`LaunchPlan`].
use std::path::Path;
use std::time::{Duration, SystemTime};

use crate::command::LaunchPlan;
use crate::error::{AppError, AppResult};

#[cfg(windows)]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

/// Scripts older than this are leftovers (a script deletes itself as soon as it starts).
const STALE_AFTER: Duration = Duration::from_secs(10 * 60);

/// Writes `content`, creating parent dirs. `.ps1` gets a UTF-8 BOM (Windows PowerShell 5.1 needs it
/// for non-ASCII); anything else (the `.sh` for WSL) is written as plain UTF-8, no BOM.
pub fn write_script(file: &Path, content: &str) -> AppResult<()> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut bytes = Vec::with_capacity(content.len() + 3);
    if file.extension().is_some_and(|e| e.eq_ignore_ascii_case("ps1")) {
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    bytes.extend_from_slice(content.as_bytes());
    std::fs::write(file, bytes)?;
    Ok(())
}

/// Deletes `*.ps1` / `*.sh` files in `dir` last modified before `older_than` ago.
pub fn sweep_older_than(dir: &Path, older_than: Duration) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let now = SystemTime::now();
    for e in entries.flatten() {
        let path = e.path();
        let is_script = path.extension().is_some_and(|x| x.eq_ignore_ascii_case("ps1") || x.eq_ignore_ascii_case("sh"));
        let old = e
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| now.duration_since(t).ok())
            .is_some_and(|age| age >= older_than);
        if is_script && old {
            let _ = std::fs::remove_file(&path);
        }
    }
}

/// Startup cleanup of scripts left behind (they may contain secrets).
pub fn sweep_stale(dir: &Path) {
    sweep_older_than(dir, STALE_AFTER);
}

/// Writes the script (if any) and spawns the program detached, without waiting for it.
/// If the spawn fails the script is removed again.
pub fn run(plan: &LaunchPlan) -> AppResult<()> {
    if let (Some(content), Some(path)) = (&plan.script, &plan.script_path) {
        write_script(Path::new(path), content)?;
    }
    let mut cmd = std::process::Command::new(&plan.program);
    cmd.args(&plan.args);
    if plan.program == "wt.exe" {
        // wt.exe opens its own window and receives the folder through `-d`.
        cmd.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    } else {
        // New console: no stdio redirection, or the console would start with dead NUL handles.
        cmd.current_dir(&plan.cwd);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(CREATE_NEW_CONSOLE);
        }
    }
    match cmd.spawn() {
        Ok(_) => Ok(()),
        Err(e) => {
            if let Some(path) = &plan.script_path {
                let _ = std::fs::remove_file(path);
            }
            if e.kind() == std::io::ErrorKind::NotFound && plan.program == "wt.exe" {
                Err(AppError::new("wt_not_found", e.to_string()))
            } else {
                Err(AppError::new("launch_failed", e.to_string()))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan_with(script_path: &Path, program: &str) -> LaunchPlan {
        LaunchPlan {
            preview: String::new(),
            program: program.into(),
            args: vec![],
            script: Some("secret\r\n".into()),
            script_path: Some(script_path.to_string_lossy().into_owned()),
            cwd: script_path.parent().unwrap().to_string_lossy().into_owned(),
        }
    }

    #[test]
    fn sweep_deletes_only_old_scripts() {
        let tmp = tempfile::tempdir().unwrap();
        for n in ["a.ps1", "b.sh", "keep.txt"] {
            std::fs::write(tmp.path().join(n), "x").unwrap();
        }
        // nothing is old yet
        sweep_stale(tmp.path());
        assert!(tmp.path().join("a.ps1").exists());
        // threshold zero: every script is old enough, other files stay
        sweep_older_than(tmp.path(), Duration::ZERO);
        assert!(!tmp.path().join("a.ps1").exists() && !tmp.path().join("b.sh").exists());
        assert!(tmp.path().join("keep.txt").exists());
        sweep_stale(&tmp.path().join("missing")); // no panic
    }

    #[test]
    fn failed_spawn_removes_script() {
        let tmp = tempfile::tempdir().unwrap();
        let script = tmp.path().join("1.ps1");
        let err = run(&plan_with(&script, "definitely-not-a-program-xyz")).unwrap_err();
        assert_eq!(err.code, "launch_failed");
        assert!(!script.exists());
    }
}

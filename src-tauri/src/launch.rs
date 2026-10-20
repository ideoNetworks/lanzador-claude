//! Script writing and detached process spawning for a [`LaunchPlan`].
use std::path::Path;

use crate::command::LaunchPlan;
use crate::error::{AppError, AppResult};

#[cfg(windows)]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

/// Writes `content` as UTF-8 with BOM (Windows PowerShell 5.1 needs it for non-ASCII), creating parent dirs.
pub fn write_script(file: &Path, content: &str) -> AppResult<()> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(content.as_bytes());
    std::fs::write(file, bytes)?;
    Ok(())
}

/// Writes the script (if any) and spawns the program detached, without waiting for it.
pub fn run(plan: &LaunchPlan) -> AppResult<()> {
    if let (Some(content), Some(path)) = (&plan.script, &plan.script_path) {
        write_script(Path::new(path), content)?;
    }
    let mut cmd = std::process::Command::new(&plan.program);
    cmd.args(&plan.args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    if plan.program != "wt.exe" {
        // wt.exe opens its own window and receives the folder through `-d`.
        cmd.current_dir(&plan.cwd);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(CREATE_NEW_CONSOLE);
        }
    }
    match cmd.spawn() {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && plan.program == "wt.exe" => {
            Err(AppError::new("wt_not_found", e.to_string()))
        }
        Err(e) => Err(AppError::new("launch_failed", e.to_string())),
    }
}

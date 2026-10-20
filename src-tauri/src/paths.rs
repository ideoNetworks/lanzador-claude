//! Well-known directories. `LANZADOR_TEST_HOME` redirects everything for tests.
use std::path::PathBuf;

const TEST_HOME: &str = "LANZADOR_TEST_HOME";

fn test_home() -> Option<PathBuf> {
    std::env::var_os(TEST_HOME).filter(|v| !v.is_empty()).map(PathBuf::from)
}

fn env_dir(var: &str, fallback: &[&str]) -> PathBuf {
    if let Some(v) = std::env::var_os(var).filter(|v| !v.is_empty()) {
        return PathBuf::from(v);
    }
    let mut p = std::env::var_os("USERPROFILE").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    p.extend(fallback);
    p
}

/// `%APPDATA%\iDeo\LanzadorClaude`, created if missing.
pub fn config_dir() -> PathBuf {
    let dir = match test_home() {
        Some(h) => h.join("AppData").join("Roaming").join("iDeo").join("LanzadorClaude"),
        None => env_dir("APPDATA", &["AppData", "Roaming"]).join("iDeo").join("LanzadorClaude"),
    };
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// `%LOCALAPPDATA%\iDeo\LanzadorClaude` (not created).
pub fn local_dir() -> PathBuf {
    match test_home() {
        Some(h) => h.join("AppData").join("Local").join("iDeo").join("LanzadorClaude"),
        None => env_dir("LOCALAPPDATA", &["AppData", "Local"]).join("iDeo").join("LanzadorClaude"),
    }
}

/// `%USERPROFILE%\.claude`.
pub fn claude_home() -> PathBuf {
    match test_home() {
        Some(h) => h.join(".claude"),
        None => env_dir("USERPROFILE", &[]).join(".claude"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_honour_test_home() {
        let tmp = tempfile::tempdir().unwrap();
        unsafe { std::env::set_var("LANZADOR_TEST_HOME", tmp.path()) };
        let cfg = config_dir();
        assert!(cfg.starts_with(tmp.path()));
        assert!(cfg.exists());
        assert!(local_dir().starts_with(tmp.path()));
        assert!(claude_home().starts_with(tmp.path()));
        unsafe { std::env::remove_var("LANZADOR_TEST_HOME") };
    }
}

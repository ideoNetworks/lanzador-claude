//! Persistent app configuration (`config.json`).
use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::paths;

const FILE: &str = "config.json";
const MAX_RECENTS: usize = 10;
const MAX_HISTORY: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Target {
    Powershell,
    Wsl,
    /// Default; also the fallback for unknown values.
    #[default]
    #[serde(other)]
    Wt,
}

/// Active option id -> value (`None` for valueless).
pub type Selection = BTreeMap<String, Option<String>>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub builtin: bool,
    pub selection: Selection,
    pub target: Target,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct HistoryEntry {
    pub at: String,
    pub path: String,
    pub profile: Option<String>,
    pub target: Target,
    pub selection: Selection,
    pub preview: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Branding {
    pub logo_path: Option<String>,
    pub tray_icon_path: Option<String>,
    pub primary_color: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Updates {
    pub mode: String,
    pub endpoint: Option<String>,
}

impl Default for Updates {
    fn default() -> Self {
        Self { mode: "notify".into(), endpoint: None }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub version: u32,
    pub language: Option<String>,
    pub theme: String,
    pub root_folder: String,
    pub show_hidden: bool,
    pub nav_collapsed: bool,
    pub close_to_tray: bool,
    pub autostart: bool,
    pub shortcut: String,
    pub default_target: Target,
    pub skills_repo_url: String,
    pub explorer_menu: bool,
    pub updates: Updates,
    pub branding: Branding,
    pub pinned: Selection,
    pub favorites: Vec<String>,
    pub recents: Vec<String>,
    pub profiles: Vec<Profile>,
    pub active_profile: Option<String>,
    pub folder_profiles: BTreeMap<String, String>,
    pub history: Vec<HistoryEntry>,
    pub first_run_done: bool,
}

fn builtin(id: &str, name: &str, sel: &[(&str, &str)]) -> Profile {
    Profile {
        id: id.into(),
        name: name.into(),
        builtin: true,
        selection: sel.iter().map(|(k, v)| (k.to_string(), Some(v.to_string()))).collect(),
        target: Target::Wt,
    }
}

pub fn builtin_profiles() -> Vec<Profile> {
    vec![
        builtin("safe", "Seguro", &[("flag.permission-mode", "manual")]),
        builtin("auto", "Autónomo", &[("flag.permission-mode", "auto")]),
        builtin(
            "ps-opus",
            "PowerShell + Opus",
            &[("env.CLAUDE_CODE_USE_POWERSHELL_TOOL", "1"), ("flag.model", "opus")],
        ),
    ]
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: 1,
            language: None,
            theme: "system".into(),
            root_folder: "C:\\Desarrollo".into(),
            show_hidden: false,
            nav_collapsed: false,
            close_to_tray: true,
            autostart: false,
            shortcut: "Ctrl+Alt+I".into(),
            default_target: Target::Wt,
            skills_repo_url: String::new(),
            explorer_menu: false,
            updates: Updates::default(),
            branding: Branding::default(),
            pinned: Selection::new(),
            favorites: Vec::new(),
            recents: Vec::new(),
            profiles: builtin_profiles(),
            active_profile: None,
            folder_profiles: BTreeMap::new(),
            history: Vec::new(),
            first_run_done: false,
        }
    }
}

/// What `load_outcome_from` found on disk.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoadOutcome {
    /// Parsed fine.
    Ok,
    /// No file yet.
    Missing,
    /// Unparseable file was moved to `config.json.bak`; defaults returned.
    Recovered,
    /// File exists but could not be read (lock, permissions...); defaults returned, file untouched.
    ReadError,
}

/// Load from `dir`. Back up to `config.json.bak` only on a parse error.
pub fn load_outcome_from(dir: &Path) -> (AppConfig, LoadOutcome) {
    let file = dir.join(FILE);
    if !file.exists() {
        return (AppConfig::default(), LoadOutcome::Missing);
    }
    let text = match std::fs::read_to_string(&file) {
        Ok(t) => t,
        Err(e) => {
            eprintln!("config: cannot read {}: {e}", file.display());
            return (AppConfig::default(), LoadOutcome::ReadError);
        }
    };
    match serde_json::from_str::<AppConfig>(&text) {
        Ok(c) => (c, LoadOutcome::Ok),
        Err(e) => {
            eprintln!("config: corrupt {}: {e}", file.display());
            let bak = dir.join(format!("{FILE}.bak"));
            let _ = std::fs::remove_file(&bak);
            if let Err(e) = std::fs::rename(&file, &bak) {
                eprintln!("config: backup to {} failed: {e}", bak.display());
            }
            (AppConfig::default(), LoadOutcome::Recovered)
        }
    }
}

pub fn load_from(dir: &Path) -> AppConfig {
    load_outcome_from(dir).0
}

/// Load and, on first run (missing/recovered, or `first_run_done` unset), apply `seed`,
/// mark first run done and persist. A read error returns defaults without touching the file.
pub fn load_or_init_from(dir: &Path, seed: Option<crate::seed::Seed>) -> AppResult<AppConfig> {
    let (mut cfg, outcome) = load_outcome_from(dir);
    if outcome != LoadOutcome::ReadError && !cfg.first_run_done {
        if let Some(s) = seed {
            crate::seed::apply(&mut cfg, s);
        }
        cfg.first_run_done = true;
        save_to(dir, &cfg)?;
    }
    Ok(cfg)
}

/// Atomic save: write `config.json.tmp`, then rename over `config.json`.
pub fn save_to(dir: &Path, config: &AppConfig) -> AppResult<()> {
    std::fs::create_dir_all(dir)?;
    let json = serde_json::to_string_pretty(config).map_err(|e| AppError::new("config", e.to_string()))?;
    let tmp = dir.join(format!("{FILE}.tmp"));
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, dir.join(FILE))?;
    Ok(())
}

pub fn load() -> AppConfig {
    load_from(&paths::config_dir())
}

pub fn save(config: &AppConfig) -> AppResult<()> {
    save_to(&paths::config_dir(), config)
}

/// Newest first, case-insensitive dedup (keeps newest spelling), capped at 10.
pub fn push_recent(config: &mut AppConfig, path: &str) {
    config.recents.retain(|p| !p.eq_ignore_ascii_case(path));
    config.recents.insert(0, path.to_string());
    config.recents.truncate(MAX_RECENTS);
}

/// Newest first, capped at 200.
pub fn push_history(config: &mut AppConfig, entry: HistoryEntry) {
    config.history.insert(0, entry);
    config.history.truncate(MAX_HISTORY);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_has_builtin_profiles() {
        let c = AppConfig::default();
        let ids: Vec<_> = c.profiles.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["safe", "auto", "ps-opus"]);
        assert!(c.profiles.iter().all(|p| p.builtin && p.target == Target::Wt));
        let ps = &c.profiles[2];
        assert_eq!(ps.selection.get("env.CLAUDE_CODE_USE_POWERSHELL_TOOL"), Some(&Some("1".to_string())));
        assert_eq!(ps.selection.get("flag.model"), Some(&Some("opus".to_string())));
        assert_eq!(c.root_folder, r"C:\Desarrollo");
        assert_eq!(c.shortcut, "Ctrl+Alt+I");
        assert!(c.close_to_tray);
    }

    #[test]
    fn corrupt_file_is_backed_up() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("config.json"), "{not json").unwrap();
        let c = load_from(d.path());
        assert_eq!(c, AppConfig::default());
        assert!(d.path().join("config.json.bak").exists());
        assert!(!d.path().join("config.json").exists());
    }

    #[test]
    fn partial_nested_entries_default() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(
            d.path().join("config.json"),
            r#"{"defaultTarget":"bogus","favorites":["a"],"profiles":[{"id":"x","name":"X","target":"zzz"}],"history":[{"path":"/p"}]}"#,
        )
        .unwrap();
        let (c, outcome) = load_outcome_from(d.path());
        assert_eq!(outcome, LoadOutcome::Ok);
        assert!(!d.path().join("config.json.bak").exists());
        assert_eq!(c.default_target, Target::Wt);
        assert_eq!(c.favorites, ["a"]);
        assert_eq!(c.profiles.len(), 1);
        assert_eq!(c.profiles[0].id, "x");
        assert_eq!(c.profiles[0].target, Target::Wt);
        assert_eq!(c.history.len(), 1);
        assert_eq!(c.history[0].path, "/p");
    }

    #[test]
    fn read_error_does_not_back_up() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir(d.path().join("config.json")).unwrap();
        let (c, outcome) = load_outcome_from(d.path());
        assert_eq!(outcome, LoadOutcome::ReadError);
        assert_eq!(c, AppConfig::default());
        assert!(d.path().join("config.json").is_dir());
        assert!(!d.path().join("config.json.bak").exists());
        // and first-run init must not try to overwrite it
        let _ = load_or_init_from(d.path(), None);
        assert!(d.path().join("config.json").is_dir());
    }

    #[test]
    fn first_run_applies_seed_after_recovery_and_persists() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("config.json"), "{not json").unwrap();
        let seed = crate::seed::Seed { autostart: true, profile: Some("safe".into()), pinned: vec![] };
        let c = load_or_init_from(d.path(), Some(seed)).unwrap();
        assert!(c.first_run_done && c.autostart);
        assert!(d.path().join("config.json.bak").exists());
        // persisted: second load is Ok and no re-seed
        let (c2, outcome) = load_outcome_from(d.path());
        assert_eq!(outcome, LoadOutcome::Ok);
        assert_eq!(c2, c);
        let again = load_or_init_from(d.path(), Some(crate::seed::Seed::default())).unwrap();
        assert!(again.autostart);
    }

    #[test]
    fn missing_fields_default() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("config.json"), r#"{"version":1,"rootFolder":"D:\\X","bogus":3}"#).unwrap();
        let c = load_from(d.path());
        assert_eq!(c.root_folder, r"D:\X");
        assert_eq!(c.shortcut, "Ctrl+Alt+I");
        assert_eq!(c.profiles.len(), 3);
    }

    #[test]
    fn save_roundtrip_is_atomic() {
        let d = tempfile::tempdir().unwrap();
        let c = AppConfig { language: Some("zh".into()), ..AppConfig::default() };
        save_to(d.path(), &c).unwrap();
        assert!(!d.path().join("config.json.tmp").exists());
        assert_eq!(load_from(d.path()), c);
    }

    #[test]
    fn recents_dedup_and_cap() {
        let mut c = AppConfig::default();
        for i in 0..11 {
            push_recent(&mut c, &format!("C:\\p{i}"));
        }
        push_recent(&mut c, r"c:\P5");
        assert_eq!(c.recents.len(), 10);
        assert_eq!(c.recents[0], r"c:\P5");
        assert_eq!(c.recents.iter().filter(|p| p.eq_ignore_ascii_case(r"C:\p5")).count(), 1);
    }

    #[test]
    fn history_cap_200() {
        let mut c = AppConfig::default();
        for i in 0..205 {
            push_history(&mut c, HistoryEntry {
                at: format!("{i}"),
                path: r"C:\x".into(),
                profile: None,
                target: Target::Wt,
                selection: Selection::new(),
                preview: String::new(),
            });
        }
        assert_eq!(c.history.len(), 200);
        assert_eq!(c.history[0].at, "204");
    }
}

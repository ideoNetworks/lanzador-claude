//! Options a project keeps in Claude Code's own settings files: `.claude/settings.json`
//! (shared, in git), `.claude/settings.local.json` (personal) and `~/.claude/settings.json`
//! (user, read only here). Only options with an exact settings equivalent are mapped.
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{Map, Value};

use crate::catalog::CatalogItem;
use crate::config::Selection;
use crate::error::{AppError, AppResult};

pub const LOCAL: &str = "local";
pub const SHARED: &str = "shared";
pub const USER: &str = "user";

/// One mapped option found in the settings files.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingEntry {
    pub id: String,
    pub value: Option<String>,
    /// Files that define it, most specific first (`local`, `shared`, `user`).
    pub sources: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    pub entries: Vec<SettingEntry>,
    /// Catalog ids that have a settings equivalent (the others stay in the launcher).
    pub mappable: Vec<String>,
    /// Files that exist but are not valid JSON objects (never written).
    pub broken: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Sep {
    /// Tool rules: spaces/commas outside parentheses (`Bash(git status) Edit`).
    Tools,
    /// Directories: `;`.
    Semicolon,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Key {
    Scalar(&'static [&'static str]),
    List(&'static [&'static str], Sep),
    Env(String, Option<String>),
}

/// Settings location of a catalog option, if it has one. Secrets are never written to files.
fn key_of(id: &str, catalog: &[CatalogItem]) -> Option<Key> {
    Some(match id {
        "flag.model" => Key::Scalar(&["model"]),
        "flag.permission-mode" => Key::Scalar(&["permissions", "defaultMode"]),
        "flag.allowed-tools" => Key::List(&["permissions", "allow"], Sep::Tools),
        "flag.disallowed-tools" => Key::List(&["permissions", "deny"], Sep::Tools),
        "flag.add-dir" => Key::List(&["permissions", "additionalDirectories"], Sep::Semicolon),
        _ => {
            let item = catalog.iter().find(|c| c.id == id && c.kind == "env")?;
            if item.value.kind == "secret" {
                return None;
            }
            Key::Env(item.key.clone(), item.value.fixed.clone())
        }
    })
}

/// Ids of the catalog that can live in a settings file.
pub fn mappable_ids(catalog: &[CatalogItem]) -> Vec<String> {
    let mut ids: Vec<String> =
        ["flag.model", "flag.permission-mode", "flag.allowed-tools", "flag.disallowed-tools", "flag.add-dir"]
            .iter()
            .map(|s| s.to_string())
            .collect();
    ids.extend(catalog.iter().filter(|c| c.kind == "env" && c.value.kind != "secret").map(|c| c.id.clone()));
    ids
}

/// Splits a tool list on spaces/commas that are not inside parentheses.
pub fn split_tools(s: &str) -> Vec<String> {
    let (mut out, mut cur, mut depth) = (Vec::new(), String::new(), 0i32);
    for c in s.chars() {
        match c {
            '(' => depth += 1,
            ')' => depth = (depth - 1).max(0),
            _ => {}
        }
        if depth == 0 && (c.is_whitespace() || c == ',') {
            if !cur.is_empty() {
                out.push(std::mem::take(&mut cur));
            }
        } else {
            cur.push(c);
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

fn split(s: &str, sep: Sep) -> Vec<String> {
    match sep {
        Sep::Tools => split_tools(s),
        Sep::Semicolon => s.split(';').map(str::trim).filter(|d| !d.is_empty()).map(str::to_string).collect(),
    }
}

fn join(items: &[String], sep: Sep) -> String {
    items.join(if sep == Sep::Tools { " " } else { ";" })
}

fn get<'a>(v: &'a Value, path: &[&str]) -> Option<&'a Value> {
    path.iter().try_fold(v, |cur, k| cur.get(k))
}

fn text_of(v: &Value) -> Option<String> {
    match v {
        Value::String(s) if !s.trim().is_empty() => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn list_of(v: &Value) -> Vec<String> {
    v.as_array().map(|a| a.iter().filter_map(text_of).collect()).unwrap_or_default()
}

/// The value one file gives to `key` (`None`: the file does not define it).
fn read_key(doc: &Value, key: &Key) -> Option<Vec<String>> {
    match key {
        Key::Scalar(path) => {
            let s = text_of(get(doc, path)?)?;
            // Older settings name the default permission mode "default"; the CLI calls it "manual".
            let s = if path.ends_with(&["defaultMode"]) && s == "default" { "manual".to_string() } else { s };
            Some(vec![s])
        }
        Key::List(path, _) => {
            let l = list_of(get(doc, path)?);
            (!l.is_empty()).then_some(l)
        }
        Key::Env(name, _) => text_of(doc.get("env")?.get(name)?).map(|s| vec![s]),
    }
}

/// Paths of the three files: (local, shared, user).
pub fn files(project: &Path, claude_home: &Path) -> [(&'static str, PathBuf); 3] {
    let dir = project.join(".claude");
    [
        (LOCAL, dir.join("settings.local.json")),
        (SHARED, dir.join("settings.json")),
        (USER, claude_home.join("settings.json")),
    ]
}

enum Doc {
    Missing,
    Broken,
    Ok(Value),
}

fn load(path: &Path) -> Doc {
    let Ok(text) = std::fs::read_to_string(path) else {
        return if path.exists() { Doc::Broken } else { Doc::Missing };
    };
    let text = text.trim_start_matches('\u{feff}');
    if text.trim().is_empty() {
        return Doc::Ok(Value::Object(Map::new()));
    }
    match serde_json::from_str::<Value>(text) {
        Ok(v @ Value::Object(_)) => Doc::Ok(v),
        _ => Doc::Broken,
    }
}

/// Mapped options defined by the project's settings files (and the user's).
pub fn read(project: &Path, claude_home: &Path, catalog: &[CatalogItem]) -> ProjectSettings {
    let mut out = ProjectSettings { mappable: mappable_ids(catalog), ..Default::default() };
    let docs: Vec<(&str, Value)> = files(project, claude_home)
        .into_iter()
        .filter_map(|(name, path)| match load(&path) {
            Doc::Ok(v) => Some((name, v)),
            Doc::Broken => {
                out.broken.push(name.to_string());
                None
            }
            Doc::Missing => None,
        })
        .collect();
    for id in mappable_ids(catalog) {
        let Some(key) = key_of(&id, catalog) else { continue };
        let found: Vec<(&str, Vec<String>)> =
            docs.iter().filter_map(|(name, doc)| read_key(doc, &key).map(|v| (*name, v))).collect();
        if found.is_empty() {
            continue;
        }
        let value = match &key {
            // Lists add up across files (user first, project last), like Claude Code does.
            Key::List(_, sep) => {
                let mut all: Vec<String> = Vec::new();
                for (_, l) in found.iter().rev() {
                    for t in l {
                        if !all.contains(t) {
                            all.push(t.clone());
                        }
                    }
                }
                Some(join(&all, *sep))
            }
            Key::Env(_, Some(fixed)) => Some(fixed.clone()),
            _ => found[0].1.first().cloned(),
        };
        out.entries.push(SettingEntry { id, value, sources: found.iter().map(|(n, _)| n.to_string()).collect() });
    }
    out
}

fn obj_at<'a>(doc: &'a mut Value, path: &[&str]) -> &'a mut Map<String, Value> {
    let mut cur = doc;
    for k in path {
        let map = cur.as_object_mut().expect("settings document is an object");
        let next = map.entry(k.to_string()).or_insert_with(|| Value::Object(Map::new()));
        if !next.is_object() {
            *next = Value::Object(Map::new());
        }
        cur = next;
    }
    cur.as_object_mut().expect("object")
}

/// Removes `path` and then any object left empty on the way (`permissions`, `env`).
fn remove_at(doc: &mut Value, path: &[&str]) {
    let Some(m) = doc.as_object_mut() else { return };
    match path {
        [] => {}
        [last] => {
            m.remove(*last);
        }
        [first, rest @ ..] => {
            if let Some(child) = m.get_mut(*first) {
                remove_at(child, rest);
                if child.as_object().is_some_and(Map::is_empty) {
                    m.remove(*first);
                }
            }
        }
    }
}

fn path_of(key: &Key) -> Vec<&str> {
    match key {
        Key::Scalar(p) | Key::List(p, _) => p.to_vec(),
        Key::Env(name, _) => vec!["env", name.as_str()],
    }
}

fn write_doc(path: &Path, doc: &Value) -> AppResult<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut text = serde_json::to_string_pretty(doc).map_err(|e| AppError::new("io", e.to_string()))?;
    text.push('\n');
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// A new `settings.local.json` in a git repository is added to `.gitignore` (Claude Code does
/// the same when it creates the file), so personal options never end up in a commit.
fn ignore_local(project: &Path) {
    if !project.join(".git").exists() {
        return;
    }
    let gi = project.join(".gitignore");
    let text = std::fs::read_to_string(&gi).unwrap_or_default();
    if text.lines().any(|l| l.trim().trim_start_matches('/') == ".claude/settings.local.json") {
        return;
    }
    let sep = if text.is_empty() || text.ends_with('\n') { "" } else { "\n" };
    let _ = std::fs::write(&gi, format!("{text}{sep}.claude/settings.local.json\n"));
}

/// Writes `set` into `settings.local.json` and removes `remove` from it (and from the shared
/// `settings.json` when `remove_shared`). Lists only store what the other files do not already
/// give. A file that is not valid JSON is never touched: `settings_invalid`.
pub fn apply(
    project: &Path,
    claude_home: &Path,
    catalog: &[CatalogItem],
    set: &Selection,
    remove: &[String],
    remove_shared: bool,
) -> AppResult<ProjectSettings> {
    let [(_, local_path), (_, shared_path), (_, user_path)] = files(project, claude_home);
    let open = |p: &Path, name: &str| match load(p) {
        Doc::Ok(v) => Ok(v),
        Doc::Missing => Ok(Value::Object(Map::new())),
        Doc::Broken => Err(AppError::new("settings_invalid", name.to_string())),
    };
    let local_existed = local_path.exists();
    let mut local = open(&local_path, "settings.local.json")?;
    let mut shared = if remove_shared { Some(open(&shared_path, "settings.json")?) } else { None };
    // What the other files already contribute to lists (never duplicated into local).
    let others: Vec<Value> = [&shared_path, &user_path]
        .iter()
        .filter_map(|p| if let Doc::Ok(v) = load(p) { Some(v) } else { None })
        .collect();

    for (id, value) in set {
        let Some(key) = key_of(id, catalog) else { continue };
        let path = path_of(&key);
        let (parent, last) = path.split_at(path.len() - 1);
        let new = match (&key, value.as_deref().map(str::trim).filter(|v| !v.is_empty())) {
            (Key::Env(_, Some(fixed)), _) => Some(Value::String(fixed.clone())),
            (Key::List(lp, sep), Some(v)) => {
                let given: Vec<String> = others.iter().flat_map(|d| get(d, lp).map(list_of).unwrap_or_default()).collect();
                let own: Vec<Value> =
                    split(v, *sep).into_iter().filter(|t| !given.contains(t)).map(Value::String).collect();
                (!own.is_empty()).then_some(Value::Array(own))
            }
            (_, Some(v)) => Some(Value::String(v.to_string())),
            (_, None) => None,
        };
        match new {
            Some(v) => {
                obj_at(&mut local, parent).insert(last[0].to_string(), v);
            }
            None => remove_at(&mut local, &path),
        }
    }
    for id in remove {
        let Some(key) = key_of(id, catalog) else { continue };
        let path = path_of(&key);
        remove_at(&mut local, &path);
        if let Some(doc) = shared.as_mut() {
            remove_at(doc, &path);
        }
    }

    if local_existed || local.as_object().is_some_and(|m| !m.is_empty()) {
        write_doc(&local_path, &local)?;
        if !local_existed {
            ignore_local(project);
        }
    }
    if let Some(doc) = shared.filter(|_| shared_path.exists()) {
        write_doc(&shared_path, &doc)?;
    }
    Ok(read(project, claude_home, catalog))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::load_embedded;

    fn setup() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let d = tempfile::tempdir().unwrap();
        let project = d.path().join("proj");
        let home = d.path().join("home").join(".claude");
        std::fs::create_dir_all(project.join(".claude")).unwrap();
        std::fs::create_dir_all(&home).unwrap();
        (d, project, home)
    }

    fn entry<'a>(s: &'a ProjectSettings, id: &str) -> Option<&'a SettingEntry> {
        s.entries.iter().find(|e| e.id == id)
    }

    #[test]
    fn split_tools_respects_parentheses() {
        assert_eq!(split_tools("Bash(git status) Edit, Read"), ["Bash(git status)", "Edit", "Read"]);
        assert_eq!(split_tools("  "), Vec::<String>::new());
    }

    #[test]
    fn reads_and_merges_the_three_files() {
        let (_d, project, home) = setup();
        let cat = load_embedded();
        std::fs::write(
            project.join(".claude/settings.json"),
            r#"{"model":"opus","permissions":{"allow":["Edit"],"defaultMode":"default"},"hooks":{}}"#,
        )
        .unwrap();
        std::fs::write(
            project.join(".claude/settings.local.json"),
            r#"{"model":"sonnet","permissions":{"allow":["Bash(git status)"]},"env":{"DISABLE_TELEMETRY":"1"}}"#,
        )
        .unwrap();
        std::fs::write(home.join("settings.json"), r#"{"env":{"HTTPS_PROXY":"http://p:8080"}}"#).unwrap();
        let s = read(&project, &home, &cat);
        assert!(s.broken.is_empty());
        let m = entry(&s, "flag.model").unwrap();
        assert_eq!(m.value.as_deref(), Some("sonnet"));
        assert_eq!(m.sources, [LOCAL, SHARED]);
        assert_eq!(entry(&s, "flag.permission-mode").unwrap().value.as_deref(), Some("manual"));
        assert_eq!(entry(&s, "flag.allowed-tools").unwrap().value.as_deref(), Some("Edit Bash(git status)"));
        assert_eq!(entry(&s, "env.DISABLE_TELEMETRY").unwrap().value.as_deref(), Some("1"));
        assert_eq!(entry(&s, "env.HTTPS_PROXY").unwrap().sources, [USER]);
        assert!(entry(&s, "flag.add-dir").is_none());
    }

    #[test]
    fn real_world_rules_with_spaces_round_trip() {
        let (_d, project, home) = setup();
        let cat = load_embedded();
        let local = project.join(".claude/settings.local.json");
        std::fs::write(
            &local,
            r#"{"permissions":{"additionalDirectories":["C:/Desarrollo/_referencia"],
                "deny":["Edit(//c/Desarrollo/_referencia/**)","Bash(git -C C:/Desarrollo/_referencia/x push:*)"]}}"#,
        )
        .unwrap();
        let s = read(&project, &home, &cat);
        let deny = entry(&s, "flag.disallowed-tools").unwrap().value.clone();
        assert_eq!(deny.as_deref(), Some("Edit(//c/Desarrollo/_referencia/**) Bash(git -C C:/Desarrollo/_referencia/x push:*)"));
        assert_eq!(entry(&s, "flag.add-dir").unwrap().value.as_deref(), Some("C:/Desarrollo/_referencia"));
        // Writing the same value back changes nothing.
        let before: Value = serde_json::from_str(&std::fs::read_to_string(&local).unwrap()).unwrap();
        let set: Selection = [("flag.disallowed-tools".to_string(), deny)].into();
        apply(&project, &home, &cat, &set, &[], false).unwrap();
        let after: Value = serde_json::from_str(&std::fs::read_to_string(&local).unwrap()).unwrap();
        assert_eq!(before, after);
    }

    #[test]
    fn broken_file_is_reported_and_never_written() {
        let (_d, project, home) = setup();
        let cat = load_embedded();
        let local = project.join(".claude/settings.local.json");
        std::fs::write(&local, "{ not json").unwrap();
        let s = read(&project, &home, &cat);
        assert_eq!(s.broken, [LOCAL]);
        let set: Selection = [("flag.model".to_string(), Some("opus".to_string()))].into();
        let e = apply(&project, &home, &cat, &set, &[], false).unwrap_err();
        assert_eq!(e.code, "settings_invalid");
        assert_eq!(std::fs::read_to_string(&local).unwrap(), "{ not json");
    }

    #[test]
    fn apply_writes_local_and_keeps_other_keys() {
        let (_d, project, home) = setup();
        let cat = load_embedded();
        let local = project.join(".claude/settings.local.json");
        std::fs::write(&local, r#"{"zeta":1,"permissions":{"allow":["Read"]},"alpha":true}"#).unwrap();
        std::fs::write(project.join(".claude/settings.json"), r#"{"permissions":{"allow":["Edit"]}}"#).unwrap();
        let set: Selection = [
            ("flag.model".to_string(), Some("opus".to_string())),
            ("flag.allowed-tools".to_string(), Some("Edit Read Bash(npm test)".to_string())),
            ("env.CLAUDE_CODE_USE_POWERSHELL_TOOL".to_string(), None),
            ("env.ANTHROPIC_API_KEY".to_string(), Some("sk-x".to_string())),
        ]
        .into();
        let s = apply(&project, &home, &cat, &set, &[], false).unwrap();
        let doc: Value = serde_json::from_str(&std::fs::read_to_string(&local).unwrap()).unwrap();
        let keys: Vec<&String> = doc.as_object().unwrap().keys().collect();
        assert_eq!(keys, ["zeta", "permissions", "alpha", "env", "model"], "order and unrelated keys kept");
        assert_eq!(doc["permissions"]["allow"], serde_json::json!(["Read", "Bash(npm test)"]), "shared Edit not copied");
        assert_eq!(doc["env"], serde_json::json!({"CLAUDE_CODE_USE_POWERSHELL_TOOL": "1"}));
        assert!(!std::fs::read_to_string(&local).unwrap().contains("sk-x"), "secrets never written");
        assert_eq!(entry(&s, "flag.model").unwrap().value.as_deref(), Some("opus"));
    }

    #[test]
    fn remove_prunes_and_touches_shared_only_when_asked() {
        let (_d, project, home) = setup();
        let cat = load_embedded();
        let local = project.join(".claude/settings.local.json");
        let shared = project.join(".claude/settings.json");
        std::fs::write(&local, r#"{"permissions":{"defaultMode":"plan"},"env":{"DISABLE_TELEMETRY":"1"}}"#).unwrap();
        std::fs::write(&shared, r#"{"permissions":{"defaultMode":"auto"},"hooks":{"a":1}}"#).unwrap();
        let ids = ["flag.permission-mode".to_string(), "env.DISABLE_TELEMETRY".to_string()];
        let s = apply(&project, &home, &cat, &Selection::new(), &ids, false).unwrap();
        assert_eq!(std::fs::read_to_string(&local).unwrap().trim(), "{}");
        assert_eq!(entry(&s, "flag.permission-mode").unwrap().sources, [SHARED]);
        let s = apply(&project, &home, &cat, &Selection::new(), &ids, true).unwrap();
        assert!(entry(&s, "flag.permission-mode").is_none());
        let doc: Value = serde_json::from_str(&std::fs::read_to_string(&shared).unwrap()).unwrap();
        assert_eq!(doc, serde_json::json!({"hooks":{"a":1}}));
    }

    #[test]
    fn new_local_file_is_git_ignored_in_repos() {
        let (_d, project, home) = setup();
        let cat = load_embedded();
        std::fs::create_dir(project.join(".git")).unwrap();
        std::fs::write(project.join(".gitignore"), "node_modules").unwrap();
        let set: Selection = [("flag.model".to_string(), Some("haiku".to_string()))].into();
        apply(&project, &home, &cat, &set, &[], false).unwrap();
        assert_eq!(std::fs::read_to_string(project.join(".gitignore")).unwrap(), "node_modules\n.claude/settings.local.json\n");
        apply(&project, &home, &cat, &set, &[], false).unwrap();
        assert_eq!(std::fs::read_to_string(project.join(".gitignore")).unwrap().matches("settings.local").count(), 1);
    }

    #[test]
    fn nothing_to_write_creates_no_file() {
        let (_d, project, home) = setup();
        let cat = load_embedded();
        apply(&project, &home, &cat, &Selection::new(), &["flag.model".to_string()], false).unwrap();
        assert!(!project.join(".claude/settings.local.json").exists());
    }
}

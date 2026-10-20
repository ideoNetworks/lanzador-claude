//! New project creation: folder, CLAUDE.md, skills, .gitignore, git init, notify hook.
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::error::{AppError, AppResult};
use crate::skills;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewProjectRequest {
    pub parent: String,
    pub name: String,
    pub template: Option<String>,
    pub description: String,
    pub stack: String,
    pub skills: Vec<String>,
    /// `"project"` or `"global"`.
    pub skills_scope: String,
    pub git_init: bool,
    pub gitignore: bool,
    pub notify_hook: bool,
}

/// `warnings` entries have the form `"<code>: <detail>"` so the UI can localize by code.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateResult {
    pub path: String,
    pub warnings: Vec<String>,
}

const GITIGNORE: &str = "node_modules/\ntarget/\ndist/\n.env\n.superpowers/\n";
const RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4",
    "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

fn validate_name(name: &str) -> AppResult<()> {
    let bad = name.is_empty()
        || name == "."
        || name == ".."
        || name.ends_with(['.', ' '])
        || name.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
        || RESERVED.iter().any(|r| name.split('.').next().is_some_and(|stem| stem.eq_ignore_ascii_case(r)));
    if bad {
        Err(AppError::new("invalid_name", format!("invalid project name: {name:?}")))
    } else {
        Ok(())
    }
}

pub fn notify_message(name: &str, lang: &str) -> String {
    match lang {
        "es" => format!("{name}: Claude ha terminado"),
        "zh" => format!("{name}: Claude 已完成"),
        _ => format!("{name}: Claude has finished"),
    }
}

/// Adds a Stop hook running `command` to a settings document, keeping everything else.
pub fn merge_hook(existing: Option<Value>, command: &str) -> Value {
    let mut root = match existing {
        Some(v @ Value::Object(_)) => v,
        _ => json!({}),
    };
    let entry = json!({"hooks": [{"type": "command", "command": command}]});
    let obj = root.as_object_mut().expect("object");
    let hooks = obj.entry("hooks").or_insert_with(|| json!({}));
    if !hooks.is_object() {
        *hooks = json!({});
    }
    let stop = hooks.as_object_mut().expect("object").entry("Stop").or_insert_with(|| json!([]));
    if !stop.is_array() {
        *stop = json!([]);
    }
    let arr = stop.as_array_mut().expect("array");
    if !arr.contains(&entry) {
        arr.push(entry);
    }
    root
}

fn render(template: &str, req: &NewProjectRequest, name: &str) -> String {
    template
        .replace("{{name}}", name)
        .replace("{{description}}", &req.description)
        .replace("{{stack}}", &req.stack)
        .replace("{{date}}", &chrono::Local::now().format("%Y-%m-%d").to_string())
}

fn warn(code: &str, e: &AppError) -> String {
    format!("{code}: {}", e.message)
}

pub fn create(req: &NewProjectRequest, exe_path: &Path) -> AppResult<CreateResult> {
    let lang = crate::config::load().language.unwrap_or_else(crate::locale::detect);
    create_in(req, exe_path, &crate::paths::claude_home(), &skills::repo_dir(), "git", &lang)
}

pub fn create_in(req: &NewProjectRequest, exe_path: &Path, claude_home: &Path, repo: &Path, git: &str, lang: &str) -> AppResult<CreateResult> {
    let name = req.name.trim();
    validate_name(name)?;
    let parent = PathBuf::from(&req.parent);
    if !parent.is_dir() {
        return Err(AppError::new("parent_missing", req.parent.clone()));
    }
    let mut warnings = Vec::new();

    // Resolve the template before touching the disk so a bad id leaves nothing behind.
    let template_text = match req.template.as_deref().filter(|t| !t.is_empty() && *t != "default") {
        None => skills::DEFAULT_TEMPLATE.to_string(),
        Some(id) => {
            if !skills::valid_segment(id) {
                return Err(AppError::new("invalid_name", format!("invalid template id: {id:?}")));
            }
            match fs::read_to_string(repo.join("templates").join("claude-md").join(format!("{id}.md"))) {
                Ok(t) => t,
                Err(e) => {
                    warnings.push(format!("template_not_found: {id} ({e})"));
                    skills::DEFAULT_TEMPLATE.to_string()
                }
            }
        }
    };

    let dir = parent.join(name);
    if dir.exists() {
        return Err(AppError::new("already_exists", dir.to_string_lossy().to_string()));
    }
    fs::create_dir(&dir)?;
    fs::write(dir.join("CLAUDE.md"), render(&template_text, req, name))?;

    if !req.skills.is_empty() {
        let dest = if req.skills_scope == "global" { claude_home.join("skills") } else { dir.join(".claude").join("skills") };
        if let Err(e) = skills::install_in(&req.skills, &dest, repo) {
            warnings.push(warn(&e.code, &e));
        }
    }

    if req.gitignore
        && let Err(e) = fs::write(dir.join(".gitignore"), GITIGNORE)
    {
        warnings.push(format!("io: .gitignore: {e}"));
    }

    if req.git_init
        && let Err(e) = skills::run_git(git, ["-C".as_ref(), dir.as_os_str(), "init".as_ref(), "-b".as_ref(), "main".as_ref()], None)
    {
        warnings.push(warn(&e.code, &e));
    }

    if req.notify_hook
        && let Err(e) = write_hook(&dir, exe_path, name, lang)
    {
        warnings.push(warn(&e.code, &e));
    }

    Ok(CreateResult { path: dir.to_string_lossy().to_string(), warnings })
}

fn write_hook(dir: &Path, exe_path: &Path, name: &str, lang: &str) -> AppResult<()> {
    let command = format!("\"{}\" --notify \"{}\"", exe_path.display(), notify_message(name, lang));
    let file = dir.join(".claude").join("settings.json");
    fs::create_dir_all(dir.join(".claude"))?;
    let existing = fs::read_to_string(&file).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok());
    let doc = merge_hook(existing, &command);
    let text = serde_json::to_string_pretty(&doc).map_err(|e| AppError::new("io", e.to_string()))?;
    fs::write(file, text)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    fn req(parent: &Path, name: &str) -> NewProjectRequest {
        NewProjectRequest {
            parent: parent.to_string_lossy().to_string(),
            name: name.into(),
            template: None,
            description: "A thing".into(),
            stack: "Rust".into(),
            skills: vec![],
            skills_scope: "project".into(),
            git_init: false,
            gitignore: false,
            notify_hook: false,
        }
    }

    fn run(r: &NewProjectRequest, tmp: &Path, git: &str, lang: &str) -> AppResult<CreateResult> {
        create_in(r, Path::new("C:\\Apps\\lanzador-claude.exe"), &tmp.join("home"), &tmp.join("repo"), git, lang)
    }

    #[test]
    fn create_renders_template() {
        let tmp = tempfile::tempdir().unwrap();
        let out = run(&req(tmp.path(), "demo"), tmp.path(), "git", "en").unwrap();
        assert!(out.warnings.is_empty());
        let md = fs::read_to_string(Path::new(&out.path).join("CLAUDE.md")).unwrap();
        assert!(md.contains("# demo"));
        assert!(md.contains("A thing"));
        assert!(md.contains("Rust"));
        assert!(md.contains(&chrono::Local::now().format("%Y-%m-%d").to_string()));
        assert!(!md.contains("{{"));
    }

    #[test]
    fn create_uses_repo_template_and_rejects_traversal() {
        let tmp = tempfile::tempdir().unwrap();
        let tdir = tmp.path().join("repo").join("templates").join("claude-md");
        fs::create_dir_all(&tdir).unwrap();
        fs::write(tdir.join("web.md"), "WEB {{name}}").unwrap();
        let mut r = req(tmp.path(), "w1");
        r.template = Some("web".into());
        let out = run(&r, tmp.path(), "git", "en").unwrap();
        assert_eq!(fs::read_to_string(Path::new(&out.path).join("CLAUDE.md")).unwrap(), "WEB w1");
        let mut r = req(tmp.path(), "w2");
        r.template = Some("..\\..\\x".into());
        assert_eq!(run(&r, tmp.path(), "git", "en").unwrap_err().code, "invalid_name");
        assert!(!tmp.path().join("w2").exists());
    }

    #[test]
    fn create_rejects_bad_names() {
        let tmp = tempfile::tempdir().unwrap();
        for bad in ["", "  ", "a/b", "a\\b", "a:b", "a*b", "a?b", "a\"b", "a<b", "a>b", "a|b", ".", "..", "x.", "con", "NUL"] {
            let e = run(&req(tmp.path(), bad), tmp.path(), "git", "en").unwrap_err();
            assert_eq!(e.code, "invalid_name", "{bad:?}");
        }
        run(&req(tmp.path(), "ok"), tmp.path(), "git", "en").unwrap();
        assert_eq!(run(&req(tmp.path(), "ok"), tmp.path(), "git", "en").unwrap_err().code, "already_exists");
        let r = req(&tmp.path().join("missing"), "z");
        assert_eq!(run(&r, tmp.path(), "git", "en").unwrap_err().code, "parent_missing");
    }

    #[test]
    fn create_without_git_still_ok() {
        let tmp = tempfile::tempdir().unwrap();
        let mut r = req(tmp.path(), "nogit");
        r.git_init = true;
        r.gitignore = true;
        let out = run(&r, tmp.path(), "git-does-not-exist-xyz", "en").unwrap();
        assert!(Path::new(&out.path).join("CLAUDE.md").exists());
        assert!(Path::new(&out.path).join(".gitignore").exists());
        assert_eq!(out.warnings.len(), 1);
        assert!(out.warnings[0].starts_with("git_missing"), "{:?}", out.warnings);
    }

    #[test]
    fn create_git_init_and_gitignore() {
        if std::process::Command::new("git").arg("--version").output().is_err() {
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let mut r = req(tmp.path(), "withgit");
        r.git_init = true;
        r.gitignore = true;
        let out = run(&r, tmp.path(), "git", "en").unwrap();
        assert!(out.warnings.is_empty(), "{:?}", out.warnings);
        assert!(Path::new(&out.path).join(".git").exists());
        let gi = fs::read_to_string(Path::new(&out.path).join(".gitignore")).unwrap();
        for l in ["node_modules/", "target/", "dist/", ".env", ".superpowers/"] {
            assert!(gi.lines().any(|x| x == l), "{l}");
        }
    }

    #[test]
    fn skills_failure_is_a_warning() {
        let tmp = tempfile::tempdir().unwrap();
        let mut r = req(tmp.path(), "sk");
        r.skills = vec!["ghost".into()];
        let out = run(&r, tmp.path(), "git", "en").unwrap();
        assert!(Path::new(&out.path).join("CLAUDE.md").exists());
        assert_eq!(out.warnings.len(), 1);
        assert!(out.warnings[0].starts_with("skill_not_found"), "{:?}", out.warnings);
    }

    #[test]
    fn skills_install_to_project_and_global() {
        let tmp = tempfile::tempdir().unwrap();
        let sdir = tmp.path().join("repo").join("skills").join("alpha");
        fs::create_dir_all(&sdir).unwrap();
        fs::write(sdir.join("SKILL.md"), "---\ndescription: A\n---\n").unwrap();
        let mut r = req(tmp.path(), "p1");
        r.skills = vec!["alpha".into()];
        let out = run(&r, tmp.path(), "git", "en").unwrap();
        assert!(Path::new(&out.path).join(".claude").join("skills").join("alpha").join("SKILL.md").exists());
        let mut r = req(tmp.path(), "p2");
        r.skills = vec!["alpha".into()];
        r.skills_scope = "global".into();
        run(&r, tmp.path(), "git", "en").unwrap();
        assert!(tmp.path().join("home").join("skills").join("alpha").join("SKILL.md").exists());
    }

    #[test]
    fn notify_hook_written() {
        let tmp = tempfile::tempdir().unwrap();
        let mut r = req(tmp.path(), "José's app; v2");
        r.notify_hook = true;
        let exe = Path::new("C:\\Program Files\\Lanzador \"Claude\"\\lanzador-claude.exe");
        let out = create_in(&r, exe, &tmp.path().join("home"), &tmp.path().join("repo"), "git", "es").unwrap();
        let text = fs::read_to_string(Path::new(&out.path).join(".claude").join("settings.json")).unwrap();
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        let cmd = v["hooks"]["Stop"][0]["hooks"][0]["command"].as_str().unwrap();
        assert_eq!(v["hooks"]["Stop"][0]["hooks"][0]["type"], "command");
        assert_eq!(cmd, format!("\"{}\" --notify \"José's app; v2: Claude ha terminado\"", exe.display()));
    }

    #[test]
    fn notify_message_is_localized_and_hook_merges() {
        assert_eq!(notify_message("p", "en"), "p: Claude has finished");
        assert_eq!(notify_message("p", "zh"), "p: Claude 已完成");
        assert_eq!(notify_message("p", "fr"), "p: Claude has finished");
        let existing: serde_json::Value =
            serde_json::json!({"model":"x","hooks":{"Stop":[{"hooks":[{"type":"command","command":"a"}]}],"Other":[]}});
        let m = merge_hook(Some(existing), "cmd");
        assert_eq!(m["model"], "x");
        assert_eq!(m["hooks"]["Stop"].as_array().unwrap().len(), 2);
        assert!(m["hooks"]["Other"].is_array());
        let again = merge_hook(Some(m), "cmd");
        assert_eq!(again["hooks"]["Stop"].as_array().unwrap().len(), 2);
    }
}

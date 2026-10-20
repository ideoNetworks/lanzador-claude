//! Skills repository: sync with `git`, list skills/templates, install into projects.
use std::ffi::{OsStr, OsString};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};
use crate::paths;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub const DEFAULT_TEMPLATE: &str = include_str!("../resources/claude-md-default.md");
pub const TOKEN_KEY: &str = "SKILLS_REPO_TOKEN";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkill {
    pub name: String,
    pub hash: String,
    pub update_available: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInfo {
    pub id: String,
    pub name: String,
}

/// `%APPDATA%\iDeo\LanzadorClaude\skills-repo`.
pub fn repo_dir() -> PathBuf {
    paths::config_dir().join("skills-repo")
}

// ---- git plumbing -------------------------------------------------------------------------

pub(crate) fn base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in data.chunks(3) {
        let n = (u32::from(chunk[0]) << 16) | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8) | u32::from(*chunk.get(2).unwrap_or(&0));
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(T[((n >> (18 - 6 * i)) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

fn auth_header_value(token: &str) -> String {
    format!("Authorization: Basic {}", base64(format!("x-access-token:{token}").as_bytes()))
}

/// Environment for a git process that must authenticate. The token never goes in argv
/// (it would leak into the reflog and the process list).
pub(crate) fn auth_env(token: Option<&str>) -> Vec<(String, String)> {
    match token.filter(|t| !t.is_empty()) {
        Some(t) => vec![
            ("GIT_CONFIG_COUNT".into(), "1".into()),
            ("GIT_CONFIG_KEY_0".into(), "http.extraHeader".into()),
            ("GIT_CONFIG_VALUE_0".into(), auth_header_value(t)),
        ],
        None => Vec::new(),
    }
}

pub(crate) fn clone_args(url: &str, dest: &Path) -> Vec<OsString> {
    vec!["clone".into(), "--depth".into(), "1".into(), url.into(), dest.as_os_str().to_os_string()]
}

pub(crate) fn pull_args(repo: &Path, url: &str) -> Vec<OsString> {
    vec!["-C".into(), repo.as_os_str().to_os_string(), "pull".into(), "--ff-only".into(), url.into()]
}

/// Removes the token (and its header form) from text that may reach the UI or logs.
pub(crate) fn scrub(text: &str, token: Option<&str>) -> String {
    let mut out = text.to_string();
    if let Some(t) = token.filter(|t| !t.is_empty()) {
        let b64 = base64(format!("x-access-token:{t}").as_bytes());
        out = out.replace(&b64, "••••").replace(t, "••••");
    }
    out
}

fn git_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    cmd.env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Runs git and returns stdout. `secret` is scrubbed from any error message.
pub(crate) fn run_git<I, S>(program: &str, args: I, secret: Option<&str>) -> AppResult<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run_git_env(program, args, &[], secret)
}

pub(crate) fn run_git_env<I, S>(program: &str, args: I, envs: &[(String, String)], secret: Option<&str>) -> AppResult<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let out = git_command(program).args(args).envs(envs.iter().map(|(k, v)| (k, v))).output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::new("git_missing", "git was not found on PATH")
        } else {
            AppError::new("git_failed", scrub(&e.to_string(), secret))
        }
    })?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr);
        Err(AppError::new("git_failed", scrub(err.trim(), secret)))
    }
}

/// Clones or fast-forwards the skills repository. Returns `"cloned"` or `"updated"`.
/// The token travels only in the git process environment (`GIT_CONFIG_*` http.extraHeader),
/// never in argv or the stored remote, which is always token-free.
pub fn sync(url: &str, token: Option<String>) -> AppResult<String> {
    sync_in(&repo_dir(), url, token.as_deref(), "git")
}

pub fn sync_in(repo: &Path, url: &str, token: Option<&str>, git: &str) -> AppResult<String> {
    let url = url.trim();
    if url.is_empty() {
        return Err(AppError::new("repo_url_empty", "no skills repository URL configured"));
    }
    let envs = auth_env(token);
    if repo.join(".git").exists() {
        // A changed URL means a different repository: re-clone instead of pulling into the old one.
        let remote = run_git(git, [OsStr::new("-C"), repo.as_os_str(), OsStr::new("remote"), OsStr::new("get-url"), OsStr::new("origin")], token)
            .unwrap_or_default();
        if remote == url {
            run_git_env(git, pull_args(repo, url), &envs, token)?;
            return Ok("updated".into());
        }
    }
    clone_fresh(repo, url, &envs, token, git)?;
    Ok("cloned".into())
}

/// Clones next to the cache dir and swaps it in, so a failure never destroys the existing cache.
fn clone_fresh(repo: &Path, url: &str, envs: &[(String, String)], token: Option<&str>, git: &str) -> AppResult<()> {
    let name = repo.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "skills-repo".into());
    let tmp = repo.with_file_name(format!("{name}.new"));
    let _ = fs::remove_dir_all(&tmp);
    if let Some(parent) = tmp.parent() {
        fs::create_dir_all(parent)?;
    }
    let result = run_git_env(git, clone_args(url, &tmp), envs, token).and_then(|_| {
        run_git(git, [OsStr::new("-C"), tmp.as_os_str(), OsStr::new("remote"), OsStr::new("set-url"), OsStr::new("origin"), OsStr::new(url)], token)
    });
    if let Err(e) = result {
        let _ = fs::remove_dir_all(&tmp);
        return Err(e);
    }
    let _ = fs::remove_dir_all(repo);
    fs::rename(&tmp, repo)?;
    Ok(())
}

// ---- listing ------------------------------------------------------------------------------

fn description_of(skill_md: &str) -> String {
    let mut lines = skill_md.lines();
    if lines.next().map(str::trim) != Some("---") {
        return String::new();
    }
    for line in lines {
        let line = line.trim();
        if line == "---" {
            break;
        }
        if let Some(v) = line.strip_prefix("description:") {
            let v = v.trim();
            let unq = v
                .strip_prefix('"').and_then(|s| s.strip_suffix('"'))
                .or_else(|| v.strip_prefix('\'').and_then(|s| s.strip_suffix('\'')))
                .unwrap_or(v);
            return unq.trim().to_string();
        }
    }
    String::new()
}

fn sorted_subdirs(dir: &Path) -> Vec<(String, PathBuf)> {
    let mut v: Vec<(String, PathBuf)> = fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                .map(|e| (e.file_name().to_string_lossy().to_string(), e.path()))
                .collect()
        })
        .unwrap_or_default();
    v.sort_by(|a, b| a.0.cmp(&b.0));
    v
}

pub fn list() -> Vec<SkillInfo> {
    list_in(&repo_dir())
}

pub fn list_in(repo: &Path) -> Vec<SkillInfo> {
    sorted_subdirs(&repo.join("skills"))
        .into_iter()
        .filter_map(|(name, dir)| {
            let md = fs::read_to_string(dir.join("SKILL.md")).ok()?;
            Some(SkillInfo { description: description_of(&md), hash: hash_dir(&dir), name })
        })
        .collect()
}

pub fn templates() -> Vec<TemplateInfo> {
    templates_in(&repo_dir())
}

pub fn templates_in(repo: &Path) -> Vec<TemplateInfo> {
    let mut v = vec![TemplateInfo { id: "default".into(), name: "default".into() }];
    let mut extra: Vec<String> = fs::read_dir(repo.join("templates").join("claude-md"))
        .map(|rd| {
            rd.flatten()
                .map(|e| e.path())
                .filter(|p| p.is_file() && p.extension().map(|x| x == "md").unwrap_or(false))
                .filter_map(|p| p.file_stem().map(|s| s.to_string_lossy().to_string()))
                .filter(|id| id != "default")
                .collect()
        })
        .unwrap_or_default();
    extra.sort();
    v.extend(extra.into_iter().map(|id| TemplateInfo { name: id.clone(), id }));
    v
}

// ---- hashing / copying ----------------------------------------------------------------------

fn collect_files(base: &Path, dir: &Path, out: &mut Vec<String>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let Ok(t) = e.file_type() else { continue };
        let p = e.path();
        if t.is_symlink() || e.file_name() == ".git" {
            continue;
        }
        if t.is_dir() {
            collect_files(base, &p, out);
        } else if let Ok(rel) = p.strip_prefix(base) {
            out.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
}

/// sha256 over sorted relative paths + contents; first 16 hex chars.
pub fn hash_dir(dir: &Path) -> String {
    let mut files = Vec::new();
    collect_files(dir, dir, &mut files);
    files.sort();
    let mut h = Sha256::new();
    for rel in &files {
        h.update(rel.as_bytes());
        h.update([0]);
        h.update(fs::read(dir.join(rel)).unwrap_or_default());
        h.update([0]);
    }
    h.finalize().iter().take(8).map(|b| format!("{b:02x}")).collect()
}

pub(crate) fn copy_dir(from: &Path, to: &Path) -> AppResult<()> {
    fs::create_dir_all(to)?;
    for e in fs::read_dir(from)?.flatten() {
        let t = e.file_type()?;
        if t.is_symlink() || e.file_name() == ".git" {
            continue;
        }
        let dest = to.join(e.file_name());
        if t.is_dir() {
            copy_dir(&e.path(), &dest)?;
        } else {
            fs::copy(e.path(), dest)?;
        }
    }
    Ok(())
}

// ---- installed / install ----------------------------------------------------------------------

pub fn installed(project: &Path) -> Vec<InstalledSkill> {
    installed_in(project, &repo_dir())
}

pub fn installed_in(project: &Path, repo: &Path) -> Vec<InstalledSkill> {
    let repo_skills = list_in(repo);
    sorted_subdirs(&project.join(".claude").join("skills"))
        .into_iter()
        .map(|(name, dir)| {
            let hash = hash_dir(&dir);
            let update_available = repo_skills.iter().any(|s| s.name == name && s.hash != hash);
            InstalledSkill { name, hash, update_available }
        })
        .collect()
}

/// Skill names must be a single plain path segment.
pub(crate) fn valid_segment(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains(['/', '\\', ':']) && !name.contains('\0')
}

pub fn install(names: &[String], dest: &Path) -> AppResult<()> {
    install_in(names, dest, &repo_dir())
}

pub fn install_in(names: &[String], dest: &Path, repo: &Path) -> AppResult<()> {
    if let Some(bad) = names.iter().find(|n| !valid_segment(n)) {
        return Err(AppError::new("invalid_name", format!("invalid skill name: {bad:?}")));
    }
    for n in names {
        let src = repo.join("skills").join(n);
        if !src.is_dir() {
            return Err(AppError::new("skill_not_found", n.clone()));
        }
        let target = dest.join(n);
        if target.exists() {
            fs::remove_dir_all(&target)?;
        }
        copy_dir(&src, &target)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    fn git_available() -> bool {
        std::process::Command::new("git").arg("--version").output().map(|o| o.status.success()).unwrap_or(false)
    }

    fn write(p: &Path, text: &str) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    fn skill(repo: &Path, name: &str, desc: &str, body: &str) {
        write(&repo.join("skills").join(name).join("SKILL.md"), &format!("---\nname: {name}\ndescription: {desc}\n---\n{body}\n"));
    }

    /// Builds a local git repo with one skill and returns its path.
    fn fixture_repo(root: &Path) -> std::path::PathBuf {
        let src = root.join("origin");
        skill(&src, "alpha", "Alpha skill", "body");
        write(&src.join("templates").join("claude-md").join("web.md"), "# {{name}} web");
        let run = |args: &[&str]| {
            let o = std::process::Command::new("git").arg("-C").arg(&src).args(args).output().unwrap();
            assert!(o.status.success(), "{args:?}: {}", String::from_utf8_lossy(&o.stderr));
        };
        run(&["init", "-q", "-b", "main"]);
        run(&["add", "."]);
        run(&["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init"]);
        src
    }

    #[test]
    fn sync_clones_local_repo() {
        if !git_available() {
            eprintln!("git not available, skipping");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let src = fixture_repo(tmp.path());
        let dest = tmp.path().join("cache");
        let url = src.to_string_lossy().to_string();
        assert_eq!(sync_in(&dest, &url, None, "git").unwrap(), "cloned");
        assert!(dest.join("skills").join("alpha").join("SKILL.md").exists());
        assert_eq!(sync_in(&dest, &url, None, "git").unwrap(), "updated");
        assert_eq!(list_in(&dest).len(), 1);
    }

    #[test]
    fn sync_keeps_remote_token_free() {
        if !git_available() {
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let src = fixture_repo(tmp.path());
        let dest = tmp.path().join("cache");
        let url = src.to_string_lossy().to_string();
        sync_in(&dest, &url, Some("SECRET"), "git").unwrap();
        let cfg = fs::read_to_string(dest.join(".git").join("config")).unwrap();
        assert!(!cfg.contains("SECRET"));
        assert!(cfg.contains("origin"));
    }

    #[test]
    fn empty_url_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let e = sync_in(&tmp.path().join("c"), "  ", None, "git").unwrap_err();
        assert_eq!(e.code, "repo_url_empty");
    }

    #[test]
    fn missing_git_and_bad_url_have_codes() {
        let tmp = tempfile::tempdir().unwrap();
        let e = sync_in(&tmp.path().join("c"), "https://example.invalid/x.git", None, "git-does-not-exist-xyz").unwrap_err();
        assert_eq!(e.code, "git_missing");
        if git_available() {
            let e = sync_in(&tmp.path().join("d"), &tmp.path().join("nope").to_string_lossy(), None, "git").unwrap_err();
            assert_eq!(e.code, "git_failed");
            assert!(!tmp.path().join("d").exists());
        }
    }

    #[test]
    fn auth_env_builds_header_and_scrub_hides_token() {
        let e = auth_env(Some("tok"));
        assert_eq!(e.len(), 3);
        assert_eq!(e[0], ("GIT_CONFIG_COUNT".to_string(), "1".to_string()));
        assert_eq!(e[1], ("GIT_CONFIG_KEY_0".to_string(), "http.extraHeader".to_string()));
        // base64("x-access-token:tok")
        assert_eq!(e[2].1, "Authorization: Basic eC1hY2Nlc3MtdG9rZW46dG9r");
        assert!(auth_env(None).is_empty());
        assert!(auth_env(Some("")).is_empty());
        assert_eq!(base64(b"a"), "YQ==");
        assert_eq!(base64(b"ab"), "YWI=");
        assert_eq!(base64(b"abc"), "YWJj");
        assert_eq!(scrub("fatal: tok eC1hY2Nlc3MtdG9rZW46dG9r", Some("tok")), "fatal: •••• ••••");
        let argv: Vec<String> = clone_args("https://h/x.git", Path::new("d"))
            .into_iter()
            .chain(pull_args(Path::new("r"), "https://h/x.git"))
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        assert!(argv.iter().all(|a| !a.contains("tok") && !a.contains('@')));
    }

    fn grep_tree(dir: &Path, needle: &str) -> Vec<String> {
        let mut hits = Vec::new();
        for e in fs::read_dir(dir).unwrap().flatten() {
            let p = e.path();
            if p.is_dir() {
                hits.extend(grep_tree(&p, needle));
            } else if fs::read(&p).map(|b| b.windows(needle.len()).any(|w| w == needle.as_bytes())).unwrap_or(false) {
                hits.push(p.display().to_string());
            }
        }
        hits
    }

    #[test]
    fn pull_never_writes_token() {
        if !git_available() {
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let src = fixture_repo(tmp.path());
        let dest = tmp.path().join("cache");
        let url = src.to_string_lossy().to_string();
        assert_eq!(sync_in(&dest, &url, Some("SECRET123"), "git").unwrap(), "cloned");
        skill(&src, "gamma", "G", "x");
        for args in [vec!["add", "."], vec!["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "two"]] {
            let o = std::process::Command::new("git").arg("-C").arg(&src).args(&args).output().unwrap();
            assert!(o.status.success());
        }
        assert_eq!(sync_in(&dest, &url, Some("SECRET123"), "git").unwrap(), "updated");
        assert!(dest.join("skills").join("gamma").exists());
        let hits = grep_tree(&dest.join(".git"), "SECRET123");
        assert!(hits.is_empty(), "{hits:?}");
    }

    #[test]
    fn lists_skills_with_description() {
        let tmp = tempfile::tempdir().unwrap();
        skill(tmp.path(), "beta", "\"Quoted desc\"", "x");
        skill(tmp.path(), "alpha", "Plain desc", "x");
        write(&tmp.path().join("skills").join("nomd").join("other.txt"), "x");
        let l = list_in(tmp.path());
        assert_eq!(l.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(), ["alpha", "beta"]);
        assert_eq!(l[0].description, "Plain desc");
        assert_eq!(l[1].description, "Quoted desc");
        assert_eq!(l[0].hash.len(), 16);
        assert!(list_in(&tmp.path().join("missing")).is_empty());
    }

    #[test]
    fn lists_templates() {
        let tmp = tempfile::tempdir().unwrap();
        write(&tmp.path().join("templates").join("claude-md").join("web.md"), "x");
        let t = templates_in(tmp.path());
        assert_eq!(t[0].id, "default");
        assert!(t.iter().any(|x| x.id == "web"));
        assert_eq!(templates_in(&tmp.path().join("none")).len(), 1);
    }

    #[test]
    fn hash_changes_with_content() {
        let tmp = tempfile::tempdir().unwrap();
        write(&tmp.path().join("a.txt"), "one");
        let h1 = hash_dir(tmp.path());
        assert_eq!(h1, hash_dir(tmp.path()));
        write(&tmp.path().join("a.txt"), "two");
        let h2 = hash_dir(tmp.path());
        assert_ne!(h1, h2);
        write(&tmp.path().join("sub").join("b.txt"), "x");
        assert_ne!(h2, hash_dir(tmp.path()));
    }

    #[test]
    fn installed_reports_update_available() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("repo");
        let project = tmp.path().join("proj");
        skill(&repo, "alpha", "A", "v1");
        skill(&repo, "beta", "B", "v1");
        install_in(&["alpha".into(), "beta".into()], &project.join(".claude").join("skills"), &repo).unwrap();
        write(&project.join(".claude").join("skills").join("local").join("SKILL.md"), "mine");
        skill(&repo, "alpha", "A", "v2");
        let inst = installed_in(&project, &repo);
        let get = |n: &str| inst.iter().find(|s| s.name == n).unwrap().clone();
        assert!(get("alpha").update_available);
        assert!(!get("beta").update_available);
        assert!(!get("local").update_available);
        assert_eq!(inst.len(), 3);
    }

    #[test]
    fn install_overwrites_and_rejects_bad_names() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("repo");
        let dest = tmp.path().join("dest");
        skill(&repo, "alpha", "A", "v1");
        install_in(&["alpha".into()], &dest, &repo).unwrap();
        write(&dest.join("alpha").join("stale.txt"), "old");
        install_in(&["alpha".into()], &dest, &repo).unwrap();
        assert!(!dest.join("alpha").join("stale.txt").exists());
        for bad in ["..", "a/b", "a\\b", "", "."] {
            assert_eq!(install_in(&[bad.into()], &dest, &repo).unwrap_err().code, "invalid_name", "{bad}");
        }
        assert_eq!(install_in(&["ghost".into()], &dest, &repo).unwrap_err().code, "skill_not_found");
    }
}

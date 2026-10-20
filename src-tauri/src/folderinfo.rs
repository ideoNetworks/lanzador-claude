//! Summary of a folder for the info panel: git branch, CLAUDE.md, skills and sessions.
use std::path::Path;

use serde::Serialize;

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderInfo {
    pub path: String,
    pub exists: bool,
    pub git_branch: Option<String>,
    pub has_claude_md: bool,
    pub skills_count: u32,
    pub sessions_count: u32,
    pub last_session_at: Option<String>,
}

pub fn info(path: &str) -> FolderInfo {
    info_in(&crate::paths::claude_home(), path)
}

const GIT_WALK_LEVELS: usize = 10;

/// Branch name from a `HEAD` file: `ref: refs/heads/<b>` or a short sha when detached.
fn parse_head(head: &str) -> Option<String> {
    let head = head.trim();
    if let Some(r) = head.strip_prefix("ref:") {
        let r = r.trim();
        return Some(r.strip_prefix("refs/heads/").unwrap_or(r).to_string());
    }
    (head.len() >= 7 && head.chars().all(|c| c.is_ascii_hexdigit())).then(|| head[..7].to_string())
}

/// Resolves the git dir of a `.git` entry (directory, or a worktree/submodule file `gitdir: <path>`).
fn resolve_git_dir(dot_git: &Path) -> Option<std::path::PathBuf> {
    if dot_git.is_dir() {
        return Some(dot_git.to_path_buf());
    }
    let text = std::fs::read_to_string(dot_git).ok()?;
    let target = text.trim().strip_prefix("gitdir:")?.trim();
    let target = Path::new(target);
    Some(if target.is_absolute() { target.to_path_buf() } else { dot_git.parent()?.join(target) })
}

fn git_branch(start: &Path) -> Option<String> {
    for dir in start.ancestors().take(GIT_WALK_LEVELS + 1) {
        let dot_git = dir.join(".git");
        if dot_git.exists() {
            let git_dir = resolve_git_dir(&dot_git)?;
            return parse_head(&std::fs::read_to_string(git_dir.join("HEAD")).ok()?);
        }
    }
    None
}

pub fn info_in(claude_home: &Path, path: &str) -> FolderInfo {
    let dir = Path::new(path);
    let mut info = FolderInfo { path: path.to_string(), ..FolderInfo::default() };
    if !dir.is_dir() {
        return info;
    }
    info.exists = true;
    info.git_branch = git_branch(dir);
    info.has_claude_md = dir.join("CLAUDE.md").is_file();
    info.skills_count = std::fs::read_dir(dir.join(".claude").join("skills"))
        .map(|rd| rd.flatten().filter(|e| e.path().is_dir()).count() as u32)
        .unwrap_or(0);
    let sessions = crate::sessions::list_in(claude_home, path);
    info.sessions_count = sessions.len() as u32;
    info.last_session_at = sessions.first().map(|s| s.modified_at.clone());
    info
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_branch_from_head() {
        let home = tempfile::tempdir().unwrap();
        let repo = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(repo.path().join(".git")).unwrap();
        std::fs::write(repo.path().join(".git/HEAD"), "ref: refs/heads/feature/x\n").unwrap();
        let sub = repo.path().join("a").join("b");
        std::fs::create_dir_all(&sub).unwrap();
        let i = info_in(home.path(), repo.path().to_str().unwrap());
        assert_eq!(i.git_branch.as_deref(), Some("feature/x"));
        // found by walking up from a subfolder
        let i = info_in(home.path(), sub.to_str().unwrap());
        assert_eq!(i.git_branch.as_deref(), Some("feature/x"));
        // detached HEAD -> short sha
        std::fs::write(repo.path().join(".git/HEAD"), "0123456789abcdef0123456789abcdef01234567\n").unwrap();
        let i = info_in(home.path(), repo.path().to_str().unwrap());
        assert_eq!(i.git_branch.as_deref(), Some("0123456"));
    }

    #[test]
    fn info_counts_skills() {
        let home = tempfile::tempdir().unwrap();
        let d = tempfile::tempdir().unwrap();
        let skills = d.path().join(".claude").join("skills");
        std::fs::create_dir_all(skills.join("one")).unwrap();
        std::fs::create_dir_all(skills.join("two")).unwrap();
        std::fs::write(skills.join("stray.md"), "x").unwrap();
        std::fs::write(d.path().join("CLAUDE.md"), "x").unwrap();
        let i = info_in(home.path(), d.path().to_str().unwrap());
        assert!(i.exists);
        assert_eq!(i.skills_count, 2);
        assert!(i.has_claude_md);
        assert_eq!(i.sessions_count, 0);
        assert_eq!(i.last_session_at, None);
    }

    #[test]
    fn info_reports_sessions() {
        let home = tempfile::tempdir().unwrap();
        let d = tempfile::tempdir().unwrap();
        let p = d.path().to_str().unwrap();
        let proj = home.path().join("projects").join(crate::sessions::encode_project_dir(p));
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(proj.join("a.jsonl"), "{}\n").unwrap();
        std::fs::write(proj.join("b.jsonl"), "{}\n").unwrap();
        let i = info_in(home.path(), p);
        assert_eq!(i.sessions_count, 2);
        assert!(i.last_session_at.is_some());
    }

    #[test]
    fn missing_folder_is_default_not_error() {
        let home = tempfile::tempdir().unwrap();
        let i = info_in(home.path(), r"C:\definitely\not\here");
        assert!(!i.exists);
        assert_eq!(i.skills_count, 0);
        assert!(!i.has_claude_md);
    }
}

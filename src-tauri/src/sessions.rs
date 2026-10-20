//! Claude Code session history for a project folder (`~/.claude/projects/<encoded>/*.jsonl`).
use std::path::Path;

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub modified_at: String,
    pub title: String,
}

/// Claude's project directory name: every char that is not ASCII alphanumeric becomes `-`.
pub fn encode_project_dir(path: &str) -> String {
    path.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect()
}

/// Only the head of each transcript is inspected (they can be hundreds of MB).
const TITLE_MAX_LINES: usize = 200;
const TITLE_MAX_BYTES: u64 = 4 * 1024 * 1024;
const TITLE_MAX_CHARS: usize = 80;

/// First user message whose content is plain text, trimmed to 80 chars.
fn read_title(path: &Path) -> Option<String> {
    use std::io::{BufRead, BufReader, Read};
    let file = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(file.take(TITLE_MAX_BYTES));
    for line in reader.lines().take(TITLE_MAX_LINES) {
        let Ok(line) = line else { break };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
        if v.get("type").and_then(|t| t.as_str()) != Some("user") {
            continue;
        }
        if let Some(text) = v.pointer("/message/content").and_then(|c| c.as_str()) {
            let text = text.trim();
            if !text.is_empty() {
                return Some(text.chars().take(TITLE_MAX_CHARS).collect());
            }
        }
    }
    None
}

pub fn list(path: &str) -> Vec<SessionSummary> {
    list_in(&crate::paths::claude_home(), path)
}

/// Sessions of `path` under `claude_home`, newest first.
pub fn list_in(claude_home: &Path, path: &str) -> Vec<SessionSummary> {
    let dir = claude_home.join("projects").join(encode_project_dir(path));
    let Ok(rd) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut found: Vec<(std::time::SystemTime, SessionSummary)> = rd
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) != Some("jsonl") {
                return None;
            }
            let meta = e.metadata().ok().filter(|m| m.is_file())?;
            let modified = meta.modified().ok()?;
            let id = p.file_stem()?.to_string_lossy().into_owned();
            let title = read_title(&p).unwrap_or_else(|| id.clone());
            let modified_at = chrono::DateTime::<chrono::Local>::from(modified).to_rfc3339();
            Some((modified, SessionSummary { id, modified_at, title }))
        })
        .collect();
    found.sort_by_key(|a| std::cmp::Reverse(a.0));
    found.into_iter().map(|(_, s)| s).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime};

    #[test]
    fn encode_matches_claude() {
        assert_eq!(encode_project_dir(r"C:\Desarrollo\IDNLanzador"), "C--Desarrollo-IDNLanzador");
        assert_eq!(encode_project_dir("C:\\Jos\u{e9}'s app"), "C--Jos--s-app");
    }

    fn write_session(dir: &Path, id: &str, body: &str, age_secs: u64) {
        let p = dir.join(format!("{id}.jsonl"));
        std::fs::write(&p, body).unwrap();
        let f = std::fs::OpenOptions::new().write(true).open(&p).unwrap();
        f.set_modified(SystemTime::now() - Duration::from_secs(age_secs)).unwrap();
    }

    #[test]
    fn sessions_title_and_order() {
        let home = tempfile::tempdir().unwrap();
        let proj = home.path().join("projects").join("C--Work-app");
        std::fs::create_dir_all(&proj).unwrap();
        let long = "x".repeat(200);
        write_session(
            &proj,
            "old",
            "{\"type\":\"summary\"}\n{\"type\":\"user\",\"message\":{\"content\":[{\"type\":\"tool_result\"}]}}\nnot json\n{\"type\":\"user\",\"message\":{\"content\":\"  Hola mundo \"}}\n",
            1000,
        );
        write_session(&proj, "new", &format!("{{\"type\":\"user\",\"message\":{{\"content\":\"{long}\"}}}}\n"), 10);
        write_session(&proj, "untitled", "{\"type\":\"summary\"}\n", 500);
        std::fs::write(proj.join("notes.txt"), "x").unwrap();

        let list = list_in(home.path(), r"C:\Work\app");
        let ids: Vec<_> = list.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, ["new", "untitled", "old"]);
        assert_eq!(list[0].title, "x".repeat(80));
        assert_eq!(list[1].title, "untitled");
        assert_eq!(list[2].title, "Hola mundo");
        assert!(chrono::DateTime::parse_from_rfc3339(&list[0].modified_at).is_ok());
    }

    #[test]
    fn missing_sessions_dir_is_empty() {
        let home = tempfile::tempdir().unwrap();
        assert!(list_in(home.path(), r"C:\Nope").is_empty());
    }
}

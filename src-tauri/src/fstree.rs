//! Lazy folder tree and drive list for the UI. Never follows junctions/symlinks.
use serde::Serialize;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub has_children: bool,
    pub hidden: bool,
    /// Detected project kind: `"claude"` (CLAUDE.md or .claude), `"code"` (git, package
    /// manifest, solution...) or `None`.
    pub project: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DriveEntry {
    pub path: String,
    pub label: String,
    /// "fixed" | "removable" | "network" | "other"
    pub kind: String,
}

/// How many children are probed to decide whether a folder shows an expand arrow.
const PROBE_LIMIT: usize = 200;

/// (is_dir, is_reparse_point, hidden-by-attribute) from metadata that does not follow links.
#[cfg(windows)]
fn classify(meta: &std::fs::Metadata) -> (bool, bool, bool) {
    use std::os::windows::fs::MetadataExt;
    const HIDDEN: u32 = 0x2;
    const SYSTEM: u32 = 0x4;
    const DIRECTORY: u32 = 0x10;
    const REPARSE_POINT: u32 = 0x400;
    let a = meta.file_attributes();
    (a & DIRECTORY != 0, a & REPARSE_POINT != 0, a & (HIDDEN | SYSTEM) != 0)
}

#[cfg(not(windows))]
fn classify(meta: &std::fs::Metadata) -> (bool, bool, bool) {
    let link = meta.file_type().is_symlink();
    (meta.is_dir() || link, link, false)
}

/// Entry names that make a folder a Claude project.
const CLAUDE_MARKERS: [&str; 2] = ["claude.md", ".claude"];
/// Entry names that make a folder a code project.
const CODE_MARKERS: [&str; 12] = [
    ".git", "package.json", "cargo.toml", "pyproject.toml", "go.mod", "pom.xml", "composer.json",
    "build.gradle", "build.gradle.kts", "requirements.txt", "gemfile", "deno.json",
];
/// Extensions of Visual Studio / .NET project files.
const CODE_EXTS: [&str; 4] = [".sln", ".slnx", ".csproj", ".vcxproj"];

/// Project kind revealed by one entry name (`None` when it is no marker).
fn marker_kind(name: &str) -> Option<&'static str> {
    let n = name.to_ascii_lowercase();
    if CLAUDE_MARKERS.contains(&n.as_str()) {
        Some("claude")
    } else if CODE_MARKERS.contains(&n.as_str()) || CODE_EXTS.iter().any(|e| n.ends_with(e)) {
        Some("code")
    } else {
        None
    }
}

/// One pass over (at most `PROBE_LIMIT`) entries of `dir`: whether it has a subfolder and which
/// project kind its marker files reveal. Markers are matched by name only (no extra I/O).
fn probe(dir: &std::path::Path) -> (bool, Option<&'static str>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return (false, None) };
    let (mut sub, mut kind) = (false, None);
    for e in rd.take(PROBE_LIMIT).flatten() {
        match marker_kind(&e.file_name().to_string_lossy()) {
            Some("claude") => kind = Some("claude"),
            Some(k) if kind.is_none() => kind = Some(k),
            _ => {}
        }
        if !sub {
            sub = std::fs::symlink_metadata(e.path()).map(|m| classify(&m).0).unwrap_or(false);
        }
        if sub && kind == Some("claude") {
            break;
        }
    }
    (sub, kind)
}

fn io_error(e: &std::io::Error) -> AppError {
    use std::io::ErrorKind::{NotADirectory, NotFound, PermissionDenied};
    match e.kind() {
        NotFound | NotADirectory => AppError::new("path_not_found", e.to_string()),
        PermissionDenied => AppError::new("access_denied", e.to_string()),
        // Disconnected network drives and the like surface as other OS errors.
        _ => match e.raw_os_error() {
            Some(3 | 53 | 67 | 1167) => AppError::new("path_not_found", e.to_string()),
            Some(5) => AppError::new("access_denied", e.to_string()),
            _ => AppError::new("io", e.to_string()),
        },
    }
}

/// Subfolders of `path`, sorted case-insensitively. Unreadable entries are skipped silently;
/// junctions/symlinks are listed but never followed (`has_children = false`).
pub fn list_dir(path: &str, show_hidden: bool) -> AppResult<Vec<DirEntry>> {
    let base = std::path::Path::new(path);
    let rd = std::fs::read_dir(base).map_err(|e| io_error(&e))?;
    let mut out = Vec::new();
    for entry in rd.flatten() {
        let full = entry.path();
        let Ok(meta) = std::fs::symlink_metadata(&full) else { continue };
        let (is_dir, reparse, attr_hidden) = classify(&meta);
        if !is_dir {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let hidden = attr_hidden || name.starts_with('.');
        if hidden && !show_hidden {
            continue;
        }
        let (has_children, project) = if reparse { (false, None) } else { probe(&full) };
        out.push(DirEntry {
            name,
            path: full.to_string_lossy().into_owned(),
            has_children,
            hidden,
            project: project.map(str::to_string),
        });
    }
    out.sort_by_cached_key(|e| e.name.to_lowercase());
    Ok(out)
}

/// Logical drives with their kind and volume label.
#[cfg(windows)]
pub fn list_roots() -> Vec<DriveEntry> {
    use windows_sys::Win32::Storage::FileSystem::{GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW};
    use windows_sys::Win32::System::Diagnostics::Debug::{
        SEM_FAILCRITICALERRORS, SEM_NOOPENFILEERRORBOX, SetThreadErrorMode,
    };
    // SAFETY: plain Win32 queries; buffers are sized as declared and root is NUL-terminated.
    // Suppress "no disk in drive" dialogs for the duration of the probing (restored below).
    let mut prev_mode = 0u32;
    unsafe { SetThreadErrorMode(SEM_FAILCRITICALERRORS | SEM_NOOPENFILEERRORBOX, &mut prev_mode) };
    let mask = unsafe { GetLogicalDrives() };
    let mut roots = Vec::new();
    for i in 0..26u32 {
        if mask & (1 << i) == 0 {
            continue;
        }
        let letter = (b'A' + i as u8) as char;
        let path = format!("{letter}:\\");
        let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        let kind = match unsafe { GetDriveTypeW(wide.as_ptr()) } {
            2 => "removable",
            3 => "fixed",
            4 => "network",
            _ => "other",
        };
        let fallback = format!("{letter}:");
        let label = if needs_label_probe(kind) {
            let mut buf = [0u16; 261];
            let ok = unsafe {
                GetVolumeInformationW(
                    wide.as_ptr(),
                    buf.as_mut_ptr(),
                    buf.len() as u32,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    0,
                )
            };
            let n = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            let text = if ok != 0 { String::from_utf16_lossy(&buf[..n]) } else { String::new() };
            if text.is_empty() { fallback } else { text }
        } else {
            fallback
        };
        roots.push(DriveEntry { path, label, kind: kind.to_string() });
    }
    // SAFETY: restores the mode saved above.
    unsafe { SetThreadErrorMode(prev_mode, std::ptr::null_mut()) };
    roots
}

/// Network drives are never queried (a dead mapping blocks for many seconds); the rest are.
#[cfg(any(windows, test))]
fn needs_label_probe(kind: &str) -> bool {
    kind != "network"
}

#[cfg(not(windows))]
pub fn list_roots() -> Vec<DriveEntry> {
    vec![DriveEntry { path: "/".into(), label: String::new(), kind: "fixed".into() }]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn names(v: &[DirEntry]) -> Vec<&str> {
        v.iter().map(|e| e.name.as_str()).collect()
    }

    #[test]
    fn lists_only_dirs_sorted() {
        let d = tempfile::tempdir().unwrap();
        for n in ["beta", "Alpha", "gamma"] {
            std::fs::create_dir(d.path().join(n)).unwrap();
        }
        std::fs::create_dir(d.path().join("gamma").join("inner")).unwrap();
        std::fs::write(d.path().join("file.txt"), "x").unwrap();
        let v = list_dir(d.path().to_str().unwrap(), false).unwrap();
        assert_eq!(names(&v), ["Alpha", "beta", "gamma"]);
        assert!(!v[0].has_children);
        assert!(v[2].has_children);
        assert_eq!(Path::new(&v[2].path), d.path().join("gamma"));
    }

    #[test]
    fn detects_project_kinds() {
        let d = tempfile::tempdir().unwrap();
        for n in ["plain", "web", "app", "net", "both"] {
            std::fs::create_dir(d.path().join(n)).unwrap();
        }
        std::fs::create_dir(d.path().join("plain").join("docs")).unwrap();
        std::fs::write(d.path().join("web").join("package.json"), "{}").unwrap();
        std::fs::write(d.path().join("app").join("CLAUDE.md"), "#").unwrap();
        std::fs::write(d.path().join("net").join("Tool.SLN"), "").unwrap();
        std::fs::create_dir(d.path().join("both").join(".git")).unwrap();
        std::fs::create_dir(d.path().join("both").join(".claude")).unwrap();
        let v = list_dir(d.path().to_str().unwrap(), false).unwrap();
        let kind = |n: &str| v.iter().find(|e| e.name == n).unwrap().project.clone();
        assert_eq!(kind("plain"), None);
        assert_eq!(kind("web").as_deref(), Some("code"));
        assert_eq!(kind("app").as_deref(), Some("claude"));
        assert_eq!(kind("net").as_deref(), Some("code"));
        assert_eq!(kind("both").as_deref(), Some("claude"), "claude markers win");
        assert!(v.iter().find(|e| e.name == "both").unwrap().has_children);
    }

    #[test]
    fn hides_dot_dirs_unless_show_hidden() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir(d.path().join(".git")).unwrap();
        std::fs::create_dir(d.path().join("src")).unwrap();
        let p = d.path().to_str().unwrap();
        assert_eq!(names(&list_dir(p, false).unwrap()), ["src"]);
        let all = list_dir(p, true).unwrap();
        assert_eq!(names(&all), [".git", "src"]);
        assert!(all[0].hidden && !all[1].hidden);
    }

    #[cfg(windows)]
    #[test]
    fn windows_hidden_attribute_is_hidden() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir(d.path().join("secret")).unwrap();
        std::fs::create_dir(d.path().join("open")).unwrap();
        let st = std::process::Command::new("attrib").arg("+H").arg(d.path().join("secret")).status().unwrap();
        assert!(st.success());
        let p = d.path().to_str().unwrap();
        assert_eq!(names(&list_dir(p, false).unwrap()), ["open"]);
        assert_eq!(names(&list_dir(p, true).unwrap()), ["open", "secret"]);
    }

    #[test]
    fn missing_root_is_error() {
        let d = tempfile::tempdir().unwrap();
        let e = list_dir(d.path().join("nope").to_str().unwrap(), false).unwrap_err();
        assert_eq!(e.code, "path_not_found");
        let f = d.path().join("f.txt");
        std::fs::write(&f, "x").unwrap();
        assert_eq!(list_dir(f.to_str().unwrap(), false).unwrap_err().code, "path_not_found");
    }

    #[cfg(windows)]
    fn mk_junction(link: &Path, target: &Path) -> bool {
        std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[cfg(windows)]
    #[test]
    fn junction_listed_without_children() {
        let d = tempfile::tempdir().unwrap();
        let target = d.path().join("target");
        std::fs::create_dir_all(target.join("sub")).unwrap();
        let link = d.path().join("link");
        if !mk_junction(&link, &target) {
            eprintln!("mklink /J unavailable; skipping");
            return;
        }
        let v = list_dir(d.path().to_str().unwrap(), false).unwrap();
        let l = v.iter().find(|e| e.name == "link").expect("junction listed");
        assert!(!l.has_children);
        assert!(v.iter().find(|e| e.name == "target").unwrap().has_children);
    }

    #[cfg(windows)]
    #[test]
    fn unreadable_entry_skipped() {
        // A junction whose target was deleted is a dangling entry: listing the parent must not fail.
        let d = tempfile::tempdir().unwrap();
        let target = d.path().join("gone");
        std::fs::create_dir(&target).unwrap();
        let link = d.path().join("dangling");
        std::fs::create_dir(d.path().join("ok")).unwrap();
        if !mk_junction(&link, &target) {
            eprintln!("mklink /J unavailable; skipping");
            return;
        }
        std::fs::remove_dir(&target).unwrap();
        let v = list_dir(d.path().to_str().unwrap(), false).unwrap();
        assert!(v.iter().any(|e| e.name == "ok"));
        if let Some(l) = v.iter().find(|e| e.name == "dangling") {
            assert!(!l.has_children);
        }
        // Listing the dangling junction itself is a clean error, not a panic.
        assert!(list_dir(link.to_str().unwrap(), false).is_err());
    }

    #[test]
    fn needs_label_probe_skips_network_only() {
        assert!(needs_label_probe("fixed"));
        assert!(needs_label_probe("removable"));
        assert!(needs_label_probe("other"));
        assert!(!needs_label_probe("network"));
    }

    #[cfg(windows)]
    #[test]
    fn roots_include_system_drive() {
        let roots = list_roots();
        assert!(!roots.is_empty());
        assert!(roots.iter().any(|r| r.kind == "fixed" && r.path.ends_with(":\\")));
    }
}

//! Pure command builder: turns a launch request into a plan (preview, program, args, script).
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::catalog::CatalogItem;
use crate::config::{Selection, Target};
use crate::error::{AppError, AppResult};
use crate::paths;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    pub path: String,
    pub target: Target,
    pub selection: Selection,
    #[serde(default)]
    pub resume_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchPlan {
    pub preview: String,
    pub program: String,
    pub args: Vec<String>,
    /// Script content (without BOM) for `wt` / `powershell`; `None` for `wsl`.
    pub script: Option<String>,
    /// Where `launch::run` must write `script` (also referenced from `args`).
    pub script_path: Option<String>,
    pub cwd: String,
}

const MASK: &str = "'••••'";

struct EnvVar {
    key: String,
    value: String,
    secret: bool,
}

/// PowerShell single-quote literal unless `s` is made of safe characters only.
/// PowerShell also treats the typographic single quotes as quote characters, so those are doubled too.
pub fn ps_quote(s: &str) -> String {
    let safe = !s.is_empty()
        && s.chars().all(|c| c.is_ascii_alphanumeric() || "_-./:=+".contains(c));
    if safe {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len() + 2);
    out.push('\'');
    for c in s.chars() {
        out.push(c);
        if matches!(c, '\'' | '\u{2018}' | '\u{2019}' | '\u{201A}' | '\u{201B}') {
            out.push(c);
        }
    }
    out.push('\'');
    out
}

fn stamp() -> u128 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

/// POSIX single-quote literal unless `s` is made of safe characters only.
pub fn sh_quote(s: &str) -> String {
    let safe = !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || "_-./:=+".contains(c));
    if safe { s.to_string() } else { format!("'{}'", s.replace('\'', "'\\''")) }
}

/// `C:\Users\A B\x.sh` -> `/mnt/c/Users/A B/x.sh` (other paths: backslashes become slashes).
pub fn to_wsl_path(p: &str) -> String {
    let b = p.as_bytes();
    if b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':' {
        let rest = p[2..].replace('\\', "/");
        format!("/mnt/{}/{}", (b[0] as char).to_ascii_lowercase(), rest.trim_start_matches('/'))
    } else {
        p.replace('\\', "/")
    }
}

/// Windows Terminal reads `;` as its own command separator in every argument.
fn wt_escape(s: &str) -> String {
    s.replace(';', "\\;")
}

/// `pwsh` if available, else Windows PowerShell. Resolved once.
pub fn detect_pwsh() -> &'static str {
    static PWSH: OnceLock<&'static str> = OnceLock::new();
    PWSH.get_or_init(|| {
        let mut cmd = std::process::Command::new("where");
        cmd.arg("pwsh")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        if cmd.status().is_ok_and(|s| s.success()) { "pwsh" } else { "powershell" }
    })
}

fn value_of<'a>(selection: &'a Selection, id: &str) -> Option<&'a str> {
    selection.get(id).and_then(|v| v.as_deref()).map(str::trim).filter(|v| !v.is_empty())
}

fn collect(
    req: &LaunchRequest,
    catalog: &[CatalogItem],
    secret: &dyn Fn(&str) -> Option<String>,
) -> (Vec<EnvVar>, Vec<String>) {
    let resume = req.resume_id.as_deref().map(str::trim).filter(|v| !v.is_empty());
    let mut envs = Vec::new();
    let mut args: Vec<String> = Vec::new();
    for item in catalog {
        if !req.selection.contains_key(&item.id) {
            continue;
        }
        let val = value_of(&req.selection, &item.id);
        if item.kind == "env" {
            let value = match item.value.kind.as_str() {
                "fixed" => item.value.fixed.clone().map(|v| (v, false)),
                "secret" => secret(&item.key).map(|v| (v, true)),
                "select" | "text" => val.map(|v| (v.to_string(), false)),
                _ => None,
            };
            if let Some((value, is_secret)) = value {
                envs.push(EnvVar { key: item.key.clone(), value, secret: is_secret });
            }
            continue;
        }
        if resume.is_some() && (item.id == "flag.resume" || item.id == "flag.continue") {
            continue;
        }
        match item.value.kind.as_str() {
            "none" => args.push(item.key.clone()),
            "fixed" => {
                if let Some(f) = &item.value.fixed {
                    args.extend([item.key.clone(), f.clone()]);
                }
            }
            "select" | "text" => match val {
                Some(v) if item.key == "--add-dir" => {
                    for dir in v.split(';').map(str::trim).filter(|d| !d.is_empty()) {
                        args.extend([item.key.clone(), dir.to_string()]);
                    }
                }
                Some(v) => args.extend([item.key.clone(), v.to_string()]),
                None if item.value.optional => args.push(item.key.clone()),
                None => {}
            },
            _ => {}
        }
    }
    if let Some(id) = resume {
        args.extend(["--resume".to_string(), id.to_string()]);
    }
    (envs, args)
}

fn join_quoted(args: &[String]) -> String {
    args.iter().map(|a| ps_quote(a)).collect::<Vec<_>>().join(" ")
}

fn script_text(path: &str, envs: &[EnvVar], args: &[String]) -> String {
    let mut lines = vec![
        "Remove-Item -LiteralPath $PSCommandPath -ErrorAction SilentlyContinue".to_string(),
        format!("Set-Location -LiteralPath {}", ps_quote(path)),
    ];
    lines.extend(envs.iter().map(|e| format!("$env:{} = {}", e.key, ps_quote(&e.value))));
    lines.push(format!("claude {}", join_quoted(args)).trim_end().to_string());
    lines.join("\r\n") + "\r\n"
}

/// WSL script line before `exec`: without `claude` on the WSL PATH the tab would just close;
/// explain it and keep a login shell open instead.
pub const WSL_GUARD: &str =
    r#"command -v claude >/dev/null 2>&1 || { echo "claude no está en el PATH de WSL"; exec bash -l; }"#;

/// Builds the plan using the real launch directory.
pub fn plan(
    req: &LaunchRequest,
    catalog: &[CatalogItem],
    secret: &dyn Fn(&str) -> Option<String>,
    pwsh: &str,
) -> AppResult<LaunchPlan> {
    plan_in(&paths::local_dir().join("launch"), req, catalog, secret, pwsh)
}

/// Same as [`plan`] with an explicit launch directory. Writes nothing to disk.
pub fn plan_in(
    launch_dir: &Path,
    req: &LaunchRequest,
    catalog: &[CatalogItem],
    secret: &dyn Fn(&str) -> Option<String>,
    pwsh: &str,
) -> AppResult<LaunchPlan> {
    if !Path::new(&req.path).is_dir() {
        return Err(AppError::new("path_not_found", req.path.clone()));
    }
    let (envs, args) = collect(req, catalog, secret);

    if req.target == Target::Wsl {
        // Values never reach a shell command line: they live single-quoted in a script file.
        let script_path = launch_dir.join(format!("{}.sh", stamp())).to_string_lossy().into_owned();
        let env_toks: Vec<String> = envs.iter().map(|e| sh_quote(&format!("{}={}", e.key, e.value))).collect();
        let mut line = vec!["exec".to_string(), "env".to_string()];
        line.extend(env_toks);
        line.push("claude".into());
        line.extend(args.iter().map(|a| sh_quote(a)));
        let script = format!("rm -f -- \"$0\"\n{WSL_GUARD}\n{}\n", line.join(" "));
        let mut parts = vec!["env".to_string()];
        parts.extend(envs.iter().map(|e| {
            if e.secret { format!("{}={MASK}", e.key) } else { sh_quote(&format!("{}={}", e.key, e.value)) }
        }));
        parts.push("claude".into());
        parts.extend(args.iter().map(|a| sh_quote(a)));
        let wt_args: Vec<String> =
            ["-d", &req.path, "wsl.exe", "--cd", &req.path, "-e", "bash", "-l", &to_wsl_path(&script_path)]
                .iter()
                .map(|a| wt_escape(a))
                .collect();
        return Ok(LaunchPlan {
            preview: format!("wsl> {}", parts.join(" ")),
            program: "wt.exe".into(),
            args: wt_args,
            script: Some(script),
            script_path: Some(script_path),
            cwd: req.path.clone(),
        });
    }

    let script_path: PathBuf = launch_dir.join(format!("{}.ps1", stamp()));
    let script_path = script_path.to_string_lossy().into_owned();

    let mut preview_parts: Vec<String> = envs
        .iter()
        .map(|e| format!("$env:{} = {}", e.key, if e.secret { MASK.to_string() } else { ps_quote(&e.value) }))
        .collect();
    preview_parts.push(format!("claude {}", join_quoted(&args)).trim_end().to_string());
    let preview = format!("PS {}> {}", req.path, preview_parts.join("; "));

    let ps_args = ["-NoExit", "-ExecutionPolicy", "Bypass", "-File"];
    let (program, args_out) = if req.target == Target::Wt {
        let mut a: Vec<String> = vec!["-d".into(), req.path.clone(), pwsh.into()];
        a.extend(ps_args.iter().map(|s| s.to_string()));
        a.push(script_path.clone());
        ("wt.exe".to_string(), a.iter().map(|x| wt_escape(x)).collect())
    } else {
        let mut a: Vec<String> = ps_args.iter().map(|s| s.to_string()).collect();
        a.push(script_path.clone());
        (pwsh.to_string(), a)
    };
    Ok(LaunchPlan {
        preview,
        program,
        args: args_out,
        script: Some(script_text(&req.path, &envs, &args)),
        script_path: Some(script_path),
        cwd: req.path.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::load_embedded;
    use crate::launch::write_script;

    fn sel(items: &[(&str, Option<&str>)]) -> Selection {
        items.iter().map(|(k, v)| (k.to_string(), v.map(|s| s.to_string()))).collect()
    }

    fn req(path: &Path, target: Target, selection: Selection) -> LaunchRequest {
        LaunchRequest { path: path.to_string_lossy().into_owned(), target, selection, resume_id: None }
    }

    fn no_secret(_: &str) -> Option<String> {
        None
    }

    fn plan_t(r: &LaunchRequest, dir: &Path) -> LaunchPlan {
        plan_in(dir, r, &load_embedded(), &no_secret, "pwsh").unwrap()
    }

    #[test]
    fn orders_env_then_flags() {
        let tmp = tempfile::tempdir().unwrap();
        let r = req(
            tmp.path(),
            Target::Wt,
            sel(&[
                ("flag.model", Some("opus")),
                ("env.DISABLE_TELEMETRY", None),
                ("flag.dangerously-skip-permissions", None),
            ]),
        );
        let p = plan_t(&r, tmp.path());
        let script = p.script.unwrap();
        let env_at = script.find("$env:DISABLE_TELEMETRY = 1").expect("env line");
        let claude_at = script.find("claude ").expect("claude line");
        assert!(env_at < claude_at);
        assert!(script.contains("claude --model opus --dangerously-skip-permissions") || {
            // catalog order decides flag order; both must appear after `claude`
            let tail = &script[claude_at..];
            tail.contains("--model opus") && tail.contains("--dangerously-skip-permissions")
        });
        assert!(p.preview.ends_with(&script[claude_at..].trim_end().to_string()));
        assert!(p.preview.contains("$env:DISABLE_TELEMETRY = 1; claude "), "{}", p.preview);
    }

    #[test]
    fn ps_quote_rules() {
        assert_eq!(ps_quote("abc-1.2/x:y=z+"), "abc-1.2/x:y=z+");
        assert_eq!(ps_quote("@foo"), "'@foo'");
        assert_eq!(ps_quote("hooks,mcp"), "'hooks,mcp'");
        assert_eq!(ps_quote(""), "''");
        assert_eq!(ps_quote(r"C:\Proyectos\José's app; v2"), r"'C:\Proyectos\José''s app; v2'");
        assert_eq!(ps_quote("a\u{2019}b"), "'a\u{2019}\u{2019}b'");
        assert_eq!(wt_escape(r"C:\Proyectos\José's app; v2"), r"C:\Proyectos\José's app\; v2");
    }

    #[test]
    fn quotes_spaces_apostrophes_semicolons() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("José's app; v2 & co");
        std::fs::create_dir(&dir).unwrap();
        let p = plan_t(&req(&dir, Target::Wt, Selection::new()), tmp.path());
        let d = dir.to_string_lossy().into_owned();
        let quoted = format!("'{}'", d.replace('\'', "''"));
        let script = p.script.as_ref().unwrap();
        assert!(script.contains(&format!("Set-Location -LiteralPath {quoted}\r\n")), "{script}");
        assert_eq!(p.args[0], "-d");
        assert_eq!(p.args[1], d.replace(';', "\\;"));
        assert!(!p.args[1].replace("\\;", "").contains(';'));
        assert!(p.preview.starts_with(&format!("PS {d}> ")));
        assert_eq!(p.cwd, d);
        // the script is written byte-exact: BOM + UTF-8 content
        let file = tmp.path().join("out").join("t.ps1");
        write_script(&file, script).unwrap();
        let bytes = std::fs::read(&file).unwrap();
        assert_eq!(&bytes[..3], &[0xEF, 0xBB, 0xBF]);
        assert_eq!(&bytes[3..], script.as_bytes());
    }

    #[test]
    fn wt_args_shape() {
        let tmp = tempfile::tempdir().unwrap();
        let launch = tmp.path().join("launch");
        let p = plan_t(&req(tmp.path(), Target::Wt, Selection::new()), &launch);
        let d = tmp.path().to_string_lossy().into_owned();
        assert_eq!(p.program, "wt.exe");
        let sp = p.script_path.clone().unwrap();
        assert!(sp.starts_with(&launch.to_string_lossy().into_owned()) && sp.ends_with(".ps1"));
        let expect: Vec<String> = ["-d", &d, "pwsh", "-NoExit", "-ExecutionPolicy", "Bypass", "-File", &sp]
            .iter()
            .map(|s| wt_escape(s))
            .collect();
        assert_eq!(p.args, expect);
        let s = p.script.unwrap();
        assert!(s.starts_with("Remove-Item -LiteralPath $PSCommandPath -ErrorAction SilentlyContinue\r\n"));
        assert!(s.ends_with("claude\r\n"));
        // powershell target: no wt, no -d
        let p2 = plan_t(&req(tmp.path(), Target::Powershell, Selection::new()), &launch);
        assert_eq!(p2.program, "pwsh");
        assert_eq!(p2.args[..4], ["-NoExit", "-ExecutionPolicy", "Bypass", "-File"]);
        assert_eq!(p2.args.len(), 5);
        assert!(!launch.exists(), "plan must not touch disk");
    }

    #[test]
    fn wsl_values_are_single_argv() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("a; b");
        std::fs::create_dir(&dir).unwrap();
        let r = req(
            &dir,
            Target::Wsl,
            sel(&[
                ("env.DISABLE_TELEMETRY", None),
                ("flag.model", Some("x;id")),
                ("flag.name", Some("a b$(x)")),
                ("flag.worktree", Some("it's")),
            ]),
        );
        let p = plan_t(&r, tmp.path());
        let s = p.script.clone().unwrap();
        let line = s.lines().nth(2).unwrap();
        for v in ["'x;id'", "'a b$(x)'", "'it'\\''s'"] {
            assert!(line.contains(v), "{line}");
        }
        assert!(line.starts_with("exec env DISABLE_TELEMETRY=1 claude "), "{line}");
        assert_eq!(s.lines().next().unwrap(), "rm -f -- \"$0\"");
        // guard before exec: missing claude explains itself and leaves a shell open
        assert_eq!(s.lines().nth(1).unwrap(), WSL_GUARD);
        assert_eq!(s.lines().count(), 3);
        assert_eq!(p.program, "wt.exe");
        let d = dir.to_string_lossy().into_owned().replace(';', "\\;");
        let sp = to_wsl_path(p.script_path.as_ref().unwrap()).replace(';', "\\;");
        assert_eq!(p.args, ["-d", &d, "wsl.exe", "--cd", &d, "-e", "bash", "-l", &sp]);
        assert!(p.args.iter().all(|a| !a.contains("x;id") && !a.contains("$(x)") && !a.contains("it's")));
        assert!(p.script_path.as_ref().unwrap().ends_with(".sh"));
        assert!(p.preview.starts_with("wsl> env DISABLE_TELEMETRY=1 claude "), "{}", p.preview);
        assert!(p.preview.contains("'it'\\''s'"));
        // bytes: LF only, no BOM
        let file = tmp.path().join("t.sh");
        write_script(&file, &s).unwrap();
        let bytes = std::fs::read(&file).unwrap();
        assert!(!bytes.contains(&b'\r'));
        assert_ne!(&bytes[..3], &[0xEF, 0xBB, 0xBF]);
    }

    #[test]
    fn wsl_secret_masked_in_preview_real_in_script() {
        let tmp = tempfile::tempdir().unwrap();
        let secret = |k: &str| (k == "ANTHROPIC_API_KEY").then(|| "sk-ant-it's".to_string());
        let r = req(tmp.path(), Target::Wsl, sel(&[("env.ANTHROPIC_API_KEY", None)]));
        let p = plan_in(tmp.path(), &r, &load_embedded(), &secret, "pwsh").unwrap();
        assert!(p.preview.contains("ANTHROPIC_API_KEY='••••'") && !p.preview.contains("sk-ant"));
        assert!(p.script.unwrap().contains("'ANTHROPIC_API_KEY=sk-ant-it'\\''s'"));
        assert!(p.args.iter().all(|a| !a.contains("sk-ant")));
    }

    #[test]
    fn sh_quote_and_wsl_path() {
        assert_eq!(sh_quote("a-b/c.d:e=f+g_1"), "a-b/c.d:e=f+g_1");
        assert_eq!(sh_quote(""), "''");
        assert_eq!(sh_quote("it's"), "'it'\\''s'");
        assert_eq!(to_wsl_path(r"C:\Users\A B\x.sh"), "/mnt/c/Users/A B/x.sh");
    }

    #[test]
    fn add_dir_splits() {
        let tmp = tempfile::tempdir().unwrap();
        let r = req(tmp.path(), Target::Powershell, sel(&[("flag.add-dir", Some(r"C:\A B; D:\Libs;"))]));
        let s = plan_t(&r, tmp.path()).script.unwrap();
        assert!(s.contains(r"claude --add-dir 'C:\A B' --add-dir 'D:\Libs'"), "{s}");
    }

    #[test]
    fn optional_and_empty_values() {
        let tmp = tempfile::tempdir().unwrap();
        let r = req(
            tmp.path(),
            Target::Powershell,
            sel(&[("flag.worktree", Some("")), ("flag.model", None), ("flag.name", Some("  ")), ("flag.debug", None)]),
        );
        let s = plan_t(&r, tmp.path()).script.unwrap();
        assert!(s.contains("--worktree") && s.contains("--debug"), "{s}");
        assert!(!s.contains("--model") && !s.contains("--name"), "{s}");
    }

    #[test]
    fn secret_hidden_in_preview_present_in_script() {
        let tmp = tempfile::tempdir().unwrap();
        let secret = |k: &str| (k == "ANTHROPIC_API_KEY").then(|| "sk-ant-it's".to_string());
        let r = req(tmp.path(), Target::Wt, sel(&[("env.ANTHROPIC_API_KEY", None)]));
        let p = plan_in(tmp.path(), &r, &load_embedded(), &secret, "pwsh").unwrap();
        assert!(p.preview.contains("$env:ANTHROPIC_API_KEY = '••••'"));
        assert!(!p.preview.contains("sk-ant"));
        assert!(p.script.unwrap().contains("$env:ANTHROPIC_API_KEY = 'sk-ant-it''s'"));
        // missing secret: variable skipped, no error
        let p = plan_t(&r, tmp.path());
        assert!(!p.script.unwrap().contains("ANTHROPIC_API_KEY"));
    }

    #[test]
    fn resume_id_overrides_continue() {
        let tmp = tempfile::tempdir().unwrap();
        let mut r = req(
            tmp.path(),
            Target::Powershell,
            sel(&[("flag.continue", None), ("flag.resume", Some("old")), ("flag.model", Some("opus"))]),
        );
        r.resume_id = Some("abc-123".into());
        let s = plan_t(&r, tmp.path()).script.unwrap();
        assert!(s.trim_end().ends_with("claude --model opus --resume abc-123"), "{s}");
        assert!(!s.contains("--continue") && !s.contains("old"));
        r.resume_id = None;
        let s = plan_t(&r, tmp.path()).script.unwrap();
        assert!(s.contains("--continue") && s.contains("--resume old"));
    }

    #[test]
    fn unknown_ids_ignored() {
        let tmp = tempfile::tempdir().unwrap();
        let r = req(tmp.path(), Target::Powershell, sel(&[("flag.nope", Some("x")), ("env.NOPE", None)]));
        let s = plan_t(&r, tmp.path()).script.unwrap();
        assert!(s.ends_with("claude\r\n") && !s.contains("nope") && !s.contains("NOPE"));
    }

    #[test]
    fn missing_path_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let r = req(&tmp.path().join("nope"), Target::Wt, Selection::new());
        assert_eq!(plan_in(tmp.path(), &r, &load_embedded(), &no_secret, "pwsh").unwrap_err().code, "path_not_found");
        let file = tmp.path().join("f.txt");
        std::fs::write(&file, "x").unwrap();
        let r = req(&file, Target::Wt, Selection::new());
        assert_eq!(plan_in(tmp.path(), &r, &load_embedded(), &no_secret, "pwsh").unwrap_err().code, "path_not_found");
    }
}

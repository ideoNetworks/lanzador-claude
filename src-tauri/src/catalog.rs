//! Embedded catalog of flags and environment variables, merged with `claude --help`.
use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ValueSpec {
    pub kind: String,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub fixed: Option<String>,
    #[serde(default)]
    pub placeholder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct I18nText {
    pub d: String,
    pub t: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogItem {
    pub id: String,
    pub kind: String,
    pub key: String,
    pub group: String,
    pub value: ValueSpec,
    #[serde(default)]
    pub dangerous: bool,
    #[serde(default)]
    pub from_help: bool,
    pub i18n: BTreeMap<String, I18nText>,
}

const EMBEDDED: &str = include_str!("../resources/catalog.json");

/// Flags never offered in the UI: meta flags and the non-interactive `--print`.
const SKIPPED: [&str; 3] = ["--help", "--version", "--print"];
const MAX_D: usize = 60;

pub fn load_embedded() -> Vec<CatalogItem> {
    serde_json::from_str(EMBEDDED).expect("embedded catalog.json is valid")
}

/// First sentence of `desc`, cut to fit a short description.
fn short(desc: &str) -> String {
    let first = desc.split(". ").next().unwrap_or(desc).trim_end_matches('.');
    if first.chars().count() <= MAX_D {
        return first.to_string();
    }
    let cut: String = first.chars().take(MAX_D - 1).collect();
    format!("{}…", cut.trim_end())
}

/// Help text that ties a flag to non-interactive (print) mode.
fn is_print_only(desc: &str) -> bool {
    let d = desc.to_lowercase();
    ["--print", "--output-format", "--input-format", "print mode"].iter().any(|m| d.contains(m))
}

/// Adds flags found in `claude --help` but missing from the catalog, in group "other".
pub fn merge_help(mut items: Vec<CatalogItem>, parsed: Vec<(String, bool, String)>) -> Vec<CatalogItem> {
    for (flag, takes_value, desc) in parsed {
        if SKIPPED.contains(&flag.as_str())
            || is_print_only(&desc)
            || items.iter().any(|i| i.kind == "flag" && i.key == flag)
        {
            continue;
        }
        let name = flag.trim_start_matches('-');
        let text = I18nText { d: short(&desc), t: desc };
        items.push(CatalogItem {
            id: format!("flag.{name}"),
            kind: "flag".into(),
            key: flag.clone(),
            group: "other".into(),
            value: ValueSpec {
                kind: if takes_value { "text" } else { "none" }.into(),
                options: Vec::new(),
                fixed: None,
                placeholder: None,
            },
            dangerous: false,
            from_help: true,
            i18n: ["es", "en", "zh"].iter().map(|l| (l.to_string(), text.clone())).collect(),
        });
    }
    items
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::help_parser;

    #[test]
    fn embedded_catalog_valid() {
        let items = load_embedded();
        assert!(items.len() > 40, "catalog too small: {}", items.len());
        let mut ids = std::collections::HashSet::new();
        for it in &items {
            assert!(ids.insert(it.id.clone()), "duplicate id {}", it.id);
            let prefix = if it.kind == "flag" { "flag." } else { "env." };
            assert!(it.id.starts_with(prefix), "{}", it.id);
            assert!(["flag", "env"].contains(&it.kind.as_str()));
            assert!(["model", "perm", "ctx", "dbg", "other"].contains(&it.group.as_str()), "{}", it.id);
            for lang in ["es", "en", "zh"] {
                let t = it.i18n.get(lang).unwrap_or_else(|| panic!("{} lacks {lang}", it.id));
                assert!(!t.d.trim().is_empty() && !t.t.trim().is_empty(), "{} {lang}", it.id);
                assert!(t.d.chars().count() <= 60, "{} {lang} d too long", it.id);
            }
            match it.value.kind.as_str() {
                "select" => assert!(!it.value.options.is_empty(), "{}", it.id),
                "fixed" => assert!(it.value.fixed.is_some(), "{}", it.id),
                "none" => assert!(it.value.options.is_empty()),
                "text" | "secret" => {}
                k => panic!("bad kind {k}"),
            }
        }
        let get = |id: &str| items.iter().find(|i| i.id == id).unwrap_or_else(|| panic!("missing {id}"));
        assert_eq!(get("flag.model").value.options, ["fable", "opus", "sonnet", "haiku"]);
        assert!(get("flag.dangerously-skip-permissions").dangerous);
        assert_eq!(get("env.ANTHROPIC_API_KEY").value.kind, "secret");
        assert_eq!(get("env.DISABLE_TELEMETRY").value.fixed.as_deref(), Some("1"));
        assert_eq!(get("flag.permission-mode").value.options.len(), 6);
    }

    #[test]
    fn embedded_catalog_covers_help_interactive_flags() {
        let items = load_embedded();
        for f in ["--resume", "--worktree", "--debug", "--ax-screen-reader", "--fallback-model"] {
            assert!(items.iter().any(|i| i.key == f), "{f}");
        }
    }

    #[test]
    fn merge_skips_print_only() {
        let help = include_str!("../../docs/reference/claude-help.txt");
        let mut parsed = help_parser::parse(help);
        parsed.push(("--brand-new-flag".into(), true, "Brand new thing".into()));
        let merged = merge_help(load_embedded(), parsed);
        assert!(!merged.iter().any(|i| i.key == "--output-format"));
        for f in ["--include-hook-events", "--replay-user-messages", "--permission-prompts"] {
            assert!(!merged.iter().any(|i| i.key == f), "{f} should be skipped");
        }
        assert!(!merged.iter().any(|i| i.key == "--print" || i.key == "--help" || i.key == "--version"));
        let n = merged.iter().find(|i| i.key == "--brand-new-flag").expect("new flag");
        assert_eq!(n.group, "other");
        assert!(n.from_help);
        assert_eq!(n.id, "flag.brand-new-flag");
        assert_eq!(n.i18n["zh"].t, "Brand new thing");
        // known flags are not duplicated
        assert_eq!(merged.iter().filter(|i| i.key == "--model").count(), 1);
    }
}

//! Installer seed read from `HKCU\Software\iDeo\LanzadorClaude\Seed`.
use crate::config::AppConfig;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Seed {
    pub autostart: bool,
    pub profile: Option<String>,
    pub pinned: Vec<(String, Option<String>)>,
}

/// Parse `id[=value];id2;...` (trim, skip empties). Value is everything after the first `=`.
pub fn parse_pinned(s: &str) -> Vec<(String, Option<String>)> {
    s.split(';')
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .filter_map(|p| match p.split_once('=') {
            Some((id, v)) => {
                let id = id.trim();
                (!id.is_empty()).then(|| (id.to_string(), Some(v.trim().to_string())))
            }
            None => Some((p.to_string(), None)),
        })
        .collect()
}

#[cfg(windows)]
pub fn read_seed() -> Option<Seed> {
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};
    let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey(r"Software\iDeo\LanzadorClaude\Seed").ok()?;
    let autostart = key.get_value::<u32, _>("Autostart").map(|v| v != 0).unwrap_or(false);
    let profile = key.get_value::<String, _>("Profile").ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let pinned = key.get_value::<String, _>("Pinned").map(|s| parse_pinned(&s)).unwrap_or_default();
    Some(Seed { autostart, profile, pinned })
}

#[cfg(not(windows))]
pub fn read_seed() -> Option<Seed> {
    None
}

pub fn apply(config: &mut AppConfig, seed: Seed) {
    config.autostart = seed.autostart;
    for (id, value) in seed.pinned {
        config.pinned.insert(id, value);
    }
    if let Some(id) = seed.profile {
        if let Some(p) = config.profiles.iter().find(|p| p.id == id) {
            for (k, v) in p.selection.clone() {
                config.pinned.insert(k, v);
            }
        }
        config.active_profile = Some(id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AppConfig;

    #[test]
    fn parse_pinned_handles_values_and_blanks() {
        let got = parse_pinned(" flag.model=opus ;; env.X ; flag.a=b=c ");
        assert_eq!(
            got,
            vec![
                ("flag.model".to_string(), Some("opus".to_string())),
                ("env.X".to_string(), None),
                ("flag.a".to_string(), Some("b=c".to_string())),
            ]
        );
    }

    #[test]
    fn seed_parses_pairs() {
        let got: std::collections::BTreeMap<_, _> = parse_pinned("flag.model=opus;flag.continue").into_iter().collect();
        assert_eq!(got.get("flag.model"), Some(&Some("opus".to_string())));
        assert_eq!(got.get("flag.continue"), Some(&None));
        assert_eq!(got.len(), 2);
    }

    #[test]
    fn seed_apply_merges_profile_and_pinned() {
        let mut cfg = AppConfig::default();
        let seed = Seed {
            autostart: true,
            profile: Some("ps-opus".into()),
            pinned: vec![("flag.verbose".into(), None), ("flag.model".into(), Some("sonnet".into()))],
        };
        apply(&mut cfg, seed);
        assert!(cfg.autostart);
        assert_eq!(cfg.active_profile.as_deref(), Some("ps-opus"));
        assert_eq!(cfg.pinned.get("flag.verbose"), Some(&None));
        // profile selection merged after explicit pinned
        assert_eq!(cfg.pinned.get("env.CLAUDE_CODE_USE_POWERSHELL_TOOL"), Some(&Some("1".to_string())));
        assert_eq!(cfg.pinned.get("flag.model"), Some(&Some("opus".to_string())));
    }
}

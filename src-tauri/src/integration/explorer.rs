//! Explorer context menu "Open with Claude" (HKCU, no admin needed).
use crate::config;
use crate::error::AppResult;

#[cfg(windows)]
const KEY_NAME: &str = "LanzadorClaude";
const ROOT: &str = r"Software\Classes";
#[cfg(windows)]
const PARENTS: [&str; 2] = [r"Directory\shell", r"Directory\Background\shell"];

/// Menu text per language.
pub fn menu_text(lang: &str) -> &'static str {
    match lang {
        "en" => "Open with Claude",
        "zh" => "用 Claude 打开",
        _ => "Abrir con Claude",
    }
}

/// `"<exe>" --open "%V"`
pub fn explorer_command(exe: &str) -> String {
    format!("\"{exe}\" --open \"%V\"")
}

#[cfg(windows)]
pub fn write_menu(root: &str, enabled: bool, exe: &str, lang: &str) -> AppResult<()> {
    use winreg::RegKey;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_ALL_ACCESS};
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    for parent in PARENTS {
        let base = format!(r"{root}\{parent}\{KEY_NAME}");
        if enabled {
            let (key, _) = hkcu.create_subkey_with_flags(&base, KEY_ALL_ACCESS)?;
            key.set_value("", &menu_text(lang))?;
            key.set_value("Icon", &exe)?;
            let (cmd, _) = key.create_subkey("command")?;
            cmd.set_value("", &explorer_command(exe))?;
        } else {
            match hkcu.delete_subkey_all(&base) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.into()),
            }
        }
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn write_menu(_: &str, _: bool, _: &str, _: &str) -> AppResult<()> {
    Ok(())
}

pub fn apply(enabled: bool) -> AppResult<()> {
    let exe = std::env::current_exe()?.to_string_lossy().into_owned();
    write_menu(ROOT, enabled, &exe, &super::current_lang())
}

/// Refreshes the menu text (language change) when the menu is enabled.
pub fn refresh_if_enabled() {
    if config::load().explorer_menu {
        let _ = apply(true);
    }
}

#[tauri::command]
pub fn set_explorer_menu(app: tauri::AppHandle, enabled: bool) -> AppResult<()> {
    apply(enabled)?;
    let mut cfg = config::load();
    cfg.explorer_menu = enabled;
    super::save_and_notify(&app, &cfg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explorer_command_string() {
        assert_eq!(
            explorer_command(r"C:\Program Files\iDeo\lanzador-claude.exe"),
            r#""C:\Program Files\iDeo\lanzador-claude.exe" --open "%V""#
        );
    }

    #[test]
    fn menu_text_per_language() {
        assert_eq!(menu_text("es"), "Abrir con Claude");
        assert_eq!(menu_text("en"), "Open with Claude");
        assert_eq!(menu_text("zh"), "用 Claude 打开");
    }

    #[cfg(windows)]
    #[test]
    fn registry_roundtrip_in_scratch_root() {
        use winreg::RegKey;
        use winreg::enums::HKEY_CURRENT_USER;
        let root = r"Software\LanzadorClaudeTest\Classes";
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        write_menu(root, true, r"C:\x y\a.exe", "en").unwrap();
        let k = hkcu.open_subkey(format!(r"{root}\Directory\Background\shell\LanzadorClaude")).unwrap();
        assert_eq!(k.get_value::<String, _>("").unwrap(), "Open with Claude");
        let c = k.open_subkey("command").unwrap();
        assert_eq!(c.get_value::<String, _>("").unwrap(), r#""C:\x y\a.exe" --open "%V""#);
        write_menu(root, false, "", "en").unwrap();
        assert!(hkcu.open_subkey(format!(r"{root}\Directory\shell\LanzadorClaude")).is_err());
        let _ = hkcu.delete_subkey_all(r"Software\LanzadorClaudeTest");
    }
}

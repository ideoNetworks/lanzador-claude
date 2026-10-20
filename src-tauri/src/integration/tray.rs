//! System tray icon and menu.
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter};

use crate::config::{self, AppConfig};
use crate::error::{AppError, AppResult};

const TRAY_ID: &str = "main";
const MAX_RECENTS: usize = 8;

pub struct TrayLabels {
    pub open: &'static str,
    pub recents: &'static str,
    pub no_recents: &'static str,
    pub new_project: &'static str,
    pub autostart: &'static str,
    pub language: &'static str,
    pub about: &'static str,
    pub quit: &'static str,
}

/// Tray-only dictionary (the tray is built in Rust, outside the UI i18n files).
pub fn tray_labels(lang: &str) -> TrayLabels {
    match lang {
        "en" => TrayLabels {
            open: "Open",
            recents: "Recent",
            no_recents: "(none)",
            new_project: "New project",
            autostart: "Start with Windows",
            language: "Language",
            about: "About",
            quit: "Quit",
        },
        "zh" => TrayLabels {
            open: "打开",
            recents: "最近",
            no_recents: "（无）",
            new_project: "新建项目",
            autostart: "开机启动",
            language: "语言",
            about: "关于",
            quit: "退出",
        },
        _ => TrayLabels {
            open: "Abrir",
            recents: "Recientes",
            no_recents: "(ninguno)",
            new_project: "Proyecto nuevo",
            autostart: "Arrancar con Windows",
            language: "Idioma",
            about: "Acerca de",
            quit: "Salir",
        },
    }
}

/// Languages offered in the tray, each labelled in its own language.
pub const LANGUAGES: [(&str, &str); 3] = [("es", "Español"), ("en", "English"), ("zh", "中文")];

/// Menu text for a path: `&` would otherwise become an accelerator marker.
pub fn recent_label(path: &str) -> String {
    path.replace('&', "&&")
}

fn build_menu(app: &AppHandle, cfg: &AppConfig, lang: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let l = tray_labels(lang);
    let recents = Submenu::with_id(app, "recents", l.recents, true)?;
    if cfg.recents.is_empty() {
        recents.append(&MenuItem::with_id(app, "none", l.no_recents, false, None::<&str>)?)?;
    }
    for path in cfg.recents.iter().take(MAX_RECENTS) {
        recents.append(&MenuItem::with_id(app, format!("recent:{path}"), recent_label(path), true, None::<&str>)?)?;
    }
    let langs = Submenu::with_id(app, "lang", l.language, true)?;
    for (code, name) in LANGUAGES {
        langs.append(&CheckMenuItem::with_id(app, format!("lang:{code}"), name, true, code == lang, None::<&str>)?)?;
    }
    Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "open", l.open, true, None::<&str>)?,
            &recents,
            &MenuItem::with_id(app, "new", l.new_project, true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &CheckMenuItem::with_id(app, "autostart", l.autostart, true, cfg.autostart, None::<&str>)?,
            &langs,
            &MenuItem::with_id(app, "about", l.about, true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", l.quit, true, None::<&str>)?,
        ],
    )
}

fn icon(app: &AppHandle, cfg: &AppConfig) -> Option<Image<'static>> {
    if let Some(p) = cfg.branding.tray_icon_path.as_deref().filter(|p| !p.is_empty())
        && let Ok(img) = Image::from_path(p)
    {
        return Some(img);
    }
    app.default_window_icon().map(|i| i.clone().to_owned())
}

fn on_menu(app: &AppHandle, id: &str) {
    match id {
        "open" => super::show_main(app),
        "new" => {
            super::show_main(app);
            let _ = app.emit("navigate", "new");
        }
        "about" => {
            super::show_main(app);
            let _ = app.emit("navigate", "about");
        }
        "quit" => app.exit(0),
        "autostart" => {
            let enabled = !config::load().autostart;
            let _ = super::apply_autostart(app, enabled);
            rebuild(app);
        }
        _ => {
            if let Some(path) = id.strip_prefix("recent:") {
                super::show_main(app);
                let _ = app.emit("open-path", path);
            } else if let Some(code) = id.strip_prefix("lang:") {
                set_language(app, code);
            }
        }
    }
}

fn set_language(app: &AppHandle, code: &str) {
    let mut cfg = config::load();
    cfg.language = Some(code.to_string());
    if super::save_and_notify(app, &cfg).is_ok() {
        let _ = app.emit("language-changed", code);
        super::explorer::refresh_if_enabled();
        rebuild(app);
    }
}

/// Creates the tray icon (once, at startup).
pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let cfg = config::load();
    let lang = super::current_lang();
    let mut b = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&build_menu(app, &cfg, &lang)?)
        .show_menu_on_left_click(false)
        .tooltip("Lanzador Claude")
        .on_menu_event(|app, ev| on_menu(app, ev.id().as_ref()))
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                super::toggle_main(tray.app_handle());
            }
        });
    if let Some(i) = icon(app, &cfg) {
        b = b.icon(i);
    }
    b.build(app)?;
    Ok(())
}

/// Rebuilds menu (and icon) from the current config.
pub fn rebuild(app: &AppHandle) {
    let cfg = config::load();
    let lang = super::current_lang();
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), build_menu(app, &cfg, &lang)) {
        let _ = tray.set_menu(Some(menu));
        if let Some(i) = icon(app, &cfg) {
            let _ = tray.set_icon(Some(i));
        }
    }
}

#[tauri::command]
pub fn refresh_tray(app: AppHandle) -> AppResult<()> {
    if app.tray_by_id(TRAY_ID).is_none() {
        return Err(AppError::new("tray_missing", "tray not created"));
    }
    rebuild(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_labels_all_langs() {
        for lang in ["es", "en", "zh"] {
            let l = tray_labels(lang);
            for s in [l.open, l.recents, l.no_recents, l.new_project, l.autostart, l.language, l.about, l.quit] {
                assert!(!s.is_empty(), "{lang}");
            }
        }
        assert_ne!(tray_labels("es").open, tray_labels("en").open);
        assert_ne!(tray_labels("zh").open, tray_labels("en").open);
    }

    #[test]
    fn recent_label_escapes_ampersand() {
        assert_eq!(recent_label(r"C:\R&D\app"), r"C:\R&&D\app");
    }

    #[test]
    fn language_menu_in_own_language() {
        assert_eq!(LANGUAGES, [("es", "Español"), ("en", "English"), ("zh", "中文")]);
    }
}

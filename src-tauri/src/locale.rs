//! System UI language detection.

/// Map a BCP-47 tag to a supported UI language (`es`, `zh`, else `en`).
pub fn map_locale(tag: &str) -> &'static str {
    let t = tag.to_ascii_lowercase();
    if t == "es" || t.starts_with("es-") || t.starts_with("es_") {
        "es"
    } else if t == "zh" || t.starts_with("zh-") || t.starts_with("zh_") {
        "zh"
    } else {
        "en"
    }
}

pub fn detect() -> String {
    map_locale(&sys_locale::get_locale().unwrap_or_default()).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_locales() {
        let cases = [("es-ES", "es"), ("es-MX", "es"), ("zh-CN", "zh"), ("zh-TW", "zh"), ("en-US", "en"), ("fr-FR", "en")];
        for (input, want) in cases {
            assert_eq!(map_locale(input), want, "{input}");
        }
    }
}

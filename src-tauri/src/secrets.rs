//! Secrets in Windows Credential Manager (service `LanzadorClaude`, user = key).
use crate::error::{AppError, AppResult};

const SERVICE: &str = "LanzadorClaude";

fn entry(key: &str) -> AppResult<keyring::Entry> {
    if key.is_empty() {
        return Err(AppError::new("invalid_key", "empty key"));
    }
    keyring::Entry::new(SERVICE, key).map_err(|e| AppError::new("secret_store_failed", e.to_string()))
}

pub fn set(key: &str, value: &str) -> AppResult<()> {
    entry(key)?.set_password(value).map_err(|e| AppError::new("secret_store_failed", e.to_string()))
}

/// None when missing or on any store error.
pub fn get(key: &str) -> Option<String> {
    entry(key).ok()?.get_password().ok()
}

pub fn has(key: &str) -> bool {
    get(key).is_some()
}

/// Deleting a missing secret is Ok.
pub fn delete(key: &str) -> AppResult<()> {
    match entry(key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::new("secret_store_failed", e.to_string())),
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    struct Cleanup(String);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = delete(&self.0);
        }
    }

    #[test]
    fn roundtrip_secret() {
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let key = format!("__test__{}_{nanos}", std::process::id());
        let _guard = Cleanup(key.clone());
        assert!(!has(&key));
        set(&key, "sk-ant-it's").unwrap();
        assert!(has(&key));
        assert_eq!(get(&key).as_deref(), Some("sk-ant-it's"));
        delete(&key).unwrap();
        assert!(!has(&key));
        assert_eq!(get(&key), None);
        delete(&key).unwrap(); // missing is Ok
    }

    #[test]
    fn empty_key_rejected() {
        assert_eq!(set("", "x").unwrap_err().code, "invalid_key");
        assert_eq!(delete("").unwrap_err().code, "invalid_key");
        assert!(!has(""));
    }
}

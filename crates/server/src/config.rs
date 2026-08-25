//! The only thing worth remembering between runs: which folders you opened.

use std::path::{Path, PathBuf};

const KEEP: usize = 12;

fn file() -> Option<PathBuf> {
    let dir = dirs::config_dir()?.join("filestoai");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("recent.json"))
}

pub fn recent() -> Vec<String> {
    let Some(path) = file() else {
        return Vec::new();
    };
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let stored: Vec<String> = serde_json::from_str(&text).unwrap_or_default();
    // A folder that has since been deleted is noise in a picker, not history.
    stored
        .into_iter()
        .filter(|entry| Path::new(entry).is_dir())
        .collect()
}

/// Move `root` to the front of the list. Best effort throughout: a tool that
/// cannot write its history file should still export.
pub fn remember(root: &Path) {
    let Some(path) = file() else { return };
    let root = root.to_string_lossy().into_owned();

    let mut entries = recent();
    entries.retain(|entry| entry != &root);
    entries.insert(0, root);
    entries.truncate(KEEP);

    if let Ok(text) = serde_json::to_string_pretty(&entries) {
        let _ = std::fs::write(path, text);
    }
}

pub fn forget_all() {
    if let Some(path) = file() {
        let _ = std::fs::remove_file(path);
    }
}

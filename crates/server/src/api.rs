//! The whole API. Three questions and three conveniences.

use std::path::PathBuf;

use axum::Json;
use axum::extract::State;
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use filestoai_core::{ExportOptions, Format, ScanOptions, Stats};
use serde::{Deserialize, Serialize};

use crate::{config, native};

type Answer<T> = Result<Json<T>, Failure>;

/// An error with a sentence in it. The interface shows the sentence.
pub struct Failure(StatusCode, String);

impl Failure {
    fn bad(message: impl std::fmt::Display) -> Self {
        Self(StatusCode::BAD_REQUEST, message.to_string())
    }
}

impl IntoResponse for Failure {
    fn into_response(self) -> Response {
        (self.0, Json(serde_json::json!({ "error": self.1 }))).into_response()
    }
}

// ── what this machine looks like ────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Context {
    version: &'static str,
    cwd: String,
    home: String,
    separator: char,
    recent: Vec<String>,
}

pub async fn context() -> Json<Context> {
    Json(Context {
        version: env!("CARGO_PKG_VERSION"),
        cwd: std::env::current_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
        home: dirs::home_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
        separator: std::path::MAIN_SEPARATOR,
        recent: config::recent(),
    })
}

// ── what is in this folder ──────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanRequest {
    path: String,
    #[serde(default = "yes")]
    gitignore: bool,
    #[serde(default)]
    hidden: bool,
    #[serde(default)]
    ignore: Vec<String>,
}

fn yes() -> bool {
    true
}

pub async fn scan(Json(request): Json<ScanRequest>) -> Answer<filestoai_core::Scan> {
    let options = ScanOptions {
        gitignore: request.gitignore,
        hidden: request.hidden,
        ignore: request.ignore,
        follow_links: false,
    };
    let path = PathBuf::from(expand(&request.path));

    // Walking a large repository is seconds of synchronous file work, which
    // does not belong on a thread that is also answering requests.
    let found = blocking(move || filestoai_core::scan(&path, &options))
        .await?
        .map_err(Failure::bad)?;

    config::remember(&found.root);
    Ok(Json(found))
}

// ── render these paths ──────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    root: String,
    paths: Vec<String>,
    #[serde(default)]
    format: Format,
    #[serde(default = "default_max")]
    max_bytes: u64,
    #[serde(default = "yes")]
    map: bool,
    #[serde(default = "yes")]
    contents: bool,
}

fn default_max() -> u64 {
    100 * 1024
}

#[derive(Serialize)]
pub struct ExportResponse {
    text: String,
    stats: Stats,
}

pub async fn export(Json(request): Json<ExportRequest>) -> Answer<ExportResponse> {
    let root = PathBuf::from(expand(&request.root));
    let options = ExportOptions {
        format: request.format,
        max_bytes: request.max_bytes,
        map: request.map,
        contents: request.contents,
    };

    let result = blocking(move || filestoai_core::export(&root, &request.paths, &options)).await?;
    Ok(Json(ExportResponse {
        text: result.text,
        stats: result.stats,
    }))
}

// ── conveniences ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct FoldersRequest {
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folders {
    path: String,
    parent: Option<String>,
    folders: Vec<String>,
}

/// One level of the filesystem, for choosing a project without typing a path.
pub async fn folders(Json(request): Json<FoldersRequest>) -> Answer<Folders> {
    let path = PathBuf::from(expand(&request.path));
    let path = std::fs::canonicalize(&path)
        .map_err(|e| Failure::bad(format!("cannot read {}: {e}", path.display())))?;

    let mut folders: Vec<String> = std::fs::read_dir(&path)
        .map_err(|e| Failure::bad(format!("cannot read {}: {e}", path.display())))?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|t| t.is_dir()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| !name.starts_with('.'))
        .collect();
    folders.sort_by_key(|name| name.to_lowercase());

    Ok(Json(Folders {
        path: path.to_string_lossy().into_owned(),
        parent: path
            .parent()
            .map(|parent| parent.to_string_lossy().into_owned()),
        folders,
    }))
}

#[derive(Deserialize)]
pub struct FileRequest {
    root: String,
    path: String,
    #[serde(default)]
    reveal: bool,
}

/// The bytes of one file, for showing an attachment that is not text.
/// Answered as an octet stream and never as HTML, so that nothing served
/// from here can execute in the interface's origin.
pub async fn raw(Json(request): Json<FileRequest>) -> Result<Response, Failure> {
    let path = within(&request.root, &request.path)?;
    let bytes = std::fs::read(&path)
        .map_err(|e| Failure::bad(format!("cannot read {}: {e}", path.display())))?;

    Ok((
        [
            (header::CONTENT_TYPE, "application/octet-stream"),
            (header::CONTENT_DISPOSITION, "inline"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        bytes,
    )
        .into_response())
}

pub async fn open(Json(request): Json<FileRequest>) -> Result<StatusCode, Failure> {
    let path = within(&request.root, &request.path)?;
    let result = if request.reveal {
        native::reveal(&path)
    } else {
        native::open(&path)
    };
    result.map_err(|e| Failure::bad(format!("cannot open {}: {e}", path.display())))?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn forget(State(_): State<crate::State>) -> StatusCode {
    config::forget_all();
    StatusCode::NO_CONTENT
}

// ── helpers ─────────────────────────────────────────────────────────────────

/// A leading `~` is a path everywhere except in the syscall.
fn expand(path: &str) -> String {
    let path = path.trim();
    let Some(rest) = path.strip_prefix('~') else {
        return path.to_string();
    };
    match dirs::home_dir() {
        Some(home) => format!("{}{rest}", home.display()),
        None => path.to_string(),
    }
}

/// Resolve `relative` under `root` and refuse to leave it.
///
/// Both sides are canonicalised before the comparison, so `../` in the path,
/// a symlink pointing outside the project, and a root reached by a different
/// spelling all end up as the same string or as an error.
fn within(root: &str, relative: &str) -> Result<PathBuf, Failure> {
    let root = std::fs::canonicalize(expand(root))
        .map_err(|e| Failure::bad(format!("cannot read the project folder: {e}")))?;
    let target = std::fs::canonicalize(root.join(relative))
        .map_err(|e| Failure::bad(format!("cannot read {relative}: {e}")))?;

    if target.starts_with(&root) {
        Ok(target)
    } else {
        Err(Failure(
            StatusCode::FORBIDDEN,
            format!("{relative} is outside the project"),
        ))
    }
}

/// Run synchronous file work off the request threads.
async fn blocking<T, F>(work: F) -> Result<T, Failure>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(work).await.map_err(|e| {
        Failure(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("the work did not finish: {e}"),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_path_cannot_climb_out_of_the_project() {
        let root = std::env::temp_dir().join(format!("filestoai-within-{}", std::process::id()));
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/main.rs"), "x").unwrap();
        let root = root.to_string_lossy().into_owned();

        assert!(within(&root, "src/main.rs").is_ok());
        assert!(within(&root, "../../../etc/passwd").is_err());
        assert!(within(&root, "/etc/passwd").is_err());

        let _ = std::fs::remove_dir_all(&root);
    }
}

//! The compiled interface, carried inside the binary.

use axum::http::{StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};

#[derive(rust_embed::Embed)]
#[folder = "dist"]
struct Assets;

/// Everything that is not the API is the interface. Hashed asset names can be
/// cached forever; the entry document never can, or an upgrade would serve
/// last week's HTML against this week's assets.
pub async fn serve(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    match Assets::get(path) {
        Some(file) => {
            let mime = file.metadata.mimetype();
            let cache = if path == "index.html" {
                "no-store"
            } else {
                "public, max-age=31536000, immutable"
            };
            (
                [(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, cache)],
                file.data,
            )
                .into_response()
        }
        // A single-page interface owns its own routes; an unknown path is the
        // entry document, not a 404.
        None => match Assets::get("index.html") {
            Some(file) => (
                [
                    (header::CONTENT_TYPE, "text/html"),
                    (header::CACHE_CONTROL, "no-store"),
                ],
                file.data,
            )
                .into_response(),
            None => (StatusCode::NOT_FOUND, "the interface was not built").into_response(),
        },
    }
}

//! The local interface.
//!
//! The server holds no state about your selection. It answers three
//! questions — what is in this folder, render these paths, and open this file
//! — and the browser owns everything else. That is why two tabs cannot
//! disagree, why reloading loses nothing, and why the whole thing is a few
//! hundred lines.

mod api;
mod config;
mod native;
mod security;
mod ui;

use std::net::{Ipv4Addr, SocketAddr};

use axum::Router;
use axum::routing::{get, post};

pub use security::Token;

#[derive(Clone)]
pub(crate) struct State {
    pub token: Token,
}

/// Serve the interface on loopback until interrupted.
pub fn serve(port: u16, open_browser: bool) -> std::io::Result<()> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    runtime.block_on(run(port, open_browser))
}

async fn run(port: u16, open_browser: bool) -> std::io::Result<()> {
    let token = Token::new();
    let state = State {
        token: token.clone(),
    };

    let app = Router::new()
        .route("/api/context", get(api::context))
        .route("/api/scan", post(api::scan))
        .route("/api/export", post(api::export))
        .route("/api/folders", post(api::folders))
        .route("/api/raw", post(api::raw))
        .route("/api/open", post(api::open))
        .route("/api/forget", post(api::forget))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            security::guard,
        ))
        .fallback(ui::serve)
        .with_state(state);

    // Loopback only. This process can read every file the user can, so it
    // must never be reachable from the network.
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let listener = tokio::net::TcpListener::bind(address).await.map_err(|e| {
        std::io::Error::new(
            e.kind(),
            format!("cannot listen on {address} ({e}) — try --port"),
        )
    })?;

    let url = format!("http://{address}/#{}", token.as_str());
    eprintln!("FilesToAI is at {url}");
    eprintln!("Press Ctrl-C to stop.");
    if open_browser {
        native::browser(&url);
    }

    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
            eprintln!();
        })
        .await
}

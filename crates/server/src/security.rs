//! Why a local tool needs a door.
//!
//! Binding to loopback stops the network reaching this process. It does not
//! stop a web page you have open in the same browser: any site can POST to
//! `http://127.0.0.1:5023`, and this process can read every file you can.
//!
//! Two things close that. A secret in a header, because a cross-origin page
//! cannot set a custom header without a preflight this server never approves;
//! and an origin check, because the only page entitled to ask is the one this
//! server served. The secret arrives in the URL fragment, which browsers do
//! not send anywhere, and the interface swaps it for `sessionStorage` on load.

use axum::extract::{Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::Next;
use axum::response::Response;

pub const HEADER: &str = "x-filestoai-token";

#[derive(Clone)]
pub struct Token(String);

impl Token {
    pub fn new() -> Self {
        let mut bytes = [0u8; 16];
        getrandom::fill(&mut bytes).expect("no source of randomness");
        Self(bytes.iter().map(|b| format!("{b:02x}")).collect())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Compared without an early exit, so the answer's timing carries no
    /// information about how much of the guess was right.
    fn matches(&self, guess: &str) -> bool {
        if guess.len() != self.0.len() {
            return false;
        }
        self.0
            .bytes()
            .zip(guess.bytes())
            .fold(0u8, |difference, (a, b)| difference | (a ^ b))
            == 0
    }
}

impl Default for Token {
    fn default() -> Self {
        Self::new()
    }
}

pub(crate) async fn guard(
    State(state): State<crate::State>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // A same-origin fetch sends no Origin header, or sends ours. Anything
    // else is another page asking, whatever it claims.
    if let Some(origin) = request.headers().get(header::ORIGIN) {
        let allowed = origin.to_str().is_ok_and(|value| {
            value.starts_with("http://127.0.0.1:") || value.starts_with("http://localhost:")
        });
        if !allowed {
            return Err(StatusCode::FORBIDDEN);
        }
    }

    let presented = request
        .headers()
        .get(HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();

    if state.token.matches(presented) {
        Ok(next.run(request).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_token_is_long_enough_to_be_worth_guessing() {
        assert_eq!(Token::new().as_str().len(), 32);
    }

    #[test]
    fn two_runs_do_not_share_a_token() {
        assert_ne!(Token::new().as_str(), Token::new().as_str());
    }

    #[test]
    fn only_the_exact_token_matches() {
        let token = Token::new();
        let correct = token.as_str().to_string();
        assert!(token.matches(&correct));
        assert!(!token.matches(""));
        assert!(!token.matches(&correct[..31]));
        assert!(!token.matches(&format!("{correct}x")));

        let mut wrong = correct.clone();
        wrong.replace_range(0..1, if &correct[0..1] == "a" { "b" } else { "a" });
        assert!(!token.matches(&wrong));
    }
}

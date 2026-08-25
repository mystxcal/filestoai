//! What the command line says about what it did.
//!
//! All of it on stderr, so that redirecting stdout gives you the export and
//! nothing else.

use std::io::{IsTerminal, Write};

use filestoai_core::{Scan, Stats, format_count, format_size};

/// `filestoai . | head` closes the pipe early, and that is not a failure. Rust
/// ignores SIGPIPE, so the write comes back as an error and we have to say so
/// ourselves.
pub fn is_closed_pipe(error: &std::io::Error) -> bool {
    error.kind() == std::io::ErrorKind::BrokenPipe
}

/// ANSI only when someone is there to see it, and never when `NO_COLOR` is set.
fn styled() -> bool {
    std::io::stderr().is_terminal() && std::env::var_os("NO_COLOR").is_none()
}

fn paint(text: &str, code: &str) -> String {
    if styled() {
        format!("\x1b[{code}m{text}\x1b[0m")
    } else {
        text.to_string()
    }
}

const DIM: &str = "2";
const BOLD: &str = "1";
const RED: &str = "31";

pub fn summary(stats: &Stats, unreadable: usize, destination: &str) {
    let headline = format!(
        "{} {} · {} · {} tokens {} {}",
        paint(&stats.included.to_string(), BOLD),
        if stats.included == 1 { "file" } else { "files" },
        format_size(stats.bytes),
        paint(&format!("~{}", format_count(stats.tokens)), BOLD),
        paint("→", DIM),
        destination,
    );

    let mut notes = Vec::new();
    if stats.oversize > 0 {
        notes.push(format!("{} over the size limit", stats.oversize));
    }
    if stats.binary > 0 {
        notes.push(format!("{} not text", stats.binary));
    }
    if stats.missing > 0 {
        notes.push(format!("{} unreadable", stats.missing));
    }
    if unreadable > 0 {
        notes.push(format!("{unreadable} skipped while walking"));
    }

    let mut err = std::io::stderr().lock();
    let _ = writeln!(err, "{headline}");
    if !notes.is_empty() {
        let _ = writeln!(
            err,
            "{}",
            paint(
                &format!("  named but not quoted: {}", notes.join(", ")),
                DIM
            )
        );
    }
}

/// `--list`. A table when a person is reading it, bare paths when a program is.
pub fn listing(found: &Scan) -> Result<(), String> {
    let mut out = std::io::stdout().lock();

    if !std::io::stdout().is_terminal() {
        for entry in &found.entries {
            if let Err(error) = writeln!(out, "{}", entry.path) {
                return if is_closed_pipe(&error) {
                    Ok(())
                } else {
                    Err(error.to_string())
                };
            }
        }
        return Ok(());
    }

    let width = found
        .entries
        .iter()
        .map(|e| e.path.chars().count())
        .max()
        .unwrap_or(0)
        .min(80);

    let mut tokens = 0;
    let mut bytes = 0;
    for entry in &found.entries {
        tokens += entry.tokens;
        bytes += entry.size;
        let size = format_size(entry.size);
        let count = if entry.tokens > 0 {
            format!("~{}", format_count(entry.tokens))
        } else {
            entry.kind.noun().to_string()
        };
        if let Err(error) = writeln!(
            out,
            "{:width$}  {:>9}  {}",
            entry.path,
            size,
            paint(&count, DIM)
        ) {
            return if is_closed_pipe(&error) {
                Ok(())
            } else {
                Err(error.to_string())
            };
        }
    }

    let _ = writeln!(
        std::io::stderr(),
        "{}",
        paint(
            &format!(
                "{} files · {} · ~{} tokens",
                found.entries.len(),
                format_size(bytes),
                format_count(tokens)
            ),
            DIM
        )
    );
    Ok(())
}

pub fn failure(message: &str) {
    let _ = writeln!(std::io::stderr(), "{} {message}", paint("error:", RED));
}

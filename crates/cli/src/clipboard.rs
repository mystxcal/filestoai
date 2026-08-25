//! Putting text on the system clipboard and having it still be there
//! afterwards.
//!
//! On macOS and Windows the clipboard is owned by the window server, so a
//! process can set it and exit. X11 and Wayland are the other way round: the
//! text lives in the process that offered it, and vanishes the moment that
//! process dies — which is every clipboard tool's oldest bug. So on Linux we
//! hand the text to a detached copy of ourselves whose only job is to stay
//! alive holding it, the way `xclip` forks. `--hold-clipboard` is that copy.

use std::io::Write;

pub const HOLD_FLAG: &str = "--hold-clipboard";

pub fn copy(text: &str) -> Result<(), String> {
    if cfg!(target_os = "linux") {
        hand_off(text)
    } else {
        set(text)
    }
}

/// Set the clipboard in this process and return.
fn set(text: &str) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

/// Spawn the holder and feed it the text down a pipe. Arguments have length
/// limits and leak into `ps`; a pipe has neither problem.
fn hand_off(text: &str) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut child = std::process::Command::new(exe)
        .arg(HOLD_FLAG)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;

    child
        .stdin
        .take()
        .ok_or("no pipe to the clipboard holder")?
        .write_all(text.as_bytes())
        .map_err(|e| e.to_string())?;

    // Deliberately not waited on: it outlives us, holding the selection.
    Ok(())
}

/// The detached half. Reads the text from stdin and blocks until another
/// application takes the selection, then exits.
pub fn hold() -> ! {
    let mut text = String::new();
    let code = match std::io::Read::read_to_string(&mut std::io::stdin(), &mut text) {
        Ok(_) => match offer(&text) {
            Ok(()) => 0,
            Err(_) => 1,
        },
        Err(_) => 1,
    };
    std::process::exit(code);
}

#[cfg(target_os = "linux")]
fn offer(text: &str) -> Result<(), String> {
    use arboard::SetExtLinux;
    arboard::Clipboard::new()
        .map_err(|e| e.to_string())?
        .set()
        .wait()
        .text(text)
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "linux"))]
fn offer(text: &str) -> Result<(), String> {
    set(text)
}

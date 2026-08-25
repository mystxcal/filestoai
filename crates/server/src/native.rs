//! The three things only the host desktop can do: open a file with whatever
//! owns it, show it in the file manager, and open a browser.

use std::ffi::OsStr;
use std::path::Path;
use std::process::{Command, Stdio};

/// Hand something to the desktop and return. Nothing here waits on the child:
/// these commands hand off to an already-running application, and their exit
/// code says nothing about what the person actually saw.
fn detach(mut command: Command) -> std::io::Result<()> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
}

fn opener(target: &OsStr) -> Command {
    let mut command = if cfg!(target_os = "macos") {
        Command::new("open")
    } else if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        // The empty string is the window title `start` would otherwise take
        // the target for.
        c.args(["/C", "start", ""]);
        c
    } else {
        Command::new("xdg-open")
    };
    command.arg(target);
    command
}

pub fn open(path: &Path) -> std::io::Result<()> {
    detach(opener(path.as_os_str()))
}

pub fn browser(url: &str) {
    let _ = detach(opener(OsStr::new(url)));
}

/// Show a file in its folder with the file itself selected. Every platform
/// spells this differently, and none of them spell it `open`.
pub fn reveal(path: &Path) -> std::io::Result<()> {
    if cfg!(target_os = "macos") {
        let mut command = Command::new("open");
        command.args([OsStr::new("-R"), path.as_os_str()]);
        return detach(command);
    }

    if cfg!(target_os = "windows") {
        let mut command = Command::new("explorer");
        command.arg(format!("/select,{}", path.display()));
        return detach(command);
    }

    // Freedesktop standardised this, but only some file managers answer, so
    // wait long enough to find out and fall back to opening the parent.
    let answered = Command::new("dbus-send")
        .args([
            "--session",
            "--dest=org.freedesktop.FileManager1",
            "--type=method_call",
            "/org/freedesktop/FileManager1",
            "org.freedesktop.FileManager1.ShowItems",
            &format!("array:string:file://{}", path.display()),
            "string:",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success());

    if answered {
        Ok(())
    } else {
        open(path.parent().unwrap_or(path))
    }
}

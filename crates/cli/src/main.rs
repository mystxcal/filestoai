//! The command line.

mod clipboard;
mod report;

use std::io::{IsTerminal, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use clap::Parser;
use filestoai_core::{ExportOptions, Format, ScanOptions, export, parse_size, scan};

/// Export a codebase as context for a language model.
///
/// With a terminal on the other end the result goes to the clipboard and a
/// summary to stderr. Redirected or piped, the export itself goes to stdout,
/// so `filestoai . > context.xml` and `filestoai . | pbcopy` both do the
/// obvious thing.
#[derive(Parser)]
#[command(name = "filestoai", version)]
struct Cli {
    /// Directory to read.
    #[arg(default_value = ".", value_name = "PATH")]
    path: PathBuf,

    /// Extra ignore pattern, in gitignore syntax. Repeatable.
    #[arg(short, long = "ignore", value_name = "PATTERN")]
    ignore: Vec<String>,

    /// Do not read .gitignore files.
    #[arg(long)]
    no_gitignore: bool,

    /// Include dotfiles and dot-directories.
    #[arg(long)]
    hidden: bool,

    /// Per-file size limit; a bare number means kilobytes. `0` removes it.
    #[arg(short = 's', long, value_name = "SIZE", default_value = "100k",
          value_parser = parse_size)]
    max_size: u64,

    /// Output shape: xml, markdown or plain.
    #[arg(short, long, value_name = "FORMAT", default_value = "xml")]
    format: Format,

    /// Write to a file instead of the clipboard or stdout.
    #[arg(short, long, value_name = "FILE")]
    output: Option<PathBuf>,

    /// The directory tree on its own, with no file contents.
    #[arg(long, conflicts_with = "no_map")]
    map_only: bool,

    /// File contents on their own, with no directory tree.
    #[arg(long)]
    no_map: bool,

    /// List what would be exported and stop.
    #[arg(short, long)]
    list: bool,

    /// Open the interface instead of exporting.
    #[arg(long)]
    serve: bool,

    /// Port for --serve.
    #[arg(long, default_value_t = 5023, value_name = "PORT")]
    port: u16,

    /// Do not open a browser with --serve.
    #[arg(long)]
    no_browser: bool,
}

fn main() -> ExitCode {
    // Neither of these is a normal invocation, and neither should go anywhere
    // near argument parsing.
    match std::env::args().nth(1).as_deref() {
        Some(clipboard::HOLD_FLAG) => clipboard::hold(),
        Some(ESTIMATE_FLAG) => return estimate_fixtures(),
        _ => {}
    }

    match run(Cli::parse()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            report::failure(&message);
            ExitCode::FAILURE
        }
    }
}

/// Undocumented, and used by `scripts/conformance.mjs`: reads a JSON array of
/// strings on stdin and writes their token estimates back as JSON, so the
/// TypeScript copy of the estimator can be held to this one.
const ESTIMATE_FLAG: &str = "--estimate-tokens";

fn estimate_fixtures() -> ExitCode {
    let mut input = String::new();
    if std::io::Read::read_to_string(&mut std::io::stdin(), &mut input).is_err() {
        return ExitCode::FAILURE;
    }
    let Some(texts) = parse_json_strings(&input) else {
        report::failure("expected a JSON array of strings on stdin");
        return ExitCode::FAILURE;
    };
    let counts: Vec<String> = texts
        .iter()
        .map(|text| filestoai_core::estimate_tokens(text).to_string())
        .collect();
    println!("[{}]", counts.join(","));
    ExitCode::SUCCESS
}

/// Just enough JSON for the fixture list, so the binary carries no parser it
/// would not otherwise need.
fn parse_json_strings(input: &str) -> Option<Vec<String>> {
    let body = input.trim().strip_prefix('[')?.strip_suffix(']')?;
    let mut out = Vec::new();
    let mut chars = body.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            ',' | ' ' | '\n' | '\r' | '\t' => {}
            '"' => {
                let mut text = String::new();
                loop {
                    match chars.next()? {
                        '"' => break,
                        '\\' => text.push(match chars.next()? {
                            'n' => '\n',
                            't' => '\t',
                            'r' => '\r',
                            'b' => '\u{8}',
                            'f' => '\u{c}',
                            'u' => {
                                let hex: String = (0..4).filter_map(|_| chars.next()).collect();
                                let code = u32::from_str_radix(&hex, 16).ok()?;
                                // Fixtures round-trip through JSON.stringify,
                                // so an astral character arrives as a pair.
                                if (0xD800..0xDC00).contains(&code) {
                                    chars.next()?;
                                    chars.next()?;
                                    let low: String = (0..4).filter_map(|_| chars.next()).collect();
                                    let low = u32::from_str_radix(&low, 16).ok()?;
                                    let combined =
                                        0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
                                    char::from_u32(combined)?
                                } else {
                                    char::from_u32(code)?
                                }
                            }
                            other => other,
                        }),
                        other => text.push(other),
                    }
                }
                out.push(text);
            }
            _ => return None,
        }
    }
    Some(out)
}

fn run(cli: Cli) -> Result<(), String> {
    if cli.serve {
        return filestoai_server::serve(cli.port, !cli.no_browser).map_err(|e| e.to_string());
    }

    let scan_options = ScanOptions {
        gitignore: !cli.no_gitignore,
        hidden: cli.hidden,
        ignore: cli.ignore.clone(),
        follow_links: false,
    };

    let found = scan(&cli.path, &scan_options).map_err(|e| e.to_string())?;
    let paths: Vec<&str> = found.entries.iter().map(|e| e.path.as_str()).collect();

    if cli.list {
        return report::listing(&found);
    }

    if paths.is_empty() {
        return Err(format!(
            "nothing to export in {} — every file was filtered out",
            found.root.display()
        ));
    }

    let export_options = ExportOptions {
        format: cli.format,
        max_bytes: cli.max_size,
        map: !cli.no_map,
        contents: !cli.map_only,
    };
    let result = export(&found.root, &paths, &export_options);

    match sink(&cli) {
        Sink::File(path) => {
            std::fs::write(&path, &result.text)
                .map_err(|e| format!("cannot write {}: {e}", path.display()))?;
            report::summary(
                &result.stats,
                found.unreadable,
                &format!("{}", path.display()),
            );
        }
        Sink::Clipboard => {
            clipboard::copy(&result.text).map_err(|e| {
                format!("cannot reach the clipboard ({e}) — redirect to a file instead")
            })?;
            report::summary(&result.stats, found.unreadable, "clipboard");
        }
        Sink::Stdout => {
            let mut out = std::io::stdout().lock();
            if let Err(error) = out
                .write_all(result.text.as_bytes())
                .and_then(|()| out.flush())
                && !report::is_closed_pipe(&error)
            {
                return Err(error.to_string());
            }
        }
    }
    Ok(())
}

enum Sink {
    File(PathBuf),
    Clipboard,
    Stdout,
}

/// Where the export goes when nobody said. A pipe is a request for the text;
/// a terminal is a request for the clipboard, because nobody wants a megabyte
/// of source scrolling past.
fn sink(cli: &Cli) -> Sink {
    match &cli.output {
        Some(path) => Sink::File(path.clone()),
        None if std::io::stdout().is_terminal() => Sink::Clipboard,
        None => Sink::Stdout,
    }
}

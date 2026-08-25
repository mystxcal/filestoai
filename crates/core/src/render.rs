//! Turning a selection of files into one block of text.

use std::path::Path;

use rayon::prelude::*;

use crate::kind::classify;
use crate::size::format_size;
use crate::{tokens, tree};

/// How the export is laid out.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    /// Tagged blocks. The default, because every current model was trained to
    /// treat a tag as a hard boundary, and a path in an attribute survives
    /// the model rewriting the code inside it.
    #[default]
    Xml,
    /// Fenced code blocks under path headings. For pasting somewhere a human
    /// will read it too.
    Markdown,
    /// Ruled separators and nothing else.
    Plain,
}

impl std::str::FromStr for Format {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "xml" => Ok(Format::Xml),
            "markdown" | "md" => Ok(Format::Markdown),
            "plain" | "text" | "txt" => Ok(Format::Plain),
            _ => Err(format!("unknown format `{s}`")),
        }
    }
}

/// What to put in the export.
#[derive(Clone, Debug)]
pub struct Options {
    pub format: Format,
    /// Files larger than this are named but not quoted. Zero means no limit.
    pub max_bytes: u64,
    /// Include the directory tree.
    pub map: bool,
    /// Include file contents. Off gives a map of the project and nothing else.
    pub contents: bool,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            format: Format::default(),
            max_bytes: 100 * 1024,
            map: true,
            contents: true,
        }
    }
}

/// What the export contains, for the summary line and the interface's counters.
#[derive(Clone, Copy, Debug, Default, serde::Serialize)]
pub struct Stats {
    /// Files asked for.
    pub requested: usize,
    /// Files whose contents made it in.
    pub included: usize,
    /// Named but not quoted, because they were over the size limit.
    pub oversize: usize,
    /// Named but not quoted, because they are not text.
    pub binary: usize,
    /// Asked for and not found. A gap you can see beats a short export.
    pub missing: usize,
    /// Bytes of source quoted.
    pub bytes: u64,
    pub chars: usize,
    pub tokens: u64,
}

pub struct Export {
    pub text: String,
    pub stats: Stats,
}

enum Body {
    Text(String),
    /// Named but not quoted, and the reason, phrased for a reader.
    Omitted(Omission, String),
}

#[derive(Clone, Copy, PartialEq)]
enum Omission {
    Oversize,
    Binary,
    Missing,
}

struct Piece {
    path: String,
    lang: Option<&'static str>,
    body: Body,
}

/// Read `paths` under `root` and render them as one document.
pub fn export<S: AsRef<str> + Sync>(root: &Path, paths: &[S], options: &Options) -> Export {
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.to_string_lossy().into_owned());

    let pieces: Vec<Piece> = if options.contents {
        paths
            .par_iter()
            .map(|p| read(root, p.as_ref(), options))
            .collect()
    } else {
        Vec::new()
    };

    let mut stats = Stats {
        requested: paths.len(),
        ..Default::default()
    };
    for piece in &pieces {
        match &piece.body {
            Body::Text(text) => {
                stats.included += 1;
                stats.bytes += text.len() as u64;
            }
            Body::Omitted(Omission::Oversize, _) => stats.oversize += 1,
            Body::Omitted(Omission::Binary, _) => stats.binary += 1,
            Body::Omitted(Omission::Missing, _) => stats.missing += 1,
        }
    }

    let map = if options.map {
        tree::draw(&name, paths)
    } else {
        String::new()
    };

    let text = match options.format {
        // The count is the selection, not the pieces: with `contents` off there
        // are no pieces, and a header reading `files="0"` above a map of a
        // hundred files is a lie the model has no way to catch.
        Format::Xml => xml(&name, &map, &pieces, paths.len()),
        Format::Markdown => markdown(&name, &map, &pieces),
        Format::Plain => plain(&name, &map, &pieces),
    };

    stats.chars = text.chars().count();
    stats.tokens = tokens::estimate(&text);
    Export { text, stats }
}

fn read(root: &Path, path: &str, options: &Options) -> Piece {
    let absolute = root.join(path);
    let Ok(metadata) = std::fs::metadata(&absolute) else {
        return Piece {
            path: path.to_string(),
            lang: None,
            body: Body::Omitted(Omission::Missing, "not found".into()),
        };
    };
    let size = metadata.len();
    let (kind, lang) = classify(&absolute, size);

    let body = if !kind.is_text() {
        Body::Omitted(
            Omission::Binary,
            format!("{} file, {}", kind.noun(), format_size(size)),
        )
    } else if options.max_bytes > 0 && size > options.max_bytes {
        Body::Omitted(
            Omission::Oversize,
            format!(
                "{} exceeds the {} limit",
                format_size(size),
                format_size(options.max_bytes)
            ),
        )
    } else {
        match std::fs::read(&absolute) {
            // Lossy is the honest conversion here: the alternative is guessing
            // at a legacy code page and quietly getting it wrong.
            Ok(bytes) => Body::Text(String::from_utf8_lossy(&bytes).into_owned()),
            Err(error) => Body::Omitted(Omission::Missing, error.to_string()),
        }
    };

    Piece {
        path: path.to_string(),
        lang,
        body,
    }
}

fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn xml(name: &str, map: &str, pieces: &[Piece], files: usize) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "<context root=\"{}\" files=\"{}\">\n",
        escape(name),
        files
    ));
    if !map.is_empty() {
        out.push_str("<map>\n");
        out.push_str(map);
        out.push_str("</map>\n");
    }
    for piece in pieces {
        out.push_str(&format!("<file path=\"{}\"", escape(&piece.path)));
        if let Some(lang) = piece.lang {
            out.push_str(&format!(" lang=\"{lang}\""));
        }
        match &piece.body {
            Body::Text(text) => {
                out.push_str(">\n");
                out.push_str(text);
                if !text.ends_with('\n') {
                    out.push('\n');
                }
                out.push_str("</file>\n");
            }
            Body::Omitted(_, why) => {
                // Nothing to quote, so the tag closes itself and says why.
                out.push_str(&format!(" omitted=\"{}\" />\n", escape(why)));
            }
        }
    }
    out.push_str("</context>\n");
    out
}

/// Long enough to survive whatever backticks the file already contains.
fn fence(text: &str) -> String {
    let mut longest = 0;
    let mut run = 0;
    for c in text.chars() {
        if c == '`' {
            run += 1;
            longest = longest.max(run);
        } else {
            run = 0;
        }
    }
    "`".repeat(longest.max(2) + 1)
}

fn markdown(name: &str, map: &str, pieces: &[Piece]) -> String {
    let mut out = format!("# {name}\n");
    if !map.is_empty() {
        out.push_str("\n```\n");
        out.push_str(map);
        out.push_str("```\n");
    }
    for piece in pieces {
        out.push_str(&format!("\n## {}\n\n", piece.path));
        match &piece.body {
            Body::Text(text) => {
                let fence = fence(text);
                out.push_str(&fence);
                out.push_str(piece.lang.unwrap_or("text"));
                out.push('\n');
                out.push_str(text);
                if !text.ends_with('\n') {
                    out.push('\n');
                }
                out.push_str(&fence);
                out.push('\n');
            }
            Body::Omitted(_, why) => out.push_str(&format!("_{why}_\n")),
        }
    }
    out
}

fn plain(name: &str, map: &str, pieces: &[Piece]) -> String {
    let mut out = String::new();
    if !map.is_empty() {
        out.push_str(&format!("{name}\n\n"));
        out.push_str(map);
    }
    for piece in pieces {
        out.push_str(&format!("\n===== {} =====\n\n", piece.path));
        match &piece.body {
            Body::Text(text) => {
                out.push_str(text);
                if !text.ends_with('\n') {
                    out.push('\n');
                }
            }
            Body::Omitted(_, why) => out.push_str(&format!("({why})\n")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("filestoai-render-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::write(dir.join("src/main.rs"), "fn main() {}\n").unwrap();
        std::fs::write(dir.join("README.md"), "Use ``` for code.\n").unwrap();
        std::fs::write(dir.join("logo.png"), [0u8, 1, 2, 3]).unwrap();
        dir
    }

    #[test]
    fn xml_tags_carry_the_path_and_language() {
        let root = project("xml");
        let export = export(&root, &["src/main.rs"], &Options::default());
        assert!(
            export
                .text
                .contains("<file path=\"src/main.rs\" lang=\"rust\">")
        );
        assert!(export.text.contains("fn main() {}"));
        assert!(export.text.ends_with("</context>\n"));
        assert_eq!(export.stats.included, 1);
    }

    #[test]
    fn a_fence_outgrows_the_backticks_inside_it() {
        let root = project("fence");
        let options = Options {
            format: Format::Markdown,
            map: false,
            ..Default::default()
        };
        let export = export(&root, &["README.md"], &options);
        assert!(export.text.contains("````markdown\n"));
        assert!(export.text.contains("Use ``` for code."));
    }

    #[test]
    fn binaries_are_named_not_quoted() {
        let root = project("binary");
        let export = export(&root, &["logo.png"], &Options::default());
        assert!(export.text.contains("omitted=\"image file"));
        assert_eq!(export.stats.binary, 1);
        assert_eq!(export.stats.included, 0);
    }

    #[test]
    fn the_size_limit_names_the_file_and_the_limit() {
        let root = project("oversize");
        let options = Options {
            max_bytes: 4,
            ..Default::default()
        };
        let export = export(&root, &["src/main.rs"], &options);
        assert!(export.text.contains("exceeds the 4 B limit"));
        assert_eq!(export.stats.oversize, 1);
    }

    #[test]
    fn a_missing_file_is_reported_rather_than_dropped() {
        let root = project("missing");
        let export = export(&root, &["gone.rs"], &Options::default());
        assert_eq!(export.stats.missing, 1);
        assert!(export.text.contains("not found"));
    }

    #[test]
    fn map_only_skips_every_read() {
        let root = project("maponly");
        let options = Options {
            contents: false,
            ..Default::default()
        };
        let export = export(&root, &["src/main.rs", "README.md"], &options);
        assert!(export.text.contains("main.rs"));
        assert!(!export.text.contains("fn main"));
        // The header counts the selection, not the blocks that were rendered.
        assert!(export.text.contains("files=\"2\""));
    }
}

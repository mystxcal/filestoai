//! What a file is.
//!
//! Decided from the name where the name is enough, which is almost always,
//! and from the first few kilobytes only when it is not. The original tool
//! opened every file three times trying UTF-8, then Latin-1, then CP-1252,
//! and called whatever came back the content. A NUL byte in the first 8 KiB
//! is the same test every version-control system uses, it costs one read,
//! and it does not silently turn a JPEG into mojibake.

use std::io::Read;
use std::path::Path;

/// The bytes we look at when a file's name tells us nothing.
const SNIFF: usize = 8192;

/// The broad category of a file, which is what decides whether its contents
/// can go into a prompt at all.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    /// Readable as text, so it can be included verbatim.
    Text,
    Image,
    Audio,
    Video,
    /// PDFs, office formats, ebooks — carry meaning, but not as bytes.
    Document,
    Archive,
    Font,
    /// Binary with nothing more specific to say about it.
    Data,
}

impl Kind {
    /// Whether the file's bytes belong in an export.
    pub fn is_text(self) -> bool {
        self == Kind::Text
    }

    /// The word for this category in a sentence.
    pub fn noun(self) -> &'static str {
        match self {
            Kind::Text => "text",
            Kind::Image => "image",
            Kind::Audio => "audio",
            Kind::Video => "video",
            Kind::Document => "document",
            Kind::Archive => "archive",
            Kind::Font => "font",
            Kind::Data => "binary",
        }
    }
}

/// A file's category and, when it is text, the language id to tag it with.
/// The ids are the ones Shiki and `highlight.js` use, so the same string
/// labels a row in the interface and opens a fence in the Markdown export.
pub fn classify(path: &Path, size: u64) -> (Kind, Option<&'static str>) {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

    if let Some(lang) = by_name(name) {
        return (Kind::Text, Some(lang));
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase);

    if let Some(ext) = ext.as_deref() {
        if let Some(lang) = text_ext(ext) {
            return (Kind::Text, Some(lang));
        }
        if let Some(kind) = binary_ext(ext) {
            return (kind, None);
        }
    }

    // An empty file is text; there is nothing in it to disagree with.
    if size == 0 {
        return (Kind::Text, Some("text"));
    }
    sniff(path)
}

/// Files that are named rather than suffixed.
fn by_name(name: &str) -> Option<&'static str> {
    Some(match name {
        "Dockerfile" | "Containerfile" | "dockerfile" => "dockerfile",
        "Makefile" | "makefile" | "GNUmakefile" => "makefile",
        "CMakeLists.txt" => "cmake",
        "Rakefile" | "Gemfile" | "Podfile" | "Fastfile" | "Brewfile" => "ruby",
        "Justfile" | "justfile" => "just",
        "Vagrantfile" => "ruby",
        "Procfile" => "yaml",
        "go.mod" | "go.sum" | "go.work" => "go-module",
        ".gitignore" | ".dockerignore" | ".npmignore" | ".prettierignore" | ".eslintignore"
        | ".gitattributes" | ".ignore" => "gitignore",
        ".editorconfig" | ".npmrc" | ".yarnrc" | ".gitconfig" | ".flake8" => "ini",
        ".env" | ".envrc" | ".bashrc" | ".zshrc" | ".profile" => "bash",
        ".nvmrc" | ".python-version" | ".ruby-version" | ".tool-versions" => "text",
        "LICENSE" | "LICENCE" | "COPYING" | "NOTICE" | "AUTHORS" | "CONTRIBUTORS" | "PATENTS"
        | "VERSION" | "CODEOWNERS" => "text",
        _ => return None,
    })
}

fn text_ext(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "rs" => "rust",
        "py" | "pyi" | "pyw" => "python",
        "js" | "mjs" | "cjs" => "javascript",
        "jsx" => "jsx",
        "ts" | "mts" | "cts" => "typescript",
        "tsx" => "tsx",
        "go" => "go",
        "java" => "java",
        "kt" | "kts" => "kotlin",
        "swift" => "swift",
        "c" | "h" => "c",
        "cpp" | "cc" | "cxx" | "hpp" | "hh" | "hxx" | "ipp" => "cpp",
        "cs" => "csharp",
        "rb" | "erb" | "rake" | "gemspec" => "ruby",
        "php" => "php",
        "sh" | "bash" | "zsh" | "ksh" => "bash",
        "fish" => "fish",
        "ps1" | "psm1" | "psd1" => "powershell",
        "bat" | "cmd" => "batch",
        "sql" | "psql" | "mysql" => "sql",
        "html" | "htm" | "xhtml" => "html",
        "css" => "css",
        "scss" => "scss",
        "sass" => "sass",
        "less" => "less",
        "styl" => "stylus",
        "vue" => "vue",
        "svelte" => "svelte",
        "astro" => "astro",
        "json" | "ipynb" | "webmanifest" | "map" => "json",
        "jsonc" | "json5" => "jsonc",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        "ini" | "cfg" | "conf" | "properties" | "desktop" | "service" => "ini",
        // Vector art is markup: readable, diffable, and useful in a prompt.
        "xml" | "svg" | "xsl" | "xsd" | "plist" | "resx" | "csproj" => "xml",
        "md" | "markdown" => "markdown",
        "mdx" => "mdx",
        "rst" => "rst",
        "adoc" | "asciidoc" => "asciidoc",
        "org" => "org",
        "tex" | "sty" | "cls" | "bib" => "latex",
        "txt" | "text" | "log" | "lock" | "nfo" | "me" => "text",
        "csv" => "csv",
        "tsv" => "tsv",
        "lua" => "lua",
        "vim" => "vim",
        "el" | "lisp" | "cl" => "lisp",
        "r" | "rmd" => "r",
        "jl" => "julia",
        "dart" => "dart",
        "ex" | "exs" | "eex" | "heex" => "elixir",
        "erl" | "hrl" => "erlang",
        "hs" | "lhs" => "haskell",
        "ml" | "mli" => "ocaml",
        "fs" | "fsi" | "fsx" => "fsharp",
        "scala" | "sbt" => "scala",
        "clj" | "cljs" | "cljc" | "edn" => "clojure",
        "zig" => "zig",
        "nim" | "nims" => "nim",
        "v" | "sv" | "vhd" | "vhdl" => "verilog",
        "sol" => "solidity",
        "proto" => "protobuf",
        "graphql" | "gql" => "graphql",
        "prisma" => "prisma",
        "tf" | "tfvars" => "terraform",
        "hcl" | "nomad" => "hcl",
        "gradle" => "groovy",
        "groovy" => "groovy",
        "pl" | "pm" | "t" => "perl",
        "asm" | "s" => "asm",
        "m" => "objective-c",
        "mm" => "objective-cpp",
        "f" | "f90" | "f95" | "for" => "fortran",
        "pas" | "pp" => "pascal",
        "ada" | "adb" | "ads" => "ada",
        "d" => "d",
        "cr" => "crystal",
        "elm" => "elm",
        "purs" => "purescript",
        "res" | "resi" => "rescript",
        "roc" => "roc",
        "gleam" => "gleam",
        "odin" => "odin",
        "patch" | "diff" => "diff",
        "http" | "rest" => "http",
        "srt" | "vtt" => "text",
        _ => return None,
    })
}

fn binary_ext(ext: &str) -> Option<Kind> {
    Some(match ext {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "avif" | "bmp" | "ico" | "icns" | "tif"
        | "tiff" | "heic" | "heif" | "psd" | "ai" | "sketch" | "fig" | "xcf" | "raw" | "cr2"
        | "nef" | "dng" => Kind::Image,

        "mp3" | "wav" | "flac" | "ogg" | "oga" | "m4a" | "aac" | "opus" | "wma" | "aiff"
        | "aif" | "mid" | "midi" => Kind::Audio,

        "mp4" | "mov" | "avi" | "mkv" | "webm" | "wmv" | "flv" | "m4v" | "mpg" | "mpeg" | "3gp"
        | "ogv" => Kind::Video,

        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "odt" | "ods" | "odp"
        | "rtf" | "epub" | "mobi" | "azw3" | "djvu" | "pages" | "numbers" | "key" => Kind::Document,

        "zip" | "tar" | "gz" | "tgz" | "bz2" | "xz" | "zst" | "7z" | "rar" | "lz4" | "jar"
        | "war" | "ear" | "whl" | "deb" | "rpm" | "apk" | "dmg" | "iso" | "cab" | "pkg"
        | "crate" => Kind::Archive,

        "ttf" | "otf" | "woff" | "woff2" | "eot" | "pfb" => Kind::Font,

        "exe" | "dll" | "so" | "dylib" | "a" | "o" | "obj" | "lib" | "bin" | "wasm" | "class"
        | "pyc" | "pyo" | "pdb" | "db" | "sqlite" | "sqlite3" | "mdb" | "dat" | "pack" | "idx"
        | "bak" | "swp" | "ds_store" | "node" | "rlib" | "rmeta" | "safetensors" | "gguf"
        | "onnx" | "pt" | "pth" | "h5" | "parquet" | "npy" | "npz" | "pickle" | "pkl" => Kind::Data,

        _ => return None,
    })
}

/// Read the head of a file and decide from the bytes.
fn sniff(path: &Path) -> (Kind, Option<&'static str>) {
    let Ok(mut file) = std::fs::File::open(path) else {
        return (Kind::Data, None);
    };
    let mut head = [0u8; SNIFF];
    let Ok(read) = file.read(&mut head) else {
        return (Kind::Data, None);
    };
    let head = &head[..read];

    if memchr::memchr(0, head).is_some() {
        return (Kind::Data, None);
    }
    (Kind::Text, Some(shebang(head).unwrap_or("text")))
}

/// An extensionless script still says what it is on its first line.
fn shebang(head: &[u8]) -> Option<&'static str> {
    let line = head.split(|&b| b == b'\n').next()?;
    let line = std::str::from_utf8(line).ok()?;
    let rest = line.strip_prefix("#!")?;
    let program = rest
        .rsplit(['/', ' '])
        .find(|part| !part.is_empty() && *part != "env")?;

    Some(
        match program.trim_end_matches(|c: char| c.is_ascii_digit() || c == '.') {
            "python" => "python",
            "node" | "bun" | "deno" => "javascript",
            "sh" | "bash" | "zsh" | "dash" | "ksh" => "bash",
            "fish" => "fish",
            "ruby" => "ruby",
            "perl" => "perl",
            "php" => "php",
            "lua" => "lua",
            "Rscript" => "r",
            _ => "text",
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kind_of(name: &str) -> Kind {
        classify(Path::new(name), 100).0
    }

    fn lang_of(name: &str) -> Option<&'static str> {
        classify(Path::new(name), 100).1
    }

    #[test]
    fn names_beat_extensions() {
        assert_eq!(lang_of("Dockerfile"), Some("dockerfile"));
        assert_eq!(lang_of("CMakeLists.txt"), Some("cmake"));
        assert_eq!(lang_of("go.sum"), Some("go-module"));
    }

    #[test]
    fn extensions_are_case_insensitive() {
        assert_eq!(kind_of("PHOTO.JPG"), Kind::Image);
        assert_eq!(lang_of("Main.RS"), Some("rust"));
    }

    #[test]
    fn media_is_kept_out_of_the_text_path() {
        assert_eq!(kind_of("a.mp4"), Kind::Video);
        assert_eq!(kind_of("a.pdf"), Kind::Document);
        assert_eq!(kind_of("a.woff2"), Kind::Font);
        assert!(!kind_of("a.zip").is_text());
    }

    #[test]
    fn svg_is_markup_not_a_picture() {
        assert_eq!(kind_of("logo.svg"), Kind::Text);
        assert_eq!(lang_of("logo.svg"), Some("xml"));
    }

    #[test]
    fn shebangs_name_the_language() {
        assert_eq!(shebang(b"#!/usr/bin/env python3\n"), Some("python"));
        assert_eq!(shebang(b"#!/bin/bash\n"), Some("bash"));
        assert_eq!(shebang(b"#!/usr/bin/node\n"), Some("javascript"));
        assert_eq!(shebang(b"no shebang here"), None);
    }

    #[test]
    fn an_empty_file_is_text() {
        assert_eq!(classify(Path::new("mystery"), 0).0, Kind::Text);
    }
}

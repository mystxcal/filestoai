//! Walking a project once and learning everything about it.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use rayon::prelude::*;

use crate::kind::{Kind, classify};
use crate::tokens;

/// Directories that are never the subject of a prompt, whatever the settings
/// say. Without this, turning hidden files on drags the whole object database
/// into the file list.
const VCS: &[&str] = &[".git/", ".hg/", ".svn/", ".jj/"];

/// Past this, counting a file's tokens exactly costs more than the answer is
/// worth, and we fall back to the folklore ratio for the tail.
const EXACT_LIMIT: u64 = 4 * 1024 * 1024;

/// How to walk a project.
#[derive(Clone, Debug)]
pub struct Options {
    /// Honour `.gitignore`, `.ignore`, `.git/info/exclude` and the user's
    /// global excludes, the way `git status` does.
    pub gitignore: bool,
    /// Include dotfiles and dot-directories.
    pub hidden: bool,
    /// Extra patterns in gitignore syntax, applied on top of everything else.
    pub ignore: Vec<String>,
    pub follow_links: bool,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            gitignore: true,
            hidden: false,
            ignore: Vec::new(),
            follow_links: false,
        }
    }
}

/// One file in the project.
#[derive(Clone, Debug, serde::Serialize)]
pub struct Entry {
    /// Relative to the scan root, always with forward slashes, so the same
    /// string is a key on every platform.
    pub path: String,
    pub size: u64,
    pub kind: Kind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lang: Option<&'static str>,
    /// Estimated tokens if this file's contents were included. Zero for
    /// anything that is not text.
    pub tokens: u64,
    pub lines: u32,
}

/// Everything the walk found.
#[derive(Debug, serde::Serialize)]
pub struct Scan {
    pub root: PathBuf,
    pub entries: Vec<Entry>,
    /// Files the walk saw but could not read. Reported rather than hidden,
    /// because a silently short export is worse than a visible gap.
    pub unreadable: usize,
}

/// Turn the caller's extra patterns into a matcher with real gitignore
/// semantics — negation, anchoring, directory-only rules and all.
fn extra_matcher(root: &Path, patterns: &[String]) -> Result<Gitignore, ignore::Error> {
    let mut builder = GitignoreBuilder::new(root);
    for pattern in VCS {
        builder.add_line(None, pattern)?;
    }
    for pattern in patterns {
        let pattern = pattern.trim();
        if pattern.is_empty() || pattern.starts_with('#') {
            continue;
        }
        builder.add_line(None, pattern)?;
    }
    builder.build()
}

/// Walk `root` and describe every file under it that survives the filters.
pub fn scan(root: &Path, options: &Options) -> Result<Scan, ScanError> {
    let root = std::fs::canonicalize(root).map_err(|source| ScanError::Root {
        path: root.to_path_buf(),
        source,
    })?;
    if !root.is_dir() {
        return Err(ScanError::NotADirectory { path: root });
    }

    let extra = extra_matcher(&root, &options.ignore).map_err(ScanError::Pattern)?;

    let mut walker = ignore::WalkBuilder::new(&root);
    walker
        .hidden(!options.hidden)
        .follow_links(options.follow_links)
        .git_ignore(options.gitignore)
        .git_global(options.gitignore)
        .git_exclude(options.gitignore)
        .ignore(options.gitignore)
        .parents(options.gitignore)
        // A folder of source files is worth filtering whether or not anyone
        // ever ran `git init` in it.
        .require_git(false)
        .filter_entry(move |entry| {
            let is_dir = entry.file_type().is_some_and(|t| t.is_dir());
            !extra.matched(entry.path(), is_dir).is_ignore()
        });

    let found = Mutex::new(Vec::new());
    let unreadable = AtomicUsize::new(0);
    let root_for_walk = root.clone();

    walker.build_parallel().run(|| {
        let found = &found;
        let unreadable = &unreadable;
        let root = &root_for_walk;
        Box::new(move |result| {
            let Ok(entry) = result else {
                unreadable.fetch_add(1, Ordering::Relaxed);
                return ignore::WalkState::Continue;
            };
            if !entry.file_type().is_some_and(|t| t.is_file()) {
                return ignore::WalkState::Continue;
            }
            let Ok(metadata) = entry.metadata() else {
                unreadable.fetch_add(1, Ordering::Relaxed);
                return ignore::WalkState::Continue;
            };
            let Ok(relative) = entry.path().strip_prefix(root) else {
                return ignore::WalkState::Continue;
            };
            found.lock().unwrap().push((
                entry.path().to_path_buf(),
                slashed(relative),
                metadata.len(),
            ));
            ignore::WalkState::Continue
        })
    });

    let found = found.into_inner().unwrap();
    let mut entries: Vec<Entry> = found
        .into_par_iter()
        .map(|(absolute, path, size)| {
            let (kind, lang) = classify(&absolute, size);
            let (tokens, lines) = if kind.is_text() {
                measure(&absolute, size)
            } else {
                (0, 0)
            };
            Entry {
                path,
                size,
                kind,
                lang,
                tokens,
                lines,
            }
        })
        .collect();

    entries.sort_unstable_by(|a, b| a.path.cmp(&b.path));

    Ok(Scan {
        root,
        entries,
        unreadable: unreadable.load(Ordering::Relaxed),
    })
}

/// Token and line counts for one text file.
fn measure(path: &Path, size: u64) -> (u64, u32) {
    if size > EXACT_LIMIT {
        return (size / 4, 0);
    }
    match std::fs::read(path) {
        Ok(bytes) => {
            let text = String::from_utf8_lossy(&bytes);
            let lines = memchr::memchr_iter(b'\n', &bytes).count() as u32;
            // A last line without a newline is still a line.
            let lines = if bytes.last().is_some_and(|&b| b == b'\n') || bytes.is_empty() {
                lines
            } else {
                lines + 1
            };
            (tokens::estimate(&text), lines)
        }
        Err(_) => (0, 0),
    }
}

fn slashed(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

#[derive(Debug)]
pub enum ScanError {
    Root {
        path: PathBuf,
        source: std::io::Error,
    },
    NotADirectory {
        path: PathBuf,
    },
    Pattern(ignore::Error),
}

impl std::fmt::Display for ScanError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ScanError::Root { path, source } => {
                write!(f, "cannot read {}: {source}", path.display())
            }
            ScanError::NotADirectory { path } => {
                write!(f, "{} is not a directory", path.display())
            }
            ScanError::Pattern(source) => write!(f, "bad ignore pattern: {source}"),
        }
    }
}

impl std::error::Error for ScanError {}

#[cfg(test)]
mod tests {
    use super::*;

    struct Project(PathBuf);

    impl Project {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("filestoai-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        fn file(&self, path: &str, contents: &str) -> &Self {
            let full = self.0.join(path);
            std::fs::create_dir_all(full.parent().unwrap()).unwrap();
            std::fs::write(full, contents).unwrap();
            self
        }

        fn paths(&self, options: &Options) -> Vec<String> {
            scan(&self.0, options)
                .unwrap()
                .entries
                .into_iter()
                .map(|e| e.path)
                .collect()
        }
    }

    impl Drop for Project {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn gitignore_is_honoured_including_negation() {
        let project = Project::new("negation");
        project
            .file(".gitignore", "*.log\n!keep.log\nbuild/\n")
            .file("a.log", "x")
            .file("keep.log", "x")
            .file("build/out.js", "x")
            .file("src/main.rs", "fn main() {}");

        let mut paths = project.paths(&Options::default());
        paths.sort();
        assert_eq!(paths, vec!["keep.log", "src/main.rs"]);
    }

    /// The rule that lives in a subdirectory applies from that subdirectory
    /// down, and nowhere else.
    #[test]
    fn nested_gitignores_are_scoped_to_their_directory() {
        let project = Project::new("nested");
        project
            .file("notes.txt", "x")
            .file("docs/.gitignore", "*.txt\n")
            .file("docs/draft.txt", "x")
            .file("docs/index.md", "x");

        let mut paths = project.paths(&Options::default());
        paths.sort();
        assert_eq!(paths, vec!["docs/index.md", "notes.txt"]);
    }

    #[test]
    fn turning_gitignore_off_shows_everything() {
        let project = Project::new("nogitignore");
        project.file(".gitignore", "*.log\n").file("a.log", "x");

        let options = Options {
            gitignore: false,
            ..Default::default()
        };
        assert_eq!(project.paths(&options), vec!["a.log"]);
    }

    #[test]
    fn extra_patterns_use_gitignore_syntax() {
        let project = Project::new("extra");
        project
            .file("src/main.rs", "x")
            .file("src/vendor/lib.rs", "x")
            .file("test.spec.ts", "x");

        let options = Options {
            ignore: vec!["vendor/".into(), "*.spec.ts".into()],
            ..Default::default()
        };
        assert_eq!(project.paths(&options), vec!["src/main.rs"]);
    }

    #[test]
    fn vcs_metadata_never_appears_even_with_hidden_files_on() {
        let project = Project::new("vcs");
        project
            .file(".git/objects/ab/cdef", "x")
            .file(".git/config", "x")
            .file(".env", "SECRET=1")
            .file("main.rs", "x");

        let options = Options {
            hidden: true,
            ..Default::default()
        };
        let mut paths = project.paths(&options);
        paths.sort();
        assert_eq!(paths, vec![".env", "main.rs"]);
    }

    #[test]
    fn hidden_files_are_out_by_default() {
        let project = Project::new("hidden");
        project.file(".env", "x").file("main.rs", "x");
        assert_eq!(project.paths(&Options::default()), vec!["main.rs"]);
    }

    #[test]
    fn entries_carry_kind_language_and_a_token_count() {
        let project = Project::new("measure");
        project
            .file("main.rs", "fn main() {\n    println!(\"hi\");\n}\n")
            .file("logo.png", "binary bytes go here");

        let scan = scan(&project.0, &Options::default()).unwrap();
        let code = scan.entries.iter().find(|e| e.path == "main.rs").unwrap();
        assert_eq!(code.kind, Kind::Text);
        assert_eq!(code.lang, Some("rust"));
        assert_eq!(code.lines, 3);
        assert!(code.tokens > 0);

        let image = scan.entries.iter().find(|e| e.path == "logo.png").unwrap();
        assert_eq!(image.kind, Kind::Image);
        assert_eq!(image.tokens, 0);
    }
}

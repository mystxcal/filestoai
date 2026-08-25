//! Drawing the directory tree.
//!
//! One implementation, used by every output format and by nothing else. The
//! version this replaces had two — an HTML one rendered on the server and a
//! JSON one rendered on the client — which is how they came to disagree.

use std::collections::BTreeMap;

/// A directory is a node with children; a file is a node without. Real
/// filesystems cannot produce a path that is both, so nothing else is needed
/// to tell them apart.
#[derive(Default)]
struct Node {
    children: BTreeMap<String, Node>,
}

impl Node {
    fn insert(&mut self, path: &str) {
        let mut node = self;
        for part in path.split('/').filter(|part| !part.is_empty()) {
            node = node.children.entry(part.to_string()).or_default();
        }
    }
}

/// `root/` followed by the paths beneath it, drawn with box characters.
/// Directories sort before files at every level, which is how a person reads
/// a folder and not how a byte comparison orders one.
pub fn draw<S: AsRef<str>>(root: &str, paths: &[S]) -> String {
    let mut tree = Node::default();
    for path in paths {
        tree.insert(path.as_ref());
    }

    let mut out = String::with_capacity(paths.len() * 24);
    out.push_str(root);
    out.push_str("/\n");
    write_children(&tree, "", &mut out);
    out
}

fn write_children(node: &Node, prefix: &str, out: &mut String) {
    let mut ordered: Vec<(&String, &Node)> = node.children.iter().collect();
    ordered.sort_by_key(|(name, child)| (child.children.is_empty(), *name));

    let mut remaining = ordered.len();
    for (name, child) in ordered {
        remaining -= 1;
        let last = remaining == 0;

        out.push_str(prefix);
        out.push_str(if last { "└── " } else { "├── " });
        out.push_str(name);
        if !child.children.is_empty() {
            out.push('/');
        }
        out.push('\n');

        if !child.children.is_empty() {
            let mut deeper = String::with_capacity(prefix.len() + 4);
            deeper.push_str(prefix);
            deeper.push_str(if last { "    " } else { "│   " });
            write_children(child, &deeper, out);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn directories_come_before_files() {
        let drawn = draw(
            "project",
            &["Cargo.toml", "src/main.rs", "src/lib.rs", "README.md"],
        );
        assert_eq!(
            drawn,
            "project/\n\
             ├── src/\n\
             │   ├── lib.rs\n\
             │   └── main.rs\n\
             ├── Cargo.toml\n\
             └── README.md\n"
        );
    }

    #[test]
    fn deep_nesting_keeps_its_spine() {
        let drawn = draw("p", &["a/b/c/deep.rs", "a/other.rs", "z.rs"]);
        assert_eq!(
            drawn,
            "p/\n\
             ├── a/\n\
             │   ├── b/\n\
             │   │   └── c/\n\
             │   │       └── deep.rs\n\
             │   └── other.rs\n\
             └── z.rs\n"
        );
    }

    #[test]
    fn nothing_selected_draws_just_the_root() {
        assert_eq!(draw("p", &[] as &[&str]), "p/\n");
    }
}

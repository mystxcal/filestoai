//! Read a project and render it as context for a language model.
//!
//! The whole tool is three steps and they are separable: [`scan`] walks a
//! directory and says what is in it, the caller picks a subset, and
//! [`export`] renders that subset as one document. Nothing here holds state
//! between calls, which is what lets the command line and the server share
//! every line of it.

mod kind;
mod render;
mod scan;
mod size;
mod tokens;
mod tree;

pub use kind::{Kind, classify};
pub use render::{Export, Format, Options as ExportOptions, Stats, export};
pub use scan::{Entry, Options as ScanOptions, Scan, ScanError, scan};
pub use size::{format_count, format_size, parse_size};
pub use tokens::estimate as estimate_tokens;
pub use tree::draw as draw_tree;

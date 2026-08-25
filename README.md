# FilesToAI

Turn a project on disk into one block of context for a language model. A single
Rust binary: no Python, no Node runtime, no browser engine. Point it at a
folder and it walks the tree, obeys the same ignore rules git does, works out
what is actually text, and renders the parts you chose as tagged blocks a model
can read.

```
$ filestoai .
157 files · 765 KB · ~218k tokens → clipboard
  named but not quoted: 2 over the size limit, 2 not text
```

For the times you want to see what you are sending before you send it, the same
binary serves a local interface with a live token count.

![The FilesToAI interface](docs/interface-light.png)

## Install

```
cargo install filestoai
```

The interface is compiled into the binary. There is nothing else to install and
nothing to run alongside it.

## The command line

```
filestoai [PATH]
```

Where the export goes depends on who is asking. A terminal gets the clipboard
and a one-line summary on stderr; a pipe or a redirect gets the export itself
on stdout. Both of these do what they look like:

```
filestoai .                     # → clipboard
filestoai . > context.xml       # → the file
filestoai src/ | wc -c          # → the pipe
```

| | |
|---|---|
| `-i, --ignore <PATTERN>` | Extra ignore pattern in gitignore syntax. Repeatable. |
| `--no-gitignore` | Do not read `.gitignore` files. |
| `--hidden` | Include dotfiles and dot-directories. |
| `-s, --max-size <SIZE>` | Per-file limit; a bare number is kilobytes. `0` removes it. Default `100k`. |
| `-f, --format <FORMAT>` | `xml`, `markdown` or `plain`. Default `xml`. |
| `-o, --output <FILE>` | Write to a file. |
| `--map-only` | The directory tree with no file contents. |
| `--no-map` | File contents with no directory tree. |
| `-l, --list` | List what would be exported and stop. |
| `--serve` | Open the interface instead. `--port` to move it. |

`--list` is a table when a person is reading it and bare paths when a program
is, so `filestoai --list | xargs wc -l` works without a flag to ask for it.

## The interface

```
filestoai --serve
```

It opens on the folder it was started in, because that is the folder you meant.
Everything after that happens in the tab: ticking files, changing the size
limit, switching format. The server holds no session, so two tabs cannot
disagree and a reload loses nothing.

The number that matters is the token count, and it moves as you tick. It is
computed the same way the export computes it — including the tags around each
file and its line in the directory map — so the figure under the tree is the
figure the export reports, not an approximation of it.

Files that are too big to quote stay in the list and in the export, marked
`skip`. They appear in the output as a named omission, so the model can see
that the file exists and how large it is.

Anything that is not text — images, PDFs, audio, video, archives, fonts — is
kept out of the tree and listed under **Attachments**, with thumbnails for
images and buttons to open a file or show it in the file manager. Ticking one
puts its name and size in the export, never its bytes.

## What goes in

Ignore rules are handled by [`ignore`](https://docs.rs/ignore), the crate
ripgrep uses, so `.gitignore` behaves exactly as it does in `git status`:
nested files apply from their own directory down, `!` un-ignores, `dir/` means
the directory, and your global excludes and `.git/info/exclude` are read too.
Anything you type into **Also ignore** is the same syntax. `.git` and the other
version-control directories are never walked, whatever the settings say.

Whether a file is text is decided from its name where the name is enough —
extension, or `Dockerfile`, `Makefile`, `go.sum` and their kind — and from a
NUL byte in the first 8 KiB when it is not. An extensionless script is read
from its shebang. Text is decoded as UTF-8, lossily, rather than guessed at
through a series of legacy code pages.

## Output

`xml` is the default because every current model treats a tag as a hard
boundary, and a path in an attribute survives the model rewriting the code
inside it.

```xml
<context root="interior" files="159">
<map>
interior/
├── app/
│   └── page.tsx
└── package.json
</map>
<file path="app/page.tsx" lang="tsx">
…
</file>
<file path="public/logo.png" omitted="image file, 38 KB" />
</context>
```

`markdown` puts each file under a heading in a fenced block, and grows the
fence past any backticks the file already contains. `plain` is ruled
separators and nothing else.

## Counting tokens

`characters / 4` is the usual estimate and on source code it is wrong in the
direction that matters: code is punctuation-dense and indentation-heavy, so it
tokenises harder than the prose that ratio came from. Shipping a real BPE would
mean carrying a megabyte of merge tables to answer a question nobody needs to
the digit.

So FilesToAI counts the six things a byte-pair encoder actually spends tokens
on — identifiers, the characters of an identifier past the third, runs of
punctuation, newlines, non-ASCII characters and horizontal whitespace — and
weights them. The weights are a non-negative least-squares fit against
`cl100k_base` over 654 files and 11M characters of Rust, Python, TSX, CSS, HTML
and Markdown. Measured over that corpus:

| estimator | mean error | p90 |
|---|---:|---:|
| `characters / 4` | 11.2% | 22.2% |
| FilesToAI | **5.6%** | **10.9%** |

Every weight is interpretable, which is the check that it is fitting the
tokeniser rather than the corpus: an identifier costs about one token, a run of
punctuation slightly more, a newline a little over half, anything outside ASCII
about three-quarters, and indentation is nearly free until it piles up.

The estimator exists twice — in Rust for the export and in TypeScript for the
live counter — so `scripts/conformance.mjs` feeds both the same fixtures and
fails if any answer differs.

## The local server

`--serve` binds to loopback only, and a process that can read every file you
can needs more than that. Any web page you have open can `POST` to
`127.0.0.1`, so the API also requires a per-run secret in a header, which a
cross-origin page cannot set without a preflight this server never approves,
and it checks the `Origin` header on anything that sends one. The secret
arrives in the URL fragment — which browsers never send to a server — and the
interface moves it into `sessionStorage` on load.

Paths are resolved and confined: `../`, an absolute path and a symlink pointing
out of the project all fail the same check.

## Building

```
cd ui && npm ci && npm run build     # compiles the interface into crates/server/dist
cargo build --release
```

`crates/server/dist` is committed so that `cargo install filestoai` works with
no Node toolchain anywhere in sight. Rebuild it whenever `ui/` changes.

```
cargo test --workspace
cargo clippy --workspace --all-targets
cd ui && npm run check && npm run conformance
```

## The version before this one

FilesToAI started as a Flask and jQuery application, and this is a full
rewrite of it. The idea was right and the implementation was not: the file
selection lived in a server-side session, the tree was rendered twice — once as
HTML on the server and once as JSON on the client — and gitignore patterns were
translated into regular expressions by hand. Those three decisions accounted
for most of its bugs. The idea survived; none of the rest did.

## Licence

MIT.

// The token estimator exists twice: in Rust for the export, and in TypeScript
// for the live counter under the tree. Two implementations of one formula is a
// standing invitation to drift, so this feeds both the same fixtures and fails
// if any answer differs.
//
//   node scripts/conformance.mjs
//
// Needs a release build: cargo build --release

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { estimate } from "../ui/src/lib/tokens.ts";

const FIXTURES = [
  "",
  "hello",
  "The quick brown fox jumps over the lazy dog.",
  'fn main() {\n    println!("{}", 1 + 2);\n}\n',
  "日本語のテキスト — em dash, ünïcode",
  "\t\t\tdeeply\n\t\t\tindented\n",
  "a".repeat(500),
  "!@#$%^&*()_+{}|:\"<>?".repeat(20),
];

// Plus every source file in the repository, which is the only corpus that
// matters: the one the tool is pointed at.
for (const path of walk("crates").concat(walk("ui/src"))) {
  FIXTURES.push(readFileSync(path, "utf8"));
}

function walk(dir, into = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, into);
    else if (/\.(rs|ts|tsx|css|toml)$/.test(name)) into.push(path);
  }
  return into;
}

const rust = JSON.parse(
  execFileSync("./target/release/filestoai", ["--estimate-tokens"], {
    input: JSON.stringify(FIXTURES),
    maxBuffer: 1 << 28,
  }),
);

let bad = 0;
FIXTURES.forEach((text, i) => {
  const mine = estimate(text);
  if (mine !== rust[i]) {
    bad += 1;
    if (bad <= 5) {
      console.error(
        `differ at ${i}: rust=${rust[i]} ts=${mine} for ${JSON.stringify(text.slice(0, 60))}…`,
      );
    }
  }
});

if (bad) {
  console.error(`\n${bad} of ${FIXTURES.length} fixtures disagree.`);
  process.exit(1);
}
console.log(`${FIXTURES.length} fixtures, both implementations agree.`);

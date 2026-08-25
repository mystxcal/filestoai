// The token estimator, in the language the counter lives in.
//
// This is a transcription of `crates/core/src/tokens.rs` — the same six
// features and the same fitted weights, because the number under the tree and
// the number on the export have to be the same number. `scripts/conformance.mjs`
// feeds both implementations the same fixtures and fails if they disagree.
//
// The interface needs this because a file's token count is not the whole cost
// of including it: the export wraps every file in a tag and lists it in the
// directory map, and that framing is a few per cent of the total. Counting
// only the contents would leave the live figure permanently short of the
// figure the export then reports.

const WORD_RUN = 0.93;
const LONG_WORD_CHAR = 0.06;
const PUNCT_RUN = 1.14;
const NEWLINE = 0.61;
const NON_ASCII = 0.72;
const SPACE = 0.04;
const WHOLE_WORD = 3;

const WORD = /[A-Za-z0-9_]/;

export function estimate(text: string): number {
  let wordRuns = 0;
  let wordChars = 0;
  let punctRuns = 0;
  let newlines = 0;
  let nonAscii = 0;
  let spaces = 0;
  let run: "word" | "space" | "punct" | null = null;

  for (const character of text) {
    if (character === "\n") {
      newlines += 1;
      run = null;
      continue;
    }
    if (character.codePointAt(0)! > 127) {
      nonAscii += 1;
      run = null;
      continue;
    }

    let next: "word" | "space" | "punct";
    if (WORD.test(character)) {
      wordChars += 1;
      next = "word";
    } else if (character === " " || character === "\t") {
      spaces += 1;
      next = "space";
    } else {
      next = "punct";
    }

    if (run !== next) {
      if (next === "word") wordRuns += 1;
      else if (next === "punct") punctRuns += 1;
      run = next;
    }
  }

  const longWordChars = Math.max(0, wordChars - WHOLE_WORD * wordRuns);
  return Math.round(
    wordRuns * WORD_RUN +
      longWordChars * LONG_WORD_CHAR +
      punctRuns * PUNCT_RUN +
      newlines * NEWLINE +
      nonAscii * NON_ASCII +
      spaces * SPACE,
  );
}

export type Framing = { path: string; lang?: string; depth: number };

/**
 * What the export costs beyond the contents of the files: the tag or heading
 * around each file, and its line in the directory map.
 *
 * The map line is measured against `│   ` repeated to the file's depth. The
 * real drawing alternates that with `    `, `├── ` and `└── `, but every one
 * of those is the same shape to the estimator — a box character is one token
 * and a space is a fortieth of one — so the difference is far below the
 * accuracy of the estimate itself.
 */
export function framing(files: Framing[], format: string, map: boolean): number {
  let total = 0;
  for (const file of files) {
    total += estimate(wrapper(file, format));
    if (map) total += estimate(`│   `.repeat(file.depth) + `├── ` + basename(file.path));
  }
  return total;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function wrapper(file: Framing, format: string): string {
  switch (format) {
    case "markdown":
      return `\n## ${file.path}\n\n\`\`\`${file.lang ?? "text"}\n\`\`\`\n`;
    case "plain":
      return `\n===== ${file.path} =====\n\n`;
    default:
      return `<file path="${file.path}"${file.lang ? ` lang="${file.lang}"` : ""}>\n</file>\n`;
  }
}

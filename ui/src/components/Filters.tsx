// The left rail: what gets walked, and what counts as too big.
//
// Every control here changes the file list, so each one is applied on change
// rather than behind an Apply button. The version this replaces had five
// separate Apply buttons and a status badge to tell you which of them you had
// forgotten to press.

import { size as bytes } from "../lib/format";
import type { Extension } from "../lib/tree";
import type { CheckState } from "./ui";
import { Chip, Legend, Switch } from "./ui";

/** Stops on the size slider. Log-ish, because the interesting range is small. */
const STOPS = [8, 16, 32, 64, 100, 200, 400, 800, 2048, 0];

export function Filters({
  gitignore,
  onGitignore,
  hidden,
  onHidden,
  patterns,
  onPatterns,
  limitKb,
  onLimitKb,
  extensions,
  extensionState,
  onExtension,
}: {
  gitignore: boolean;
  onGitignore: (on: boolean) => void;
  hidden: boolean;
  onHidden: (on: boolean) => void;
  patterns: string;
  onPatterns: (value: string) => void;
  limitKb: number;
  onLimitKb: (kb: number) => void;
  extensions: Extension[];
  extensionState: (ext: string) => CheckState;
  onExtension: (ext: string) => void;
}) {
  const stop = Math.max(0, STOPS.indexOf(limitKb));

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-4 py-4">
      <section>
        <Legend>Walk</Legend>
        <Switch
          on={gitignore}
          onChange={onGitignore}
          label="Respect .gitignore"
          hint="Nested files, negations and your global excludes"
        />
        <Switch
          on={hidden}
          onChange={onHidden}
          label="Include dotfiles"
          hint=".env, .github and the rest"
        />
      </section>

      <section>
        <Legend>Also ignore</Legend>
        <textarea
          value={patterns}
          onChange={(event) => onPatterns(event.target.value)}
          spellCheck={false}
          aria-label="Extra ignore patterns"
          placeholder={"dist/\n*.min.js\n!keep.min.js"}
          rows={4}
          className="mat-well w-full resize-y rounded-[8px] px-2.5 py-2 font-mono text-[11.5px] leading-[1.6] text-ink outline-none placeholder:text-ghost focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
        />
        <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
          One gitignore pattern per line. <code className="font-mono">!</code> keeps
          a file the rules above threw out.
        </p>
      </section>

      <section>
        <Legend>Size limit</Legend>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={STOPS.length - 1}
            step={1}
            value={stop}
            aria-label="Per-file size limit"
            onChange={(event) => onLimitKb(STOPS[Number(event.target.value)] ?? 100)}
            className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--hairline-strong)] accent-[var(--accent)]"
          />
          <span className="meta w-14 shrink-0 text-right text-ink-2">
            {limitKb === 0 ? "none" : bytes(limitKb * 1024)}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
          Bigger files stay in the list and in the export, named but not quoted.
        </p>
      </section>

      {extensions.length > 0 ? (
        <section className="min-h-0">
          <Legend>By kind</Legend>
          <div className="flex flex-wrap gap-1.5">
            {extensions.slice(0, 22).map((entry) => (
              <Chip
                key={entry.ext}
                label={entry.ext || "no suffix"}
                meta={String(entry.files)}
                state={extensionState(entry.ext)}
                onClick={() => onExtension(entry.ext)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

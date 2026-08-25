// Everything that is not text: images, PDFs, audio, video, archives, fonts.
//
// They are kept out of the tree because their bytes can never go into a
// prompt, and shown anyway because knowing a project has forty PNGs in it is
// worth knowing. Selecting one puts its name and size in the export, not its
// contents, so a model can see that the asset exists.

import { useEffect, useState } from "react";

import { api, type Entry } from "../lib/api";
import { plural, size as bytes } from "../lib/format";
import * as Icon from "./icons";
import { Check, IconButton, Legend } from "./ui";

const GROUPS = [
  { kind: "image", label: "Images" },
  { kind: "document", label: "Documents" },
  { kind: "video", label: "Video" },
  { kind: "audio", label: "Audio" },
  { kind: "font", label: "Fonts" },
  { kind: "archive", label: "Archives" },
  { kind: "data", label: "Binary" },
] as const;

export function Attachments({
  root,
  entries,
  selected,
  onToggle,
  onToggleMany,
}: {
  root: string;
  entries: Entry[];
  selected: ReadonlySet<string>;
  onToggle: (path: string) => void;
  onToggleMany: (paths: string[], on: boolean) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="grid h-full place-items-center px-8 text-center text-[12.5px] text-ink-3">
        Nothing here but text. Every file in this project can be quoted.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      {GROUPS.map((group) => {
        const mine = entries.filter((entry) => entry.kind === group.kind);
        if (mine.length === 0) return null;
        const paths = mine.map((entry) => entry.path);
        const on = paths.filter((path) => selected.has(path)).length;

        return (
          <section key={group.kind} className="mb-5">
            <div className="mb-2 flex items-center gap-2">
              <Legend>
                {group.label} · {mine.length}
              </Legend>
              <button
                type="button"
                onClick={() => onToggleMany(paths, on !== paths.length)}
                className="meta ml-auto mb-2 text-ink-3 uppercase outline-none hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
              >
                {on === paths.length ? "none" : "all"}
              </button>
            </div>

            <div className="grid gap-1">
              {mine.map((entry) => (
                <Attachment
                  key={entry.path}
                  root={root}
                  entry={entry}
                  on={selected.has(entry.path)}
                  onToggle={() => onToggle(entry.path)}
                />
              ))}
            </div>
          </section>
        );
      })}

      <p className="pb-2 text-[11px] leading-snug text-ink-3">
        {entries.length} {plural(entries.length, "attachment")} ·{" "}
        {bytes(entries.reduce((total, entry) => total + entry.size, 0))}. Ticking one
        adds its name and size to the export, never its bytes.
      </p>
    </div>
  );
}

function Attachment({
  root,
  entry,
  on,
  onToggle,
}: {
  root: string;
  entry: Entry;
  on: boolean;
  onToggle: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);

  // Only images, only once, and the object URL is released when the row goes
  // away — an interface that leaks a blob per thumbnail is an interface that
  // grows until the tab dies.
  useEffect(() => {
    if (entry.kind !== "image" || entry.size > 2 * 1024 * 1024) return;
    let url: string | null = null;
    let live = true;
    api
      .preview(root, entry.path)
      .then((made) => {
        url = made;
        if (live) setThumb(made);
        else URL.revokeObjectURL(made);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [root, entry.path, entry.kind, entry.size]);

  return (
    <div className="group flex h-9 items-center gap-2.5 rounded-[8px] px-2 hover:bg-[color-mix(in_oklab,var(--ink)_5%,transparent)]">
      <Check
        state={on ? "on" : "off"}
        onChange={onToggle}
        label={`Mention ${entry.path}`}
      />

      <span className="mat-well grid size-6 shrink-0 place-items-center overflow-hidden rounded-[5px]">
        {thumb ? (
          <img src={thumb} alt="" className="size-full object-cover" />
        ) : (
          <Icon.File className="size-3.5 text-ink-3" />
        )}
      </span>

      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2" title={entry.path}>
        {entry.path}
      </span>

      <span className="meta shrink-0 text-ink-3">{bytes(entry.size)}</span>

      <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <IconButton
          label="Open"
          className="size-7"
          onClick={() => void api.open(root, entry.path, false).catch(() => {})}
        >
          <Icon.External className="size-3.5" />
        </IconButton>
        <IconButton
          label="Show in file manager"
          className="size-7"
          onClick={() => void api.open(root, entry.path, true).catch(() => {})}
        >
          <Icon.Reveal className="size-3.5" />
        </IconButton>
      </span>
    </div>
  );
}

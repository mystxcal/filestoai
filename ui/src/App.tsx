import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";

import {
  api,
  ApiError,
  type Context,
  type Format,
  type Scan,
  type Stats,
} from "./lib/api";
import * as Tokens from "./lib/tokens";
import * as Tree from "./lib/tree";
import { Attachments } from "./components/Attachments";
import { Filters } from "./components/Filters";
import { Instrument, type CopyState } from "./components/Instrument";
import { PathBar } from "./components/PathBar";
import { Preview } from "./components/Preview";
import { Tree as FileTree } from "./components/Tree";
import * as Icon from "./components/icons";
import { Button, Field, IconButton } from "./components/ui";

/** How long to wait after the last keystroke before walking the disk again. */
const SETTLE = 400;

export default function App() {
  const [context, setContext] = useState<Context | null>(null);
  const [path, setPath] = useState("");
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gitignore, setGitignore] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [patterns, setPatterns] = useState("");
  const [limitKb, setLimitKb] = useState(100);

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"files" | "attachments">("files");

  const [format, setFormat] = useState<Format>("xml");
  const [copy, setCopy] = useState<CopyState>("idle");
  const [preview, setPreview] = useState<{ text: string; stats: Stats } | null>(null);
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

  // ── loading ───────────────────────────────────────────────────────────────

  // The server was started somewhere on purpose. Opening that folder without
  // being asked is what `filestoai .` already does, and it means the interface
  // has something in it the moment it appears.
  useEffect(() => {
    api
      .context()
      .then((found) => {
        setContext(found);
        setPath((current) => current || found.cwd);
        if (found.cwd) void load(found.cwd, false);
      })
      .catch((problem: Error) => setError(problem.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(
    async (where: string, keepSelection: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const found = await api.scan({
          path: where,
          gitignore,
          hidden,
          ignore: patterns.split("\n").map((line) => line.trim()).filter(Boolean),
        });
        setScan(found);
        setPath(found.root);

        const text = found.entries.filter((entry) => entry.kind === "text");
        const tree = Tree.build(text);
        setOpen(Tree.openToDepth(tree, 1));
        setSelected((was) =>
          // A rescan is a change of filters, not a change of mind: whatever is
          // still there stays ticked.
          keepSelection
            ? new Set(found.entries.filter((e) => was.has(e.path)).map((e) => e.path))
            : new Set(text.map((entry) => entry.path)),
        );
      } catch (problem) {
        setError(problem instanceof ApiError ? problem.message : String(problem));
        setScan(null);
      } finally {
        setBusy(false);
      }
    },
    [gitignore, hidden, patterns],
  );

  // Filters re-walk the disk. Typing a pattern should not re-walk on every
  // keystroke, so the walk waits for the typing to stop.
  const loaded = useRef(false);
  useEffect(() => {
    if (!scan) return;
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    const timer = setTimeout(() => void load(scan.root, true), SETTLE);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitignore, hidden, patterns]);

  // ── derived ───────────────────────────────────────────────────────────────

  const text = useMemo(
    () => scan?.entries.filter((entry) => entry.kind === "text") ?? [],
    [scan],
  );
  const attachments = useMemo(
    () => scan?.entries.filter((entry) => entry.kind !== "text") ?? [],
    [scan],
  );

  const tree = useMemo(() => Tree.build(text), [text]);
  const limit = limitKb * 1024;
  const counts = useMemo(
    () => Tree.totals(tree, selected, limit),
    [tree, selected, limit],
  );

  const matcher = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return null;
    return (node: Tree.Node) => node.path.toLowerCase().includes(needle);
  }, [search]);

  const rows = useMemo(() => Tree.rows(tree, open, matcher), [tree, open, matcher]);
  const extensions = useMemo(() => Tree.extensions(text), [text]);

  const grand = counts.get("") ?? { files: 0, bytes: 0, tokens: 0, oversize: 0 };
  const attachmentsOn = attachments.filter((entry) => selected.has(entry.path)).length;
  const totalSelected = grand.files + attachmentsOn;

  // ── selection ─────────────────────────────────────────────────────────────

  const setMany = useCallback((paths: string[], on: boolean) => {
    setSelected((was) => {
      const next = new Set(was);
      for (const path of paths) {
        if (on) next.add(path);
        else next.delete(path);
      }
      return next;
    });
  }, []);

  const toggleNode = useCallback(
    (node: Tree.Node) => {
      const paths = Tree.filesUnder(node);
      const on = paths.some((path) => !selected.has(path));
      setMany(paths, on);
    },
    [selected, setMany],
  );

  const toggleOpen = useCallback((folder: string) => {
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }, []);

  const filesWithExtension = useCallback(
    (ext: string) =>
      text
        .filter((entry) => Tree.extensionOf(entry.path) === ext)
        .map((entry) => entry.path),
    [text],
  );

  const extensionState = useCallback(
    (ext: string) => {
      const paths = filesWithExtension(ext);
      const on = paths.filter((path) => selected.has(path)).length;
      return on === 0 ? "off" : on === paths.length ? "on" : "some";
    },
    [filesWithExtension, selected],
  );

  // ── export ────────────────────────────────────────────────────────────────

  const paths = useMemo(() => {
    const wanted = new Set(selected);
    // Server order, so the export reads in the same order as the tree.
    return (scan?.entries ?? [])
      .filter((entry) => wanted.has(entry.path))
      .map((entry) => entry.path);
  }, [scan, selected]);

  // The tags around each file and its line in the directory map are a few per
  // cent of the export. Counting only the contents would leave this figure
  // permanently below the one the export goes on to report.
  const framing = useMemo(() => {
    const lang = new Map((scan?.entries ?? []).map((e) => [e.path, e.lang]));
    return Tokens.framing(
      paths.map((path) => ({
        path,
        lang: lang.get(path),
        depth: path.split("/").length - 1,
      })),
      format,
      true,
    );
  }, [paths, scan, format]);

  const build = useCallback(async () => {
    if (!scan || paths.length === 0) return null;
    return api.export({
      root: scan.root,
      paths,
      format,
      maxBytes: limit,
      map: true,
      contents: true,
    });
  }, [scan, paths, format, limit]);

  const doCopy = useCallback(
    async (ready?: string) => {
      setCopy("working");
      try {
        const value = ready ?? (await build())?.text;
        if (value === undefined) throw new Error("nothing to copy");
        await write(value);
        setCopy("done");
        setTimeout(() => setCopy("idle"), 1600);
      } catch (problem) {
        setCopy("failed");
        setError(problem instanceof Error ? problem.message : String(problem));
        setTimeout(() => setCopy("idle"), 2200);
      }
    },
    [build],
  );

  const doDownload = useCallback(
    async (ready?: string) => {
      try {
        const value = ready ?? (await build())?.text;
        if (value === undefined || !scan) return;
        const name = scan.root.split(/[\\/]/).filter(Boolean).pop() ?? "context";
        const extension = format === "markdown" ? "md" : format === "xml" ? "xml" : "txt";
        save(`${name}-context.${extension}`, value);
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : String(problem));
      }
    },
    [build, format, scan],
  );

  const doPreview = useCallback(async () => {
    try {
      const made = await build();
      if (made) setPreview(made);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  }, [build]);

  // ── keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "c" && event.shiftKey) {
        event.preventDefault();
        void doCopy();
      }
      if (meta && event.key.toLowerCase() === "f") {
        event.preventDefault();
        document.getElementById("tree-search")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [doCopy]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("filestoai-theme", next ? "dark" : "light");
  };

  // ── layout ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 flex flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4">
        <Brand version={context?.version} />
        <PathBar
          path={path}
          onPath={setPath}
          onLoad={(where) => void load(where, false)}
          recent={context?.recent ?? []}
          onForget={() => {
            void api.forget();
            setContext((was) => (was ? { ...was, recent: [] } : was));
          }}
          busy={busy}
        />
        <IconButton label={dark ? "Light theme" : "Dark theme"} onClick={toggleTheme}>
          {dark ? <Icon.Sun /> : <Icon.Moon />}
        </IconButton>
      </header>

      {error ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-hairline bg-[color-mix(in_oklab,var(--flag)_10%,transparent)] px-4 py-2">
          <Icon.Warning className="size-4 shrink-0" />
          <p className="min-w-0 flex-1 text-[12.5px]">{error}</p>
          <IconButton label="Dismiss" onClick={() => setError(null)}>
            <Icon.Cross className="size-3.5" />
          </IconButton>
        </div>
      ) : null}

      <main className="flex min-h-0 flex-1">
        <aside className="w-[19rem] shrink-0 border-r border-hairline">
          <Filters
            gitignore={gitignore}
            onGitignore={setGitignore}
            hidden={hidden}
            onHidden={setHidden}
            patterns={patterns}
            onPatterns={setPatterns}
            limitKb={limitKb}
            onLimitKb={setLimitKb}
            extensions={extensions}
            extensionState={extensionState}
            onExtension={(ext) => {
              const paths = filesWithExtension(ext);
              setMany(paths, extensionState(ext) !== "on");
            }}
          />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-panel">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-3">
            <Tabs
              tab={tab}
              onTab={setTab}
              files={text.length}
              attachments={attachments.length}
            />

            <div className="relative ml-2 min-w-0 flex-1">
              <Icon.Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
              <Field
                ariaLabel="Filter by name"
                value={search}
                onChange={setSearch}
                placeholder="Filter by name"
                className="w-full pl-8"
              />
            </div>

            <Button
              onClick={() => setMany(text.map((entry) => entry.path), true)}
              disabled={!scan}
            >
              All
            </Button>
            <Button onClick={() => setSelected(new Set())} disabled={!scan}>
              None
            </Button>
            <IconButton
              label="Collapse folders"
              onClick={() => setOpen(new Set())}
            >
              <Icon.Caret className="size-4 rotate-90" />
            </IconButton>
            <IconButton
              label="Expand folders"
              onClick={() => setOpen(new Set(Tree.allFolders(tree)))}
            >
              <Icon.Caret className="size-4 -rotate-90" />
            </IconButton>
            <IconButton
              label="Read the folder again"
              onClick={() => scan && void load(scan.root, true)}
            >
              <Icon.Refresh />
            </IconButton>
          </div>

          <div className="min-h-0 flex-1">
            {!scan ? (
              <Empty busy={busy} />
            ) : tab === "files" ? (
              <FileTree
                rows={rows}
                counts={counts}
                open={open}
                onToggleOpen={toggleOpen}
                onToggleSelect={toggleNode}
                limit={limit}
                empty={
                  search
                    ? `No file matches “${search}”.`
                    : "Every file was filtered out. Loosen the rules on the left."
                }
              />
            ) : (
              <Attachments
                root={scan.root}
                entries={attachments}
                selected={selected}
                onToggle={(one) => setMany([one], !selected.has(one))}
                onToggleMany={setMany}
              />
            )}
          </div>
        </section>
      </main>

      <Instrument
        files={totalSelected}
        tokens={grand.tokens + framing}
        size={grand.bytes}
        oversize={grand.oversize}
        format={format}
        onFormat={setFormat}
        onPreview={() => void doPreview()}
        onDownload={() => void doDownload()}
        onCopy={() => void doCopy()}
        copy={copy}
      />

      <AnimatePresence>
        {preview ? (
          <Preview
            text={preview.text}
            stats={preview.stats}
            onClose={() => setPreview(null)}
            onCopy={() => void doCopy(preview.text)}
            onDownload={() => void doDownload(preview.text)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Brand({ version }: { version?: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 pr-1">
      <span className="grid size-7 place-items-center rounded-[7px] bg-accent text-white dark:text-[#141312]">
        <Icon.File className="size-4" />
      </span>
      <span className="hidden sm:block">
        <span className="block text-[13px] font-semibold leading-none text-ink">
          FilesToAI
        </span>
        {version ? <span className="meta text-ink-3">{version}</span> : null}
      </span>
    </div>
  );
}

function Tabs({
  tab,
  onTab,
  files,
  attachments,
}: {
  tab: "files" | "attachments";
  onTab: (tab: "files" | "attachments") => void;
  files: number;
  attachments: number;
}) {
  const items = [
    { id: "files" as const, label: "Files", n: files },
    { id: "attachments" as const, label: "Attachments", n: attachments },
  ];

  return (
    <div className="flex shrink-0 items-center gap-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onTab(item.id)}
          aria-pressed={tab === item.id}
          className={`press flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] font-medium outline-none focus-visible:outline-2 focus-visible:outline-accent ${
            tab === item.id
              ? "mat-cap text-ink"
              : "text-ink-3 hover:text-ink-2"
          }`}
        >
          {item.label}
          <span className="meta opacity-60">{item.n}</span>
        </button>
      ))}
    </div>
  );
}

function Empty({ busy }: { busy: boolean }) {
  return (
    <div className="grid h-full place-items-center px-8 text-center">
      <div className="max-w-sm">
        <p className="text-[13px] text-ink-2">
          {busy ? "Reading the folder…" : "Open a project to begin."}
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
          {busy
            ? "Counting tokens as it goes."
            : "Type a path, pick a recent folder, or browse to one. Everything after that happens in this tab."}
        </p>
      </div>
    </div>
  );
}

/** Clipboard, with the fallback for the browsers that still want a selection. */
async function write(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const carrier = document.createElement("textarea");
    carrier.value = value;
    carrier.style.position = "fixed";
    carrier.style.opacity = "0";
    document.body.append(carrier);
    carrier.select();
    const copied = document.execCommand("copy");
    carrier.remove();
    if (!copied) throw new Error("The browser refused the clipboard.");
  }
}

function save(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

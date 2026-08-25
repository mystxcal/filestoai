// Choosing a project: type it, pick a recent one, or walk there one folder at
// a time. The last of those exists because a browser cannot be given a real
// directory path by a file picker, and typing one from memory is worse than
// clicking three times.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { api, type Folders } from "../lib/api";
import * as Icon from "./icons";
import { Button, Field, IconButton, useTransition } from "./ui";

export function PathBar({
  path,
  onPath,
  onLoad,
  recent,
  onForget,
  busy,
}: {
  path: string;
  onPath: (path: string) => void;
  onLoad: (path: string) => void;
  recent: string[];
  onForget: () => void;
  busy: boolean;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <div className="relative flex min-w-0 flex-1 items-center gap-1.5">
      <Field
        ariaLabel="Project folder"
        value={path}
        onChange={onPath}
        onEnter={() => onLoad(path)}
        placeholder="/path/to/project"
        mono
        className="min-w-0 flex-1"
      />

      <Menu
        recent={recent}
        onPick={(pick) => {
          onPath(pick);
          onLoad(pick);
        }}
        onForget={onForget}
      />

      <IconButton label="Browse folders" onClick={() => setPicking(true)}>
        <Icon.Folder />
      </IconButton>

      <Button tone="primary" onClick={() => onLoad(path)} disabled={busy || !path.trim()}>
        {busy ? "Reading…" : "Open"}
      </Button>

      <AnimatePresence>
        {picking ? (
          <Picker
            start={path}
            onClose={() => setPicking(false)}
            onChoose={(chosen) => {
              setPicking(false);
              onPath(chosen);
              onLoad(chosen);
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Menu({
  recent,
  onPick,
  onForget,
}: {
  recent: string[];
  onPick: (path: string) => void;
  onForget: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const transition = useTransition();

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Element)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <IconButton
        label="Recent folders"
        onClick={() => setOpen((was) => !was)}
      >
        <Icon.Clock />
      </IconButton>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
            transition={transition}
            style={{ transformOrigin: "top right" }}
            className="mat-float absolute right-0 top-9 z-30 w-[min(30rem,80vw)] rounded-[11px] p-1.5"
          >
            {recent.length === 0 ? (
              <p className="px-2.5 py-3 text-center text-[12px] text-ink-3">
                Folders you open will be listed here.
              </p>
            ) : (
              <>
                {recent.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onPick(entry);
                    }}
                    className="press flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left outline-none hover:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)] focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Icon.Folder className="size-4 shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2">
                      {entry}
                    </span>
                  </button>
                ))}
                <div className="mx-1.5 my-1 h-px bg-hairline" />
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onForget();
                  }}
                  className="press w-full rounded-[7px] px-2.5 py-1.5 text-left text-[12px] text-ink-3 outline-none hover:text-flag focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Clear history
                </button>
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Picker({
  start,
  onClose,
  onChoose,
}: {
  start: string;
  onClose: () => void;
  onChoose: (path: string) => void;
}) {
  const [at, setAt] = useState<Folders | null>(null);
  const [error, setError] = useState<string | null>(null);
  const transition = useTransition();

  useEffect(() => {
    let live = true;
    api
      .folders(start || "~")
      .then((folders) => live && setAt(folders))
      .catch((problem: Error) => live && setError(problem.message));
    return () => {
      live = false;
    };
  }, [start]);

  const go = (to: string) => {
    setError(null);
    api
      .folders(to)
      .then(setAt)
      .catch((problem: Error) => setError(problem.message));
  };

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={onClose}
      className="fixed inset-0 z-40 grid place-items-center bg-black/25 p-6 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.985, transition: { duration: 0.12 } }}
        transition={transition}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label="Choose a folder"
        className="mat-float flex h-[26rem] w-[min(34rem,92vw)] flex-col rounded-[13px]"
      >
        <div className="flex items-center gap-2 border-b border-hairline px-3 py-2.5">
          <Icon.Folder className="size-4 shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2">
            {at?.path ?? "…"}
          </span>
          <IconButton label="Close" onClick={onClose}>
            <Icon.Cross />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {error ? (
            <p className="px-2.5 py-3 text-[12px] text-flag">{error}</p>
          ) : null}

          {at?.parent ? (
            <button
              type="button"
              onClick={() => go(at.parent!)}
              className="press flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left outline-none hover:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)] focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="grid size-4 shrink-0 place-items-center text-ink-3">
                <Icon.Caret className="size-3 -rotate-90" />
              </span>
              <span className="text-[12.5px] text-ink-2">Up one level</span>
            </button>
          ) : null}

          {at?.folders.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => go(`${at.path.replace(/\/$/, "")}/${name}`)}
              onDoubleClick={() => onChoose(`${at.path.replace(/\/$/, "")}/${name}`)}
              className="press flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left outline-none hover:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)] focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Icon.Folder className="size-4 shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{name}</span>
            </button>
          ))}

          {at && at.folders.length === 0 && !error ? (
            <p className="px-2.5 py-3 text-[12px] text-ink-3">No folders in here.</p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline px-3 py-2.5">
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" onClick={() => at && onChoose(at.path)} disabled={!at}>
            Open this folder
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

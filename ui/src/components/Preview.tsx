// The export itself, before you commit to it.
//
// Shown on request rather than always, which is the whole difference from the
// interface this replaces: that one generated into two permanent panes you had
// to scroll past to reach the controls.

import { useEffect } from "react";
import { motion } from "motion/react";

import type { Stats } from "../lib/api";
import { count, plural, size as bytes } from "../lib/format";
import * as Icon from "./icons";
import { Button, IconButton, useTransition } from "./ui";

export function Preview({
  text,
  stats,
  onClose,
  onCopy,
  onDownload,
}: {
  text: string;
  stats: Stats;
  onClose: () => void;
  onCopy: () => void;
  onDownload: () => void;
}) {
  const transition = useTransition();

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);

  const notes = [
    stats.oversize > 0 ? `${stats.oversize} over the size limit` : null,
    stats.binary > 0 ? `${stats.binary} not text` : null,
    stats.missing > 0 ? `${stats.missing} unreadable` : null,
  ].filter(Boolean) as string[];

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
        initial={{ opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.985, transition: { duration: 0.12 } }}
        transition={transition}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label="The export"
        className="mat-float flex h-[min(46rem,88vh)] w-[min(64rem,94vw)] flex-col rounded-[13px]"
      >
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
          <h2 className="text-[13px] font-semibold text-ink">Export</h2>
          <span className="meta text-ink-3">
            {stats.included} {plural(stats.included, "file")} · {bytes(stats.bytes)} ·
            ~{count(stats.tokens)} tokens
          </span>
          {notes.length > 0 ? (
            <span className="meta text-ink-3">named only: {notes.join(", ")}</span>
          ) : null}
          <IconButton label="Close" className="ml-auto" onClick={onClose}>
            <Icon.Cross />
          </IconButton>
        </div>

        <div className="mat-well m-3 min-h-0 flex-1 overflow-auto rounded-[9px]">
          <pre className="p-3.5 font-mono text-[11.5px] leading-[1.65] whitespace-pre text-ink-2">
            {text}
          </pre>
        </div>

        <div className="flex items-center gap-2 border-t border-hairline px-4 py-3">
          <p className="text-[11.5px] text-ink-3">
            {stats.chars.toLocaleString()} characters. The token count is an
            estimate, typically within a few per cent.
          </p>
          <div className="ml-auto flex gap-2">
            <Button onClick={onDownload}>
              <Icon.Download className="size-4" />
              Download
            </Button>
            <Button tone="primary" onClick={onCopy}>
              <Icon.Copy className="size-4" />
              Copy
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

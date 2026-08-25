// The bottom rail: what you have selected, and the two things you can do with
// it. The counters are live — they move as you tick — because the number that
// matters is the token count, and finding it out by generating the export and
// reading a report is finding it out too late.

import { AnimatePresence, motion } from "motion/react";

import type { Format } from "../lib/api";
import { count, plural, size as bytes } from "../lib/format";
import * as Icon from "./icons";
import { Button, Segmented, useTransition } from "./ui";

const FORMATS = [
  { value: "xml" as const, label: "XML" },
  { value: "markdown" as const, label: "Markdown" },
  { value: "plain" as const, label: "Plain" },
];

export type CopyState = "idle" | "working" | "done" | "failed";

export function Instrument({
  files,
  tokens,
  size,
  oversize,
  format,
  onFormat,
  onPreview,
  onDownload,
  onCopy,
  copy,
}: {
  files: number;
  tokens: number;
  size: number;
  oversize: number;
  format: Format;
  onFormat: (format: Format) => void;
  onPreview: () => void;
  onDownload: () => void;
  onCopy: () => void;
  copy: CopyState;
}) {
  const empty = files === 0;

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-t border-hairline px-4">
      <Readout
        files={files}
        tokens={tokens}
        size={size}
        oversize={oversize}
        empty={empty}
      />

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Segmented
          label="Export format"
          value={format}
          options={FORMATS}
          onChange={onFormat}
        />

        <Button onClick={onPreview} disabled={empty}>
          Preview
        </Button>

        <Button onClick={onDownload} disabled={empty} title="Download the export">
          <Icon.Download className="size-4" />
        </Button>

        <Button tone="primary" onClick={onCopy} disabled={empty || copy === "working"}>
          <CopyFace state={copy} />
        </Button>
      </div>
    </div>
  );
}

function Readout({
  files,
  tokens,
  size,
  oversize,
  empty,
}: {
  files: number;
  tokens: number;
  size: number;
  oversize: number;
  empty: boolean;
}) {
  if (empty) {
    return (
      <p className="text-[12.5px] text-ink-3">
        Nothing selected. Tick a folder to start.
      </p>
    );
  }

  return (
    <div className="flex min-w-0 items-baseline gap-x-4 gap-y-0 overflow-hidden">
      <Number value={String(files)} unit={plural(files, "file")} />
      <Number value={bytes(size)} unit="" />
      <Number value={`~${count(tokens)}`} unit="tokens" strong />
      {oversize > 0 ? (
        <span
          className="meta flex shrink-0 items-center gap-1"
          style={{ color: "var(--flag)" }}
          title="Selected but over the size limit: named in the export, not quoted"
        >
          <Icon.Warning className="size-3.5" />
          {oversize} over limit
        </span>
      ) : null}
    </div>
  );
}

function Number({
  value,
  unit,
  strong,
}: {
  value: string;
  unit: string;
  strong?: boolean;
}) {
  return (
    <span className="flex shrink-0 items-baseline gap-1">
      <span
        className={`tnum text-[13px] ${strong ? "font-semibold text-ink" : "text-ink-2"}`}
      >
        {value}
      </span>
      {unit ? <span className="text-[11.5px] text-ink-3">{unit}</span> : null}
    </span>
  );
}

/**
 * The label swaps but the button does not resize: both faces occupy the same
 * grid cell, so the widest one has always reserved the space. A primary action
 * that jumps a few pixels on success is the exact moment a person stops
 * trusting the interface.
 */
function CopyFace({ state }: { state: CopyState }) {
  const transition = useTransition();
  const label =
    state === "done" ? "Copied" : state === "failed" ? "Failed" : "Copy";

  return (
    <span className="grid place-items-center">
      <span className="invisible col-start-1 row-start-1 flex items-center gap-1.5">
        <Icon.Copy className="size-4" />
        Copied
      </span>
      <span className="col-start-1 row-start-1 flex items-center gap-1.5">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={state === "done" ? "done" : "idle"}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={transition}
            className="grid place-items-center"
          >
            {state === "done" ? (
              <Icon.Tick className="size-4" />
            ) : (
              <Icon.Copy className="size-4" />
            )}
          </motion.span>
        </AnimatePresence>
        {label}
      </span>
    </span>
  );
}

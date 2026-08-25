// The file tree.
//
// Only the rows on screen exist as elements. A cargo registry checkout is
// thirty thousand files, and the difference between drawing all of them and
// drawing the forty you can see is the difference between a tool and a
// slideshow. The scroll container reserves the full height up front, so the
// bar never resizes underneath your thumb as rows come and go.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { count, size as bytes } from "../lib/format";
import type { Node, Row, Totals } from "../lib/tree";
import { check } from "../lib/tree";
import * as Icon from "./icons";
import { Check } from "./ui";

const ROW = 26;
/** Rows drawn beyond each edge, so a fast flick does not show blank bands. */
const OVERSCAN = 12;

export function Tree({
  rows,
  counts,
  open,
  onToggleOpen,
  onToggleSelect,
  limit,
  empty,
}: {
  rows: Row[];
  counts: Map<string, Totals>;
  open: ReadonlySet<string>;
  onToggleOpen: (path: string) => void;
  onToggleSelect: (node: Node) => void;
  /** Per-file byte limit, so a row can show that it will not be quoted. */
  limit: number;
  empty: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(600);
  const [cursor, setCursor] = useState(0);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A tree that just changed shape has no business keeping a cursor that now
  // points at a different file.
  useEffect(() => {
    setCursor((at) => Math.min(at, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  const reveal = useCallback((index: number) => {
    const element = scroller.current;
    if (!element) return;
    const y = index * ROW;
    if (y < element.scrollTop) element.scrollTop = y;
    else if (y + ROW > element.scrollTop + element.clientHeight) {
      element.scrollTop = y + ROW - element.clientHeight;
    }
  }, []);

  const move = useCallback(
    (to: number) => {
      const next = Math.max(0, Math.min(rows.length - 1, to));
      setCursor(next);
      reveal(next);
    },
    [reveal, rows.length],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    const row = rows[cursor];
    switch (event.key) {
      case "ArrowDown":
        move(cursor + 1);
        break;
      case "ArrowUp":
        move(cursor - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(rows.length - 1);
        break;
      case "PageDown":
        move(cursor + Math.floor(height / ROW));
        break;
      case "PageUp":
        move(cursor - Math.floor(height / ROW));
        break;
      case "ArrowRight":
        if (!row) return;
        if (row.node.children && !open.has(row.node.path)) {
          onToggleOpen(row.node.path);
        } else {
          move(cursor + 1);
        }
        break;
      case "ArrowLeft": {
        if (!row) return;
        if (row.node.children && open.has(row.node.path)) {
          onToggleOpen(row.node.path);
          return;
        }
        // Otherwise climb: the parent is the nearest row above that is
        // shallower than this one.
        for (let i = cursor - 1; i >= 0; i -= 1) {
          if (rows[i]!.node.depth < row.node.depth) {
            move(i);
            break;
          }
        }
        break;
      }
      case " ":
      case "Enter":
        if (row) onToggleSelect(row.node);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  if (rows.length === 0) {
    return (
      <div className="grid h-full place-items-center px-8 text-center text-[12.5px] text-ink-3">
        {empty}
      </div>
    );
  }

  const first = Math.max(0, Math.floor(top / ROW) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((top + height) / ROW) + OVERSCAN);
  const window = rows.slice(first, last);

  return (
    <div
      ref={scroller}
      tabIndex={0}
      role="tree"
      aria-label="Project files"
      aria-activedescendant={rows[cursor] ? rowId(rows[cursor].node.path) : undefined}
      onScroll={(event) => setTop(event.currentTarget.scrollTop)}
      onKeyDown={onKeyDown}
      className="h-full overflow-y-auto overflow-x-hidden outline-none focus-visible:outline-none"
    >
      <div style={{ height: rows.length * ROW, position: "relative" }}>
        {window.map((row, i) => (
          <TreeRow
            key={row.node.path}
            row={row}
            y={(first + i) * ROW}
            focused={first + i === cursor}
            counts={counts}
            limit={limit}
            onToggleOpen={onToggleOpen}
            onToggleSelect={onToggleSelect}
            onFocus={() => setCursor(first + i)}
          />
        ))}
      </div>
    </div>
  );
}

function rowId(path: string) {
  return `row-${path}`;
}

function TreeRow({
  row,
  y,
  focused,
  counts,
  limit,
  onToggleOpen,
  onToggleSelect,
  onFocus,
}: {
  row: Row;
  y: number;
  focused: boolean;
  counts: Map<string, Totals>;
  limit: number;
  onToggleOpen: (path: string) => void;
  onToggleSelect: (node: Node) => void;
  onFocus: () => void;
}) {
  const { node } = row;
  const folder = node.children !== null;
  const state = check(node, counts);
  const selected = counts.get(node.path)?.files ?? 0;
  // Named in the export but not quoted, so the row says so before you count on it.
  const oversize = !folder && limit > 0 && node.bytes > limit;

  return (
    <div
      id={rowId(node.path)}
      role="treeitem"
      aria-level={node.depth + 1}
      aria-expanded={folder ? row.open : undefined}
      aria-selected={state === "on"}
      onMouseDown={onFocus}
      onClick={() => (folder ? onToggleOpen(node.path) : onToggleSelect(node))}
      className={`absolute inset-x-0 flex h-[26px] cursor-default items-center gap-1.5 rounded-[7px] pr-2 select-none ${
        focused
          ? "bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]"
          : "hover:bg-[color-mix(in_oklab,var(--ink)_5%,transparent)]"
      }`}
      style={{ top: y, paddingLeft: 6 + node.depth * 13 }}
    >
      {folder ? (
        <span
          className="grid size-3.5 shrink-0 place-items-center text-ink-3 transition-transform duration-200"
          style={{ transform: row.open ? "rotate(90deg)" : "none" }}
        >
          <Icon.Caret className="size-3" />
        </span>
      ) : (
        <span className="size-3.5 shrink-0" />
      )}

      <Check
        state={state}
        onChange={() => onToggleSelect(node)}
        label={`Include ${node.path}`}
      />

      <span
        className="shrink-0"
        style={{ color: state === "off" ? "var(--ink-3)" : "var(--accent)" }}
      >
        {folder ? <Icon.Folder className="size-4" /> : <Icon.File className="size-4" />}
      </span>

      <span
        className={`min-w-0 flex-1 truncate text-[12.5px] ${
          state === "off" ? "text-ink-3" : "text-ink"
        }`}
      >
        {node.name}
      </span>

      <span
        className="meta shrink-0"
        style={{ color: oversize ? "var(--flag)" : "var(--ink-3)" }}
        title={oversize ? "Over the size limit — named in the export, not quoted" : undefined}
      >
        {folder ? `${selected ? `${selected}/` : ""}${node.files}` : bytes(node.bytes)}
      </span>
      <span className="meta w-11 shrink-0 text-right text-ink-3">
        {oversize ? "skip" : node.tokens > 0 ? `~${count(node.tokens)}` : "—"}
      </span>
    </div>
  );
}

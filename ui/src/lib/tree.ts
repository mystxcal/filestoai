// The file tree, and the arithmetic that keeps its counters honest.
//
// Every number in the interface — files, bytes, tokens, the third state of a
// folder's checkbox — is derived from one selection set and one tree. Nothing
// is stored twice, so nothing can disagree with itself, which is the failure
// this replaces: the version before it kept the selection on the server and
// the counts on the client, and they drifted apart the moment you opened a
// second tab.

import type { Entry } from "./api";

export type Node = {
  path: string;
  name: string;
  depth: number;
  children: Node[] | null;
  /** Present on files, absent on folders. */
  entry: Entry | null;
  /** Files at or under this node. One for a file. */
  files: number;
  bytes: number;
  tokens: number;
};

export type Row = { node: Node; open: boolean };

/** Build the folder tree from the flat list the server sends. */
export function build(entries: Entry[]): Node {
  const root: Node = {
    path: "",
    name: "",
    depth: -1,
    children: [],
    entry: null,
    files: 0,
    bytes: 0,
    tokens: 0,
  };

  // The server sends paths sorted, so a folder's children arrive together and
  // a single cursor down the list is enough.
  const folders = new Map<string, Node>([["", root]]);

  const folder = (path: string, depth: number): Node => {
    const existing = folders.get(path);
    if (existing) return existing;

    const cut = path.lastIndexOf("/");
    const parent = folder(cut === -1 ? "" : path.slice(0, cut), depth - 1);
    const node: Node = {
      path,
      name: path.slice(cut + 1),
      depth,
      children: [],
      entry: null,
      files: 0,
      bytes: 0,
      tokens: 0,
    };
    parent.children!.push(node);
    folders.set(path, node);
    return node;
  };

  for (const entry of entries) {
    const cut = entry.path.lastIndexOf("/");
    const depth = entry.path.split("/").length - 1;
    const parent = folder(cut === -1 ? "" : entry.path.slice(0, cut), depth - 1);
    parent.children!.push({
      path: entry.path,
      name: entry.path.slice(cut + 1),
      depth,
      children: null,
      entry,
      files: 1,
      bytes: entry.size,
      tokens: entry.tokens,
    });
  }

  sum(root);
  return root;
}

/** Roll totals up, and put folders before files at every level. */
function sum(node: Node): void {
  if (!node.children) return;
  for (const child of node.children) {
    sum(child);
    node.files += child.files;
    node.bytes += child.bytes;
    node.tokens += child.tokens;
  }
  node.children.sort((a, b) => {
    const aFolder = a.children !== null;
    if (aFolder !== (b.children !== null)) return aFolder ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

/** Every file path at or under a node. */
export function filesUnder(node: Node, into: string[] = []): string[] {
  if (!node.children) {
    into.push(node.path);
    return into;
  }
  for (const child of node.children) filesUnder(child, into);
  return into;
}

export type Totals = {
  /** Files ticked. */
  files: number;
  /** Bytes that will actually be quoted. */
  bytes: number;
  /** Tokens that will actually be spent. */
  tokens: number;
  /** Ticked, but too big to be quoted at the current limit. */
  oversize: number;
};

/**
 * How much of each folder is selected, in one pass.
 *
 * A file over the size limit is still selected — it appears in the export as a
 * named omission — but it contributes no bytes and no tokens, because it
 * contributes no content. Counting it would put a number on the screen that
 * the export then fails to match, which is the one thing a live counter must
 * never do.
 *
 * Recomputed from scratch on every change rather than patched incrementally: a
 * counter only ever moved by deltas is a counter that will eventually be wrong
 * and will never say so.
 */
export function totals(
  root: Node,
  selected: ReadonlySet<string>,
  limit: number,
): Map<string, Totals> {
  const map = new Map<string, Totals>();

  const walk = (node: Node): Totals => {
    if (!node.children) {
      const on = selected.has(node.path);
      const quoted = on && (limit === 0 || node.bytes <= limit);
      const own = {
        files: on ? 1 : 0,
        bytes: quoted ? node.bytes : 0,
        tokens: quoted ? node.tokens : 0,
        oversize: on && !quoted ? 1 : 0,
      };
      map.set(node.path, own);
      return own;
    }
    const own = { files: 0, bytes: 0, tokens: 0, oversize: 0 };
    for (const child of node.children) {
      const under = walk(child);
      own.files += under.files;
      own.bytes += under.bytes;
      own.tokens += under.tokens;
      own.oversize += under.oversize;
    }
    map.set(node.path, own);
    return own;
  };

  walk(root);
  return map;
}

export type Check = "on" | "off" | "some";

export function check(node: Node, counts: Map<string, Totals>): Check {
  const selected = counts.get(node.path)?.files ?? 0;
  if (selected === 0) return "off";
  return selected === node.files ? "on" : "some";
}

/**
 * The rows a scrolling list has to draw: the tree flattened, with closed
 * folders' contents left out.
 */
export function rows(
  root: Node,
  open: ReadonlySet<string>,
  match: ((node: Node) => boolean) | null,
): Row[] {
  const out: Row[] = [];

  const walk = (node: Node): boolean => {
    if (node.children === null) {
      if (match && !match(node)) return false;
      out.push({ node, open: false });
      return true;
    }

    // A folder earns its row by having something under it that matched. Which
    // means the search has to look before it can draw, so the row goes in on
    // trust and comes back out if nothing below it survived.
    const mark = out.length;
    const showing = open.has(node.path) || match !== null;
    out.push({ node, open: showing });

    let kept = !match;
    if (showing) {
      kept = false;
      for (const child of node.children) kept = walk(child) || kept;
    }

    if (!kept && match) {
      out.length = mark;
      return false;
    }
    return true;
  };

  for (const child of root.children ?? []) walk(child);
  return out;
}

/** Folders that contain a file, deepest first — the sensible default opening. */
export function openToDepth(root: Node, depth: number): Set<string> {
  const open = new Set<string>();
  const walk = (node: Node) => {
    if (!node.children) return;
    if (node.depth < depth) {
      open.add(node.path);
      for (const child of node.children) walk(child);
    }
  };
  for (const child of root.children ?? []) walk(child);
  open.delete("");
  return open;
}

/** Every folder path in the tree. */
export function allFolders(root: Node, into: string[] = []): string[] {
  for (const child of root.children ?? []) {
    if (child.children) {
      into.push(child.path);
      allFolders(child, into);
    }
  }
  return into;
}

export type Extension = { ext: string; files: number; tokens: number };

/** The bucket for Makefile, LICENSE, Dockerfile and the rest. */
export const NO_EXTENSION = "";

/**
 * The suffix a file is selected by. Everything without one shares a single
 * bucket: a project has a handful of extensionless files with nothing in
 * common but that fact, and giving each its own chip turns the panel into a
 * list of filenames.
 */
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const cut = name.lastIndexOf(".");
  return cut > 0 ? name.slice(cut) : NO_EXTENSION;
}

/** The extensions present, commonest first, for selecting by kind. */
export function extensions(entries: Entry[]): Extension[] {
  const map = new Map<string, Extension>();
  for (const entry of entries) {
    const ext = extensionOf(entry.path);
    const found = map.get(ext);
    if (found) {
      found.files += 1;
      found.tokens += entry.tokens;
    } else {
      map.set(ext, { ext, files: 1, tokens: entry.tokens });
    }
  }
  return [...map.values()].sort(
    (a, b) => b.files - a.files || a.ext.localeCompare(b.ext),
  );
}

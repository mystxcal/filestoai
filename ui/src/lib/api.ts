// The server's side of the contract, and the secret that gets us through the
// door. The token arrives in the URL fragment — which browsers never send to
// a server — and moves to sessionStorage on first load so a copied URL is not
// a copied key.

const TOKEN_KEY = "filestoai-token";

function token(): string {
  const fromHash = location.hash.replace(/^#/, "").trim();
  if (fromHash) {
    sessionStorage.setItem(TOKEN_KEY, fromHash);
    history.replaceState(null, "", location.pathname + location.search);
    return fromHash;
  }
  return sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export type Kind =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "archive"
  | "font"
  | "data";

export type Entry = {
  path: string;
  size: number;
  kind: Kind;
  lang?: string;
  tokens: number;
  lines: number;
};

export type Scan = { root: string; entries: Entry[]; unreadable: number };

export type Stats = {
  requested: number;
  included: number;
  oversize: number;
  binary: number;
  missing: number;
  bytes: number;
  chars: number;
  tokens: number;
};

export type Format = "xml" | "markdown" | "plain";

export type Context = {
  version: string;
  cwd: string;
  home: string;
  separator: string;
  recent: string[];
};

export type Folders = { path: string; parent: string | null; folders: string[] };

export class ApiError extends Error {}

async function call<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method: body === undefined ? "GET" : method,
      headers: {
        "x-filestoai-token": token(),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("The FilesToAI server is not answering. Is it still running?");
  }

  if (response.status === 401) {
    throw new ApiError(
      "This tab is not authorised. Open the link the server printed when it started.",
    );
  }
  if (!response.ok) {
    const message = await response
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => null);
    throw new ApiError(message ?? `The server answered ${response.status}.`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  context: () => call<Context>("context"),

  scan: (request: {
    path: string;
    gitignore: boolean;
    hidden: boolean;
    ignore: string[];
  }) => call<Scan>("scan", request),

  export: (request: {
    root: string;
    paths: string[];
    format: Format;
    maxBytes: number;
    map: boolean;
    contents: boolean;
  }) => call<{ text: string; stats: Stats }>("export", request),

  folders: (path: string) => call<Folders>("folders", { path }),

  open: (root: string, path: string, reveal: boolean) =>
    call<void>("open", { root, path, reveal }),

  forget: () => call<void>("forget", {}),

  /// Bytes of one attachment, as a blob URL the caller must revoke.
  async preview(root: string, path: string): Promise<string> {
    const response = await fetch("/api/raw", {
      method: "POST",
      headers: {
        "x-filestoai-token": token(),
        "content-type": "application/json",
      },
      body: JSON.stringify({ root, path }),
    });
    if (!response.ok) throw new ApiError("That file could not be read.");
    return URL.createObjectURL(await response.blob());
  },
};

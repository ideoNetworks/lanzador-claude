import type { DirEntry, DriveEntry } from "../api";

/** Load state of one folder's children (keyed by path) or of the drive list. */
export type ChildState =
  | { status: "loading" }
  | { status: "ok"; entries: DirEntry[] }
  | { status: "error"; code: string };
export type DriveState =
  | { status: "idle" | "loading" }
  | { status: "ok"; drives: DriveEntry[] };

export interface TreeInput {
  root: string;
  /** Expanded row ids (`r|<path>` root subtree, `pc`, `d|<path>` drive subtree). */
  expanded: Set<string>;
  children: Map<string, ChildState>;
  drives: DriveState;
}

export type RowKind = "folder" | "pc" | "drive" | "net" | "error" | "loading";

export interface TreeRow {
  id: string;
  path: string | null;
  name: string;
  /** Secondary text (drive label). */
  label?: string;
  depth: number;
  kind: RowKind;
  hasChildren: boolean;
  expanded: boolean;
  parentId: string | null;
  /** Project kind detected by the engine (manual marks are applied by the tree view). */
  project?: "claude" | "code" | null;
  /** Error code for `error` rows. */
  hint?: string;
}

export const baseName = (p: string): string => {
  const t = p.replace(/[\\/]+$/, "");
  if (/^[A-Za-z]:$/.test(t)) return `${t}\\`;
  const i = Math.max(t.lastIndexOf("\\"), t.lastIndexOf("/"));
  return i >= 0 ? t.slice(i + 1) || p : t || p;
};

const focusable = (r: TreeRow) => r.kind !== "error" && r.kind !== "loading";

function pushFolder(out: TreeRow[], input: TreeInput, prefix: string, entry: { path: string; name: string; label?: string; hasChildren: boolean; kind: RowKind; project?: "claude" | "code" | null }, depth: number, parentId: string | null) {
  const id = `${prefix}|${entry.path}`;
  const expanded = input.expanded.has(id);
  const state = input.children.get(entry.path);
  const loadedEmpty = state?.status === "ok" && state.entries.length === 0;
  out.push({ id, path: entry.path, name: entry.name, label: entry.label, depth, kind: entry.kind, hasChildren: entry.hasChildren && !loadedEmpty, expanded, parentId, project: entry.project ?? null });
  if (!expanded || !state) return;
  if (state.status === "loading") out.push({ id: `${id}#loading`, path: null, name: "", depth: depth + 1, kind: "loading", hasChildren: false, expanded: false, parentId: id });
  else if (state.status === "error") out.push({ id: `${id}#error`, path: null, name: "", depth: depth + 1, kind: "error", hasChildren: false, expanded: false, parentId: id, hint: state.code });
  else for (const e of state.entries) pushFolder(out, input, prefix, { path: e.path, name: e.name, hasChildren: e.hasChildren, kind: "folder", project: e.project ?? null }, depth + 1, id);
}

/** Flattens the visible tree: root subtree, then "This PC" with its drives. */
export function buildRows(input: TreeInput): TreeRow[] {
  const out: TreeRow[] = [];
  pushFolder(out, input, "r", { path: input.root, name: baseName(input.root), hasChildren: true, kind: "folder" }, 0, null);
  const pcOpen = input.expanded.has("pc");
  out.push({ id: "pc", path: null, name: "", depth: 0, kind: "pc", hasChildren: true, expanded: pcOpen, parentId: null });
  if (pcOpen) {
    if (input.drives.status === "loading") out.push({ id: "pc#loading", path: null, name: "", depth: 1, kind: "loading", hasChildren: false, expanded: false, parentId: "pc" });
    if (input.drives.status === "ok")
      for (const d of input.drives.drives) {
        const letter = d.path.replace(/[\\/]+$/, "");
        const label = d.label && d.label !== letter ? d.label : undefined;
        pushFolder(out, input, "d", { path: d.path, name: `${letter}\\`, label, hasChildren: true, kind: d.kind === "network" ? "net" : "drive" }, 1, "pc");
      }
  }
  return out;
}

export type TreeAction = { type: "focus" | "expand" | "collapse" | "select"; id: string } | null;

/** Keyboard behaviour of the tree (WAI-ARIA tree pattern). */
export function treeKey(rows: TreeRow[], focusId: string | null, key: string): TreeAction {
  const nav = rows.filter(focusable);
  if (!nav.length) return null;
  const i = nav.findIndex((r) => r.id === focusId);
  if (i < 0) return ["ArrowDown", "ArrowUp", "Home", "End"].includes(key) ? { type: "focus", id: nav[0].id } : null;
  const cur = nav[i];
  switch (key) {
    case "ArrowDown": return i + 1 < nav.length ? { type: "focus", id: nav[i + 1].id } : null;
    case "ArrowUp": return i > 0 ? { type: "focus", id: nav[i - 1].id } : null;
    case "Home": return { type: "focus", id: nav[0].id };
    case "End": return { type: "focus", id: nav[nav.length - 1].id };
    case "ArrowRight": {
      if (!cur.hasChildren) return null;
      if (!cur.expanded) return { type: "expand", id: cur.id };
      const next = nav[i + 1];
      return next && next.parentId === cur.id ? { type: "focus", id: next.id } : null;
    }
    case "ArrowLeft":
      if (cur.expanded) return { type: "collapse", id: cur.id };
      return cur.parentId ? { type: "focus", id: cur.parentId } : null;
    case "Enter":
    case " ":
      return { type: "select", id: cur.id };
    default:
      return null;
  }
}

const trimSep = (p: string) => (/^[A-Za-z]:[\\/]?$/.test(p) ? `${p.slice(0, 2)}\\` : p.replace(/[\\/]+$/, ""));

/** Folders (root included) that must be expanded to reveal `target` under `root`; [] if outside. */
export function ancestorsUnder(root: string, target: string): string[] {
  const r = trimSep(root);
  const t = trimSep(target);
  const rl = r.toLowerCase();
  const tl = t.toLowerCase();
  const prefix = rl.endsWith("\\") ? rl : `${rl}\\`;
  if (tl === rl || !tl.startsWith(prefix)) return [];
  const parts = t.slice(prefix.length).split(/[\\/]/).filter(Boolean);
  const out = [r];
  let cur = r;
  for (const part of parts.slice(0, -1)) {
    cur = cur.endsWith("\\") ? `${cur}${part}` : `${cur}\\${part}`;
    out.push(cur);
  }
  return out;
}

/** `C:\…\Local\Temp\lzt9`: keeps the drive (or `\\server`) and as many trailing folders as fit in `max`. */
export function shortenPath(p: string, max: number): string {
  if (p.length <= max) return p;
  const unc = p.startsWith("\\\\");
  const parts = (unc ? p.slice(2) : p).split(/[\\/]/).filter(Boolean);
  const head = (unc ? "\\\\" : "") + parts.shift();
  const prefix = `${head}\\…\\`;
  let tail = parts.pop() ?? "";
  while (parts.length && prefix.length + parts[parts.length - 1].length + 1 + tail.length <= max) tail = `${parts.pop()}\\${tail}`;
  return parts.length ? prefix + tail : `${head}\\${tail}`;
}

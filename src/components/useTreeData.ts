import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api";
import { buildRows, type ChildState, type DriveState, type TreeRow } from "../logic/tree";

const codeOf = (e: unknown) => (e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string" ? (e as { code: string }).code : "io");

/** Root plus every expanded folder path (ids are `r|path` / `d|path`). */
const openPaths = (root: string, expanded: Set<string>) => {
  const paths = new Set<string>([root]);
  for (const id of expanded) if (id.includes("|")) paths.add(id.slice(2));
  return paths;
};

/** Lazy tree state: expanded ids, children per path, drive list. Resets when root or showHidden change. */
export function useTreeData(root: string, showHidden: boolean) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([`r|${root}`]));
  const [children, setChildren] = useState<Map<string, ChildState>>(new Map());
  const [drives, setDrives] = useState<DriveState>({ status: "idle" });
  // Generation guards against late responses after a reset.
  const gen = useRef(0);
  const childrenRef = useRef(children);
  childrenRef.current = children;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const prevRoot = useRef<string | null>(null);

  const load = useCallback((path: string, force = false) => {
    const cur = childrenRef.current.get(path);
    if (!force && cur && cur.status !== "error") return;
    const g = gen.current;
    setChildren((m) => new Map(m).set(path, { status: "loading" }));
    api.listDir(path, showHidden).then(
      (entries) => g === gen.current && setChildren((m) => new Map(m).set(path, { status: "ok", entries })),
      (e) => g === gen.current && setChildren((m) => new Map(m).set(path, { status: "error", code: codeOf(e) })),
    );
  }, [showHidden]);

  const loadDrives = useCallback(() => {
    setDrives({ status: "loading" });
    api.listRoots().then((d) => setDrives({ status: "ok", drives: d }), () => setDrives({ status: "ok", drives: [] }));
  }, []);

  // New root: start over with the root expanded. Hidden-folder toggle: reload what is open.
  useEffect(() => {
    gen.current++;
    const sameRoot = prevRoot.current === root;
    prevRoot.current = root;
    childrenRef.current = new Map();
    setChildren(new Map());
    if (sameRoot) {
      openPaths(root, expandedRef.current).forEach((p) => load(p, true));
    } else {
      setExpanded((prev) => new Set([`r|${root}`, ...[...prev].filter((id) => id === "pc")]));
      load(root, true);
    }
  }, [root, showHidden, load]);

  const rows: TreeRow[] = useMemo(() => buildRows({ root, expanded, children, drives }), [root, expanded, children, drives]);

  const expand = useCallback((row: TreeRow) => {
    if (row.kind === "pc") {
      if (drives.status === "idle") loadDrives();
    } else if (row.path) load(row.path);
    setExpanded((s) => new Set(s).add(row.id));
  }, [drives.status, load, loadDrives]);

  const collapse = useCallback((id: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }, []);

  /** Expands the given root-subtree folders (used to reveal a selection). */
  const reveal = useCallback((paths: string[]) => {
    if (!paths.length) return;
    paths.forEach((p) => load(p));
    setExpanded((s) => {
      const n = new Set(s);
      paths.forEach((p) => n.add(`r|${p}`));
      return n;
    });
  }, [load]);

  const refresh = useCallback(() => {
    gen.current++;
    childrenRef.current = new Map();
    setChildren(new Map());
    openPaths(root, expanded).forEach((p) => load(p, true));
    if (drives.status !== "idle") loadDrives();
  }, [root, expanded, drives.status, load, loadDrives]);

  return { rows, expand, collapse, reveal, refresh };
}

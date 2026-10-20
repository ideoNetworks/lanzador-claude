import { describe, it, expect } from "vitest";
import { buildRows, treeKey, ancestorsUnder, shortenPath, type TreeInput, type TreeRow } from "../logic/tree";

const dir = (path: string, hasChildren = true) => ({ name: path.split("\\").pop()!, path, hasChildren, hidden: false });

const base = (over: Partial<TreeInput> = {}): TreeInput => ({
  root: "C:\\Desarrollo",
  expanded: new Set(["r|C:\\Desarrollo"]),
  children: new Map([["C:\\Desarrollo", { status: "ok", entries: [dir("C:\\Desarrollo\\api"), dir("C:\\Desarrollo\\web", false)] }]]),
  drives: { status: "idle" },
  ...over,
});

const ids = (rows: TreeRow[]) => rows.map((r) => r.id);

describe("buildRows", () => {
  it("lists the root, its loaded children and the PC node", () => {
    const rows = buildRows(base());
    expect(ids(rows)).toEqual(["r|C:\\Desarrollo", "r|C:\\Desarrollo\\api", "r|C:\\Desarrollo\\web", "pc"]);
    expect(rows[0]).toMatchObject({ name: "Desarrollo", depth: 0, expanded: true, hasChildren: true });
    expect(rows[1]).toMatchObject({ depth: 1, parentId: "r|C:\\Desarrollo", kind: "folder" });
    expect(rows[3]).toMatchObject({ kind: "pc", path: null, expanded: false });
  });

  it("shows an error row when the root cannot be listed, PC node still present", () => {
    const rows = buildRows(base({ children: new Map([["C:\\Desarrollo", { status: "error", code: "path_not_found" }]]) }));
    expect(rows.map((r) => r.kind)).toEqual(["folder", "error", "pc"]);
    expect(rows[1].hint).toBe("path_not_found");
  });

  it("shows a loading row while children load", () => {
    const rows = buildRows(base({ children: new Map([["C:\\Desarrollo", { status: "loading" }]]) }));
    expect(rows[1].kind).toBe("loading");
  });

  it("lists drives under an expanded PC node with labels and kinds", () => {
    const rows = buildRows(base({
      expanded: new Set(["pc"]),
      drives: { status: "ok", drives: [{ path: "C:\\", label: "Windows", kind: "fixed" }, { path: "Z:\\", label: "", kind: "network" }] },
    }));
    expect(ids(rows)).toEqual(["r|C:\\Desarrollo", "pc", "d|C:\\", "d|Z:\\"]);
    expect(rows[2]).toMatchObject({ kind: "drive", name: "C:\\", label: "Windows", depth: 1, parentId: "pc" });
    expect(rows[3]).toMatchObject({ kind: "net", name: "Z:\\" });
  });

  it("a root that is a drive keeps distinct ids from the PC subtree", () => {
    const rows = buildRows(base({ root: "C:\\", expanded: new Set(), children: new Map() }));
    expect(rows[0]).toMatchObject({ id: "r|C:\\", name: "C:\\" });
  });
});

describe("treeKey", () => {
  const rows = buildRows(base({
    expanded: new Set(["r|C:\\Desarrollo", "pc"]),
    drives: { status: "ok", drives: [{ path: "C:\\", label: "", kind: "fixed" }] },
  }));
  // r|root, r|api, r|web, pc, d|C:\

  it("moves focus up and down over focusable rows", () => {
    expect(treeKey(rows, "r|C:\\Desarrollo", "ArrowDown")).toEqual({ type: "focus", id: "r|C:\\Desarrollo\\api" });
    expect(treeKey(rows, "r|C:\\Desarrollo\\api", "ArrowUp")).toEqual({ type: "focus", id: "r|C:\\Desarrollo" });
    expect(treeKey(rows, "d|C:\\", "ArrowDown")).toBeNull();
    expect(treeKey(rows, null, "ArrowDown")).toEqual({ type: "focus", id: "r|C:\\Desarrollo" });
    expect(treeKey(rows, "r|C:\\Desarrollo\\web", "End")).toEqual({ type: "focus", id: "d|C:\\" });
    expect(treeKey(rows, "d|C:\\", "Home")).toEqual({ type: "focus", id: "r|C:\\Desarrollo" });
  });

  it("skips error and loading rows", () => {
    const r2 = buildRows(base({ children: new Map([["C:\\Desarrollo", { status: "error", code: "access_denied" }]]) }));
    expect(treeKey(r2, "r|C:\\Desarrollo", "ArrowDown")).toEqual({ type: "focus", id: "pc" });
  });

  it("ArrowRight expands a collapsed node, then enters it", () => {
    expect(treeKey(rows, "r|C:\\Desarrollo\\api", "ArrowRight")).toEqual({ type: "expand", id: "r|C:\\Desarrollo\\api" });
    expect(treeKey(rows, "r|C:\\Desarrollo", "ArrowRight")).toEqual({ type: "focus", id: "r|C:\\Desarrollo\\api" });
    expect(treeKey(rows, "r|C:\\Desarrollo\\web", "ArrowRight")).toBeNull();
  });

  it("ArrowLeft collapses an expanded node, else goes to the parent", () => {
    expect(treeKey(rows, "pc", "ArrowLeft")).toEqual({ type: "collapse", id: "pc" });
    expect(treeKey(rows, "d|C:\\", "ArrowLeft")).toEqual({ type: "focus", id: "pc" });
    expect(treeKey(rows, "r|C:\\Desarrollo\\web", "ArrowLeft")).toEqual({ type: "focus", id: "r|C:\\Desarrollo" });
  });

  it("Enter and Space select", () => {
    expect(treeKey(rows, "r|C:\\Desarrollo\\web", "Enter")).toEqual({ type: "select", id: "r|C:\\Desarrollo\\web" });
    expect(treeKey(rows, "pc", " ")).toEqual({ type: "select", id: "pc" });
    expect(treeKey(rows, "pc", "x")).toBeNull();
  });
});

describe("ancestorsUnder", () => {
  it("returns the folders to expand between root and target (case-insensitive)", () => {
    expect(ancestorsUnder("C:\\Desarrollo", "c:\\desarrollo\\IDN\\src")).toEqual(["C:\\Desarrollo", "C:\\Desarrollo\\IDN"]);
    expect(ancestorsUnder("C:\\Desarrollo\\", "C:\\Desarrollo\\IDN")).toEqual(["C:\\Desarrollo"]);
    expect(ancestorsUnder("C:\\Desarrollo", "C:\\Desarrollo")).toEqual([]);
    expect(ancestorsUnder("C:\\Desarrollo", "D:\\x")).toEqual([]);
    expect(ancestorsUnder("C:\\", "C:\\a\\b")).toEqual(["C:\\", "C:\\a"]);
  });
});

describe("shortenPath", () => {
  it("keeps short paths and elides the middle of long ones, keeping the tail", () => {
    expect(shortenPath(String.raw`C:\Desarrollo`, 30)).toBe(String.raw`C:\Desarrollo`);
    expect(shortenPath(String.raw`C:\Users\AntonioTarazona\AppData\Local\Temp\lzt9`, 25)).toBe(String.raw`C:\…\Local\Temp\lzt9`);
    expect(shortenPath(String.raw`C:\averyveryveryveryverylongfoldername`, 20)).toBe(String.raw`C:\averyveryveryveryverylongfoldername`);
    expect(shortenPath(String.raw`C:\a\averyveryveryveryverylongfoldername`, 20)).toBe(String.raw`C:\…\averyveryveryveryverylongfoldername`);
    expect(shortenPath(String.raw`\\server\share\a\b\c\deep`, 18)).toBe(String.raw`\\server\…\c\deep`);
  });
});

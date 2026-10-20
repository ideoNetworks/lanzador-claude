import { describe, it, expect } from "vitest";
import { searchFolders, normalize, mergeCandidates } from "../logic/search";

const c = (path: string, fav = false, recent = false) => ({ path, name: path.split("\\").pop()!, fav, recent });

describe("folder search", () => {
  it("normalize lowercases and strips accents", () => {
    expect(normalize("José's APP")).toBe("jose's app");
  });

  it("mergeCandidates dedupes paths case-insensitively and merges flags", () => {
    const m = mergeCandidates([c("C:\\A\\One", true), c("c:\\a\\one", false, true), c("C:\\A\\Two")]);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ path: "C:\\A\\One", fav: true, recent: true });
  });

  it("empty query returns favourites then recents only", () => {
    const r = searchFolders([c("C:\\x\\plain"), c("C:\\x\\rec", false, true), c("C:\\x\\fav", true)], "");
    expect(r.map((x) => x.name)).toEqual(["fav", "rec"]);
  });

  it("ranks name prefix over name substring over path match, accent-insensitive", () => {
    const r = searchFolders([c("C:\\lanz\\other"), c("C:\\x\\mi-lanzador"), c("C:\\x\\Lanzador"), c("C:\\x\\zzz")], "lanz");
    expect(r.map((x) => x.name)).toEqual(["Lanzador", "mi-lanzador", "other"]);
    expect(searchFolders([c("C:\\P\\José's app")], "jose")[0].name).toBe("José's app");
  });

  it("all words must match; favourites win ties", () => {
    const r = searchFolders([c("C:\\a\\web ideo"), c("C:\\b\\web ideo", true), c("C:\\c\\web")], "ideo web");
    expect(r.map((x) => x.path)).toEqual(["C:\\b\\web ideo", "C:\\a\\web ideo"]);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 80 }, (_, i) => c(`C:\\r\\proj${i}`));
    expect(searchFolders(many, "proj", 20)).toHaveLength(20);
  });
});

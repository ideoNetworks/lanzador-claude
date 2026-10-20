import { describe, it, expect } from "vitest";
import { applyProfile, countByKind } from "../logic/selection";
import type { CatalogItem, Profile } from "../api";

const item = (id: string, kind: "flag" | "env"): CatalogItem => ({
  id, kind, key: id, group: "other", dangerous: false, fromHelp: false, i18n: {},
  value: { kind: "none", options: [], fixed: null, placeholder: null, optional: false },
});

describe("selection helpers", () => {
  it("applyProfile_keeps_pins", () => {
    const profile: Profile = { id: "p", name: "P", builtin: false, selection: { b: null }, target: "wt" };
    const s = applyProfile({ active: { a: null }, pinned: { a: null } }, profile);
    expect(s.active).toEqual({ b: null });
    expect(s.pinned).toEqual({ a: null });
  });
  it("countByKind counts active ids of a kind", () => {
    const cat = [item("f1", "flag"), item("f2", "flag"), item("e1", "env")];
    expect(countByKind({ f1: null, e1: "x", unknown: null }, cat, "flag")).toBe(1);
    expect(countByKind({ f1: null, e1: "x" }, cat, "env")).toBe(1);
  });
});

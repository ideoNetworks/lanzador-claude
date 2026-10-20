import { describe, it, expect } from "vitest";
import { defaultValue, filterOptions, groupItems, itemText, sameSelection } from "../logic/options";
import type { CatalogItem, ValueSpec } from "../api";

const spec = (over: Partial<ValueSpec> = {}): ValueSpec => ({ kind: "none", options: [], fixed: null, placeholder: null, optional: false, ...over });
const item = (id: string, group: string, over: Partial<CatalogItem> = {}): CatalogItem => ({
  id, kind: id.startsWith("env.") ? "env" : "flag", key: id.split(".")[1], group, dangerous: false, fromHelp: false,
  value: spec(), i18n: { es: { d: `desc ${id} acción`, t: "tip" }, en: { d: `en ${id}`, t: "en tip" } }, ...over,
});

describe("option helpers", () => {
  it("defaultValue per value kind", () => {
    expect(defaultValue(item("flag.a", "model"))).toBeNull();
    expect(defaultValue(item("flag.m", "model", { value: spec({ kind: "select", options: ["opus", "sonnet"] }) }))).toBe("opus");
    expect(defaultValue(item("flag.m", "model", { value: spec({ kind: "select", options: ["x"], optional: true }) }))).toBeNull();
    expect(defaultValue(item("flag.t", "ctx", { value: spec({ kind: "text" }) }))).toBeNull();
    expect(defaultValue(item("env.K", "ctx", { value: spec({ kind: "fixed", fixed: "1" }) }))).toBe("1");
    expect(defaultValue(item("env.ANTHROPIC_API_KEY", "other", { value: spec({ kind: "secret" }) }))).toBe("@secret");
  });

  it("itemText uses the language, falls back to English", () => {
    const i = item("flag.a", "model");
    expect(itemText(i, "es").d).toContain("acción");
    expect(itemText(i, "zh").d).toBe("en flag.a");
    expect(itemText({ ...i, i18n: {} }, "es")).toEqual({ d: "", t: "" });
  });

  it("groupItems keeps the canonical group order and drops empty groups", () => {
    const g = groupItems([item("flag.o", "other"), item("flag.d", "dbg"), item("flag.m", "model"), item("flag.x", "weird")]);
    expect(g.map(([k]) => k)).toEqual(["model", "dbg", "other"]);
    expect(g[2][1].map((i) => i.id)).toEqual(["flag.o", "flag.x"]);
  });

  it("filterOptions matches key and localized description, accent-insensitive", () => {
    const items = [item("flag.model", "model"), item("flag.verbose", "dbg")];
    expect(filterOptions(items, "", "es")).toHaveLength(2);
    expect(filterOptions(items, "VERB", "es").map((i) => i.id)).toEqual(["flag.verbose"]);
    expect(filterOptions(items, "accion model", "es").map((i) => i.id)).toEqual(["flag.model"]);
  });

  it("sameSelection compares keys and values", () => {
    expect(sameSelection({ a: null, b: "1" }, { b: "1", a: null })).toBe(true);
    expect(sameSelection({ a: null }, { a: "x" })).toBe(false);
    expect(sameSelection({ a: null }, {})).toBe(false);
  });
});

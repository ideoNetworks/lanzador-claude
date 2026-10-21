import { describe, it, expect } from "vitest";
import { togglePin, toggleActive, setValue, initialActive, type OptState } from "../logic/checkboxes";

const empty: OptState = { active: {}, pinned: {} };

describe("checkbox rules (spec 4.2)", () => {
  it("checking pin pins and activates", () => {
    const s = togglePin(empty, "model", "opus");
    expect(s.pinned).toEqual({ model: "opus" });
    expect(s.active).toEqual({ model: "opus" });
  });
  it("unchecking pin clears both", () => {
    const s = togglePin({ active: { a: null }, pinned: { a: null } }, "a", null);
    expect(s.pinned).toEqual({});
    expect(s.active).toEqual({});
  });
  it("unchecking active on a pinned option turns it off just this time (stays pinned)", () => {
    const s = toggleActive({ active: { a: "x" }, pinned: { a: "x" } }, "a", null);
    expect(s.pinned).toEqual({ a: "x" });
    expect(s.active).toEqual({});
    const back = toggleActive(s, "a", "other");
    // Re-checking brings back the pinned value.
    expect(back.active).toEqual({ a: "x" });
  });
  it("unchecking active on a session-only option clears it", () => {
    const s = toggleActive({ active: { a: null }, pinned: {} }, "a", null);
    expect(s).toEqual({ active: {}, pinned: {} });
  });
  it("checking active without pin is active only", () => {
    const s = toggleActive(empty, "a", null);
    expect(s.active).toEqual({ a: null });
    expect(s.pinned).toEqual({});
  });
  it("changing a value activates it, and updates the pinned value if pinned", () => {
    const s1 = setValue(empty, "model", "sonnet");
    expect(s1.active).toEqual({ model: "sonnet" });
    expect(s1.pinned).toEqual({});
    const s2 = setValue({ active: { model: "opus" }, pinned: { model: "opus" } }, "model", "haiku");
    expect(s2.active).toEqual({ model: "haiku" });
    expect(s2.pinned).toEqual({ model: "haiku" });
  });
  it("initialActive equals pinned (copy)", () => {
    const pinned = { a: null, b: "x" };
    const a = initialActive(pinned);
    expect(a).toEqual(pinned);
    expect(a).not.toBe(pinned);
  });
  it("does not mutate input", () => {
    const s: OptState = { active: {}, pinned: {} };
    togglePin(s, "a", null);
    expect(s).toEqual({ active: {}, pinned: {} });
  });
});

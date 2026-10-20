import { describe, it, expect } from "vitest";
import { currentRequest, requestKey, truncate } from "../logic/request";

describe("launch request helpers", () => {
  it("currentRequest builds from path/target/active plus extras; null without a path", () => {
    const s = { selectedPath: "C:\\x", target: "wt" as const, opt: { active: { a: "1" }, pinned: {} } };
    expect(currentRequest(s)).toEqual({ path: "C:\\x", target: "wt", selection: { a: "1" }, resumeId: null });
    expect(currentRequest(s, { extra: { "flag.continue": null } })?.selection).toEqual({ a: "1", "flag.continue": null });
    expect(currentRequest(s, { resumeId: "abc" })?.resumeId).toBe("abc");
    expect(currentRequest({ ...s, selectedPath: null })).toBeNull();
  });

  it("requestKey is stable regardless of selection key order and changes with any field", () => {
    const a = { path: "C:\\x", target: "wt" as const, selection: { b: null, a: "1" }, resumeId: null };
    const b = { path: "C:\\x", target: "wt" as const, selection: { a: "1", b: null }, resumeId: null };
    expect(requestKey(a)).toBe(requestKey(b));
    expect(requestKey({ ...a, selection: { a: "2", b: null } })).not.toBe(requestKey(a));
    expect(requestKey({ ...a, target: "powershell" })).not.toBe(requestKey(a));
    expect(requestKey({ ...a, resumeId: "r" })).not.toBe(requestKey(a));
    expect(requestKey(null)).toBe("");
  });

  it("truncate shortens long text with an ellipsis", () => {
    expect(truncate("abc", 5)).toBe("abc");
    expect(truncate("abcdefgh", 5)).toBe("abcd…");
  });
});

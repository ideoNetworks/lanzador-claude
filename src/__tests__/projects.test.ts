import { describe, it, expect } from "vitest";
import type { AppConfig, ProjectSettings } from "../api";
import {
  buildLayers, findKey, fromFileCount, launchSelection, parentOf, planPins, projectKind, rebase, resolvePrefs, withProjectPins,
} from "../logic/projects";

const config = (pinned = {}, projects = {}) => ({ pinned, projects }) as Pick<AppConfig, "pinned" | "projects">;
const file = (entries: ProjectSettings["entries"]): ProjectSettings => ({ entries, mappable: ["flag.model", "flag.permission-mode"], broken: [] });

describe("paths", () => {
  it("parentOf walks up to the drive root", () => {
    expect(parentOf("C:\\a\\b\\")).toBe("C:\\a");
    expect(parentOf("C:\\a")).toBe("C:\\");
    expect(parentOf("C:\\")).toBeNull();
    expect(parentOf("\\\\srv\\share")).toBeNull();
    expect(parentOf("\\\\srv\\share\\x")).toBe("\\\\srv\\share");
  });
  it("findKey ignores case and trailing separators", () => {
    expect(findKey({ "C:\\Web\\": 1 }, "c:\\web")).toBe("C:\\Web\\");
  });
  it("resolvePrefs finds the folder itself or its nearest ancestor", () => {
    const projects = { "C:\\w": { pinned: { a: null }, target: null }, "C:\\w\\api": { pinned: { b: null }, target: null } };
    expect(resolvePrefs(projects, "C:\\W\\API")).toMatchObject({ key: "C:\\w\\api", own: true });
    expect(resolvePrefs(projects, "C:\\w\\front\\src")).toMatchObject({ key: "C:\\w", own: false });
    expect(resolvePrefs(projects, "D:\\x")).toBeNull();
  });
});

describe("layers", () => {
  it("project files win over launcher defaults; a launcher pin wins over a user setting", () => {
    const l = buildLayers(config({ "flag.model": "haiku", "env.X": "1", "flag.verbose": null }), "C:\\p", "project", file([
      { id: "flag.model", value: "sonnet", sources: ["local", "shared"] },
      { id: "env.X", value: "2", sources: ["user"] },
      { id: "flag.permission-mode", value: "plan", sources: ["shared"] },
    ]));
    expect(l.opt.pinned).toEqual({ "flag.model": "sonnet", "env.X": "1", "flag.verbose": null, "flag.permission-mode": "plan" });
    expect(l.origin).toEqual({ "flag.model": "local", "env.X": "defaults", "flag.verbose": "defaults", "flag.permission-mode": "shared" });
    expect(l.opt.active).toEqual(l.opt.pinned);
  });
  it("the defaults scope ignores project options and files", () => {
    const l = buildLayers(config({ a: null }, { "C:\\p": { pinned: { b: null }, target: null } }), "C:\\p", "defaults", file([{ id: "flag.model", value: "x", sources: ["local"] }]));
    expect(l.opt.pinned).toEqual({ a: null });
  });
  it("rebase keeps this launch's choices", () => {
    const cur = { active: { b: null, s: "1" }, pinned: { a: null, b: null } };
    const next = { active: { a: null, b: null, c: null }, pinned: { a: null, b: null, c: null } };
    expect(rebase(cur, next).active).toEqual({ b: null, c: null, s: "1" });
  });
});

describe("launch selection", () => {
  const origin = { "flag.model": "local", "flag.permission-mode": "shared", "flag.verbose": "project" } as const;
  it("leaves settings-file options to Claude", () => {
    const opt = { active: { "flag.model": "opus", "flag.permission-mode": "plan", "flag.verbose": null }, pinned: { "flag.model": "opus", "flag.permission-mode": "plan", "flag.verbose": null } };
    expect(launchSelection(opt, origin)).toEqual({ "flag.verbose": null });
    expect(fromFileCount(opt, origin)).toBe(2);
  });
  it("passes a value changed for this launch, and overrides a switched-off one", () => {
    const opt = { active: { "flag.model": "haiku" }, pinned: { "flag.model": "opus", "flag.permission-mode": "plan", "flag.verbose": null } };
    expect(launchSelection(opt, origin)).toEqual({ "flag.model": "haiku", "flag.permission-mode": "manual" });
  });
});

describe("planPins", () => {
  const mappable = new Set(["flag.model"]);
  it("a new mappable pin in a project goes to settings.local.json; others to the project", () => {
    const p = planPins({}, { "flag.model": "opus", "flag.verbose": null }, {}, "project", mappable);
    expect(p.fileSet).toEqual({ "flag.model": "opus" });
    expect(p.launcher).toEqual({ "flag.verbose": null });
    expect(p.origin).toEqual({ "flag.model": "local", "flag.verbose": "project" });
  });
  it("in the defaults scope everything goes to config.pinned", () => {
    const p = planPins({}, { "flag.model": "opus" }, {}, "defaults", mappable);
    expect(p.fileSet).toEqual({});
    expect(p.launcher).toEqual({ "flag.model": "opus" });
  });
  it("the first change copies inherited options into the project", () => {
    const origin = { a: "inherited", b: "inherited" } as const;
    const p = planPins({ a: null, b: null }, { a: null }, origin, "project", mappable);
    expect(p.launcher).toEqual({ a: null });
    expect(p.origin).toEqual({ a: "project" });
  });
  it("unpinning a shared option removes it from settings.json too; user ones are never touched", () => {
    const origin = { "flag.model": "shared", "env.X": "user", "flag.debug": "local" } as const;
    const p = planPins({ "flag.model": "opus", "env.X": "1", "flag.debug": null }, {}, origin, "project", mappable);
    expect(p.fileRemove.sort()).toEqual(["flag.debug", "flag.model"]);
    expect(p.removeShared).toBe(true);
    expect(p.launcher).toBeNull();
  });
  it("changing the value of a file option rewrites it in settings.local.json", () => {
    const p = planPins({ "flag.model": "opus" }, { "flag.model": "haiku" }, { "flag.model": "shared" }, "project", mappable);
    expect(p.fileSet).toEqual({ "flag.model": "haiku" });
    expect(p.fileRemove).toEqual([]);
  });
  it("withProjectPins keeps the stored spelling of the path", () => {
    const next = withProjectPins({ "C:\\Web": { pinned: {}, target: "wsl" } }, "c:\\web", { pinned: { a: null } });
    expect(next).toEqual({ "C:\\Web": { pinned: { a: null }, target: "wsl" } });
  });
});

describe("projectKind", () => {
  it("manual marks win over detection", () => {
    expect(projectKind("claude", {}, "C:\\a")).toBe("claude");
    expect(projectKind("code", { "c:\\A": false }, "C:\\a")).toBeNull();
    expect(projectKind(null, { "C:\\a": true }, "c:\\a")).toBe("code");
    expect(projectKind(null, {}, "C:\\a")).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../api", () => ({
  saveConfig: vi.fn().mockResolvedValue(undefined),
  buildCommand: vi.fn(),
  launch: vi.fn(),
  getConfig: vi.fn(),
  getCatalog: vi.fn(),
  systemLocale: vi.fn().mockResolvedValue("es"),
  refreshTray: vi.fn(),
}));

import * as api from "../api";
import { useStore, PINNED_SAVE_MS } from "../store";
import type { AppConfig } from "../api";
import { currentRequest, previewKey } from "../logic/request";
import { setLanguage } from "../i18n";

const mocked = vi.mocked(api);
const cfg = { pinned: {}, favorites: [], recents: [] } as unknown as AppConfig;
const entry = { at: "", path: "", profile: null, target: "wt" as const, selection: {}, preview: "" };

describe("store option persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useStore.setState({ config: { ...cfg }, opt: { active: {}, pinned: {} } });
  });
  afterEach(() => vi.useRealTimers());

  it("pin changes are saved once after the debounce, with the latest value", () => {
    const s = useStore.getState();
    s.updateOpt({ active: { "flag.name": "a" }, pinned: { "flag.name": "a" } });
    s.updateOpt({ active: { "flag.name": "ab" }, pinned: { "flag.name": "ab" } });
    s.updateOpt({ active: { "flag.name": "abc" }, pinned: { "flag.name": "abc" } });
    expect(mocked.saveConfig).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PINNED_SAVE_MS);
    expect(mocked.saveConfig).toHaveBeenCalledTimes(1);
    expect(mocked.saveConfig.mock.calls[0][0].pinned).toEqual({ "flag.name": "abc" });
  });

  it("flushPinned saves a pending change immediately and only once", () => {
    useStore.getState().updateOpt({ active: { "flag.model": "opus" }, pinned: { "flag.model": "opus" } });
    useStore.getState().flushPinned();
    expect(mocked.saveConfig).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(PINNED_SAVE_MS * 2);
    expect(mocked.saveConfig).toHaveBeenCalledTimes(1);
    useStore.getState().flushPinned();
    expect(mocked.saveConfig).toHaveBeenCalledTimes(1);
  });

  it("session-only (active) changes are not saved", () => {
    useStore.getState().updateOpt({ active: { "flag.verbose": null }, pinned: {} });
    vi.advanceTimersByTime(PINNED_SAVE_MS * 2);
    expect(mocked.saveConfig).not.toHaveBeenCalled();
  });

  it("toggleFavorite adds and removes case-insensitively", () => {
    useStore.getState().toggleFavorite("C:\\A");
    expect(useStore.getState().config?.favorites).toEqual(["C:\\A"]);
    useStore.getState().toggleFavorite("c:\\a");
    expect(useStore.getState().config?.favorites).toEqual([]);
  });
});

describe("store launching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.launch.mockResolvedValue(entry);
    mocked.getConfig.mockRejectedValue(new Error("x"));
    mocked.refreshTray.mockResolvedValue(undefined);
    useStore.setState({ config: null, launching: false, preview: null, selectedPath: "C:\\p", target: "wt", opt: { active: { "flag.model": "opus" }, pinned: {} } });
  });

  it("launchWithPreview builds the exact request, then launches that same object", async () => {
    mocked.buildCommand.mockResolvedValue("claude --model opus --continue");
    await useStore.getState().launchWithPreview({ extra: { "flag.continue": null } });
    const built = mocked.buildCommand.mock.calls[0][0];
    expect(built.selection).toEqual({ "flag.model": "opus", "flag.continue": null });
    // the preview shown is sent along: the engine refuses if a fresh plan differs
    expect(mocked.launch).toHaveBeenCalledWith(built, "claude --model opus --continue");
    expect(mocked.launch.mock.calls[0][0]).toBe(built);
    expect(useStore.getState().toastCode).toBe("claude --model opus --continue");
  });

  it("launchWithPreview with a resume id, and no launch when the build fails", async () => {
    mocked.buildCommand.mockResolvedValue("claude --resume abc");
    await useStore.getState().launchWithPreview({ resumeId: "abc" });
    expect(mocked.launch.mock.calls[0][0].resumeId).toBe("abc");
    mocked.buildCommand.mockRejectedValue({ code: "path_not_found", message: "" });
    await useStore.getState().launchWithPreview({ resumeId: "abc" });
    expect(mocked.launch).toHaveBeenCalledTimes(1);
  });

  it("launchPreviewed (Ctrl+Enter) only launches the stored request while it matches the live state", async () => {
    const req = currentRequest(useStore.getState())!;
    const rev = useStore.getState().previewRev;
    useStore.setState({ preview: { key: previewKey(req, rev), request: req, text: "claude --model opus", error: false } });
    useStore.setState({ opt: { active: { "flag.model": "sonnet" }, pinned: {} } });
    await useStore.getState().launchPreviewed();
    expect(mocked.launch).not.toHaveBeenCalled();
    useStore.setState({ opt: { active: { "flag.model": "opus" }, pinned: {} } });
    await useStore.getState().launchPreviewed();
    expect(mocked.launch).toHaveBeenCalledWith(req, "claude --model opus");
  });

  it("launchPreviewed refuses an error preview", async () => {
    const req = currentRequest(useStore.getState())!;
    useStore.setState({ preview: { key: previewKey(req, useStore.getState().previewRev), request: req, text: "boom", error: true } });
    await useStore.getState().launchPreviewed();
    expect(mocked.launch).not.toHaveBeenCalled();
  });

  it("a secret change (previewRev bump) makes the on-screen preview unlaunchable", async () => {
    const req = currentRequest(useStore.getState())!;
    useStore.setState({ preview: { key: previewKey(req, useStore.getState().previewRev), request: req, text: "x", error: false } });
    useStore.getState().invalidatePreview();
    await useStore.getState().launchPreviewed();
    expect(mocked.launch).not.toHaveBeenCalled();
  });

  it("preview_stale from the engine re-previews and explains it", async () => {
    setLanguage("es");
    mocked.launch.mockRejectedValue({ code: "preview_stale", message: "" });
    const before = useStore.getState().previewRev;
    await useStore.getState().launchRequest(currentRequest(useStore.getState())!, "old");
    expect(useStore.getState().previewRev).toBe(before + 1);
    expect(useStore.getState().toast).toBe("La vista previa ha cambiado; revísala y vuelve a pulsar Iniciar");
  });

  it("waits for the pinned save before launching", async () => {
    const order: string[] = [];
    let release!: () => void;
    mocked.saveConfig.mockImplementationOnce(() => new Promise<void>((r) => { release = () => { order.push("saved"); r(); }; }));
    mocked.launch.mockImplementation(async () => { order.push("launch"); return entry; });
    useStore.setState({ config: { ...cfg } });
    useStore.getState().updateOpt({ active: { "flag.model": "opus" }, pinned: { "flag.model": "opus" } });
    const p = useStore.getState().launchRequest(currentRequest(useStore.getState())!, "x");
    await Promise.resolve();
    expect(order).toEqual([]);
    release();
    await p;
    expect(order).toEqual(["saved", "launch"]);
  });
});

describe("store config safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useStore.setState({ config: { ...cfg, profiles: [], folderProfiles: {} }, configError: false, toast: null, selectedPath: null, opt: { active: {}, pinned: {} } });
  });
  afterEach(() => vi.useRealTimers());

  it("replaceConfig cancels a pending pinned save", () => {
    useStore.getState().updateOpt({ active: { "flag.model": "opus" }, pinned: { "flag.model": "opus" } });
    useStore.getState().replaceConfig({ ...cfg, pinned: { "flag.debug": null }, defaultTarget: "wt", language: null } as AppConfig);
    vi.advanceTimersByTime(PINNED_SAVE_MS * 2);
    void useStore.getState().flushPinned();
    expect(mocked.saveConfig).not.toHaveBeenCalled();
    expect(useStore.getState().opt.pinned).toEqual({ "flag.debug": null });
  });

  it("a project shows its own options; re-selecting it keeps the changes made since", () => {
    const projects = { "C:\\x": { pinned: { "flag.model": "opus" }, target: "powershell" as const } };
    useStore.setState({ config: { ...cfg, projects, defaultTarget: "wt" } as unknown as AppConfig });
    useStore.getState().selectPath("c:\\X");
    expect(useStore.getState().opt.active).toEqual({ "flag.model": "opus" });
    expect(useStore.getState().target).toBe("powershell");
    expect(useStore.getState().scope).toBe("project");
    useStore.setState({ opt: { active: { "flag.model": "sonnet", "flag.debug": null }, pinned: {} } });
    useStore.getState().selectPath("c:\\X");
    expect(useStore.getState().opt.active).toEqual({ "flag.model": "sonnet", "flag.debug": null });
  });

  it("a subfolder inherits; pinning there creates its own copy and leaves the parent alone", () => {
    const projects = { "C:\\x": { pinned: { "flag.model": "opus" }, target: null } };
    useStore.setState({ config: { ...cfg, pinned: { "flag.verbose": null }, projects, defaultTarget: "wt" } as unknown as AppConfig });
    useStore.getState().selectPath("C:\\x\\web");
    expect(useStore.getState().opt.pinned).toEqual({ "flag.model": "opus" });
    expect(useStore.getState().origin["flag.model"]).toBe("inherited");
    const o = useStore.getState().opt;
    useStore.getState().updateOpt({ active: { ...o.active, "flag.debug": null }, pinned: { ...o.pinned, "flag.debug": null } });
    void useStore.getState().flushPinned();
    const saved = useStore.getState().config!.projects;
    expect(saved["C:\\x\\web"].pinned).toEqual({ "flag.model": "opus", "flag.debug": null });
    expect(saved["C:\\x"].pinned).toEqual({ "flag.model": "opus" });
    expect(useStore.getState().config!.pinned).toEqual({ "flag.verbose": null });
  });

  it("the defaults scope edits config.pinned, and a folder without options uses them", () => {
    useStore.setState({ config: { ...cfg, pinned: { "flag.verbose": null }, projects: {}, defaultTarget: "wt" } as unknown as AppConfig });
    useStore.getState().selectPath("C:\\nuevo");
    expect(useStore.getState().opt.pinned).toEqual({ "flag.verbose": null });
    expect(useStore.getState().origin["flag.verbose"]).toBe("defaults");
    useStore.getState().setScope("defaults");
    const o = useStore.getState().opt;
    useStore.getState().updateOpt({ active: { ...o.active, "flag.ide": null }, pinned: { ...o.pinned, "flag.ide": null } });
    void useStore.getState().flushPinned();
    expect(useStore.getState().config!.pinned).toEqual({ "flag.verbose": null, "flag.ide": null });
    expect(useStore.getState().config!.projects).toEqual({});
  });

  it("resetProjectOptions drops the project's own options", async () => {
    const projects = { "C:\\x": { pinned: { "flag.model": "opus" }, target: null } };
    useStore.setState({ config: { ...cfg, pinned: {}, projects, defaultTarget: "wt" } as unknown as AppConfig });
    useStore.getState().selectPath("C:\\x");
    await useStore.getState().resetProjectOptions();
    expect(useStore.getState().config!.projects).toEqual({});
    expect(useStore.getState().opt.pinned).toEqual({});
  });

  it("an unreadable config blocks the UI instead of toasting, and a good retry clears it", async () => {
    mocked.getConfig.mockRejectedValueOnce({ code: "config_unreadable", message: "" });
    await useStore.getState().load();
    expect(useStore.getState().configError).toBe(true);
    expect(useStore.getState().toast).toBeNull();
    mocked.getConfig.mockResolvedValueOnce({ ...cfg, language: "es", defaultTarget: "wt" } as AppConfig);
    mocked.getCatalog.mockResolvedValue([]);
    await useStore.getState().load();
    expect(useStore.getState().configError).toBe(false);
  });

  it("a refused save (config_unreadable) raises the blocking error", async () => {
    mocked.saveConfig.mockRejectedValueOnce({ code: "config_unreadable", message: "" });
    expect(await useStore.getState().saveConfig({ showHidden: true })).toBe(false);
    expect(useStore.getState().configError).toBe(true);
  });
});

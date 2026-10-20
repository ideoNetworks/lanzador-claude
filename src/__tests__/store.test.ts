import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../api", () => ({
  saveConfig: vi.fn().mockResolvedValue(undefined),
  buildCommand: vi.fn(),
  launch: vi.fn(),
  getConfig: vi.fn(),
  refreshTray: vi.fn(),
}));

import * as api from "../api";
import { useStore, PINNED_SAVE_MS } from "../store";
import type { AppConfig } from "../api";
import { currentRequest, requestKey } from "../logic/request";

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
    expect(mocked.launch).toHaveBeenCalledWith(built);
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
    useStore.setState({ preview: { key: requestKey(req), request: req, text: "claude --model opus", error: false } });
    useStore.setState({ opt: { active: { "flag.model": "sonnet" }, pinned: {} } });
    await useStore.getState().launchPreviewed();
    expect(mocked.launch).not.toHaveBeenCalled();
    useStore.setState({ opt: { active: { "flag.model": "opus" }, pinned: {} } });
    await useStore.getState().launchPreviewed();
    expect(mocked.launch).toHaveBeenCalledWith(req);
  });

  it("launchPreviewed refuses an error preview", async () => {
    const req = currentRequest(useStore.getState())!;
    useStore.setState({ preview: { key: requestKey(req), request: req, text: "boom", error: true } });
    await useStore.getState().launchPreviewed();
    expect(mocked.launch).not.toHaveBeenCalled();
  });
});

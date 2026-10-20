import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api", () => ({ saveConfig: vi.fn().mockResolvedValue(undefined) }));

import * as api from "../api";
import { useStore } from "../store";
import type { AppConfig } from "../api";

const cfg = { pinned: {}, favorites: [], recents: [] } as unknown as AppConfig;

describe("store option persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ config: { ...cfg }, opt: { active: {}, pinned: {} } });
  });

  it("pin changes are saved to config.pinned immediately", () => {
    useStore.getState().updateOpt({ active: { "flag.model": "opus" }, pinned: { "flag.model": "opus" } });
    expect(vi.mocked(api.saveConfig)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.saveConfig).mock.calls[0][0].pinned).toEqual({ "flag.model": "opus" });
  });

  it("session-only (active) changes are not saved", () => {
    useStore.getState().updateOpt({ active: { "flag.verbose": null }, pinned: {} });
    expect(vi.mocked(api.saveConfig)).not.toHaveBeenCalled();
    expect(useStore.getState().opt.active).toEqual({ "flag.verbose": null });
  });

  it("toggleFavorite adds and removes case-insensitively", () => {
    useStore.getState().toggleFavorite("C:\\A");
    expect(useStore.getState().config?.favorites).toEqual(["C:\\A"]);
    useStore.getState().toggleFavorite("c:\\a");
    expect(useStore.getState().config?.favorites).toEqual([]);
  });
});

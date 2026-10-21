import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

vi.mock("../api", () => ({
  saveConfig: vi.fn().mockResolvedValue(undefined),
  getConfig: vi.fn(),
  refreshTray: vi.fn(),
  buildCommand: vi.fn(),
  launch: vi.fn(),
  secretHas: vi.fn().mockResolvedValue(false),
  listDir: vi.fn(),
  listRoots: vi.fn().mockResolvedValue([]),
  openExplorer: vi.fn(),
  projectSettings: vi.fn().mockResolvedValue({ entries: [], mappable: [], broken: [] }),
  projectSettingsApply: vi.fn().mockResolvedValue({ entries: [], mappable: [], broken: [] }),
}));

import * as api from "../api";
import type { AppConfig, CatalogItem, DirEntry } from "../api";
import { useStore } from "../store";
import { setLanguage } from "../i18n";
import OptionRow from "../components/OptionRow";
import FolderTree from "../components/FolderTree";
import { TOOLTIP_DELAY_MS } from "../components/Tooltip";

const mocked = vi.mocked(api);
const item = (id: string, key: string, kind = "select", extra: Partial<CatalogItem> = {}): CatalogItem => ({
  id, kind: "flag", key, group: "perm", dangerous: false, fromHelp: false,
  value: { kind, options: kind === "select" ? ["manual", "plan"] : [], fixed: null, placeholder: null, optional: false },
  i18n: { es: { d: "Descripción", t: "Ayuda en español" }, en: { d: "Description", t: "English help" }, zh: { d: "描述", t: "中文帮助" } },
  ...extra,
});
const MODE = item("flag.permission-mode", "--permission-mode");
const MODEL = item("flag.model", "--model");
const pinBox = (key: string) => screen.getByRole("checkbox", { name: `Fijar: se recuerda al volver a abrir · ${key}` });
const actBox = (key: string) => screen.getByRole("checkbox", { name: `Activar en esta sesión · ${key}` });

describe("OptionRow with project settings", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    setLanguage("es");
    useStore.setState({
      config: { pinned: {}, projects: {} } as unknown as AppConfig,
      selectedPath: "C:\\p", scope: "project", projectFile: null, drafts: {},
      opt: { active: { "flag.permission-mode": "plan", "flag.model": "opus" }, pinned: { "flag.permission-mode": "plan", "flag.model": "opus" } },
      origin: { "flag.permission-mode": "shared", "flag.model": "local" },
    });
  });

  it("unchecking blue keeps the pin: 'just this time'", () => {
    render(<OptionRow item={MODE} lang="es" />);
    fireEvent.click(actBox("--permission-mode"));
    expect(useStore.getState().opt.pinned["flag.permission-mode"]).toBe("plan");
    expect(useStore.getState().opt.active).not.toHaveProperty("flag.permission-mode");
    expect(screen.getByText("solo esta vez")).toBeTruthy();
  });

  it("a file option without a neutral value is locked on", () => {
    render(<OptionRow item={MODEL} lang="es" />);
    expect(actBox("--model").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(actBox("--model"));
    expect(useStore.getState().opt.active["flag.model"]).toBe("opus");
    expect(screen.getByText("local")).toBeTruthy();
  });

  it("unpinning a shared option asks first", () => {
    render(<OptionRow item={MODE} lang="es" />);
    fireEvent.click(pinBox("--permission-mode"));
    expect(useStore.getState().opt.pinned).toHaveProperty("flag.permission-mode");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(useStore.getState().opt.pinned).toHaveProperty("flag.permission-mode");
    fireEvent.click(pinBox("--permission-mode"));
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(useStore.getState().opt.pinned).not.toHaveProperty("flag.permission-mode");
  });

  it("a user-level setting cannot be unpinned", () => {
    useStore.setState({ origin: { "flag.permission-mode": "user", "flag.model": "local" } });
    render(<OptionRow item={MODE} lang="es" />);
    fireEvent.click(pinBox("--permission-mode"));
    expect(useStore.getState().opt.pinned).toHaveProperty("flag.permission-mode");
  });

  it("the tooltip is in the UI language and flags untranslated help text", () => {
    vi.useFakeTimers();
    try {
      setLanguage("zh");
      render(<OptionRow item={item("flag.new", "--new", "none", { fromHelp: true })} lang="zh" />);
      fireEvent.mouseEnter(screen.getByText("--new"));
      act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
      expect(screen.getByRole("tooltip").textContent).toContain("中文帮助");
      expect(screen.getByRole("tooltip").textContent).toContain("claude --help");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("FolderTree projects", () => {
  afterEach(cleanup);
  const entries: DirEntry[] = [
    { name: "plain", path: "C:\\D\\plain", hasChildren: true, hidden: false, project: null },
    { name: "web", path: "C:\\D\\web", hasChildren: true, hidden: false, project: "claude" },
  ];
  beforeEach(() => {
    vi.clearAllMocks();
    setLanguage("es");
    mocked.listDir.mockImplementation(async (p) => (p === "C:\\D" ? entries : []));
    useStore.setState({
      config: { rootFolder: "C:\\D", showHidden: false, favorites: [], recents: [], pinned: {}, projectMarks: {}, projects: { "C:\\D\\web": { pinned: {}, target: null } }, expandProjectsOnClick: false } as unknown as AppConfig,
      selectedPath: null, scope: "defaults", origin: {}, projectFile: null, opt: { active: {}, pinned: {} },
    });
  });

  it("a project is selected without expanding; its + button expands it", async () => {
    render(<FolderTree />);
    const web = await screen.findByText("web");
    fireEvent.click(web);
    expect(useStore.getState().selectedPath).toBe("C:\\D\\web");
    expect(mocked.listDir).not.toHaveBeenCalledWith("C:\\D\\web", false);
    expect(screen.getByLabelText("Tiene opciones propias")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar subcarpetas" }));
    expect(mocked.listDir).toHaveBeenCalledWith("C:\\D\\web", false);
  });

  it("a plain folder still expands on click", async () => {
    render(<FolderTree />);
    fireEvent.click(await screen.findByText("plain"));
    expect(mocked.listDir).toHaveBeenCalledWith("C:\\D\\plain", false);
  });
});

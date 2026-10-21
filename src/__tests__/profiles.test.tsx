import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

vi.mock("../api", () => ({
  saveConfig: vi.fn().mockResolvedValue(undefined),
  getConfig: vi.fn(),
  refreshTray: vi.fn(),
  buildCommand: vi.fn(),
  launch: vi.fn(),
  projectSettings: vi.fn().mockResolvedValue({ entries: [], mappable: ["flag.model"], broken: [] }),
  projectSettingsApply: vi.fn().mockResolvedValue({ entries: [], mappable: ["flag.model"], broken: [] }),
}));

import * as api from "../api";
import type { AppConfig, Profile } from "../api";
import { useStore } from "../store";
import { setLanguage } from "../i18n";
import ProfilesView from "../views/ProfilesView";
import { removeProfile } from "../logic/profiles";

const mocked = vi.mocked(api);
const builtin = (id: string, selection: Profile["selection"]): Profile => ({ id, name: id, builtin: true, selection, target: "wt" });
const user: Profile = { id: "user-1", name: "Mío", builtin: false, selection: { "flag.model": "opus" }, target: "powershell" };

function cfg(over: Partial<AppConfig> = {}): AppConfig {
  return {
    profiles: [builtin("safe", { "flag.permission-mode": "manual" }), builtin("auto", {}), user],
    activeProfile: null, pinned: {}, projects: {}, defaultTarget: "wt", ...over,
  } as unknown as AppConfig;
}
const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

describe("ProfilesView", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    setLanguage("es");
    useStore.setState({
      config: cfg(), view: "profiles", selectedPath: null, target: "powershell", toast: null,
      opt: { active: { "flag.model": "sonnet", "env.FOO": "1" }, pinned: {} },
    });
  });

  it("builtins cannot be renamed or deleted; user profiles can", () => {
    render(<ProfilesView />);
    const safe = row("Seguro");
    expect(within(safe).queryByRole("button", { name: "Eliminar" })).toBeNull();
    expect(within(safe).queryByRole("button", { name: "Renombrar" })).toBeNull();
    expect(within(safe).getByText("Predefinido")).toBeTruthy();
    const mine = row("Mío");
    expect(within(mine).getByRole("button", { name: "Eliminar" })).toBeTruthy();
    expect(within(mine).getByRole("button", { name: "Renombrar" })).toBeTruthy();
  });

  it("creates a profile from the current selection and target", () => {
    render(<ProfilesView />);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo perfil" }));
    fireEvent.change(screen.getByLabelText("Nombre del perfil"), { target: { value: "  Trabajo  " } });
    fireEvent.click(screen.getByRole("button", { name: "Crear perfil" }));
    const saved = mocked.saveConfig.mock.calls[0][0];
    const created = saved.profiles.find((p) => p.name === "Trabajo")!;
    expect(created.builtin).toBe(false);
    expect(created.selection).toEqual({ "flag.model": "sonnet", "env.FOO": "1" });
    expect(created.target).toBe("powershell");
    expect(saved.profiles).toHaveLength(4);
  });

  it("apply loads the profile into the launch options and switches view", () => {
    render(<ProfilesView />);
    fireEvent.click(within(row("Mío")).getByRole("button", { name: "Aplicar" }));
    const s = useStore.getState();
    expect(s.opt.active).toEqual({ "flag.model": "opus" });
    expect(s.target).toBe("powershell");
    expect(s.view).toBe("launch");
    expect(mocked.saveConfig.mock.calls[0][0].activeProfile).toBe("user-1");
  });

  it("delete asks inline before removing", () => {
    render(<ProfilesView />);
    fireEvent.click(within(row("Mío")).getByRole("button", { name: "Eliminar" }));
    expect(mocked.saveConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    expect(mocked.saveConfig.mock.calls[0][0].profiles.map((p) => p.id)).toEqual(["safe", "auto"]);
  });

  it("apply to this project pins the profile in the selected project", () => {
    useStore.setState({ selectedPath: "C:\\Proyectos\\app", scope: "project", origin: {}, projectFile: null });
    render(<ProfilesView />);
    fireEvent.click(within(row("Mío")).getByRole("button", { name: "Aplicar a este proyecto" }));
    const s = useStore.getState();
    expect(s.opt.pinned["flag.model"]).toBe("opus");
    expect(s.target).toBe("powershell");
    expect(s.config?.projects["C:\\Proyectos\\app"]?.pinned).toEqual({ "flag.model": "opus" });
    expect(s.config?.projects["C:\\Proyectos\\app"]?.target).toBe("powershell");
    expect(s.view).toBe("launch");
  });

  it("apply to this project is disabled without a folder", () => {
    render(<ProfilesView />);
    expect(within(row("Mío")).getByRole("button", { name: "Aplicar a este proyecto" })).toHaveProperty("disabled", true);
  });
});

describe("profile helpers", () => {
  it("removeProfile refuses builtins and clears the active reference", () => {
    const c = cfg({ activeProfile: "user-1" });
    expect(removeProfile(c, "safe")).toBeNull();
    const r = removeProfile(c, "user-1")!;
    expect(r.activeProfile).toBeNull();
    expect(r.profiles.map((p) => p.id)).toEqual(["safe", "auto"]);
  });
});

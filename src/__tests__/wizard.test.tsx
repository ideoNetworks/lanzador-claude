import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({
  templatesList: vi.fn(),
  skillsList: vi.fn(),
  createProject: vi.fn(),
  buildCommand: vi.fn(),
  launch: vi.fn(),
  saveConfig: vi.fn(),
  getConfig: vi.fn(),
  refreshTray: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import * as api from "../api";
import type { AppConfig } from "../api";
import { useStore } from "../store";
import { setLanguage } from "../i18n";
import NewProjectView from "../views/NewProjectView";
import { nameError, warningText } from "../logic/project";

const mocked = vi.mocked(api);
const cfg = (over: Partial<AppConfig> = {}) => ({ rootFolder: "C:\Desarrollo", skillsRepoUrl: "", ...over }) as unknown as AppConfig;
const next = () => fireEvent.click(screen.getByText("Siguiente"));

describe("NewProjectView", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    setLanguage("es");
    mocked.templatesList.mockResolvedValue([{ id: "default", name: "default" }, { id: "web", name: "Web" }]);
    mocked.skillsList.mockResolvedValue([{ name: "review", description: "Revisa", hash: "h" }]);
    useStore.setState({ config: cfg(), view: "new", selectedPath: null, toast: null });
  });

  it("cannot advance from step 1 with an empty or invalid name", () => {
    render(<NewProjectView />);
    next();
    expect(screen.getByRole("alert").textContent).toContain("no es válido");
  });

  it("submits the composed request and shows localized warnings", async () => {
    mocked.createProject.mockResolvedValue({ path: "C:\Desarrollo\mi-app", warnings: ["git_missing: git not found"] });
    useStore.setState({ config: cfg({ skillsRepoUrl: "https://x/y.git" }) });
    render(<NewProjectView />);
    fireEvent.change(screen.getByPlaceholderText("mi-proyecto"), { target: { value: " mi-app " } });
    next();
    fireEvent.change(screen.getByPlaceholderText("Qué hace el proyecto"), { target: { value: "Una app" } });
    fireEvent.change(screen.getByPlaceholderText("Ej.: React, Node, PostgreSQL"), { target: { value: "React" } });
    next();
    fireEvent.click(await screen.findByLabelText(/review/));
    next();
    fireEvent.click(screen.getByLabelText("Crear .gitignore"));
    fireEvent.click(screen.getByText("Crear proyecto"));
    await waitFor(() => expect(mocked.createProject).toHaveBeenCalled());
    expect(mocked.createProject).toHaveBeenCalledWith({
      parent: "C:\Desarrollo", name: "mi-app", template: null, description: "Una app", stack: "React",
      skills: ["review"], skillsScope: "project", gitInit: true, gitignore: false, notifyHook: true,
    });
    expect(await screen.findByText("Proyecto creado")).toBeTruthy();
    expect(screen.getByText(/Git no está instalado/)).toBeTruthy();
  });

  it("returns to step 1 when the engine rejects the name", async () => {
    mocked.createProject.mockRejectedValue({ code: "already_exists", message: "x" });
    render(<NewProjectView />);
    fireEvent.change(screen.getByPlaceholderText("mi-proyecto"), { target: { value: "dup" } });
    next(); next(); next();
    fireEvent.click(screen.getByText("Crear proyecto"));
    expect((await screen.findByRole("alert")).textContent).toContain("Ya existe");
  });

  it("step 3 links to Settings when no skills repo is set", () => {
    render(<NewProjectView />);
    fireEvent.change(screen.getByPlaceholderText("mi-proyecto"), { target: { value: "p" } });
    next(); next();
    fireEvent.click(screen.getByText("Configura un repositorio de skills en Ajustes"));
    expect(useStore.getState().view).toBe("settings");
  });
});

describe("project helpers", () => {
  beforeEach(() => setLanguage("es"));
  it("nameError mirrors the engine rules", () => {
    for (const bad of ["", "  ", "a/b", "a\\b", "a:b", "a$b", "a`b", "x.", "CON", "nul.txt", "a|b", "a?b", "..", "a<b"]) expect(nameError(bad), bad).toBe("invalid_name");
    for (const ok of ["mi-app", "José's app; v2", "a.b"]) expect(nameError(ok), ok).toBeNull();
  });
  it("warningText splits on the first colon", () => {
    expect(warningText("io: .gitignore: access denied")).toBe("Error de lectura o escritura. (.gitignore: access denied)");
    expect(warningText("git_missing")).toContain("Git");
    expect(warningText("weird_code: d")).toBe("weird_code: d");
    expect(warningText("not a code: x")).toBe("not a code: x");
  });
});

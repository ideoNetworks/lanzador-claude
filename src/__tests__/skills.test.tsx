import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({
  skillsList: vi.fn(),
  skillsInstalled: vi.fn(),
  skillsInstall: vi.fn(),
  skillsSync: vi.fn(),
}));

import * as api from "../api";
import type { AppConfig } from "../api";
import { useStore } from "../store";
import { setLanguage } from "../i18n";
import SkillsView from "../views/SkillsView";

const mocked = vi.mocked(api);

describe("SkillsView", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    setLanguage("es");
    mocked.skillsList.mockResolvedValue([{ name: "review", description: "Revisa", hash: "a" }, { name: "docs", description: "Docs", hash: "b" }]);
    mocked.skillsInstalled.mockResolvedValue([{ name: "docs", hash: "old", updateAvailable: true }]);
    mocked.skillsInstall.mockResolvedValue(undefined);
    useStore.setState({ config: { skillsRepoUrl: "https://x/y.git" } as unknown as AppConfig, selectedPath: "C:\p", toast: null, view: "skills" });
  });

  it("installs the checked skills into the selected project", async () => {
    render(<SkillsView />);
    fireEvent.click(await screen.findByLabelText(/review/));
    fireEvent.click(screen.getByText("Instalar seleccionadas"));
    await waitFor(() => expect(mocked.skillsInstall).toHaveBeenCalledWith("C:\p", ["review"]));
  });

  it("installs globally with a null path", async () => {
    render(<SkillsView />);
    fireEvent.click(await screen.findByLabelText(/review/));
    fireEvent.click(screen.getByLabelText(/Global/));
    fireEvent.click(screen.getByText("Instalar seleccionadas"));
    await waitFor(() => expect(mocked.skillsInstall).toHaveBeenCalledWith(null, ["review"]));
  });

  it("updates one installed skill", async () => {
    render(<SkillsView />);
    fireEvent.click(await screen.findByText("Actualizar"));
    await waitFor(() => expect(mocked.skillsInstall).toHaveBeenCalledWith("C:\p", ["docs"]));
  });

  it("shows the empty state without a repo", () => {
    useStore.setState({ config: { skillsRepoUrl: "" } as unknown as AppConfig });
    render(<SkillsView />);
    fireEvent.click(screen.getByText("Configura un repositorio de skills en Ajustes"));
    expect(useStore.getState().view).toBe("settings");
  });
});

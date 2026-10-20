import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("../api", () => ({
  buildCommand: vi.fn(),
  launch: vi.fn(),
  getConfig: vi.fn(),
  openVscode: vi.fn(),
  saveConfig: vi.fn(),
}));

import * as api from "../api";
import { useStore } from "../store";
import { setLanguage } from "../i18n";
import CommandFooter from "../components/CommandFooter";

const mocked = vi.mocked(api);

describe("CommandFooter", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    setLanguage("es");
    useStore.setState({
      config: null,
      selectedPath: "C:\\Proyectos\\José's app; v2",
      target: "powershell",
      opt: { active: { "flag.model": "opus", "env.CLAUDE_CODE_USE_POWERSHELL_TOOL": "1" }, pinned: {} },
    });
  });

  it("shows the preview returned by buildCommand", async () => {
    mocked.buildCommand.mockResolvedValue("pwsh -NoExit -Command claude --model opus");
    render(<CommandFooter />);
    expect(await screen.findByText("pwsh -NoExit -Command claude --model opus")).toBeTruthy();
    expect(mocked.buildCommand).toHaveBeenCalledWith({
      path: "C:\\Proyectos\\José's app; v2",
      target: "powershell",
      selection: { "flag.model": "opus", "env.CLAUDE_CODE_USE_POWERSHELL_TOOL": "1" },
      resumeId: null,
    });
  });

  it("Iniciar calls launch with the current path, target and selection", async () => {
    mocked.buildCommand.mockResolvedValue("preview");
    mocked.launch.mockResolvedValue({ at: "", path: "", profile: null, target: "powershell", selection: {}, preview: "" });
    mocked.getConfig.mockRejectedValue(new Error("offline"));
    render(<CommandFooter />);
    fireEvent.click(screen.getByRole("button", { name: /Iniciar/ }));
    await waitFor(() => expect(mocked.launch).toHaveBeenCalledTimes(1));
    expect(mocked.launch).toHaveBeenCalledWith({
      path: "C:\\Proyectos\\José's app; v2",
      target: "powershell",
      selection: { "flag.model": "opus", "env.CLAUDE_CODE_USE_POWERSHELL_TOOL": "1" },
      resumeId: null,
    });
    await waitFor(() => expect(useStore.getState().toast).toContain("José's app; v2"));
  });

  it("Iniciar is disabled without a folder", () => {
    mocked.buildCommand.mockResolvedValue("x");
    useStore.setState({ selectedPath: null });
    render(<CommandFooter />);
    expect((screen.getByRole("button", { name: /Iniciar/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

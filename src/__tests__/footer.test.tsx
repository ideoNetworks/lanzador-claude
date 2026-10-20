import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";

vi.mock("../api", () => ({
  buildCommand: vi.fn(),
  launch: vi.fn(),
  getConfig: vi.fn(),
  openVscode: vi.fn(),
  saveConfig: vi.fn(),
  refreshTray: vi.fn(),
}));

import * as api from "../api";
import type { LaunchRequest } from "../api";
import { useStore } from "../store";
import { setLanguage } from "../i18n";
import CommandFooter from "../components/CommandFooter";

const mocked = vi.mocked(api);
const PATH = "C:\\Proyectos\\José's app; v2";
const SEL = { "flag.model": "opus", "env.CLAUDE_CODE_USE_POWERSHELL_TOOL": "1" };
const startBtn = () => screen.getByRole("button", { name: /Iniciar/ }) as HTMLButtonElement;

/** buildCommand whose answers are released by the test. */
function deferredBuild() {
  const pending: { req: LaunchRequest; resolve: (s: string) => void; reject: (e: unknown) => void }[] = [];
  mocked.buildCommand.mockImplementation((req) => new Promise((resolve, reject) => pending.push({ req, resolve, reject })));
  return pending;
}

describe("CommandFooter", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    setLanguage("es");
    mocked.launch.mockResolvedValue({ at: "", path: "", profile: null, target: "powershell", selection: {}, preview: "" });
    mocked.getConfig.mockRejectedValue(new Error("offline"));
    mocked.refreshTray.mockRejectedValue(new Error("no tray"));
    useStore.setState({ config: null, preview: null, toast: null, toastCode: null, selectedPath: PATH, target: "powershell", launching: false, opt: { active: { ...SEL }, pinned: {} } });
  });

  it("shows the preview returned by buildCommand", async () => {
    mocked.buildCommand.mockResolvedValue("pwsh -NoExit -Command claude --model opus");
    render(<CommandFooter />);
    expect(await screen.findByText("pwsh -NoExit -Command claude --model opus")).toBeTruthy();
    expect(mocked.buildCommand).toHaveBeenCalledWith({ path: PATH, target: "powershell", selection: SEL, resumeId: null });
  });

  it("Iniciar is disabled until the preview resolves, then launches that request and toasts the preview", async () => {
    const pending = deferredBuild();
    render(<CommandFooter />);
    expect(startBtn().disabled).toBe(true);
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(startBtn().disabled).toBe(true);
    await act(async () => pending[0].resolve("claude --model opus"));
    await waitFor(() => expect(startBtn().disabled).toBe(false));
    fireEvent.click(startBtn());
    await waitFor(() => expect(mocked.launch).toHaveBeenCalledTimes(1));
    expect(mocked.launch).toHaveBeenCalledWith({ path: PATH, target: "powershell", selection: SEL, resumeId: null });
    await waitFor(() => expect(useStore.getState().toast).toContain("José's app; v2"));
    expect(useStore.getState().toastCode).toBe("claude --model opus");
    await waitFor(() => expect(mocked.refreshTray).toHaveBeenCalled());
  });

  it("after an option change Iniciar stays disabled until the new preview arrives, then launches the new request", async () => {
    const pending = deferredBuild();
    render(<CommandFooter />);
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0].resolve("old preview"));
    await waitFor(() => expect(startBtn().disabled).toBe(false));

    act(() => useStore.setState({ opt: { active: { ...SEL, "flag.verbose": null }, pinned: {} } }));
    expect(startBtn().disabled).toBe(true);
    fireEvent.click(startBtn());
    expect(mocked.launch).not.toHaveBeenCalled();

    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1].resolve("new preview --verbose"));
    await waitFor(() => expect(startBtn().disabled).toBe(false));
    expect(screen.getByText("new preview --verbose")).toBeTruthy();
    fireEvent.click(startBtn());
    await waitFor(() => expect(mocked.launch).toHaveBeenCalledTimes(1));
    expect(mocked.launch).toHaveBeenCalledWith(pending[1].req);
    expect(pending[1].req.selection).toEqual({ ...SEL, "flag.verbose": null });
  });

  it("an error preview keeps Iniciar disabled", async () => {
    mocked.buildCommand.mockRejectedValue({ code: "path_not_found", message: "x" });
    render(<CommandFooter />);
    expect(await screen.findByText("No se encuentra la ruta indicada.")).toBeTruthy();
    expect(startBtn().disabled).toBe(true);
  });

  it("Iniciar is disabled without a folder", () => {
    mocked.buildCommand.mockResolvedValue("x");
    useStore.setState({ selectedPath: null });
    render(<CommandFooter />);
    expect(startBtn().disabled).toBe(true);
  });
});

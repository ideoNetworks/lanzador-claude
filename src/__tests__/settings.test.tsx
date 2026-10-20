import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({
  updateCheck: vi.fn(),
  saveConfig: vi.fn(),
  setShortcut: vi.fn(),
  setAutostart: vi.fn(),
  setExplorerMenu: vi.fn(),
  languageChanged: vi.fn(),
  refreshTray: vi.fn(),
}));

import * as api from "../api";
import type { AppConfig } from "../api";
import { useStore } from "../store";
import { getLanguage, setLanguage } from "../i18n";
import UpdatesSection, { modeOf } from "../views/settings/UpdatesSection";
import WindowsSection from "../views/settings/WindowsSection";
import { applyImportedIntegration } from "../views/settings/ConfigSection";
import { applyShortcutFailed } from "../integration/useAppEvents";

const mocked = vi.mocked(api);
const cfg = (over: Partial<AppConfig> = {}) =>
  ({ updates: { mode: "manual", endpoint: null }, shortcut: "Ctrl+Alt+I", closeToTray: true, autostart: false, explorerMenu: false, language: "es", ...over }) as unknown as AppConfig;

describe("settings", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    setLanguage("es");
    mocked.saveConfig.mockResolvedValue(undefined);
    mocked.languageChanged.mockResolvedValue(undefined);
    useStore.setState({ config: cfg(), update: null, toast: null, shortcutError: null });
  });

  it("unknown update mode is shown as notify, like the engine", () => {
    expect(modeOf("bogus")).toBe("notify");
    expect(modeOf("auto")).toBe("auto");
    expect(modeOf("manual")).toBe("manual");
    useStore.setState({ config: cfg({ updates: { mode: "???", endpoint: null } }) });
    render(<UpdatesSection />);
    expect(screen.getByRole("radio", { name: "Avisar" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Automática" }).getAttribute("aria-checked")).toBe("false");
  });

  it("manual mode: 'Buscar actualizaciones' shows the banner when an update exists", async () => {
    mocked.updateCheck.mockResolvedValue({ version: "0.2.0", notes: null });
    render(<UpdatesSection />);
    fireEvent.click(screen.getByText("Buscar actualizaciones"));
    await waitFor(() => expect(useStore.getState().update).toEqual({ version: "0.2.0", notes: null }));
  });

  it("manual check without an update says you are up to date", async () => {
    mocked.updateCheck.mockResolvedValue(null);
    render(<UpdatesSection />);
    fireEvent.click(screen.getByText("Buscar actualizaciones"));
    await waitFor(() => expect(useStore.getState().toast).toBe("Estás al día"));
    expect(useStore.getState().update).toBeNull();
  });

  it("a startup shortcut failure toasts and shows inline in Windows settings", () => {
    applyShortcutFailed({ code: "shortcut_taken", message: "Ctrl+Alt+I" });
    expect(useStore.getState().toast).toBe(
      "No se pudo registrar el atajo Ctrl+Alt+I. Ese atajo ya está en uso por otra aplicación. Elige otro.",
    );
    render(<WindowsSection />);
    expect(screen.getByRole("alert").textContent).toContain("Ctrl+Alt+I");
  });

  it("re-entering the failed combo retries registration and clears the error", async () => {
    mocked.setShortcut.mockResolvedValue(undefined);
    useStore.setState({ shortcutError: { code: "shortcut_taken", message: "Ctrl+Alt+I" } });
    render(<WindowsSection />);
    const fld = screen.getByRole("button", { name: "Atajo global" });
    fireEvent.click(fld);
    fireEvent.keyDown(fld, { key: "I", code: "KeyI", ctrlKey: true, altKey: true });
    await waitFor(() => expect(mocked.setShortcut).toHaveBeenCalledWith("Ctrl+Alt+I"));
    await waitFor(() => expect(useStore.getState().shortcutError).toBeNull());
  });

  it("an imported config is applied to Explorer menu, autostart and shortcut", async () => {
    mocked.setExplorerMenu.mockRejectedValue({ code: "io", message: "" });
    mocked.setAutostart.mockResolvedValue(undefined);
    mocked.setShortcut.mockRejectedValue({ code: "shortcut_taken", message: "x" });
    const errors: unknown[] = [];
    await applyImportedIntegration(cfg({ explorerMenu: true, autostart: true, shortcut: "Ctrl+Shift+K" }), (e) => errors.push(e));
    expect(mocked.setExplorerMenu).toHaveBeenCalledWith(true);
    expect(mocked.setAutostart).toHaveBeenCalledWith(true);
    expect(mocked.setShortcut).toHaveBeenCalledWith("Ctrl+Shift+K");
    expect(errors).toHaveLength(2);
    expect(useStore.getState().shortcutError).toEqual({ code: "shortcut_taken", message: "Ctrl+Shift+K" });
  });

  it("a UI language change is saved first, then tray and Explorer text are refreshed", async () => {
    const order: string[] = [];
    mocked.saveConfig.mockImplementation(async () => { order.push("save"); });
    mocked.languageChanged.mockImplementation(async () => { order.push("engine"); });
    await useStore.getState().changeLanguage("en");
    expect(getLanguage()).toBe("en");
    expect(order).toEqual(["save", "engine"]);
    setLanguage("es");
  });
});

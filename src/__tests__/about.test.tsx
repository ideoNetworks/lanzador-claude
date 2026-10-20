import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const openUrl = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: (u: string) => openUrl(u) }));
vi.mock("../api", () => ({ ping: vi.fn() }));

import { useStore } from "../store";
import { setLanguage } from "../i18n";
import AboutDialog from "../components/AboutDialog";

const HOME = "https://ideonetworks.com";
const PRODUCT = "https://ideonetworks.com/software/lanzador-claude";
const MAPS = "https://www.google.com/maps/search/?api=1&query=Avenida%20Madrid%2C%203%2C%20Madrid%2C%20Espa%C3%B1a";

describe("AboutDialog", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    setLanguage("es");
    useStore.setState({ aboutOpen: true, engineVersion: "0.1.0", config: null });
  });

  it("renders nothing while closed", () => {
    useStore.setState({ aboutOpen: false });
    const { container } = render(<AboutDialog />);
    expect(container.firstChild).toBeNull();
  });

  it("has the exact links, phone, version and licence", () => {
    render(<AboutDialog />);
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(HOME);
    expect(hrefs).toContain(PRODUCT);
    expect(hrefs).toContain(MAPS);
    expect(screen.getByRole("link", { name: "Madrid" }).getAttribute("href")).toBe(MAPS);
    expect(screen.getByText("+34 911 29 29 39")).toBeTruthy();
    expect(screen.getByText(/0\.1\.0/)).toBeTruthy();
    expect(screen.getByText("Licencia GPLv3 · Código abierto")).toBeTruthy();
    expect(document.querySelector(".about-orig")?.textContent).toBe("Desarrollado originalmente por iDeo (https://ideonetworks.com)");
  });

  it("every iDeo word in the story links to the home page", () => {
    render(<AboutDialog />);
    const story = document.querySelector(".about-story") as HTMLElement;
    expect(story.textContent).toContain("Mantenimiento Informático");
    const ideoLinks = Array.from(story.querySelectorAll("a")).filter((a) => a.textContent === "iDeo");
    expect(ideoLinks.length).toBe(3);
    ideoLinks.forEach((a) => expect(a.getAttribute("href")).toBe(HOME));
    const clone = story.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("a").forEach((a) => a.remove());
    expect(clone.textContent).not.toMatch(/iDeo/);
  });

  it("WhatsApp shows the coming-soon text while the constant is empty", () => {
    render(<AboutDialog />);
    expect(screen.getByText("Próximamente")).toBeTruthy();
  });

  it("opens links with the opener plugin instead of navigating", () => {
    render(<AboutDialog />);
    fireEvent.click(screen.getByRole("link", { name: "Madrid" }));
    expect(openUrl).toHaveBeenCalledWith(MAPS);
  });

  it("the copy button copies the phone and Esc closes", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AboutDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar teléfono" }));
    expect(writeText).toHaveBeenCalledWith("+34 911 29 29 39");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useStore.getState().aboutOpen).toBe(false);
  });
});

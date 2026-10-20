import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../store";
import { applyNavigate, applyOpenPath, applyLanguage } from "../integration/useAppEvents";
import { getLanguage } from "../i18n";

describe("app events", () => {
  beforeEach(() => useStore.setState({ view: "settings", aboutOpen: false, selectedPath: null }));

  it("navigate switches view or opens About", () => {
    applyNavigate("new");
    expect(useStore.getState().view).toBe("new");
    applyNavigate("about");
    expect(useStore.getState().aboutOpen).toBe(true);
    applyNavigate("bogus");
    expect(useStore.getState().view).toBe("new");
  });

  it("open-path selects the folder in the launch view", () => {
    applyOpenPath("C:\Proyectos\José's app");
    expect(useStore.getState().selectedPath).toBe("C:\Proyectos\José's app");
    expect(useStore.getState().view).toBe("launch");
  });

  it("language-changed updates the UI language and ignores unknown codes", () => {
    applyLanguage("zh");
    expect(getLanguage()).toBe("zh");
    applyLanguage("fr");
    expect(getLanguage()).toBe("zh");
    applyLanguage("es");
  });
});

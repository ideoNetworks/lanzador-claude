import { create } from "zustand";
import * as api from "./api";
import type { AppConfig, CatalogItem, ViewId } from "./api";
import { initialActive, type OptState } from "./logic/checkboxes";
import { detectLanguage, setLanguage } from "./i18n";
import { errorText } from "./i18n/errors";

interface State {
  config: AppConfig | null;
  catalog: CatalogItem[];
  opt: OptState;
  selectedPath: string | null;
  view: ViewId;
  engineUp: boolean;
  engineVersion: string;
  toast: string | null;
  load: () => Promise<void>;
  saveConfig: (patch: Partial<AppConfig>) => Promise<void>;
  selectPath: (p: string | null) => void;
  setView: (v: ViewId) => void;
  setOpt: (o: OptState) => void;
  setEngine: (up: boolean, version?: string) => void;
  showToast: (msg: string) => void;
  showError: (e: unknown) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => ({
  config: null,
  catalog: [],
  opt: { active: {}, pinned: {} },
  selectedPath: null,
  view: "launch",
  engineUp: false,
  engineVersion: "",
  toast: null,

  async load() {
    try {
      const config = await api.getConfig();
      const sys = await api.systemLocale().catch(() => "en");
      setLanguage(detectLanguage(config.language, sys));
      set({ config, opt: { active: initialActive(config.pinned), pinned: { ...config.pinned } } });
    } catch (e) {
      get().showError(e);
      return;
    }
    try {
      set({ catalog: await api.getCatalog(false) });
      // Flags discovered in `claude --help` can take a few seconds: merge them in afterwards.
      void api.getCatalog(true).then((catalog) => set({ catalog })).catch(() => {});
    } catch (e) {
      get().showError(e);
    }
  },

  async saveConfig(patch) {
    const prev = get().config;
    if (!prev) return;
    const next = { ...prev, ...patch };
    set({ config: next });
    try {
      await api.saveConfig(next);
    } catch (e) {
      set({ config: prev });
      get().showError(e);
    }
  },

  selectPath: (selectedPath) => set({ selectedPath }),
  setView: (view) => set({ view }),
  setOpt: (opt) => set({ opt }),
  setEngine: (engineUp, version) =>
    set((s) => ({ engineUp, engineVersion: version ?? s.engineVersion })),

  showToast(msg) {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 3500);
  },
  showError: (e) => get().showToast(errorText(e)),
}));

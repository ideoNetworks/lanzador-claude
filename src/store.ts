import { create } from "zustand";
import * as api from "./api";
import type { AppConfig, CatalogItem, Selection, Target, ViewId } from "./api";
import { initialActive, type OptState } from "./logic/checkboxes";
import { detectLanguage, setLanguage, t } from "./i18n";
import { errorText } from "./i18n/errors";
import { sameSelection } from "./logic/options";

interface State {
  config: AppConfig | null;
  catalog: CatalogItem[];
  opt: OptState;
  selectedPath: string | null;
  view: ViewId;
  engineUp: boolean;
  engineVersion: string;
  toast: string | null;
  /** Session-only launch target (starts as config.defaultTarget). */
  target: Target;
  /** Remembered values of options that are currently off (session only). */
  drafts: Selection;
  paletteOpen: boolean;
  launching: boolean;
  load: () => Promise<void>;
  saveConfig: (patch: Partial<AppConfig>) => Promise<void>;
  selectPath: (p: string | null) => void;
  setView: (v: ViewId) => void;
  setOpt: (o: OptState) => void;
  /** Sets the option state; pinned changes are persisted to config.pinned immediately. */
  updateOpt: (o: OptState) => void;
  setDraft: (id: string, value: string | null) => void;
  setTarget: (t: Target) => void;
  setPaletteOpen: (open: boolean) => void;
  toggleFavorite: (path: string) => void;
  /** Launches the selected folder with the active options (plus extra ones / a session to resume). */
  launchNow: (opts?: { extra?: Selection; resumeId?: string | null }) => Promise<void>;
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
  target: "wt",
  drafts: {},
  paletteOpen: false,
  launching: false,

  async load() {
    try {
      const config = await api.getConfig();
      const sys = await api.systemLocale().catch(() => "en");
      setLanguage(detectLanguage(config.language, sys));
      set({ config, target: config.defaultTarget, opt: { active: initialActive(config.pinned), pinned: { ...config.pinned } } });
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
  updateOpt(opt) {
    const before = get().opt.pinned;
    set({ opt });
    if (!sameSelection(before, opt.pinned)) void get().saveConfig({ pinned: { ...opt.pinned } });
  },
  setDraft: (id, value) => set((s) => ({ drafts: { ...s.drafts, [id]: value } })),
  setTarget: (target) => set({ target }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  toggleFavorite(path) {
    const favs = get().config?.favorites ?? [];
    const has = favs.some((f) => f.toLowerCase() === path.toLowerCase());
    void get().saveConfig({ favorites: has ? favs.filter((f) => f.toLowerCase() !== path.toLowerCase()) : [...favs, path] });
  },
  async launchNow(opts) {
    const { selectedPath: path, target, opt, launching } = get();
    if (!path || launching) return;
    set({ launching: true });
    try {
      await api.launch({ path, target, selection: { ...opt.active, ...opts?.extra }, resumeId: opts?.resumeId ?? null });
      get().showToast(t("toast.launched", { path }));
      // The engine updated recents and history: reload so later saves do not overwrite them.
      try {
        const config = await api.getConfig();
        set({ config });
      } catch {
        /* keep the current config */
      }
    } catch (e) {
      get().showError(e);
    } finally {
      set({ launching: false });
    }
  },
  setEngine: (engineUp, version) =>
    set((s) => ({ engineUp, engineVersion: version ?? s.engineVersion })),

  showToast(msg) {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 3500);
  },
  showError: (e) => get().showToast(errorText(e)),
}));

import { create } from "zustand";
import * as api from "./api";
import type { AppConfig, AppError, CatalogItem, Lang, LaunchRequest, Selection, Target, ViewId } from "./api";
import { initialActive, type OptState } from "./logic/checkboxes";
import { detectLanguage, setLanguage, t } from "./i18n";
import { errorText } from "./i18n/errors";
import { sameSelection } from "./logic/options";
import { applyProfile } from "./logic/selection";
import { folderProfileKey } from "./logic/profiles";
import { currentRequest, previewKey, truncate, type LaunchExtras } from "./logic/request";

const errCode = (e: unknown) => (e && typeof e === "object" ? (e as { code?: unknown }).code : undefined);

/** Pinned option changes are persisted after this quiet period (or on flush). */
export const PINNED_SAVE_MS = 400;
const TOAST_CODE_MAX = 160;

/** The preview on screen and the exact request that produced it. */
export interface PreviewState { key: string; request: LaunchRequest; text: string; error: boolean }

interface State {
  config: AppConfig | null;
  catalog: CatalogItem[];
  opt: OptState;
  selectedPath: string | null;
  view: ViewId;
  engineUp: boolean;
  engineVersion: string;
  toast: string | null;
  /** Monospace detail under the toast message (the launched command). */
  toastCode: string | null;
  /** Footer preview; Launch / Ctrl+Enter only use it while its key matches the live request. */
  preview: PreviewState | null;
  setPreview: (p: PreviewState | null) => void;
  /** Session-only launch target (starts as config.defaultTarget). */
  target: Target;
  /** Remembered values of options that are currently off (session only). */
  drafts: Selection;
  paletteOpen: boolean;
  /** About dialog open flag (the dialog itself is rendered by Task 10). */
  aboutOpen: boolean;
  launching: boolean;
  /** Pending update announced by the engine (`update-available`). */
  update: { version: string; notes: string | null } | null;
  setUpdate: (u: { version: string; notes: string | null } | null) => void;
  /** Bumped when something the preview depends on changes outside the request (secrets saved
   * or deleted, engine refused a stale preview): the footer re-previews. */
  previewRev: number;
  invalidatePreview: () => void;
  /** config.json exists but cannot be read: the UI is blocked until a retry reads it. */
  configError: boolean;
  /** Global shortcut that could not be registered at startup (inline error in Settings). */
  shortcutError: AppError | null;
  setShortcutError: (e: AppError | null) => void;
  load: () => Promise<void>;
  /** Resolves true once saved (false: rolled back and reported). */
  saveConfig: (patch: Partial<AppConfig>) => Promise<boolean>;
  /** UI language change (TopBar / Settings): dictionary, config, then tray + Explorer menu text. */
  changeLanguage: (lang: Lang) => Promise<void>;
  /** Replaces the whole config (import): language, target and options follow it. */
  replaceConfig: (config: AppConfig) => void;
  selectPath: (p: string | null) => void;
  setView: (v: ViewId) => void;
  setOpt: (o: OptState) => void;
  /** Sets the option state; pinned changes are persisted to config.pinned (debounced, see flushPinned). */
  updateOpt: (o: OptState) => void;
  /** Saves a pending pinned change now (blur / unmount / before launching). */
  flushPinned: () => Promise<void>;
  setDraft: (id: string, value: string | null) => void;
  setTarget: (t: Target) => void;
  setPaletteOpen: (open: boolean) => void;
  setAboutOpen: (open: boolean) => void;
  toggleFavorite: (path: string) => void;
  /** Launches exactly `req` and reports `preview` (the command built for it) in the toast. */
  launchRequest: (req: LaunchRequest, preview: string) => Promise<void>;
  /** Builds the request (selection + extras), previews it, then launches that same object. */
  launchWithPreview: (x: LaunchExtras) => Promise<void>;
  /** Launch / Ctrl+Enter: launches the previewed request if it still matches the live state. */
  launchPreviewed: () => Promise<void>;
  setEngine: (up: boolean, version?: string) => void;
  showToast: (msg: string, code?: string | null) => void;
  showError: (e: unknown) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let pinnedTimer: ReturnType<typeof setTimeout> | undefined;
let pinnedDirty = false;

export const useStore = create<State>((set, get) => ({
  config: null,
  catalog: [],
  opt: { active: {}, pinned: {} },
  selectedPath: null,
  view: "launch",
  engineUp: false,
  engineVersion: "",
  toast: null,
  toastCode: null,
  preview: null,
  setPreview: (preview) => set({ preview }),
  target: "wt",
  drafts: {},
  paletteOpen: false,
  aboutOpen: false,
  launching: false,
  update: null,
  setUpdate: (update) => set({ update }),
  previewRev: 0,
  invalidatePreview: () => set((s) => ({ previewRev: s.previewRev + 1 })),
  configError: false,
  shortcutError: null,
  setShortcutError: (shortcutError) => set({ shortcutError }),

  async load() {
    try {
      const config = await api.getConfig();
      const sys = await api.systemLocale().catch(() => "en");
      setLanguage(detectLanguage(config.language, sys));
      set({ config, configError: false, target: config.defaultTarget, opt: { active: initialActive(config.pinned), pinned: { ...config.pinned } } });
    } catch (e) {
      if (errCode(e) === "config_unreadable") set({ configError: true });
      else get().showError(e);
      return;
    }
    try {
      // Each catalog arrival is a new version the engine plans against: re-preview.
      const catalog = await api.getCatalog(false);
      set((s) => ({ catalog, previewRev: s.previewRev + 1 }));
      // Flags discovered in `claude --help` can take a few seconds: merge them in afterwards.
      void api.getCatalog(true).then((catalog) => set((s) => ({ catalog, previewRev: s.previewRev + 1 }))).catch(() => {});
    } catch (e) {
      get().showError(e);
    }
  },

  async saveConfig(patch) {
    const prev = get().config;
    if (!prev) return false;
    const next = { ...prev, ...patch };
    set({ config: next });
    try {
      await api.saveConfig(next);
      return true;
    } catch (e) {
      set({ config: prev });
      if (errCode(e) === "config_unreadable") set({ configError: true });
      else get().showError(e);
      return false;
    }
  },

  async changeLanguage(lang) {
    setLanguage(lang);
    if (await get().saveConfig({ language: lang })) await api.languageChanged().catch(() => {});
  },

  replaceConfig(config) {
    // The imported pins replace the old ones: a pending pinned save must not write them back.
    clearTimeout(pinnedTimer);
    pinnedDirty = false;
    set({ config, target: config.defaultTarget, opt: { active: initialActive(config.pinned), pinned: { ...config.pinned } } });
    const code = (config.language ?? "").toLowerCase();
    if (code.startsWith("es") || code.startsWith("en") || code.startsWith("zh")) setLanguage(detectLanguage(config.language, "en"));
    void Promise.resolve().then(() => api.refreshTray()).catch(() => {});
  },

  selectPath(selectedPath) {
    const changed = selectedPath !== get().selectedPath;
    set({ selectedPath });
    // A folder with its own default profile applies it when chosen (not when re-selected,
    // which would wipe the options changed since).
    const { config, opt } = get();
    if (!changed || !selectedPath || !config) return;
    const key = folderProfileKey(config.folderProfiles ?? {}, selectedPath);
    const profile = key === undefined ? undefined : config.profiles.find((p) => p.id === config.folderProfiles[key]);
    if (!profile) return;
    get().updateOpt(applyProfile(opt, profile));
    set({ target: profile.target });
    if (config.activeProfile !== profile.id) void get().saveConfig({ activeProfile: profile.id });
  },
  setView: (view) => set({ view }),
  setOpt: (opt) => set({ opt }),
  updateOpt(opt) {
    const before = get().opt.pinned;
    set({ opt });
    if (sameSelection(before, opt.pinned)) return;
    pinnedDirty = true;
    clearTimeout(pinnedTimer);
    pinnedTimer = setTimeout(() => get().flushPinned(), PINNED_SAVE_MS);
  },
  async flushPinned() {
    clearTimeout(pinnedTimer);
    if (!pinnedDirty) return;
    pinnedDirty = false;
    await get().saveConfig({ pinned: { ...get().opt.pinned } });
  },
  setDraft: (id, value) => set((s) => ({ drafts: { ...s.drafts, [id]: value } })),
  setTarget: (target) => set({ target }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  toggleFavorite(path) {
    const favs = get().config?.favorites ?? [];
    const has = favs.some((f) => f.toLowerCase() === path.toLowerCase());
    void get().saveConfig({ favorites: has ? favs.filter((f) => f.toLowerCase() !== path.toLowerCase()) : [...favs, path] });
  },
  async launchRequest(req, preview) {
    if (get().launching) return;
    set({ launching: true });
    try {
      // The engine records the launch in config: the pinned save must land first, not race it.
      await get().flushPinned();
      await api.launch(req, preview);
      get().showToast(t("toast.launched", { path: req.path }), truncate(preview, TOAST_CODE_MAX));
      // The tray's "Recientes" menu reads config: refresh it (no tray in tests / errors ignored).
      void Promise.resolve()
        .then(() => api.refreshTray())
        .catch(() => {});
      // The engine updated recents and history: reload so later saves do not overwrite them.
      try {
        const config = await api.getConfig();
        set({ config });
      } catch {
        /* keep the current config */
      }
    } catch (e) {
      if (errCode(e) === "preview_stale") {
        get().invalidatePreview();
        get().showToast(t("toast.previewStale"));
      } else if (errCode(e) === "config_unreadable") {
        set({ configError: true });
      } else {
        get().showError(e);
      }
    } finally {
      set({ launching: false });
    }
  },
  async launchWithPreview(x) {
    const req = currentRequest(get(), x);
    if (!req || get().launching) return;
    let preview: string;
    try {
      preview = await api.buildCommand(req);
    } catch (e) {
      get().showError(e);
      return;
    }
    await get().launchRequest(req, preview);
  },
  async launchPreviewed() {
    const p = get().preview;
    const s = get();
    if (!p || p.error || p.key !== previewKey(currentRequest(s), s.previewRev)) return;
    await get().launchRequest(p.request, p.text);
  },
  setEngine: (engineUp, version) =>
    set((s) => ({ engineUp, engineVersion: version ?? s.engineVersion })),

  showToast(msg, code = null) {
    clearTimeout(toastTimer);
    set({ toast: msg, toastCode: code });
    toastTimer = setTimeout(() => set({ toast: null, toastCode: null }), code ? 5000 : 3500);
  },
  showError: (e) => get().showToast(errorText(e)),
}));

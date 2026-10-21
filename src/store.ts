import { create } from "zustand";
import * as api from "./api";
import type { AppConfig, AppError, CatalogItem, Lang, LaunchRequest, ProjectSettings, Selection, Target, ViewId } from "./api";
import type { OptState } from "./logic/checkboxes";
import { detectLanguage, setLanguage, t } from "./i18n";
import { errorText } from "./i18n/errors";
import { sameSelection } from "./logic/options";
import { buildLayers, findKey, isFileOrigin, planPins, rebase, resolvePrefs, withoutProject, withProjectPins, type Origin, type Scope } from "./logic/projects";
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
  /** Where each pinned option lives (settings file or launcher layer). */
  origin: Record<string, Origin>;
  /** Options shown and saved for the selected project, or the defaults. */
  scope: Scope;
  /** Settings files of the selected project, as last read. */
  projectFile: { path: string; settings: ProjectSettings } | null;
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
  setScope: (scope: Scope) => void;
  /** Re-reads the project's settings files (window focus), keeping this launch's choices. */
  refreshProjectFile: () => Promise<void>;
  /** Drops the selected project's own launcher options (it goes back to inherited/defaults). */
  resetProjectOptions: () => Promise<void>;
  /** Saves the pinned options on screen (except user-level ones) as the defaults. */
  useAsDefaults: () => Promise<void>;
  setView: (v: ViewId) => void;
  setOpt: (o: OptState) => void;
  /** Sets the option state; pinned changes are persisted where they belong (debounced, see flushPinned):
   * the project's settings.local.json, its launcher options, or config.pinned. */
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

type Get = () => State;
type Set = (p: Partial<State>) => void;

const fileOf = (s: State) => (s.projectFile && s.selectedPath && s.projectFile.path === s.selectedPath ? s.projectFile.settings : null);

/** Pinned options as saved (config + settings files): flushPinned routes the difference. */
const savedLayers = (s: State) => buildLayers(s.config!, s.selectedPath, s.scope, fileOf(s));

/** Shows the layers of the current folder/scope from scratch (every pinned option on). */
function relayer(get: Get, set: Set) {
  const s = get();
  if (!s.config) return;
  const l = savedLayers(s);
  clearTimeout(pinnedTimer);
  pinnedDirty = false;
  set({ opt: l.opt, origin: l.origin });
}

export const useStore = create<State>((set, get) => ({
  config: null,
  catalog: [],
  opt: { active: {}, pinned: {} },
  origin: {},
  scope: "defaults",
  projectFile: null,
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
      set({ config, configError: false, target: config.defaultTarget });
      relayer(get, set);
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
    set({ config, target: config.defaultTarget });
    relayer(get, set);
    const code = (config.language ?? "").toLowerCase();
    if (code.startsWith("es") || code.startsWith("en") || code.startsWith("zh")) setLanguage(detectLanguage(config.language, "en"));
    void Promise.resolve().then(() => api.refreshTray()).catch(() => {});
  },

  selectPath(selectedPath) {
    // Re-selecting keeps the options changed since; a new folder shows its own (or inherited
    // or default) options and its target, then its settings files once read.
    if (selectedPath === get().selectedPath) return;
    void get().flushPinned();
    const { config } = get();
    const prefs = config && selectedPath ? resolvePrefs(config.projects ?? {}, selectedPath)?.prefs : undefined;
    set({
      selectedPath,
      scope: selectedPath ? "project" : "defaults",
      projectFile: null,
      ...(config ? { target: prefs?.target ?? config.defaultTarget } : {}),
    });
    relayer(get, set);
    if (selectedPath) void get().refreshProjectFile();
  },
  setScope(scope) {
    if (scope === get().scope || (scope === "project" && !get().selectedPath)) return;
    void get().flushPinned();
    set({ scope });
    relayer(get, set);
  },
  async refreshProjectFile() {
    const path = get().selectedPath;
    if (!path) return;
    let settings: ProjectSettings;
    try {
      settings = await api.projectSettings(path);
    } catch {
      return; // missing folder: FolderInfo already says so
    }
    const s = get();
    if (s.selectedPath !== path || !s.config) return;
    const prev = s.projectFile?.path === path ? s.projectFile.settings : null;
    if (prev && JSON.stringify(prev) === JSON.stringify(settings)) return;
    set({ projectFile: { path, settings } });
    // A pending pin is routed against the old layers first; the next refresh picks this up.
    if (s.scope !== "project" || pinnedDirty) return;
    const l = buildLayers(s.config, path, "project", settings);
    set({ opt: rebase(s.opt, l.opt), origin: l.origin });
  },
  async resetProjectOptions() {
    const { config, selectedPath } = get();
    if (!config || !selectedPath || findKey(config.projects ?? {}, selectedPath) === undefined) return;
    clearTimeout(pinnedTimer);
    pinnedDirty = false;
    if (await get().saveConfig({ projects: withoutProject(config.projects, selectedPath) })) {
      set({ target: resolvePrefs(get().config!.projects, selectedPath)?.prefs.target ?? config.defaultTarget });
      relayer(get, set);
    }
  },
  async useAsDefaults() {
    await get().flushPinned();
    const { opt, origin } = get();
    const pinned = Object.fromEntries(Object.entries(opt.pinned).filter(([id]) => origin[id] !== "user"));
    await get().saveConfig({ pinned });
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
    // Everything is read now: the folder or scope may change while the writes are pending.
    const s = get();
    const { config, selectedPath: path, scope, opt, origin } = s;
    if (!config) return;
    const mappable = new Set(fileOf(s)?.mappable ?? []);
    const plan = planPins(savedLayers(s).opt.pinned, opt.pinned, origin, scope, mappable);
    set({ origin: plan.origin });
    if (plan.launcher) {
      if (scope === "project" && path) await get().saveConfig({ projects: withProjectPins(config.projects ?? {}, path, { pinned: plan.launcher }) });
      else await get().saveConfig({ pinned: plan.launcher });
    }
    if (path && scope === "project" && (Object.keys(plan.fileSet).length || plan.fileRemove.length)) {
      try {
        const settings = await api.projectSettingsApply(path, plan.fileSet, plan.fileRemove, plan.removeShared);
        if (get().selectedPath === path) set({ projectFile: { path, settings } });
      } catch (e) {
        get().showError(e);
        // Show what the files really hold again (the failed pin goes away).
        if (get().selectedPath === path && get().scope === "project") {
          set({ projectFile: null });
          await get().refreshProjectFile();
        }
      }
    }
  },
  setDraft: (id, value) => set((s) => ({ drafts: { ...s.drafts, [id]: value } })),
  setTarget(target) {
    set({ target });
    // In a project the terminal is remembered with its options; in the defaults it is per session.
    const { config, selectedPath, scope, opt, origin } = get();
    if (!config || !selectedPath || scope !== "project") return;
    const own = findKey(config.projects ?? {}, selectedPath) !== undefined;
    const pinned = own
      ? undefined
      : Object.fromEntries(Object.entries(opt.pinned).filter(([id]) => origin[id] && !isFileOrigin(origin[id])));
    void get().saveConfig({ projects: withProjectPins(config.projects ?? {}, selectedPath, pinned ? { target, pinned } : { target }) }).then((ok) => {
      if (ok && !own) set({ origin: Object.fromEntries(Object.entries(get().origin).map(([id, o]) => [id, isFileOrigin(o) ? o : "project"])) });
    });
  },
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

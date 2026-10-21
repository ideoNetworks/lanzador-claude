import { invoke } from "@tauri-apps/api/core";

export type Target = "wt" | "powershell" | "wsl";
export type Selection = Record<string, string | null>;
export type Lang = "es" | "en" | "zh";
export type ViewId = "launch" | "new" | "profiles" | "skills" | "history" | "settings";

export interface Profile { id: string; name: string; builtin: boolean; selection: Selection; target: Target }
export interface ProjectPrefs { pinned: Selection; target: Target | null }
export interface HistoryEntry { at: string; path: string; profile: string | null; target: Target; selection: Selection; preview: string }
export interface Branding { logoPath: string | null; trayIconPath: string | null; primaryColor: string | null }
export interface Updates { mode: string; endpoint: string | null }
export interface AppConfig {
  version: number; language: string | null; theme: string; rootFolder: string; showHidden: boolean;
  navCollapsed: boolean; closeToTray: boolean; autostart: boolean; shortcut: string; defaultTarget: Target;
  skillsRepoUrl: string; explorerMenu: boolean; updates: Updates; branding: Branding; pinned: Selection;
  favorites: string[]; recents: string[]; profiles: Profile[]; activeProfile: string | null;
  folderProfiles: Record<string, string>; projects: Record<string, ProjectPrefs>; projectMarks: Record<string, boolean>;
  expandProjectsOnClick: boolean; history: HistoryEntry[]; firstRunDone: boolean;
}
export interface ValueSpec { kind: string; options: string[]; fixed: string | null; placeholder: string | null; optional: boolean }
export interface I18nText { d: string; t: string }
export interface CatalogItem {
  id: string; kind: "flag" | "env"; key: string; group: string; value: ValueSpec;
  dangerous: boolean; fromHelp: boolean; i18n: Record<string, I18nText>;
}
export interface LaunchRequest { path: string; target: Target; selection: Selection; resumeId: string | null }
export interface LaunchPlan { preview: string; program: string; args: string[]; script: string | null; scriptPath: string | null; cwd: string }
export interface DirEntry { name: string; path: string; hasChildren: boolean; hidden: boolean; project?: "claude" | "code" | null }
/** One option found in Claude's settings files; `sources` most specific first. */
export interface SettingEntry { id: string; value: string | null; sources: ("local" | "shared" | "user")[] }
export interface ProjectSettings { entries: SettingEntry[]; mappable: string[]; broken: string[] }
export interface DriveEntry { path: string; label: string; kind: "fixed" | "removable" | "network" | "other" }
export interface FolderInfo {
  path: string; exists: boolean; gitBranch: string | null; hasClaudeMd: boolean;
  skillsCount: number; sessionsCount: number; lastSessionAt: string | null;
}
export interface SessionSummary { id: string; modifiedAt: string; title: string }
export interface SkillInfo { name: string; description: string; hash: string }
export interface InstalledSkill { name: string; hash: string; updateAvailable: boolean }
export interface TemplateInfo { id: string; name: string }
export interface NewProjectRequest {
  parent: string; name: string; template: string | null; description: string; stack: string;
  skills: string[]; skillsScope: "project" | "global"; gitInit: boolean; gitignore: boolean; notifyHook: boolean;
}
export interface CreateResult { path: string; warnings: string[] }
export interface Pong { ok: boolean; version: string }
export interface AppError { code: string; message: string }

export const ping = () => invoke<Pong>("ping");
export const getConfig = () => invoke<AppConfig>("get_config");
export const saveConfig = (config: AppConfig) => invoke<void>("save_config", { config });
export const systemLocale = () => invoke<string>("system_locale");
export const exportConfig = (path: string) => invoke<void>("export_config", { path });
export const importConfig = (path: string) => invoke<AppConfig>("import_config", { path });
export const getCatalog = (includeHelp: boolean) => invoke<CatalogItem[]>("get_catalog", { includeHelp });
export const buildCommand = (req: LaunchRequest) => invoke<string>("build_command", { req });
/** `expectedPreview` is the preview on screen: the engine refuses with `preview_stale` if a fresh plan differs. */
export const launch = (req: LaunchRequest, expectedPreview: string | null = null) =>
  invoke<HistoryEntry>("launch", { req, expectedPreview });
export const listDir = (path: string, showHidden: boolean) => invoke<DirEntry[]>("list_dir", { path, showHidden });
export const listRoots = () => invoke<DriveEntry[]>("list_roots");
export const folderInfo = (path: string) => invoke<FolderInfo>("folder_info", { path });
export const listSessions = (path: string) => invoke<SessionSummary[]>("list_sessions", { path });
export const secretSet = (key: string, value: string) => invoke<void>("secret_set", { key, value });
export const secretHas = (key: string) => invoke<boolean>("secret_has", { key });
export const secretDelete = (key: string) => invoke<void>("secret_delete", { key });
// Task 7
export const skillsSync = () => invoke<string>("skills_sync");
export const skillsList = () => invoke<SkillInfo[]>("skills_list");
export const templatesList = () => invoke<TemplateInfo[]>("templates_list");
export const skillsInstalled = (path: string) => invoke<InstalledSkill[]>("skills_installed", { path });
export const skillsInstall = (path: string | null, names: string[]) => invoke<void>("skills_install", { path, names });
export const createProject = (req: NewProjectRequest) => invoke<CreateResult>("create_project", { req });
// Task 12
export const openVscode = (path: string) => invoke<void>("open_vscode", { path });
export const openExplorer = (path: string) => invoke<void>("open_explorer", { path });
export const projectSettings = (path: string) => invoke<ProjectSettings>("project_settings", { path });
export const projectSettingsApply = (path: string, set: Selection, remove: string[], removeShared: boolean) =>
  invoke<ProjectSettings>("project_settings_apply", { path, set, remove, removeShared });
export const setAutostart = (enabled: boolean) => invoke<void>("set_autostart", { enabled });
export const setShortcut = (shortcut: string) => invoke<void>("set_shortcut", { shortcut });
export const setExplorerMenu = (enabled: boolean) => invoke<void>("set_explorer_menu", { enabled });
export const refreshTray = () => invoke<void>("refresh_tray");
export const notify = (title: string, body: string) => invoke<void>("notify", { title, body });

export { errorText } from "./i18n/errors";
export const takePendingOpen = () => invoke<string | null>("take_pending_open");
export const updateInstall = () => invoke<void>("update_install");
export const takePendingUpdate = () => invoke<{ version: string; notes: string | null } | null>("take_pending_update");
/** Manual check: the update (if any) is reported, never installed. */
export const updateCheck = () => invoke<{ version: string; notes: string | null } | null>("update_check");
export const takeShortcutError = () => invoke<AppError | null>("take_shortcut_error");
export const languageChanged = () => invoke<void>("language_changed");
/** Branding image as a `data:` URL (svg/png/ico/jpg, max 2 MB). */
export const readImageDataUrl = (path: string) => invoke<string>("read_image_data_url", { path });

import type { AppConfig, ProjectPrefs, ProjectSettings, Selection } from "../api";
import type { OptState } from "./checkboxes";

/** Where pinned options are read from and saved: the selected project, or the defaults. */
export type Scope = "project" | "defaults";
/** Where a pinned option lives: Claude settings files, or the launcher (project, an ancestor, defaults). */
export type Origin = "local" | "shared" | "user" | "project" | "inherited" | "defaults";

const FILE: ReadonlySet<Origin> = new Set<Origin>(["local", "shared", "user"]);
export const isFileOrigin = (o: Origin | undefined): o is "local" | "shared" | "user" => !!o && FILE.has(o);

/** Value given to Claude when an option from a settings file is switched off for one launch.
 * Only options with a neutral value can be overridden; the others are locked while pinned in a file. */
export const OVERRIDES: Record<string, string> = { "flag.permission-mode": "manual" };
export const canOverride = (id: string) => id in OVERRIDES;

const trimSep = (p: string) => (/^[A-Za-z]:[\\/]?$/.test(p) ? `${p.slice(0, 2)}\\` : p.replace(/[\\/]+$/, ""));

/** Key of `map` equal to `path`, ignoring case and trailing separators (Windows paths). */
export function findKey<T>(map: Record<string, T>, path: string): string | undefined {
  const p = trimSep(path).toLowerCase();
  return Object.keys(map).find((k) => trimSep(k).toLowerCase() === p);
}

/** `C:\a\b` -> `C:\a`, `C:\a` -> `C:\`; null for a drive root or a UNC share root. */
export function parentOf(path: string): string | null {
  const p = trimSep(path);
  if (/^[A-Za-z]:\\$/.test(p)) return null;
  const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  if (i < 0) return null;
  if (p.startsWith("\\\\") && p.slice(2).split(/[\\/]/).filter(Boolean).length <= 2) return null;
  const up = p.slice(0, i);
  return /^[A-Za-z]:$/.test(up) ? `${up}\\` : up || null;
}

export interface ResolvedPrefs { key: string; prefs: ProjectPrefs; own: boolean }

/** Options of `path` or, failing that, of its nearest ancestor that has its own. */
export function resolvePrefs(projects: Record<string, ProjectPrefs>, path: string): ResolvedPrefs | null {
  let cur: string | null = path;
  let own = true;
  while (cur) {
    const key = findKey(projects, cur);
    if (key !== undefined) return { key, prefs: projects[key], own };
    cur = parentOf(cur);
    own = false;
  }
  return null;
}

export interface Layers { opt: OptState; origin: Record<string, Origin>; resolved: ResolvedPrefs | null }

/** Pinned options for a folder: the launcher's (its own, an ancestor's or the defaults) with the
 * project's settings files on top. A user-level setting yields to a launcher pin (the command
 * line wins over it); project files win over launcher defaults. Every pinned option starts active. */
export function buildLayers(
  config: Pick<AppConfig, "pinned" | "projects">,
  path: string | null,
  scope: Scope,
  file: ProjectSettings | null,
): Layers {
  const origin: Record<string, Origin> = {};
  if (scope === "defaults" || !path) {
    for (const id of Object.keys(config.pinned)) origin[id] = "defaults";
    return { opt: { active: { ...config.pinned }, pinned: { ...config.pinned } }, origin, resolved: null };
  }
  const resolved = resolvePrefs(config.projects ?? {}, path);
  const launcher = resolved ? resolved.prefs.pinned : config.pinned;
  const lo: Origin = resolved ? (resolved.own ? "project" : "inherited") : "defaults";
  const pinned: Selection = { ...launcher };
  for (const id of Object.keys(launcher)) origin[id] = lo;
  for (const e of file?.entries ?? []) {
    const src = e.sources[0] as Origin;
    if (src === "user" && e.id in launcher) continue;
    pinned[e.id] = e.value;
    origin[e.id] = src;
  }
  return { opt: { active: { ...pinned }, pinned }, origin, resolved };
}

/** New layers keeping the user's choices for this launch: options switched off "just this
 * time" stay off and session-only options stay on. */
export function rebase(cur: OptState, next: OptState): OptState {
  const active: Selection = { ...next.pinned };
  for (const id of Object.keys(cur.pinned)) if (id in next.pinned && !(id in cur.active)) delete active[id];
  for (const [id, v] of Object.entries(cur.active)) if (!(id in cur.pinned)) active[id] = v;
  return { active, pinned: next.pinned };
}

/** Selection sent to the engine. Options that come from a settings file are applied by Claude
 * itself and are left out, unless their value was changed for this launch; switched off, they
 * get their override value (when they have one). */
export function launchSelection(opt: OptState, origin: Record<string, Origin>): Selection {
  const out: Selection = {};
  for (const [id, v] of Object.entries(opt.active)) {
    if (isFileOrigin(origin[id]) && id in opt.pinned && (opt.pinned[id] ?? null) === (v ?? null)) continue;
    out[id] = v;
  }
  for (const id of Object.keys(opt.pinned)) {
    if (isFileOrigin(origin[id]) && !(id in opt.active) && canOverride(id)) out[id] = OVERRIDES[id];
  }
  return out;
}

/** Number of active options that Claude takes from settings files (not in the command). */
export function fromFileCount(opt: OptState, origin: Record<string, Origin>): number {
  return Object.keys(opt.active).filter((id) => isFileOrigin(origin[id]) && (opt.pinned[id] ?? null) === (opt.active[id] ?? null)).length;
}

export interface PinPlan {
  /** Full launcher pin set to save (null: unchanged). */
  launcher: Selection | null;
  /** Options to write into `settings.local.json`. */
  fileSet: Selection;
  /** Options to remove from the settings files. */
  fileRemove: string[];
  /** One of `fileRemove` is in the shared `settings.json`. */
  removeShared: boolean;
  /** Origins after the save. */
  origin: Record<string, Origin>;
}

const LAUNCHER: ReadonlySet<Origin> = new Set<Origin>(["project", "inherited", "defaults"]);

/** Routes the pinned changes between `prev` and `next`. In a project, a newly pinned option
 * with a settings equivalent goes to `settings.local.json`, any other to the project's launcher
 * options (created from the inherited/default ones on the first change). */
export function planPins(
  prev: Selection,
  next: Selection,
  origin: Record<string, Origin>,
  scope: Scope,
  mappable: ReadonlySet<string>,
): PinPlan {
  const out: Record<string, Origin> = { ...origin };
  const launcherOrigin: Origin = scope === "project" ? "project" : "defaults";
  const fileSet: Selection = {};
  const fileRemove: string[] = [];
  let removeShared = false;
  let launcherChanged = false;
  for (const id of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    const had = id in prev;
    const has = id in next;
    if (had && has && (prev[id] ?? null) === (next[id] ?? null)) continue;
    const o = origin[id];
    if (has) {
      if (o === "local" || o === "shared") {
        fileSet[id] = next[id];
        out[id] = "local";
      } else if (o === "user") {
        continue;
      } else if (!had && scope === "project" && mappable.has(id)) {
        fileSet[id] = next[id];
        out[id] = "local";
      } else {
        launcherChanged = true;
        out[id] = launcherOrigin;
      }
    } else {
      delete out[id];
      if (o === "local" || o === "shared") {
        fileRemove.push(id);
        if (o === "shared") removeShared = true;
      } else if (o !== "user") {
        launcherChanged = true;
      }
    }
  }
  let launcher: Selection | null = null;
  if (launcherChanged) {
    launcher = {};
    for (const [id, v] of Object.entries(next)) {
      if (out[id] && LAUNCHER.has(out[id])) {
        launcher[id] = v;
        out[id] = launcherOrigin;
      }
    }
  }
  return { launcher, fileSet, fileRemove, removeShared, origin: out };
}

/** `projects` with the launcher options of `path` replaced (created when missing). */
export function withProjectPins(projects: Record<string, ProjectPrefs>, path: string, patch: Partial<ProjectPrefs>): Record<string, ProjectPrefs> {
  const key = findKey(projects, path) ?? path;
  const cur = projects[key] ?? { pinned: {}, target: null };
  return { ...projects, [key]: { ...cur, ...patch } };
}

export function withoutProject(projects: Record<string, ProjectPrefs>, path: string): Record<string, ProjectPrefs> {
  const key = findKey(projects, path);
  if (key === undefined) return projects;
  const next = { ...projects };
  delete next[key];
  return next;
}

/** Project kind shown in the tree: manual marks win over detection. */
export function projectKind(detected: string | null | undefined, marks: Record<string, boolean>, path: string): "claude" | "code" | null {
  const key = findKey(marks, path);
  const mark = key === undefined ? undefined : marks[key];
  if (mark === false) return null;
  if (detected === "claude" || detected === "code") return detected;
  return mark ? "code" : null;
}

import type { AppConfig, Profile, Selection, Target } from "../api";

export type ProfileNamer = (p: Profile) => string;

/** True when another profile (not `exceptId`) already uses that display name. */
export function nameTaken(profiles: Profile[], name: string, nameOf: ProfileNamer, exceptId?: string): boolean {
  const n = name.trim().toLowerCase();
  return profiles.some((p) => p.id !== exceptId && nameOf(p).trim().toLowerCase() === n);
}

/** New user profile from the current launch selection and target. */
export function createProfile(name: string, selection: Selection, target: Target, now = Date.now()): Profile {
  return { id: `user-${now.toString(36)}`, name: name.trim(), builtin: false, selection: { ...selection }, target };
}

export function renameProfile(profiles: Profile[], id: string, name: string): Profile[] {
  return profiles.map((p) => (p.id === id && !p.builtin ? { ...p, name: name.trim() } : p));
}

/** Removes a user profile and every reference to it (active profile, folder defaults). Builtins give null. */
export function removeProfile(config: Pick<AppConfig, "profiles" | "activeProfile" | "folderProfiles">, id: string) {
  const target = config.profiles.find((p) => p.id === id);
  if (!target || target.builtin) return null;
  return {
    profiles: config.profiles.filter((p) => p.id !== id),
    activeProfile: config.activeProfile === id ? null : config.activeProfile,
    folderProfiles: Object.fromEntries(Object.entries(config.folderProfiles).filter(([, v]) => v !== id)),
  };
}

/** Folder-profile key lookup tolerant to case (Windows paths). */
export function folderProfileKey(map: Record<string, string>, path: string): string | undefined {
  const p = path.toLowerCase();
  return Object.keys(map).find((k) => k.toLowerCase() === p);
}

/** Toggles `path -> id`: set when it is not the current default, removed when it is. */
export function toggleFolderProfile(map: Record<string, string>, path: string, id: string): Record<string, string> {
  const key = folderProfileKey(map, path);
  const next = Object.fromEntries(Object.entries(map).filter(([k]) => k !== key));
  if (key !== undefined && map[key] === id) return next;
  return { ...next, [path]: id };
}

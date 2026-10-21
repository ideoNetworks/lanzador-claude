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

/** Removes a user profile and the reference to it (active profile). Builtins give null. */
export function removeProfile(config: Pick<AppConfig, "profiles" | "activeProfile">, id: string) {
  const target = config.profiles.find((p) => p.id === id);
  if (!target || target.builtin) return null;
  return {
    profiles: config.profiles.filter((p) => p.id !== id),
    activeProfile: config.activeProfile === id ? null : config.activeProfile,
  };
}


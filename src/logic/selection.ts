import type { CatalogItem, Profile, Selection } from "../api";
import type { OptState } from "./checkboxes";

/** Applying a profile replaces the active selection; pins are untouched. */
export function applyProfile(s: OptState, profile: Profile): OptState {
  return { active: { ...profile.selection }, pinned: s.pinned };
}

export function countByKind(active: Selection, catalog: CatalogItem[], kind: "flag" | "env"): number {
  const kinds = new Map(catalog.map((c) => [c.id, c.kind]));
  return Object.keys(active).filter((id) => kinds.get(id) === kind).length;
}

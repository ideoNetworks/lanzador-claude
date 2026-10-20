import type { CatalogItem, Profile, Selection } from "../api";
import type { OptState } from "./checkboxes";

/** Applying a profile replaces the active selection, but a pinned option is never left off
 * (§4.2): pinned ids stay active, with the profile's value when the profile sets them. */
export function applyProfile(s: OptState, profile: Profile): OptState {
  return { active: { ...s.pinned, ...profile.selection }, pinned: s.pinned };
}

export function countByKind(active: Selection, catalog: CatalogItem[], kind: "flag" | "env"): number {
  const kinds = new Map(catalog.map((c) => [c.id, c.kind]));
  return Object.keys(active).filter((id) => kinds.get(id) === kind).length;
}

import type { Selection } from "../api";

export type OptState = { active: Selection; pinned: Selection };

const without = (s: Selection, id: string): Selection => {
  const rest = { ...s };
  delete rest[id];
  return rest;
};

/** Pin box: checking pins + activates; unchecking clears both. */
export function togglePin(s: OptState, id: string, value: string | null): OptState {
  if (id in s.pinned) return { active: without(s.active, id), pinned: without(s.pinned, id) };
  return { active: { ...s.active, [id]: value }, pinned: { ...s.pinned, [id]: value } };
}

/** Active box: unchecking clears both; checking without pin is session-only. */
export function toggleActive(s: OptState, id: string, value: string | null): OptState {
  if (id in s.active) return { active: without(s.active, id), pinned: without(s.pinned, id) };
  return { active: { ...s.active, [id]: value }, pinned: s.pinned };
}

/** Changing a value activates the option and updates the remembered value if pinned. */
export function setValue(s: OptState, id: string, value: string | null): OptState {
  return {
    active: { ...s.active, [id]: value },
    pinned: id in s.pinned ? { ...s.pinned, [id]: value } : s.pinned,
  };
}

/** On program open, active options are the pinned ones. */
export function initialActive(pinned: Selection): Selection {
  return { ...pinned };
}

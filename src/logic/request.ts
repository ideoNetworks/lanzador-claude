import type { LaunchRequest, Selection, Target } from "../api";
import type { OptState } from "./checkboxes";

export interface LaunchExtras { extra?: Selection; resumeId?: string | null }

/** The request the UI would launch right now (null without a folder). */
export function currentRequest(
  s: { selectedPath: string | null; target: Target; opt: OptState },
  x: LaunchExtras = {},
): LaunchRequest | null {
  if (!s.selectedPath) return null;
  return { path: s.selectedPath, target: s.target, selection: { ...s.opt.active, ...x.extra }, resumeId: x.resumeId ?? null };
}

/** Stable serialization: selection keys sorted, so equal requests give equal keys. */
export function requestKey(r: LaunchRequest | null): string {
  if (!r) return "";
  const sel = Object.keys(r.selection).sort().map((k) => [k, r.selection[k] ?? null]);
  return JSON.stringify([r.path, r.target, r.resumeId ?? null, sel]);
}

/** Key of a preview: the request plus the store's `previewRev` (secrets, catalog version), so a
 * change the request does not show still invalidates the preview on screen. */
export function previewKey(r: LaunchRequest | null, rev: number): string {
  return r ? `${requestKey(r)}#${rev}` : "";
}

export const truncate = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

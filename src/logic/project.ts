import { t, hasKey } from "../i18n";

const FORBIDDEN = /[<>:"/\\|?*$`]/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/** Mirrors the engine's name check (the engine stays authoritative). Returns an error code or null. */
export function nameError(raw: string): "invalid_name" | null {
  const name = raw.trim();
  if (!name || name === "." || name === "..") return "invalid_name";
  if (/[. ]$/.test(name) || FORBIDDEN.test(name) || CONTROL.test(name) || RESERVED.test(name.split(".")[0])) return "invalid_name";
  return null;
}

/** Localizes an engine warning of the form "<code>: <detail>" (split on the first colon). */
export function warningText(w: string): string {
  const i = w.indexOf(":");
  const code = (i < 0 ? w : w.slice(0, i)).trim();
  const detail = i < 0 ? "" : w.slice(i + 1).trim();
  const known = /^\w+$/.test(code) && hasKey(`errors.${code}`);
  if (!known) return w;
  const msg = t(`errors.${code}`);
  return detail ? `${msg} (${detail})` : msg;
}

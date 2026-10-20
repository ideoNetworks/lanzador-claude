export interface KeyLike { key: string; code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph", "OS"]);
const NAMED: Record<string, string> = {
  Space: "Space", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Insert: "Insert",
  Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
};

/** Key part from the physical `code` (independent of layout and of Alt/AltGr composition). */
function keyName(e: KeyLike): string | null {
  const c = e.code;
  let m = /^Key([A-Z])$/.exec(c);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(c);
  if (m) return m[1];
  m = /^Numpad(\d)$/.exec(c);
  if (m) return `Num${m[1]}`;
  if (/^F([1-9]|1\d|2[0-4])$/.test(c)) return c;
  if (c in NAMED) return NAMED[c];
  return null;
}

/**
 * Combo string for the global shortcut field, e.g. `Ctrl+Alt+I`.
 * Returns null while only modifiers are held, for keys that cannot be registered, and
 * for a combo without a modifier (a global shortcut on a bare key would hijack typing).
 */
export function comboFromEvent(e: KeyLike): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const key = keyName(e);
  if (!key) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean) as string[];
  if (mods.length === 0) return null;
  return [...mods, key].join("+");
}

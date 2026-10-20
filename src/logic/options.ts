import type { CatalogItem, I18nText, Selection } from "../api";
import { normalize } from "./search";

export const GROUPS = ["model", "perm", "ctx", "dbg", "other"] as const;
export const SECRET_VALUE = "@secret";

/** Value an option takes when it is switched on without a remembered value. */
export function defaultValue(item: CatalogItem): string | null {
  const v = item.value;
  switch (v.kind) {
    case "select": return v.optional ? null : v.options[0] ?? null;
    case "fixed": return v.fixed;
    case "secret": return SECRET_VALUE;
    default: return null;
  }
}

export function itemText(item: CatalogItem, lang: string): I18nText {
  return item.i18n[lang] ?? item.i18n.en ?? item.i18n.es ?? { d: "", t: "" };
}

/** Groups in canonical order; unknown groups fall into "other". */
export function groupItems(items: CatalogItem[]): [string, CatalogItem[]][] {
  const known = new Set<string>(GROUPS);
  return GROUPS.map((g) => [g, items.filter((i) => (known.has(i.group) ? i.group : "other") === g)] as [string, CatalogItem[]]).filter(([, l]) => l.length > 0);
}

/** Every word must appear in the key or the localized description. */
export function filterOptions(items: CatalogItem[], query: string, lang: string): CatalogItem[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((i) => {
    const hay = normalize(`${i.key} ${itemText(i, lang).d}`);
    return words.every((w) => hay.includes(w));
  });
}

export function sameSelection(a: Selection, b: Selection): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => k in b && (a[k] ?? null) === (b[k] ?? null));
}

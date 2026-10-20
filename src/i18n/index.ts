import { useSyncExternalStore } from "react";
import es from "./es.json";
import en from "./en.json";
import zh from "./zh.json";
import type { Lang } from "../api";

const dicts: Record<Lang, unknown> = { es, en, zh };
let current: Lang = "es";
const listeners = new Set<() => void>();

function lookup(lang: Lang, key: string): string | undefined {
  let node: unknown = dicts[lang];
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as object)) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

export const hasKey = (key: string) => lookup(current, key) !== undefined || lookup("es", key) !== undefined;

export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = lookup(current, key) ?? lookup("es", key) ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}

export const getLanguage = () => current;

export function setLanguage(lang: Lang): void {
  current = lang;
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

/** config.language wins; otherwise the system locale: es* -> es, zh* -> zh, else en. */
export function detectLanguage(configLang: string | null | undefined, systemLocale: string): Lang {
  const pick = (s: string): Lang | null => {
    const l = s.toLowerCase();
    return l.startsWith("es") ? "es" : l.startsWith("zh") ? "zh" : l.startsWith("en") ? "en" : null;
  };
  return (configLang && pick(configLang)) || (pick(systemLocale) ?? "en");
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

/** Re-renders on language change; returns `t`. */
export function useT(): typeof t {
  useSyncExternalStore(subscribe, getLanguage);
  return t;
}

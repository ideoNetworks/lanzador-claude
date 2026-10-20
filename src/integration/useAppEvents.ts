import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import * as api from "../api";
import type { AppConfig, Lang, ViewId } from "../api";
import { setLanguage } from "../i18n";
import { useStore } from "../store";

const VIEWS: readonly string[] = ["launch", "new", "profiles", "skills", "history", "settings"];

/** `navigate` payload: a view id, or "about" which opens the About dialog. */
export function applyNavigate(target: string): void {
  const s = useStore.getState();
  if (target === "about") s.setAboutOpen(true);
  else if (VIEWS.includes(target)) s.setView(target as ViewId);
}

/** `open-path` (tray recents, Explorer menu, second launch): select the folder in the launch view. */
export function applyOpenPath(path: string): void {
  const s = useStore.getState();
  s.selectPath(path);
  s.setView("launch");
}

/** The engine already saved the language; mirror it in the store and the UI dictionary. */
export function applyLanguage(lang: string): void {
  if (lang !== "es" && lang !== "en" && lang !== "zh") return;
  const s = useStore.getState();
  if (s.config) useStore.setState({ config: { ...s.config, language: lang } });
  setLanguage(lang as Lang);
}

/** The engine saved the config (tray, shortcut, autostart, launch): replace the store copy so the UI never writes back a stale one. */
export function applyConfig(cfg: AppConfig): void {
  if (useStore.getState().config) useStore.setState({ config: cfg });
}

/** Listens to the engine events: navigate, open-path, language-changed, update-available. */
export function useAppEvents(): void {
  useEffect(() => {
    let alive = true;
    const unlisten: Array<() => void> = [];
    const sub = async <T>(name: string, fn: (p: T) => void) => {
      try {
        const un = await listen<T>(name, (e) => fn(e.payload));
        if (alive) unlisten.push(un);
        else un();
      } catch {
        /* not running inside Tauri (tests / browser) */
      }
    };
    void sub<string>("navigate", applyNavigate);
    void sub<string>("open-path", applyOpenPath);
    void sub<string>("language-changed", applyLanguage);
    void sub<AppConfig>("config-changed", applyConfig);
    void sub<{ version: string; notes: string | null }>("update-available", (u) => useStore.getState().setUpdate(u));
    // A path passed on the command line before this hook was listening.
    api.takePendingOpen().then((p) => { if (alive && p) applyOpenPath(p); }).catch(() => {});
    api.takePendingUpdate().then((u) => { if (alive && u) useStore.getState().setUpdate(u); }).catch(() => {});
    return () => {
      alive = false;
      unlisten.forEach((u) => u());
    };
  }, []);
}

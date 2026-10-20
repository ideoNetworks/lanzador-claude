import { useEffect, useState } from "react";
import { useStore } from "./store";
import { useT } from "./i18n";
import TopBar from "./components/TopBar";
import NavRail from "./components/NavRail";
import StatusBar from "./components/StatusBar";
import Toast from "./components/Toast";
import ProfilesView from "./views/ProfilesView";
import HistoryView from "./views/HistoryView";
import SettingsView from "./views/SettingsView";
import AboutDialog from "./components/AboutDialog";
import NewProjectView from "./views/NewProjectView";
import SkillsView from "./views/SkillsView";
import LaunchView from "./views/LaunchView";
import UpdateBanner from "./components/UpdateBanner";
import { useAppEvents } from "./integration/useAppEvents";
import SearchPalette from "./components/SearchPalette";

/** config.json exists but cannot be read (locked, permissions): nothing may be saved over it. */
export function ConfigErrorBanner() {
  const t = useT();
  const load = useStore((s) => s.load);
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      await load();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cfg-block" role="alertdialog" aria-modal="true" aria-labelledby="cfg-block-title">
      <div className="card">
        <h3 id="cfg-block-title">{t("cfgError.title")}</h3>
        <p>{t("cfgError.body")}</p>
        <button className="btn pri" disabled={busy} onClick={() => void retry()}>{t("cfgError.retry")}</button>
      </div>
    </div>
  );
}

export default function App() {
  const load = useStore((s) => s.load);
  const configError = useStore((s) => s.configError);
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.config?.theme);
  const primary = useStore((s) => s.config?.branding.primaryColor);

  useEffect(() => void load(), [load]);
  useAppEvents();

  // No native WebView context menu (Reload / Inspect), except in text fields where it offers copy/paste.
  useEffect(() => {
    const block = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.closest("input, textarea")) e.preventDefault();
    };
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, []);

  // Theme: "system" leaves data-theme unset so the OS preference applies.
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "light" || theme === "dark") el.setAttribute("data-theme", theme);
    else el.removeAttribute("data-theme");
  }, [theme]);

  // Branding primary colour overrides the token.
  useEffect(() => {
    const el = document.documentElement;
    if (primary) el.style.setProperty("--primary", primary);
    else el.style.removeProperty("--primary");
  }, [primary]);

  return (
    <div className="app">
      <TopBar />
      <UpdateBanner />
      <div className="body">
        <NavRail onAbout={() => useStore.getState().setAboutOpen(true)} />
        <main className="main">
          {view === "new" ? <NewProjectView />
            : view === "skills" ? <SkillsView />
            : view === "profiles" ? <ProfilesView />
            : view === "history" ? <HistoryView />
            : view === "settings" ? <SettingsView />
            : <LaunchView />}
        </main>
      </div>
      <StatusBar />
      {configError && <ConfigErrorBanner />}
      <SearchPalette />
      <AboutDialog />
      <Toast />
    </div>
  );
}

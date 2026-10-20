import { useEffect } from "react";
import { useStore } from "./store";
import { useT } from "./i18n";
import TopBar from "./components/TopBar";
import NavRail from "./components/NavRail";
import StatusBar from "./components/StatusBar";
import Toast from "./components/Toast";
import Placeholder from "./views/Placeholder";
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

export default function App() {
  const t = useT();
  const load = useStore((s) => s.load);
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
          {view === "launch" ? <LaunchView />
            : view === "new" ? <NewProjectView />
            : view === "skills" ? <SkillsView />
            : view === "profiles" ? <ProfilesView />
            : view === "history" ? <HistoryView />
            : view === "settings" ? <SettingsView />
            : <Placeholder title={t(`nav.${view}`)} />}
        </main>
      </div>
      <StatusBar />
      <SearchPalette />
      <AboutDialog />
      <Toast />
    </div>
  );
}

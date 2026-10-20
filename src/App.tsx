import { useEffect } from "react";
import { useStore } from "./store";
import { useT } from "./i18n";
import TopBar from "./components/TopBar";
import NavRail from "./components/NavRail";
import StatusBar from "./components/StatusBar";
import Toast from "./components/Toast";
import Placeholder from "./views/Placeholder";
import LaunchView from "./views/LaunchView";
import SearchPalette from "./components/SearchPalette";

export default function App() {
  const t = useT();
  const load = useStore((s) => s.load);
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.config?.theme);
  const primary = useStore((s) => s.config?.branding.primaryColor);

  useEffect(() => void load(), [load]);

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
      <div className="body">
        <NavRail onAbout={() => { /* About dialog arrives in Task 10 */ }} />
        <main className="main">
          {/* Remaining views are filled in by Tasks 10-11. */}
          {view === "launch" ? <LaunchView /> : <Placeholder title={t(`nav.${view}`)} />}
        </main>
      </div>
      <StatusBar />
      <SearchPalette />
      <Toast />
    </div>
  );
}

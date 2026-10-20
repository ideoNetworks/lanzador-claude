import { useEffect } from "react";
import { useStore } from "./store";
import { useT } from "./i18n";
import TopBar from "./components/TopBar";
import NavRail from "./components/NavRail";
import StatusBar from "./components/StatusBar";
import Toast from "./components/Toast";
import Placeholder from "./views/Placeholder";

export default function App() {
  const t = useT();
  const load = useStore((s) => s.load);
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.config?.theme);
  const primary = useStore((s) => s.config?.branding.primaryColor);

  useEffect(() => void load(), [load]);

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
          {/* Views are filled in by Tasks 9-11. */}
          <Placeholder title={t(`nav.${view}`)} />
        </main>
      </div>
      <StatusBar />
      <Toast />
    </div>
  );
}

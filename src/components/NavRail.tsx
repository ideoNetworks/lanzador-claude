import { useStore } from "../store";
import { useT } from "../i18n";
import type { ViewId } from "../api";
import { icons } from "./icons";

const MAIN: ViewId[] = ["launch", "new", "profiles", "skills", "history"];

export default function NavRail({ onAbout }: { onAbout: () => void }) {
  const t = useT();
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const collapsed = useStore((s) => s.config?.navCollapsed ?? false);
  const saveConfig = useStore((s) => s.saveConfig);

  const item = (id: string, active: boolean, onClick: () => void) => (
    <button key={id} className={active ? "on" : ""} onClick={onClick} title={collapsed ? t(`nav.${id}`) : undefined} aria-label={t(`nav.${id}`)}>
      {icons[id]}
      <span className="lbl">{t(`nav.${id}`)}</span>
    </button>
  );

  return (
    <nav className={`nav${collapsed ? " min" : ""}`}>
      {MAIN.map((id) => item(id, view === id, () => setView(id)))}
      <div className="spacer" />
      {item("settings", view === "settings", () => setView("settings"))}
      {item("about", false, onAbout)}
      <button
        className="collapse"
        onClick={() => void saveConfig({ navCollapsed: !collapsed })}
        title={collapsed ? t("nav.expand") : t("nav.collapse")}
        aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
      >
        {icons.chev}
        <span className="lbl">{t("nav.collapse")}</span>
      </button>
    </nav>
  );
}

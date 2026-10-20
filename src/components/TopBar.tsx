import logoWhite from "../assets/logo-iDeo-blanco-Servicios-Informaticos-Premium.svg";
import { useStore } from "../store";
import { useT, getLanguage } from "../i18n";
import type { Lang } from "../api";
import { icons } from "./icons";
import { useImageDataUrl } from "./useImageDataUrl";

const systemDark = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;

export function nextTheme(theme: string): "light" | "dark" {
  const dark = theme === "dark" || (theme !== "light" && systemDark());
  return dark ? "light" : "dark";
}

export default function TopBar() {
  const t = useT();
  const config = useStore((s) => s.config);
  const saveConfig = useStore((s) => s.saveConfig);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const changeLanguage = useStore((s) => s.changeLanguage);
  const custom = useImageDataUrl(config?.branding.logoPath);
  const lang = getLanguage();

  return (
    <header className="top">
      <div className="brand">
        <img src={custom ?? logoWhite} alt={t("top.logoAlt")} />
        <span>{t("app.name")}</span>
      </div>
      <button className="search" onClick={() => setPaletteOpen(true)} aria-label={t("top.search")}>
        {icons.search}
        <span>{t("top.search")}</span>
        <kbd>Ctrl K</kbd>
      </button>
      <select
        className="tbtn"
        aria-label={t("top.language")}
        value={lang}
        onChange={(e) => void changeLanguage(e.target.value as Lang)}
      >
        <option value="es">Español</option>
        <option value="en">English</option>
        <option value="zh">中文</option>
      </select>
      <button
        className="tbtn"
        aria-label={t("top.theme")}
        title={t("top.theme")}
        onClick={() => void saveConfig({ theme: nextTheme(config?.theme ?? "system") })}
      >
        {icons.moon}
      </button>
    </header>
  );
}

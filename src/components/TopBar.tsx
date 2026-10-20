import { convertFileSrc } from "@tauri-apps/api/core";
import logoWhite from "../assets/logo-iDeo-blanco-Servicios-Informaticos-Premium.svg";
import { useStore } from "../store";
import { useT, setLanguage, getLanguage } from "../i18n";
import type { Lang } from "../api";
import { icons } from "./icons";

const systemDark = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;

export function nextTheme(theme: string): "light" | "dark" {
  const dark = theme === "dark" || (theme !== "light" && systemDark());
  return dark ? "light" : "dark";
}

export default function TopBar() {
  const t = useT();
  const config = useStore((s) => s.config);
  const saveConfig = useStore((s) => s.saveConfig);
  const logoPath = config?.branding.logoPath;
  const lang = getLanguage();

  return (
    <header className="top">
      <div className="brand">
        <img src={logoPath ? convertFileSrc(logoPath) : logoWhite} alt={t("top.logoAlt")} />
        <span>{t("app.name")}</span>
      </div>
      <div className="search">
        {icons.search}
        <span>{t("top.search")}</span>
        <kbd>Ctrl K</kbd>
      </div>
      <select
        className="tbtn"
        aria-label={t("top.language")}
        value={lang}
        onChange={(e) => {
          const l = e.target.value as Lang;
          setLanguage(l);
          void saveConfig({ language: l });
        }}
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

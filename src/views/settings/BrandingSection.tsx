import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useImageDataUrl } from "../../components/useImageDataUrl";
import * as api from "../../api";
import type { Branding } from "../../api";
import { useStore } from "../../store";
import { useT } from "../../i18n";
import { Row, Section } from "./parts";

const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_PRIMARY = "#006EB3";
const COMMIT_MS = 300;

export default function BrandingSection() {
  const t = useT();
  const branding = useStore((s) => s.config?.branding);
  const saveConfig = useStore((s) => s.saveConfig);
  const showError = useStore((s) => s.showError);
  const logoUrl = useImageDataUrl(branding?.logoPath);
  const [hex, setHex] = useState(branding?.primaryColor ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => setHex(branding?.primaryColor ?? ""), [branding?.primaryColor]);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!branding) return null;

  const refreshTray = () => void Promise.resolve().then(() => api.refreshTray()).catch(() => {});
  const update = async (patch: Partial<Branding>, tray = false) => {
    await saveConfig({ branding: { ...branding, ...patch } });
    if (tray) refreshTray();
  };

  const pick = async (key: "logoPath" | "trayIconPath", exts: string[], name: string) => {
    try {
      const file = await open({ multiple: false, directory: false, filters: [{ name, extensions: exts }] });
      if (typeof file === "string") await update({ [key]: file }, key === "trayIconPath");
    } catch (e) {
      showError(e);
    }
  };

  const commitColor = (v: string) => {
    if (HEX.test(v)) void update({ primaryColor: v.toUpperCase() === DEFAULT_PRIMARY ? null : v });
  };
  const onPicker = (v: string) => {
    setHex(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commitColor(v), COMMIT_MS);
  };
  const badHex = hex !== "" && !HEX.test(hex);
  const empty = !branding.logoPath && !branding.trayIconPath && !branding.primaryColor;

  const file = (label: string, path: string | null, key: "logoPath" | "trayIconPath", exts: string[], filterName: string) => (
    <Row label={label}>
      {key === "logoPath" && logoUrl && <img className="thumb" src={logoUrl} alt="" />}
      <span className="path-box" title={path ?? undefined}>
        <bdi>{path ?? t("settings.brandingDefault")}</bdi>
      </span>
      <button className="btn sm" onClick={() => void pick(key, exts, filterName)}>{t("settings.pick")}</button>
      {path && <button className="btn sm" onClick={() => void update({ [key]: null }, key === "trayIconPath")}>{t("settings.clearField")}</button>}
    </Row>
  );

  return (
    <Section title={t("settings.branding")}>
      {file(t("settings.logo"), branding.logoPath, "logoPath", ["svg", "png"], t("settings.imageFilter"))}
      {file(t("settings.trayIcon"), branding.trayIconPath, "trayIconPath", ["ico", "png"], t("settings.iconFilter"))}
      <Row label={t("settings.primary")} hint={badHex ? <span className="err-text">{t("settings.invalidColor")}</span> : undefined}>
        <input
          type="color"
          className="color-in"
          aria-label={t("settings.primary")}
          value={HEX.test(hex) ? hex : DEFAULT_PRIMARY}
          onChange={(e) => onPicker(e.target.value)}
        />
        <input
          type="text"
          className="fld hex"
          aria-label={t("settings.primary")}
          value={hex}
          placeholder={DEFAULT_PRIMARY}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => setHex(e.target.value)}
          onBlur={() => (hex === "" ? void update({ primaryColor: null }) : commitColor(hex))}
          onKeyDown={(e) => e.key === "Enter" && commitColor(hex)}
        />
      </Row>
      <Row label={t("settings.brandingReset")}>
        <button className="btn" disabled={empty} onClick={() => { setHex(""); void update({ logoPath: null, trayIconPath: null, primaryColor: null }, true); }}>
          {t("settings.brandingReset")}
        </button>
      </Row>
    </Section>
  );
}

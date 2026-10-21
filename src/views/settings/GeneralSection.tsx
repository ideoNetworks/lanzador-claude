import { open } from "@tauri-apps/plugin-dialog";
import type { Lang, Target } from "../../api";
import { useStore } from "../../store";
import { getLanguage, useT } from "../../i18n";
import { Row, Section, Segmented, Switch } from "./parts";

const TARGETS: Target[] = ["wt", "powershell", "wsl"];

export default function GeneralSection() {
  const t = useT();
  const config = useStore((s) => s.config);
  const saveConfig = useStore((s) => s.saveConfig);
  const showError = useStore((s) => s.showError);
  const changeLanguage = useStore((s) => s.changeLanguage);
  if (!config) return null;

  const pickRoot = async () => {
    try {
      const dir = await open({ directory: true, multiple: false, defaultPath: config.rootFolder, title: t("tree.pickRoot") });
      if (typeof dir === "string") void saveConfig({ rootFolder: dir });
    } catch (e) {
      showError(e);
    }
  };

  return (
    <Section title={t("settings.general")}>
      <Row label={t("settings.language")}>
        <select
          className="sel2"
          aria-label={t("settings.language")}
          value={getLanguage()}
          onChange={(e) => void changeLanguage(e.target.value as Lang)}
        >
          <option value="es">Español</option>
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </Row>
      <Row label={t("settings.theme")}>
        <Segmented
          label={t("settings.theme")}
          value={config.theme === "light" || config.theme === "dark" ? config.theme : "system"}
          onChange={(theme) => void saveConfig({ theme })}
          options={[
            { id: "system", label: t("settings.themeSystem") },
            { id: "light", label: t("settings.themeLight") },
            { id: "dark", label: t("settings.themeDark") },
          ]}
        />
      </Row>
      <Row label={t("settings.rootFolder")}>
        <span className="path-box" title={config.rootFolder}>
          <bdi>{config.rootFolder}</bdi>
        </span>
        <button className="btn sm" onClick={() => void pickRoot()}>{t("settings.pick")}</button>
      </Row>
      <Row label={t("settings.showHidden")}>
        <Switch label={t("settings.showHidden")} checked={config.showHidden} onChange={(showHidden) => void saveConfig({ showHidden })} />
      </Row>
      <Row label={t("settings.expandProjects")} hint={t("settings.expandProjectsHint")}>
        <Switch
          label={t("settings.expandProjects")}
          checked={config.expandProjectsOnClick ?? false}
          onChange={(expandProjectsOnClick) => void saveConfig({ expandProjectsOnClick })}
        />
      </Row>
      <Row label={t("settings.defaultTarget")}>
        <select
          className="sel2"
          aria-label={t("settings.defaultTarget")}
          value={config.defaultTarget}
          onChange={(e) => void saveConfig({ defaultTarget: e.target.value as Target })}
        >
          {TARGETS.map((x) => <option key={x} value={x}>{t(`target.${x}`)}</option>)}
        </select>
      </Row>
    </Section>
  );
}

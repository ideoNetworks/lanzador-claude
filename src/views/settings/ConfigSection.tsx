import { open, save } from "@tauri-apps/plugin-dialog";
import * as api from "../../api";
import { useStore } from "../../store";
import { useT } from "../../i18n";
import { Row, Section } from "./parts";

export default function ConfigSection() {
  const t = useT();
  const replaceConfig = useStore((s) => s.replaceConfig);
  const showToast = useStore((s) => s.showToast);
  const showError = useStore((s) => s.showError);
  const filters = [{ name: t("settings.jsonFilter"), extensions: ["json"] }];

  const doExport = async () => {
    try {
      const path = await save({ defaultPath: t("settings.exportName"), filters });
      if (!path) return;
      await api.exportConfig(path);
      showToast(t("settings.exported"));
    } catch (e) {
      showError(e);
    }
  };

  const doImport = async () => {
    try {
      const path = await open({ multiple: false, directory: false, filters });
      if (typeof path !== "string") return;
      replaceConfig(await api.importConfig(path));
      showToast(t("settings.imported"));
    } catch (e) {
      showError(e);
    }
  };

  return (
    <Section title={t("settings.config")}>
      <Row label={t("settings.config")}>
        <button className="btn" onClick={() => void doExport()}>{t("settings.export")}</button>
        <button className="btn" onClick={() => void doImport()}>{t("settings.import")}</button>
      </Row>
    </Section>
  );
}

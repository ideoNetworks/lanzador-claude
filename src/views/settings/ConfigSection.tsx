import { open, save } from "@tauri-apps/plugin-dialog";
import * as api from "../../api";
import type { AppConfig } from "../../api";
import { useStore } from "../../store";
import { useT } from "../../i18n";
import { Row, Section } from "./parts";

/** An imported config only changes the file: make Explorer menu, autostart and the global
 * shortcut match it (each failure is reported, the others still run). */
export async function applyImportedIntegration(cfg: AppConfig, onError: (e: unknown) => void): Promise<void> {
  for (const step of [() => api.setExplorerMenu(cfg.explorerMenu), () => api.setAutostart(cfg.autostart)]) {
    try {
      await step();
    } catch (e) {
      onError(e);
    }
  }
  try {
    await api.setShortcut(cfg.shortcut);
    useStore.getState().setShortcutError(null);
  } catch (e) {
    const code = (e as { code?: string } | null)?.code ?? "shortcut_taken";
    useStore.getState().setShortcutError({ code, message: cfg.shortcut });
    onError(e);
  }
}

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
      const cfg = await api.importConfig(path);
      replaceConfig(cfg);
      showToast(t("settings.imported"));
      await applyImportedIntegration(cfg, showError);
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

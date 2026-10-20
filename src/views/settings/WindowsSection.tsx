import { useState, type KeyboardEvent } from "react";
import * as api from "../../api";
import { errorText, shortcutFailedText } from "../../i18n/errors";
import { useStore } from "../../store";
import { useT } from "../../i18n";
import { comboFromEvent } from "../../logic/shortcut";
import { Row, Section, Switch } from "./parts";

/** Click-to-record field for the global shortcut; the old shortcut stays when registering fails. */
function ShortcutField() {
  const t = useT();
  const shortcut = useStore((s) => s.config?.shortcut ?? "");
  const showToast = useStore((s) => s.showToast);
  const startupError = useStore((s) => s.shortcutError);
  const setStartupError = useStore((s) => s.setShortcutError);
  const [recording, setRecording] = useState(false);
  const [localError, setError] = useState<string | null>(null);
  const error = localError ?? (startupError ? shortcutFailedText(startupError) : null);

  const onKeyDown = async (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return setRecording(false);
    const combo = comboFromEvent(e.nativeEvent);
    if (!combo) return;
    setRecording(false);
    // The same combo is a no-op only while it is actually registered.
    if (combo === shortcut && !startupError) return setError(null);
    try {
      // The engine saves the config and emits `config-changed`: nothing to write from here.
      await api.setShortcut(combo);
      setError(null);
      setStartupError(null);
      showToast(t("settings.shortcutSaved", { combo }));
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <>
      <button
        type="button"
        className={`keyfld${recording ? " rec" : ""}${error ? " bad" : ""}`}
        aria-label={t("settings.shortcut")}
        onClick={() => { setRecording(true); setError(null); }}
        onKeyDown={(e) => void onKeyDown(e)}
        onBlur={() => setRecording(false)}
      >
        {recording ? t("settings.shortcutPress") : shortcut}
      </button>
      {error && <span className="err-text" role="alert">{error}</span>}
    </>
  );
}

export default function WindowsSection() {
  const t = useT();
  const config = useStore((s) => s.config);
  const saveConfig = useStore((s) => s.saveConfig);
  const showError = useStore((s) => s.showError);
  if (!config) return null;

  // autostart / explorer menu: the engine persists them and emits `config-changed`.
  const run = (p: Promise<void>) => p.catch(showError);

  return (
    <Section title={t("settings.windows")}>
      <Row label={t("settings.closeToTray")} hint={t("settings.closeToTrayHint")}>
        <Switch label={t("settings.closeToTray")} checked={config.closeToTray} onChange={(closeToTray) => void saveConfig({ closeToTray })} />
      </Row>
      <Row label={t("settings.autostart")} hint={t("settings.autostartHint")}>
        <Switch label={t("settings.autostart")} checked={config.autostart} onChange={(v) => void run(api.setAutostart(v))} />
      </Row>
      <Row label={t("settings.shortcut")} hint={t("settings.shortcutHint")}>
        <ShortcutField />
      </Row>
      <Row label={t("settings.explorerMenu")} hint={t("settings.explorerMenuHint")}>
        <Switch label={t("settings.explorerMenu")} checked={config.explorerMenu} onChange={(v) => void run(api.setExplorerMenu(v))} />
      </Row>
    </Section>
  );
}

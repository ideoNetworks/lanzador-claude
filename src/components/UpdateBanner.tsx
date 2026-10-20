import { useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import * as api from "../api";

/** Shown when the engine announces a new version; "Actualizar" downloads, installs and restarts. */
export default function UpdateBanner() {
  const t = useT();
  const update = useStore((s) => s.update);
  const setUpdate = useStore((s) => s.setUpdate);
  const showError = useStore((s) => s.showError);
  const [busy, setBusy] = useState(false);
  if (!update) return null;

  const install = async () => {
    setBusy(true);
    try {
      await api.updateInstall();
    } catch (e) {
      showError(e);
      setBusy(false);
    }
  };

  return (
    <div className="update-banner" role="status">
      <span>{t("update.available", { version: update.version })}</span>
      <button type="button" disabled={busy} onClick={() => void install()}>{t("update.install")}</button>
      <button type="button" disabled={busy} onClick={() => setUpdate(null)}>{t("update.later")}</button>
    </div>
  );
}

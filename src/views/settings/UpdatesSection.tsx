import { useEffect, useState } from "react";
import * as api from "../../api";
import { useStore } from "../../store";
import { useT } from "../../i18n";
import { Row, Section, Segmented } from "./parts";

type Mode = "auto" | "notify" | "manual";

/** Same rule as the engine (`action_for`): anything unknown behaves as "notify". */
export function modeOf(mode: string): Mode {
  return mode === "auto" || mode === "manual" ? mode : "notify";
}

export default function UpdatesSection() {
  const t = useT();
  const updates = useStore((s) => s.config?.updates);
  const saveConfig = useStore((s) => s.saveConfig);
  const setUpdate = useStore((s) => s.setUpdate);
  const showToast = useStore((s) => s.showToast);
  const showError = useStore((s) => s.showError);
  const [checking, setChecking] = useState(false);
  const [endpoint, setEndpoint] = useState(updates?.endpoint ?? "");
  useEffect(() => setEndpoint(updates?.endpoint ?? ""), [updates?.endpoint]);
  if (!updates) return null;

  const commit = () => {
    const v = endpoint.trim();
    if ((v || null) !== (updates.endpoint ?? null)) void saveConfig({ updates: { ...updates, endpoint: v || null } });
  };

  // Works in every mode (the only way to update in "manual"): shows the banner, never installs.
  const check = async () => {
    setChecking(true);
    try {
      const u = await api.updateCheck();
      if (u) setUpdate(u);
      else showToast(t("settings.upToDate"));
    } catch (e) {
      showError(e);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Section title={t("settings.updates")}>
      <Row label={t("settings.updatesMode")}>
        <Segmented<Mode>
          label={t("settings.updatesMode")}
          value={modeOf(updates.mode)}
          onChange={(mode) => void saveConfig({ updates: { ...updates, mode } })}
          options={[
            { id: "auto", label: t("settings.modeAuto") },
            { id: "notify", label: t("settings.modeNotify") },
            { id: "manual", label: t("settings.modeManual") },
          ]}
        />
      </Row>
      <Row label={t("settings.checkNow")} hint={t("settings.checkNowHint")}>
        <button className="btn" disabled={checking} onClick={() => void check()}>
          {checking ? t("settings.checking") : t("settings.checkUpdates")}
        </button>
      </Row>
      <Row label={t("settings.endpoint")} hint={t("settings.endpointHint")} stack>
        <div className="fld-row">
          <input
            type="text"
            value={endpoint}
            spellCheck={false}
            placeholder="https://…/latest.json"
            aria-label={t("settings.endpoint")}
            onChange={(e) => setEndpoint(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        </div>
      </Row>
    </Section>
  );
}

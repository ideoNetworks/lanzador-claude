import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { useT } from "../../i18n";
import { Row, Section, Segmented } from "./parts";

type Mode = "auto" | "notify" | "manual";

export default function UpdatesSection() {
  const t = useT();
  const updates = useStore((s) => s.config?.updates);
  const saveConfig = useStore((s) => s.saveConfig);
  const [endpoint, setEndpoint] = useState(updates?.endpoint ?? "");
  useEffect(() => setEndpoint(updates?.endpoint ?? ""), [updates?.endpoint]);
  if (!updates) return null;

  const commit = () => {
    const v = endpoint.trim();
    if ((v || null) !== (updates.endpoint ?? null)) void saveConfig({ updates: { ...updates, endpoint: v || null } });
  };

  return (
    <Section title={t("settings.updates")}>
      <Row label={t("settings.updatesMode")}>
        <Segmented<Mode>
          label={t("settings.updatesMode")}
          value={updates.mode === "notify" || updates.mode === "manual" ? updates.mode : "auto"}
          onChange={(mode) => void saveConfig({ updates: { ...updates, mode } })}
          options={[
            { id: "auto", label: t("settings.modeAuto") },
            { id: "notify", label: t("settings.modeNotify") },
            { id: "manual", label: t("settings.modeManual") },
          ]}
        />
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

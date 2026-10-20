import { useEffect, useState } from "react";
import * as api from "../../api";
import { useStore } from "../../store";
import { useT } from "../../i18n";
import { icons } from "../../components/icons";
import { Row, Section } from "./parts";

export const TOKEN_KEY = "SKILLS_REPO_TOKEN";

export default function SkillsSection() {
  const t = useT();
  const url = useStore((s) => s.config?.skillsRepoUrl);
  const saveConfig = useStore((s) => s.saveConfig);
  const showToast = useStore((s) => s.showToast);
  const showError = useStore((s) => s.showError);
  const [draft, setDraft] = useState(url ?? "");
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => setDraft(url ?? ""), [url]);
  useEffect(() => {
    let alive = true;
    api.secretHas(TOKEN_KEY).then((v) => alive && setHasToken(v), () => {});
    return () => { alive = false; };
  }, []);

  if (url === undefined) return null;

  /** Resolves false when the URL could not be saved (the error is already shown). */
  const commitUrl = async (): Promise<boolean> => {
    const v = draft.trim();
    return v === url ? true : saveConfig({ skillsRepoUrl: v });
  };

  const saveToken = async () => {
    if (!token) return;
    try {
      await api.secretSet(TOKEN_KEY, token);
      setToken("");
      setHasToken(true);
      showToast(t("toast.secretSaved"));
    } catch (e) {
      showError(e);
    }
  };

  const deleteToken = async () => {
    try {
      await api.secretDelete(TOKEN_KEY);
      setHasToken(false);
      showToast(t("settings.tokenDeleted"));
    } catch (e) {
      showError(e);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      // The engine reads the URL from config.json: it must be saved before syncing.
      if (!(await commitUrl())) return;
      await api.skillsSync();
      showToast(t("settings.synced"));
    } catch (e) {
      showError(e);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Section title={t("settings.skills")}>
      <Row label={t("settings.repoUrl")} stack>
        <div className="fld-row">
          <input
            type="text"
            value={draft}
            spellCheck={false}
            placeholder="https://github.com/…"
            aria-label={t("settings.repoUrl")}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commitUrl()}
            onKeyDown={(e) => e.key === "Enter" && void commitUrl()}
          />
          <button className="btn" disabled={syncing} onClick={() => void sync()}>
            {icons.refresh}
            {syncing ? t("settings.syncing") : t("settings.syncNow")}
          </button>
        </div>
      </Row>
      <Row label={t("settings.repoToken")} stack>
        <div className="fld-row">
          <input
            type="password"
            value={token}
            autoComplete="off"
            placeholder={hasToken ? t("settings.tokenSaved") : t("settings.tokenPlaceholder")}
            aria-label={t("settings.repoToken")}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void saveToken()}
          />
          <button className="btn" disabled={!token} onClick={() => void saveToken()}>{t("settings.tokenSave")}</button>
          {hasToken && <button className="btn danger" onClick={() => void deleteToken()}>{t("settings.tokenDelete")}</button>}
        </div>
      </Row>
    </Section>
  );
}

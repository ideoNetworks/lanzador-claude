import { useCallback, useEffect, useState } from "react";
import * as api from "../api";
import type { InstalledSkill, SkillInfo } from "../api";
import { useStore } from "../store";
import { useT } from "../i18n";
import { icons } from "../components/icons";

export default function SkillsView() {
  const t = useT();
  const repoUrl = useStore((s) => s.config?.skillsRepoUrl);
  const selectedPath = useStore((s) => s.selectedPath);
  const setView = useStore((s) => s.setView);
  const showToast = useStore((s) => s.showToast);
  const showError = useStore((s) => s.showError);

  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [target, setTarget] = useState<"project" | "global">("project");
  const [syncing, setSyncing] = useState(false);
  const [installing, setInstalling] = useState(false);

  const loadSkills = useCallback(async () => {
    try { setSkills(await api.skillsList()); } catch { setSkills([]); }
  }, []);
  const loadInstalled = useCallback(async () => {
    if (!selectedPath) return setInstalled([]);
    try { setInstalled(await api.skillsInstalled(selectedPath)); } catch { setInstalled([]); }
  }, [selectedPath]);

  useEffect(() => { if (repoUrl) void loadSkills(); else setSkills([]); }, [repoUrl, loadSkills]);
  useEffect(() => { void loadInstalled(); }, [loadInstalled]);

  if (repoUrl === undefined) return null;

  const toProject = target === "project";
  const path = toProject ? selectedPath : null;
  const canInstall = chosen.length > 0 && (!toProject || !!selectedPath) && !installing;

  const sync = async () => {
    setSyncing(true);
    try {
      await api.skillsSync();
      showToast(t("settings.synced"));
      await loadSkills();
      await loadInstalled();
    } catch (e) {
      showError(e);
    } finally {
      setSyncing(false);
    }
  };

  const install = async (names: string[], toast: string) => {
    setInstalling(true);
    try {
      await api.skillsInstall(path, names);
      showToast(toast);
      setChosen([]);
      await loadInstalled();
    } catch (e) {
      showError(e);
    } finally {
      setInstalling(false);
    }
  };

  const update = async (name: string) => {
    setInstalling(true);
    try {
      await api.skillsInstall(selectedPath, [name]);
      showToast(t("skills.updatedOk"));
      await loadInstalled();
    } catch (e) {
      showError(e);
    } finally {
      setInstalling(false);
    }
  };

  const toggle = (name: string, on: boolean) => setChosen((c) => (on ? [...c, name] : c.filter((n) => n !== name)));
  const isInstalled = (name: string) => installed.some((i) => i.name === name);

  return (
    <section className="view">
      <div className="view-head">
        <div className="grow">
          <h2>{t("skills.title")}</h2>
          <p>{t("skills.subtitle")}</p>
        </div>
        {repoUrl && (
          <button className="btn" disabled={syncing} onClick={() => void sync()}>
            {icons.refresh}
            {syncing ? t("skills.syncing") : t("skills.sync")}
          </button>
        )}
      </div>

      {!repoUrl ? (
        <div className="empty">
          <p>{t("skills.noRepo")}</p>
          <button className="link" onClick={() => setView("settings")}>{t("skills.configureRepo")}</button>
        </div>
      ) : (
        <>
          <div className="repo-line">
            <span className="hint">{t("skills.repo")}</span>
            <span className="repo-url" title={repoUrl}>{repoUrl}</span>
          </div>

          <div className="sec">
            <h3>{t("skills.available")}</h3>
            {skills.length === 0 ? (
              <div className="sec-empty">{t("skills.none")}</div>
            ) : (
              <ul className="sk-rows">
                {skills.map((s) => (
                  <li key={s.name}>
                    <label className="chk sk">
                      <input type="checkbox" checked={chosen.includes(s.name)} onChange={(e) => toggle(s.name, e.target.checked)} />
                      <span><b>{s.name}</b><small>{s.description}</small></span>
                    </label>
                    {isInstalled(s.name) && <span className="badge">{t("skills.upToDate")}</span>}
                  </li>
                ))}
              </ul>
            )}
            <div className="sec-foot">
              <fieldset className="radios inline">
                <legend>{t("skills.target")}</legend>
                <label className="chk"><input type="radio" name="target" checked={toProject} onChange={() => setTarget("project")} /><span>{t("skills.targetProject")}</span></label>
                <label className="chk"><input type="radio" name="target" checked={!toProject} onChange={() => setTarget("global")} /><span>{t("skills.targetGlobal")}</span></label>
              </fieldset>
              <span className="grow" />
              <button className="btn pri" disabled={!canInstall} onClick={() => void install(chosen, t("skills.installedOk"))}>
                {installing ? t("skills.installing") : t("skills.install")}
              </button>
            </div>
            {toProject && (
              <div className="sec-note">
                {selectedPath ? <span className="mono" title={selectedPath}>{selectedPath}</span> : <span className="hint">{t("skills.noProject")}</span>}
              </div>
            )}
          </div>
        </>
      )}

      {selectedPath && (
        <div className="sec">
          <h3>{t("skills.installed", { n: installed.length })}</h3>
          <div className="sec-note"><span className="mono" title={selectedPath}>{t("skills.installedFor", { path: selectedPath })}</span></div>
          {installed.length === 0 ? (
            <div className="sec-empty">{t("skills.noneInstalled")}</div>
          ) : (
            <ul className="sk-rows">
              {installed.map((i) => (
                <li key={i.name}>
                  <span className="sk-name"><b>{i.name}</b></span>
                  <span className="grow" />
                  {i.updateAvailable ? (
                    <>
                      <span className="badge warn">{t("skills.updateAvailable")}</span>
                      <button className="btn sm" disabled={installing} onClick={() => void update(i.name)}>{t("skills.update")}</button>
                    </>
                  ) : (
                    <span className="badge">{t("skills.upToDate")}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

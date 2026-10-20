import { useState } from "react";
import * as api from "../api";
import type { HistoryEntry } from "../api";
import { useStore } from "../store";
import { getLanguage, useT } from "../i18n";
import { icons } from "../components/icons";
import { profileName } from "../components/OptionsPanel";

const LOCALES: Record<string, string> = { es: "es-ES", en: "en-GB", zh: "zh-CN" };

export function formatWhen(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(LOCALES[lang] ?? lang, { dateStyle: "short", timeStyle: "short" }).format(d);
}

export default function HistoryView() {
  const t = useT();
  const lang = getLanguage();
  const config = useStore((s) => s.config);
  const saveConfig = useStore((s) => s.saveConfig);
  const launchRequest = useStore((s) => s.launchRequest);
  const launching = useStore((s) => s.launching);
  const showError = useStore((s) => s.showError);
  const [confirm, setConfirm] = useState(false);

  if (!config) return null;
  const history = config.history;

  const profileOf = (e: HistoryEntry) => {
    if (!e.profile) return t("history.noProfile");
    const p = config.profiles.find((x) => x.id === e.profile);
    return p ? profileName(p, t) : e.profile;
  };

  const relaunch = async (e: HistoryEntry) => {
    const req = { path: e.path, target: e.target, selection: { ...e.selection }, resumeId: null };
    let preview: string;
    try {
      preview = await api.buildCommand(req);
    } catch (err) {
      return showError(err);
    }
    await launchRequest(req, preview);
  };

  return (
    <section className="view">
      <div className="view-head">
        <div className="grow">
          <h2>{t("history.title")}</h2>
          {history.length > 0 && <p>{t("history.count", { n: history.length })}</p>}
        </div>
        {history.length > 0 &&
          (confirm ? (
            <div className="inl">
              <span>{t("history.clearAsk")}</span>
              <button className="btn sm danger fill" onClick={() => { void saveConfig({ history: [] }); setConfirm(false); }}>{t("history.clearYes")}</button>
              <button className="btn sm" onClick={() => setConfirm(false)}>{t("common.cancel")}</button>
            </div>
          ) : (
            <button className="btn" onClick={() => setConfirm(true)}>{t("history.clear")}</button>
          ))}
      </div>

      {history.length === 0 ? (
        <div className="empty">{t("history.empty")}</div>
      ) : (
        <div className="hist-wrap">
          <table className="hist">
            <colgroup>
              <col className="c-when" />
              <col />
              <col className="c-prof" />
              <col className="c-tgt" />
              <col className="c-act" />
            </colgroup>
            <thead>
              <tr>
                <th>{t("history.date")}</th>
                <th>{t("history.folder")} · {t("history.command")}</th>
                <th>{t("history.profile")}</th>
                <th>{t("history.target")}</th>
                <th aria-label={t("history.relaunch")} />
              </tr>
            </thead>
            <tbody>
              {history.map((e, i) => (
                <tr key={`${e.at}-${i}`}>
                  <td className="when">{formatWhen(e.at, lang)}</td>
                  <td className="where">
                    <div className="dir" title={e.path}>{e.path}</div>
                    <div className="cmd-cell" title={e.preview}>{e.preview}</div>
                  </td>
                  <td>{profileOf(e)}</td>
                  <td>{t(`target.${e.target}`)}</td>
                  <td className="act">
                    <button className="btn sm" disabled={launching} onClick={() => void relaunch(e)} title={t("history.relaunch")} aria-label={t("history.relaunch")}>
                      {icons.resume}
                      <span className="lbl">{t("history.relaunch")}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

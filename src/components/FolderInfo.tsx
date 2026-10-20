import { useEffect, useState } from "react";
import * as api from "../api";
import type { FolderInfo as Info, SessionSummary } from "../api";
import { useStore } from "../store";
import { getLanguage, useT } from "../i18n";
import { relativeTime } from "../logic/time";
import ContextMenu from "./ContextMenu";
import { icons } from "./icons";

const NONE: string[] = [];

/** Folder card: path, sessions, git branch, CLAUDE.md, skills, Continue last / Resume…. */
export default function FolderInfo() {
  const t = useT();
  const lang = getLanguage();
  const path = useStore((s) => s.selectedPath);
  const favorites = useStore((s) => s.config?.favorites) ?? NONE;
  const lastLaunch = useStore((s) => s.config?.history[0]?.at);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const launchNow = useStore((s) => s.launchNow);
  const launching = useStore((s) => s.launching);
  const showError = useStore((s) => s.showError);
  const [info, setInfo] = useState<Info | null>(null);
  const [sessions, setSessions] = useState<{ x: number; y: number; list: SessionSummary[] } | null>(null);
  const [tick, setTick] = useState(0);

  // Refresh when the window regains focus (Claude may have written new sessions meanwhile).
  useEffect(() => {
    const f = () => setTick((n) => n + 1);
    window.addEventListener("focus", f);
    return () => window.removeEventListener("focus", f);
  }, []);

  useEffect(() => {
    if (!path) return setInfo(null);
    let alive = true;
    api.folderInfo(path).then((i) => alive && setInfo(i), (e) => alive && showError(e));
    return () => {
      alive = false;
    };
  }, [path, tick, lastLaunch, showError]);

  if (!path) {
    return (
      <div className="info empty">
        <span className="info-ic">{icons.folder}</span>
        <div>
          <div className="ttl">{t("info.none")}</div>
          <div className="sub">{t("info.noneSub")}</div>
        </div>
      </div>
    );
  }

  const fav = favorites.some((f) => f.toLowerCase() === path.toLowerCase());
  const current = info && info.path === path ? info : null;
  const hasSessions = !!current && current.sessionsCount > 0;

  const openResume = async (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    try {
      const list = await api.listSessions(path);
      setSessions({ x: r.left, y: r.bottom + 4, list });
    } catch (err) {
      showError(err);
    }
  };

  return (
    <div className="info">
      <button
        className={`ibtn favbtn${fav ? " on" : ""}`}
        onClick={() => toggleFavorite(path)}
        aria-label={fav ? t("tree.favRemove") : t("tree.favAdd")}
        title={fav ? t("tree.favRemove") : t("tree.favAdd")}
        aria-pressed={fav}
      >
        {fav ? icons.star : icons.starOff}
      </button>
      <div className="info-main">
        <div className="p">{path}</div>
        <div className="sub">
          {current && !current.exists
            ? t("info.missing")
            : hasSessions && current.lastSessionAt
              ? t(current.sessionsCount === 1 ? "info.lastOne" : "info.last", { when: relativeTime(current.lastSessionAt, lang), n: current.sessionsCount })
              : t("info.noSessions")}
        </div>
      </div>
      {current && !current.exists && <span className="badge warn">{icons.warn}{t("info.missing")}</span>}
      {current?.gitBranch && <span className="badge ok" title={t("info.branch")}>{icons.branch}{current.gitBranch}</span>}
      {current?.exists && <span className={`badge${current.hasClaudeMd ? " ok" : ""}`}>{current.hasClaudeMd ? t("info.claudeMd") : t("info.noClaudeMd")}</span>}
      {current?.exists && <span className="badge">{t("info.skills", { n: current.skillsCount })}</span>}
      <div className="info-act">
        <button className="ibtn" onClick={() => void api.openExplorer(path).catch(showError)} aria-label={t("tree.openExplorer")} title={t("tree.openExplorer")}>
          {icons.open}
        </button>
        {hasSessions && (
          <>
            <button className="btn" disabled={launching} onClick={() => void launchNow({ extra: { "flag.continue": null } })}>
              {icons.resume}
              {t("info.continue")}
            </button>
            <button className="btn" disabled={launching} onClick={(e) => void openResume(e)} aria-haspopup="menu">
              {t("info.resume")}
              {icons.down}
            </button>
          </>
        )}
      </div>
      {sessions && (
        <ContextMenu
          x={sessions.x}
          y={sessions.y}
          label={t("info.resumeTitle")}
          empty={t("info.resumeEmpty")}
          onClose={() => setSessions(null)}
          items={sessions.list.map((s) => ({
            label: s.title || t("info.untitled"),
            sub: `${relativeTime(s.modifiedAt, lang)} · ${s.id.slice(0, 8)}`,
            icon: icons.history,
            onSelect: () => void launchNow({ resumeId: s.id }),
          }))}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import type { Profile } from "../api";
import { useStore } from "../store";
import { useT } from "../i18n";
import { applyProfile } from "../logic/selection";
import { createProfile, nameTaken, removeProfile, renameProfile } from "../logic/profiles";
import { profileName } from "../components/OptionsPanel";

type Mode = { kind: "rename"; id: string; name: string } | { kind: "delete"; id: string } | null;

export default function ProfilesView() {
  const t = useT();
  const config = useStore((s) => s.config);
  const opt = useStore((s) => s.opt);
  const target = useStore((s) => s.target);
  const selectedPath = useStore((s) => s.selectedPath);
  const saveConfig = useStore((s) => s.saveConfig);
  const updateOpt = useStore((s) => s.updateOpt);
  const setTarget = useStore((s) => s.setTarget);
  const setView = useStore((s) => s.setView);
  const showToast = useStore((s) => s.showToast);
  const showError = useStore((s) => s.showError);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>(null);

  if (!config) return null;
  const { profiles, activeProfile } = config;
  const nameOf = (p: Profile) => profileName(p, t);
  const activeCount = Object.keys(opt.active).length;

  const create = () => {
    const n = name.trim();
    if (!n) return;
    if (nameTaken(profiles, n, nameOf)) return showError({ code: "already_exists", message: n });
    const p = createProfile(n, opt.active, target);
    void saveConfig({ profiles: [...profiles, p], activeProfile: p.id });
    showToast(t("profiles.created", { name: n }));
    setName("");
    setCreating(false);
  };

  const apply = (p: Profile) => {
    updateOpt(applyProfile(opt, p));
    setTarget(p.target);
    void saveConfig({ activeProfile: p.id });
    showToast(t("profiles.applied", { name: nameOf(p) }));
    setView("launch");
  };

  const rename = (id: string, value: string) => {
    const n = value.trim();
    if (!n) return;
    if (nameTaken(profiles, n, nameOf, id)) return showError({ code: "already_exists", message: n });
    void saveConfig({ profiles: renameProfile(profiles, id, n) });
    setMode(null);
  };

  const remove = (id: string) => {
    const next = removeProfile(config, id);
    if (next) void saveConfig(next);
    setMode(null);
  };

  /** Pins the profile's options in the selected project (settings.local.json or its launcher options). */
  const applyToProject = (p: Profile) => {
    if (!selectedPath) return;
    const s = useStore.getState();
    s.setScope("project");
    const cur = useStore.getState().opt;
    updateOpt({ active: { ...cur.active, ...p.selection }, pinned: { ...cur.pinned, ...p.selection } });
    setTarget(p.target);
    void useStore.getState().flushPinned();
    void saveConfig({ activeProfile: p.id });
    showToast(t("profiles.appliedProject", { name: nameOf(p), path: selectedPath }));
    setView("launch");
  };

  return (
    <section className="view">
      <div className="view-head">
        <div className="grow">
          <h2>{t("profiles.title")}</h2>
          <p>{t("profiles.intro")}</p>
        </div>
        {!creating && (
          <button className="btn pri" onClick={() => setCreating(true)}>{t("profiles.newBtn")}</button>
        )}
      </div>

      {!selectedPath && profiles.length > 0 && <p className="hint">{t("profiles.projectNone")}</p>}

      {creating && (
        <form className="newbox" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <h3>{t("profiles.newTitle")}</h3>
          <div className="inl">
            <input
              autoFocus
              type="text"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (setCreating(false), setName(""))}
              placeholder={t("profiles.newName")}
              aria-label={t("profiles.newName")}
            />
            <button type="submit" className="btn pri sm" disabled={!name.trim()}>{t("profiles.create")}</button>
            <button type="button" className="btn sm" onClick={() => { setCreating(false); setName(""); }}>{t("common.cancel")}</button>
          </div>
          <span className="hint">{t("profiles.fromNow", { n: activeCount, target: t(`target.${target}`) })}</span>
        </form>
      )}

      {profiles.length === 0 && <div className="empty">{t("profiles.empty")}</div>}
      <ul className="cards">
        {profiles.map((p) => {
          const renaming = mode?.kind === "rename" && mode.id === p.id ? mode : null;
          const deleting = mode?.kind === "delete" && mode.id === p.id;
          return (
            <li key={p.id} className={`card${activeProfile === p.id ? " on" : ""}`}>
              <div className="card-top">
                {renaming ? (
                  <form className="inl" onSubmit={(e) => { e.preventDefault(); rename(p.id, renaming.name); }}>
                    <input
                      autoFocus
                      type="text"
                      value={renaming.name}
                      maxLength={60}
                      onChange={(e) => setMode({ kind: "rename", id: p.id, name: e.target.value })}
                      onKeyDown={(e) => e.key === "Escape" && setMode(null)}
                      aria-label={t("profiles.rename")}
                    />
                    <button type="submit" className="btn pri sm" disabled={!renaming.name.trim()}>{t("common.save")}</button>
                    <button type="button" className="btn sm" onClick={() => setMode(null)}>{t("common.cancel")}</button>
                  </form>
                ) : (
                  <span className="card-name">{nameOf(p)}</span>
                )}
                {p.builtin && <span className="badge" title={t("profiles.builtinNote")}>{t("profiles.builtinBadge")}</span>}
                {activeProfile === p.id && <span className="badge pri">{t("profiles.active")}</span>}
                <span className="card-sum">{t("profiles.summary", { n: Object.keys(p.selection).length, target: t(`target.${p.target}`) })}</span>
                {!renaming && (
                  <div className="card-act">
                    {deleting ? (
                      <>
                        <span>{t("profiles.deleteAsk", { name: nameOf(p) })}</span>
                        <button className="btn sm danger fill" onClick={() => remove(p.id)}>{t("profiles.deleteYes")}</button>
                        <button className="btn sm" onClick={() => setMode(null)}>{t("common.cancel")}</button>
                      </>
                    ) : (
                      <>
                        <button className="btn pri sm" onClick={() => apply(p)}>{t("profiles.apply")}</button>
                        <button className="btn sm" disabled={!selectedPath} title={selectedPath ? selectedPath : t("profiles.projectNone")} onClick={() => applyToProject(p)}>{t("profiles.applyProject")}</button>
                        {!p.builtin && (
                          <>
                            <button className="btn sm" onClick={() => setMode({ kind: "rename", id: p.id, name: p.name })}>{t("profiles.rename")}</button>
                            <button className="btn sm danger" onClick={() => setMode({ kind: "delete", id: p.id })}>{t("profiles.delete")}</button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

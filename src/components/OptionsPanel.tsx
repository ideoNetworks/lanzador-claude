import { useState } from "react";
import type { Profile, Target } from "../api";
import { useStore } from "../store";
import { getLanguage, hasKey, useT } from "../i18n";
import { applyProfile, countByKind } from "../logic/selection";
import { filterOptions, groupItems, sameSelection } from "../logic/options";
import { resolvePrefs } from "../logic/projects";
import { baseName } from "../logic/tree";
import OptionRow from "./OptionRow";
import { icons } from "./icons";

const TARGETS: Target[] = ["wt", "powershell", "wsl"];
const NO_PROFILES: Profile[] = [];
const NO_FILES: string[] = [];

export const profileName = (p: Profile, t: (k: string) => string) =>
  p.builtin && hasKey(`profiles.builtin.${p.id}`) ? t(`profiles.builtin.${p.id}`) : p.name;

/** Inline "Save as profile…" form (no window.prompt). */
function SaveProfile({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const config = useStore((s) => s.config);
  const active = useStore((s) => s.opt.active);
  const target = useStore((s) => s.target);
  const saveConfig = useStore((s) => s.saveConfig);
  const showToast = useStore((s) => s.showToast);
  const showError = useStore((s) => s.showError);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || !config) return;
    if (config.profiles.some((p) => profileName(p, t).toLowerCase() === n.toLowerCase())) return showError({ code: "already_exists", message: n });
    const p: Profile = { id: `user-${Date.now().toString(36)}`, name: n, builtin: false, selection: { ...active }, target };
    void saveConfig({ profiles: [...config.profiles, p], activeProfile: p.id });
    showToast(t("opts.profileSaved", { name: n }));
    onDone();
  };

  return (
    <form className="saveprof" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onDone()}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("opts.profileName")} aria-label={t("opts.profileName")} maxLength={60} />
      <button className="btn sm pri" type="submit" disabled={!name.trim()}>{t("common.save")}</button>
      <button className="btn sm" type="button" onClick={onDone}>{t("common.cancel")}</button>
    </form>
  );
}

/** Whose options are shown and saved (this project / the defaults), with their status. */
function ScopeBar() {
  const t = useT();
  const scope = useStore((s) => s.scope);
  const setScope = useStore((s) => s.setScope);
  const path = useStore((s) => s.selectedPath);
  const projects = useStore((s) => s.config?.projects);
  const broken = useStore((s) => (s.projectFile && s.projectFile.path === s.selectedPath ? s.projectFile.settings.broken : NO_FILES));
  const resetProjectOptions = useStore((s) => s.resetProjectOptions);
  const useAsDefaults = useStore((s) => s.useAsDefaults);
  const showToast = useStore((s) => s.showToast);
  const resolved = path ? resolvePrefs(projects ?? {}, path) : null;
  const status =
    scope === "defaults" ? t("scope.defaultsNote")
      : !resolved ? t("scope.usingDefaults")
        : resolved.own ? t("scope.own") : t("scope.inherited", { name: baseName(resolved.key) });
  const files = broken.map((b) => (b === "user" ? "~/.claude/settings.json" : b === "local" ? ".claude/settings.local.json" : ".claude/settings.json"));

  return (
    <>
      <div className="scopebar">
        <span className="scope-lbl">{t("scope.label")}</span>
        <div className="seg" role="radiogroup" aria-label={t("scope.label")}>
          <button type="button" role="radio" aria-checked={scope === "project"} disabled={!path} title={path ? undefined : t("scope.noPath")} onClick={() => setScope("project")}>
            {t("scope.project")}
          </button>
          <button type="button" role="radio" aria-checked={scope === "defaults"} onClick={() => setScope("defaults")}>
            {t("scope.defaults")}
          </button>
        </div>
        <span className={`scope-st${scope === "project" && resolved?.own ? " own" : ""}`}>{status}</span>
        {scope === "project" && resolved?.own && (
          <button className="lnk" title={t("scope.resetTip")} onClick={() => void resetProjectOptions().then(() => showToast(t("scope.resetDone")))}>
            {t("scope.reset")}
          </button>
        )}
        {scope === "project" && (
          <button className="lnk" title={t("scope.useAsDefaultTip")} onClick={() => void useAsDefaults().then(() => showToast(t("scope.defaultsSaved")))}>
            {t("scope.useAsDefault")}
          </button>
        )}
      </div>
      {scope === "project" && files.length > 0 && (
        <div className="scope-warn" role="alert">{icons.warn}{t("opts.broken", { files: files.join(", ") })}</div>
      )}
    </>
  );
}

/** Tabs (flags / env vars), target and profile selectors, grouped option rows. */
export default function OptionsPanel() {
  const t = useT();
  const lang = getLanguage();
  const catalog = useStore((s) => s.catalog);
  const opt = useStore((s) => s.opt);
  const target = useStore((s) => s.target);
  const setTarget = useStore((s) => s.setTarget);
  const updateOpt = useStore((s) => s.updateOpt);
  const profiles = useStore((s) => s.config?.profiles) ?? NO_PROFILES;
  const activeProfile = useStore((s) => s.config?.activeProfile ?? null);
  const saveConfig = useStore((s) => s.saveConfig);
  const [tab, setTab] = useState<"flag" | "env">("flag");
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  const current = profiles.find((p) => p.id === activeProfile);
  const modified = !!current && !sameSelection(opt.active, current.selection);
  const items = filterOptions(catalog.filter((c) => c.kind === tab), filter, lang);
  const groups = groupItems(items);

  const pickProfile = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    if (p) {
      updateOpt(applyProfile(opt, p));
      setTarget(p.target);
    }
    void saveConfig({ activeProfile: p ? p.id : null });
  };

  const tabBtn = (k: "flag" | "env", label: string) => (
    <button role="tab" aria-selected={tab === k} className={`tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
      {label}
      <span className="n">{countByKind(opt.active, catalog, k)}</span>
    </button>
  );

  return (
    <>
      <ScopeBar />
      <div className="tabs">
        <div role="tablist" className="tablist">
          {tabBtn("flag", t("opts.tabFlags"))}
          {tabBtn("env", t("opts.tabEnv"))}
        </div>
        <label className="target">
          {t("opts.target")}
          <select className="sel2" value={target} onChange={(e) => setTarget(e.target.value as Target)}>
            {TARGETS.map((x) => <option key={x} value={x}>{t(`target.${x}`)}</option>)}
          </select>
        </label>
      </div>
      <div className="prof">
        <label className="prof-sel">
          {t("opts.profile")}:
          <select className="sel2" value={current ? current.id : ""} onChange={(e) => pickProfile(e.target.value)}>
            {!current && <option value="">{t("opts.custom")}</option>}
            {profiles.map((p) => <option key={p.id} value={p.id}>{profileName(p, t)}</option>)}
          </select>
        </label>
        {modified && <span className="badge mod">{t("opts.modified")}</span>}
        {saving ? <SaveProfile onDone={() => setSaving(false)} /> : <button className="lnk" onClick={() => setSaving(true)}>{t("opts.saveProfile")}</button>}
        <label className="filter">
          {icons.filter}
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("opts.filter")} aria-label={t("opts.filter")} spellCheck={false} />
          {filter && <button className="ibtn sm" onClick={() => setFilter("")} aria-label={t("common.close")}>{icons.x}</button>}
        </label>
      </div>
      <div className="opts" role="tabpanel" aria-label={t("opts.list")}>
        {groups.length === 0 && <div className="opts-empty">{catalog.length ? t("opts.noMatch") : t("common.loading")}</div>}
        {groups.map(([g, list]) => (
          <section key={g} aria-label={t(`group.${g}`)}>
            <div className="grp">{t(`group.${g}`)}</div>
            {list.map((item) => <OptionRow key={item.id} item={item} lang={lang} />)}
          </section>
        ))}
      </div>
    </>
  );
}

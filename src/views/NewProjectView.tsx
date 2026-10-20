import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import * as api from "../api";
import type { CreateResult, NewProjectRequest, SkillInfo, TemplateInfo } from "../api";
import { useStore } from "../store";
import { useT } from "../i18n";
import { icons } from "../components/icons";
import { nameError, warningText } from "../logic/project";

const STEPS = ["name", "template", "skills", "options"] as const;
const joinPath = (parent: string, name: string) => `${parent.replace(/[\\/]+$/, "")}\\${name.trim()}`;

export default function NewProjectView() {
  const t = useT();
  const config = useStore((s) => s.config);
  const setView = useStore((s) => s.setView);
  const selectPath = useStore((s) => s.selectPath);
  const launchWithPreview = useStore((s) => s.launchWithPreview);
  const showError = useStore((s) => s.showError);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateInfo[]>([{ id: "default", name: "default" }]);
  const [template, setTemplate] = useState("default");
  const [description, setDescription] = useState("");
  const [stack, setStack] = useState("");
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [scope, setScope] = useState<"project" | "global">("project");
  const [gitInit, setGitInit] = useState(true);
  const [gitignore, setGitignore] = useState(true);
  const [notifyHook, setNotifyHook] = useState(true);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);

  const repoUrl = config?.skillsRepoUrl ?? "";
  const parentDir = parent ?? config?.rootFolder ?? "";

  useEffect(() => {
    let alive = true;
    api.templatesList().then((l) => alive && l.length > 0 && setTemplates(l), () => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!repoUrl) return void setSkills([]);
    let alive = true;
    api.skillsList().then((l) => alive && setSkills(l), () => alive && setSkills([]));
    return () => { alive = false; };
  }, [repoUrl]);

  if (!config) return null;

  const tplName = (tp: TemplateInfo) => (tp.id === "default" ? t("wizard.templateDefault") : tp.name);
  const shownNameErr = nameErr ? t(`errors.${nameErr}`) : null;

  const pickParent = async () => {
    try {
      const dir = await open({ directory: true, multiple: false, defaultPath: parentDir, title: t("wizard.pickParent") });
      if (typeof dir === "string") { setParent(dir); setNameErr(null); }
    } catch (e) { showError(e); }
  };

  const next = () => {
    if (step === 0) {
      const err = nameError(name);
      if (err) return setNameErr(err);
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const create = async () => {
    const err = nameError(name);
    if (err) { setNameErr(err); return setStep(0); }
    const req: NewProjectRequest = {
      parent: parentDir, name: name.trim(), template: template === "default" ? null : template, description: description.trim(), stack: stack.trim(),
      skills: chosen, skillsScope: scope, gitInit, gitignore, notifyHook,
    };
    setCreating(true);
    try {
      setResult(await api.createProject(req));
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      if (code === "invalid_name" || code === "already_exists") {
        setNameErr(code);
        setStep(0);
      } else showError(e);
    } finally {
      setCreating(false);
    }
  };

  const reset = () => {
    setResult(null); setStep(0); setName(""); setNameErr(null); setDescription(""); setStack(""); setChosen([]); setTemplate("default");
  };

  if (result) {
    return (
      <section className="view">
        <div className="card wiz">
          <div className="done-head">
            <span className="done-ico">{icons.ok}</span>
            <div className="grow">
              <h2>{t("wizard.doneTitle")}</h2>
              <div className="done-path" title={result.path}>{result.path}</div>
            </div>
          </div>
          {result.warnings.length > 0 && (
            <div className="warns">
              <h3>{icons.warn}{t("wizard.doneWarnings")}</h3>
              <ul>{result.warnings.map((w, i) => <li key={i}>{warningText(w)}</li>)}</ul>
            </div>
          )}
          <div className="wiz-nav">
            <button className="btn" onClick={reset}>{t("wizard.another")}</button>
            <span className="grow" />
            <button className="btn" onClick={() => { selectPath(result.path); setView("launch"); }}>{icons.folder}{t("wizard.showTree")}</button>
            <button className="btn pri" onClick={() => { selectPath(result.path); setView("launch"); void launchWithPreview({}); }}>{icons.play}{t("wizard.openNow")}</button>
          </div>
        </div>
      </section>
    );
  }

  const last = step === STEPS.length - 1;
  return (
    <section className="view">
      <div className="view-head">
        <div className="grow">
          <h2>{t("wizard.title")}</h2>
          <p>{t("wizard.subtitle")}</p>
        </div>
      </div>

      <ol className="stepper" aria-label={t("wizard.title")}>
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
            <span className="dot">{i < step ? icons.ok : i + 1}</span>
            <span className="lbl">{t(`wizard.steps.${s}`)}</span>
          </li>
        ))}
      </ol>

      <div className="card wiz">
        {step === 0 && (
          <>
            <label className="field">
              <span>{t("wizard.name")}</span>
              <input
                type="text" className="fld" autoFocus spellCheck={false} value={name} placeholder={t("wizard.namePh")}
                aria-invalid={!!nameErr}
                onChange={(e) => { setName(e.target.value); setNameErr(null); }}
                onKeyDown={(e) => e.key === "Enter" && next()}
              />
              {shownNameErr && <span className="err-text" role="alert">{shownNameErr}</span>}
            </label>
            <div className="field">
              <span>{t("wizard.parent")}</span>
              <div className="fld-row">
                <div className="path-fld" title={parentDir}>{parentDir}</div>
                <button className="btn" onClick={() => void pickParent()}>{icons.folder}{t("wizard.change")}</button>
              </div>
              {name.trim() && !nameError(name) && <span className="hint mono">{t("wizard.willCreate", { path: joinPath(parentDir, name) })}</span>}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <label className="field">
              <span>{t("wizard.template")}</span>
              <select className="fld" value={template} onChange={(e) => setTemplate(e.target.value)}>
                {templates.map((tp) => <option key={tp.id} value={tp.id}>{tplName(tp)}</option>)}
              </select>
              <span className="hint">{t("wizard.templateHelp")}</span>
            </label>
            <label className="field">
              <span>{t("wizard.description")}</span>
              <textarea className="fld" rows={3} value={description} placeholder={t("wizard.descriptionPh")} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="field">
              <span>{t("wizard.stack")}</span>
              <input type="text" className="fld" spellCheck={false} value={stack} placeholder={t("wizard.stackPh")} onChange={(e) => setStack(e.target.value)} />
            </label>
          </>
        )}

        {step === 2 && (
          !repoUrl ? (
            <div className="empty-in">
              <p>{t("wizard.noRepo")}</p>
              <button className="link" onClick={() => setView("settings")}>{t("wizard.configureRepo")}</button>
            </div>
          ) : skills === null ? (
            <p className="hint">{t("wizard.loadingSkills")}</p>
          ) : skills.length === 0 ? (
            <p className="hint">{t("wizard.noSkills")}</p>
          ) : (
            <>
              <p className="hint">{t("wizard.skillsHelp")}</p>
              <ul className="sk-list">
                {skills.map((s) => (
                  <li key={s.name}>
                    <label className="chk sk">
                      <input type="checkbox" checked={chosen.includes(s.name)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, s.name] : c.filter((n) => n !== s.name)))} />
                      <span><b>{s.name}</b><small>{s.description}</small></span>
                    </label>
                  </li>
                ))}
              </ul>
              <fieldset className="radios">
                <legend>{t("wizard.scope")}</legend>
                <label className="chk"><input type="radio" name="scope" checked={scope === "project"} onChange={() => setScope("project")} /><span>{t("wizard.scopeProject")}</span></label>
                <label className="chk"><input type="radio" name="scope" checked={scope === "global"} onChange={() => setScope("global")} /><span>{t("wizard.scopeGlobal")}</span></label>
              </fieldset>
            </>
          )
        )}

        {step === 3 && (
          <>
            <label className="chk"><input type="checkbox" checked={gitInit} onChange={(e) => setGitInit(e.target.checked)} /><span>{t("wizard.gitInit")}</span></label>
            <label className="chk"><input type="checkbox" checked={gitignore} onChange={(e) => setGitignore(e.target.checked)} /><span>{t("wizard.gitignore")}</span></label>
            <label className="chk sk"><input type="checkbox" checked={notifyHook} onChange={(e) => setNotifyHook(e.target.checked)} /><span><b>{t("wizard.notifyHook")}</b><small>{t("wizard.notifyHelp")}</small></span></label>
          </>
        )}

        <div className="wiz-nav">
          <button className="btn" disabled={step === 0 || creating} onClick={() => setStep((s) => s - 1)}>{t("wizard.back")}</button>
          <span className="grow" />
          {last ? (
            <button className="btn pri" disabled={creating} onClick={() => void create()}>{creating ? t("wizard.creating") : t("wizard.create")}</button>
          ) : (
            <button className="btn pri" onClick={next}>{t("wizard.next")}</button>
          )}
        </div>
      </div>
    </section>
  );
}

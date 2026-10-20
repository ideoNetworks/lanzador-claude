import { useEffect, useState } from "react";
import * as api from "../api";
import type { CatalogItem } from "../api";
import { useStore } from "../store";
import { useT } from "../i18n";
import { setValue, toggleActive, togglePin } from "../logic/checkboxes";
import { defaultValue, itemText, SECRET_VALUE } from "../logic/options";
import Tooltip from "./Tooltip";
import { icons } from "./icons";

/** Secret value: password field saved to Credential Manager on blur, never kept in React state afterwards. */
function SecretField({ item, onSaved }: { item: CatalogItem; onSaved: () => void }) {
  const t = useT();
  const showError = useStore((s) => s.showError);
  const showToast = useStore((s) => s.showToast);
  // A stored/deleted key changes the command without changing the request: re-preview.
  const invalidatePreview = useStore((s) => s.invalidatePreview);
  const [stored, setStored] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    let alive = true;
    api.secretHas(item.key).then((h) => alive && setStored(h), () => {});
    return () => {
      alive = false;
    };
  }, [item.key]);

  const save = () => {
    const value = text.trim();
    setText("");
    if (!value) return;
    api.secretSet(item.key, value).then(() => {
      setStored(true);
      invalidatePreview();
      showToast(t("toast.secretSaved"));
      onSaved();
    }, showError);
  };

  return (
    <span className="secret">
      <input
        type="password"
        value={text}
        autoComplete="off"
        spellCheck={false}
        aria-label={item.key}
        placeholder={stored ? t("opts.secretSaved") : t("opts.secretPlaceholder")}
        className={stored ? "saved" : ""}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {stored && (
        <button
          className="ibtn sm"
          title={t("opts.secretDelete")}
          aria-label={t("opts.secretDelete")}
          onClick={() => api.secretDelete(item.key).then(() => { setStored(false); invalidatePreview(); }, showError)}
        >
          {icons.x}
        </button>
      )}
    </span>
  );
}

/** One option: purple pin box, blue active box, key with tooltip, description, value control. */
export default function OptionRow({ item, lang }: { item: CatalogItem; lang: string }) {
  const t = useT();
  const opt = useStore((s) => s.opt);
  const drafts = useStore((s) => s.drafts);
  const updateOpt = useStore((s) => s.updateOpt);
  const setDraft = useStore((s) => s.setDraft);
  const flushPinned = useStore((s) => s.flushPinned);
  const { id } = item;
  const on = id in opt.active;
  const pinned = id in opt.pinned;
  const value = on ? opt.active[id] : id in drafts ? drafts[id] : defaultValue(item);
  const text = itemText(item, lang);

  const change = (v: string | null) => {
    setDraft(id, v);
    updateOpt(setValue(useStore.getState().opt, id, v));
  };
  const flipActive = () => {
    if (on) setDraft(id, opt.active[id]);
    updateOpt(toggleActive(opt, id, value));
  };

  const v = item.value;
  let control = null;
  if (v.kind === "select") {
    control = (
      <select value={value ?? ""} onChange={(e) => change(e.target.value || null)} aria-label={item.key}>
        {v.optional && <option value="">{t("opts.none")}</option>}
        {v.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (v.kind === "text") {
    control = (
      <input
        value={value ?? ""}
        placeholder={v.placeholder ?? ""}
        spellCheck={false}
        aria-label={item.key}
        onChange={(e) => change(e.target.value === "" ? null : e.target.value)}
        onBlur={flushPinned}
      />
    );
  } else if (v.kind === "fixed") {
    control = <span className="fixed">= {v.fixed}</span>;
  } else if (v.kind === "secret") {
    control = <SecretField item={item} onSaved={() => change(SECRET_VALUE)} />;
  }

  const tip = (
    <>
      <b>{item.key}</b>
      {item.dangerous && <span className="tip-warn">{icons.warn}{t("opts.dangerous")}</span>}
      {text.t && <span className="tip-body">{text.t}</span>}
    </>
  );

  return (
    <div className={`row${on ? " on" : ""}`}>
      <button
        className={`cb pin${pinned ? " on" : ""}`}
        role="checkbox"
        aria-checked={pinned}
        aria-label={`${t("opts.pin")} · ${item.key}`}
        title={t("opts.pin")}
        onClick={() => updateOpt(togglePin(opt, id, value))}
      >
        {icons.ok}
      </button>
      <button
        className={`cb chk${on ? " on" : ""}`}
        role="checkbox"
        aria-checked={on}
        aria-label={`${t("opts.active")} · ${item.key}`}
        title={t("opts.active")}
        onClick={flipActive}
      >
        {icons.ok}
      </button>
      <Tooltip content={tip}>
        <span className={`flag${item.dangerous ? " warn" : ""}`} tabIndex={0}>
          {item.dangerous && icons.warn}
          {item.key}
        </span>
      </Tooltip>
      <span className="desc" title={text.d}>{text.d}</span>
      {control && <span className="val">{control}</span>}
    </div>
  );
}

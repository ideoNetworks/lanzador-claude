import { useEffect, useMemo, useRef } from "react";
import * as api from "../api";
import { useStore } from "../store";
import { useT } from "../i18n";
import { errorText } from "../i18n/errors";
import { currentRequest, requestKey } from "../logic/request";
import { icons } from "./icons";

export const PREVIEW_DEBOUNCE_MS = 150;

/** Exact command preview plus Copy, VS Code and Launch. Launch uses the very request that was previewed. */
export default function CommandFooter() {
  const t = useT();
  const path = useStore((s) => s.selectedPath);
  const target = useStore((s) => s.target);
  const active = useStore((s) => s.opt.active);
  const launching = useStore((s) => s.launching);
  const preview = useStore((s) => s.preview);
  const setPreview = useStore((s) => s.setPreview);
  const launchPreviewed = useStore((s) => s.launchPreviewed);
  const showToast = useStore((s) => s.showToast);
  const showError = useStore((s) => s.showError);
  const cmdRef = useRef<HTMLDivElement>(null);

  const request = useMemo(() => currentRequest({ selectedPath: path, target, opt: { active, pinned: {} } }), [path, target, active]);
  const key = requestKey(request);

  useEffect(() => {
    if (!request) {
      setPreview(null);
      return;
    }
    let alive = true;
    const id = setTimeout(() => {
      api.buildCommand(request).then(
        (text) => alive && setPreview({ key, request, text, error: false }),
        (e) => alive && setPreview({ key, request, text: errorText(e), error: true }),
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [key, request, setPreview]);

  // Only a successful preview of the request currently on screen can be launched or copied.
  const current = preview && preview.key === key ? preview : null;
  const ready = !!current && !current.error;

  const selectPreview = () => {
    const el = cmdRef.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const copy = async () => {
    if (!ready) return;
    try {
      await navigator.clipboard.writeText(current.text);
      showToast(t("toast.copied"));
    } catch {
      selectPreview();
      if (document.execCommand?.("copy")) showToast(t("toast.copied"));
    }
  };

  return (
    <div className="foot">
      <div
        ref={cmdRef}
        className={`cmd${current?.error ? " err" : ""}${!path ? " empty" : ""}${path && !current ? " stale" : ""}`}
        aria-label={t("foot.preview")}
        aria-busy={!!path && !current}
        title={current?.text}
        tabIndex={0}
      >
        {path ? (current ?? preview)?.text ?? " " : t("foot.noPath")}
      </div>
      <button className="btn" onClick={() => void copy()} disabled={!ready}>
        {icons.copy}
        {t("foot.copy")}
      </button>
      <button className="btn" onClick={() => path && api.openVscode(path).catch(showError)} disabled={!path}>
        {icons.code}
        {t("foot.vscode")}
      </button>
      <button className="btn pri" onClick={() => void launchPreviewed()} disabled={!ready || launching} title="Ctrl+Enter">
        {icons.play}
        {t("foot.start")}
      </button>
    </div>
  );
}

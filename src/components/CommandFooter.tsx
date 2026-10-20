import { useEffect, useRef, useState } from "react";
import * as api from "../api";
import { useStore } from "../store";
import { useT } from "../i18n";
import { errorText } from "../i18n/errors";
import { icons } from "./icons";

export const PREVIEW_DEBOUNCE_MS = 150;

type Preview = { text: string; error: boolean } | null;

/** Exact command preview plus Copy, VS Code and Launch. */
export default function CommandFooter() {
  const t = useT();
  const path = useStore((s) => s.selectedPath);
  const target = useStore((s) => s.target);
  const active = useStore((s) => s.opt.active);
  const launching = useStore((s) => s.launching);
  const launchNow = useStore((s) => s.launchNow);
  const showToast = useStore((s) => s.showToast);
  const showError = useStore((s) => s.showError);
  const [preview, setPreview] = useState<Preview>(null);
  const cmdRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!path) {
      setPreview(null);
      return;
    }
    let alive = true;
    const id = setTimeout(() => {
      api.buildCommand({ path, target, selection: active, resumeId: null }).then(
        (text) => alive && setPreview({ text, error: false }),
        (e) => alive && setPreview({ text: errorText(e), error: true }),
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [path, target, active]);

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
    if (!preview || preview.error) return;
    try {
      await navigator.clipboard.writeText(preview.text);
      showToast(t("toast.copied"));
    } catch {
      selectPreview();
      if (document.execCommand?.("copy")) showToast(t("toast.copied"));
    }
  };

  const ready = !!path && !!preview && !preview.error;

  return (
    <div className="foot">
      <div
        ref={cmdRef}
        className={`cmd${preview?.error ? " err" : ""}${!path ? " empty" : ""}`}
        aria-label={t("foot.preview")}
        title={preview?.text}
        tabIndex={0}
      >
        {path ? preview?.text ?? " " : t("foot.noPath")}
      </div>
      <button className="btn" onClick={() => void copy()} disabled={!ready}>
        {icons.copy}
        {t("foot.copy")}
      </button>
      <button className="btn" onClick={() => path && api.openVscode(path).catch(showError)} disabled={!path}>
        {icons.code}
        {t("foot.vscode")}
      </button>
      <button className="btn pri" onClick={() => void launchNow()} disabled={!path || launching} title="Ctrl+Enter">
        {icons.play}
        {t("foot.start")}
      </button>
    </div>
  );
}

import { useEffect, useRef } from "react";
import logoBlue from "../assets/logo-iDeo-mantenimiento-informatico-azul-120x48.svg";
import logoWhite from "../assets/logo-iDeo-blanco-Servicios-Informaticos-Premium.svg";
import * as api from "../api";
import { useStore } from "../store";
import { useT } from "../i18n";
import { icons } from "./icons";
import { ExtLink, rich, HOME_URL } from "./rich";

/** WhatsApp Business link; empty until iDeo publishes the number (shows "Próximamente"). */
export const WHATSAPP_URL = "";
export const PRODUCT_URL = "https://ideonetworks.com/software/lanzador-claude";
export const PHONE = "+34 911 29 29 39";
/** GPLv3 section 7(b) notice: must stay visible and unmodified (see NOTICE). */
export const ORIGIN_NOTICE = `Desarrollado originalmente por iDeo (${HOME_URL})`;

const FOCUSABLE = 'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])';

const prefersDark = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
const isDark = (theme: string | undefined) => theme === "dark" || (theme !== "light" && prefersDark());

const STORY_SECTIONS: { title: string; items: string[]; list?: boolean }[] = [
  { title: "whatTitle", items: ["what1", "what2", "what3", "what4", "what5"], list: true },
  { title: "howTitle", items: ["how1", "how2"] },
  { title: "whyTitle", items: ["why1", "why2", "why3"] },
  { title: "originTitle", items: ["origin1", "origin2", "origin3"] },
];

export default function AboutDialog() {
  const t = useT();
  const open = useStore((s) => s.aboutOpen);
  const setOpen = useStore((s) => s.setAboutOpen);
  const version = useStore((s) => s.engineVersion);
  const theme = useStore((s) => s.config?.theme);
  const showToast = useStore((s) => s.showToast);
  const setEngine = useStore((s) => s.setEngine);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus: move into the dialog, trap Tab, close on Esc, give focus back.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === "Tab" && ref.current) {
        const els = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (els.length === 0) return;
        const first = els[0], last = els[els.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !ref.current.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !ref.current.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [open, setOpen]);

  // The version normally arrives with the engine ping; ask again if it is still unknown.
  useEffect(() => {
    if (!open || version) return;
    void Promise.resolve()
      .then(() => api.ping())
      .then((p) => p && setEngine(true, p.version))
      .catch(() => {});
  }, [open, version, setEngine]);

  if (!open) return null;

  const copyPhone = () => {
    try {
      void navigator.clipboard.writeText(PHONE).then(() => showToast(t("about.phoneCopied")), () => {});
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="about" role="dialog" aria-modal="true" aria-labelledby="about-title" ref={ref}>
        <header className="about-head">
          <img src={isDark(theme) ? logoWhite : logoBlue} alt={t("about.logoAlt")} />
          <div className="about-ttl">
            <h2 id="about-title">{t("app.name")}</h2>
            <small>{t("about.sub")}{version ? ` · ${t("about.version", { version })}` : ""}</small>
          </div>
          <button ref={closeRef} className="ibtn" onClick={() => setOpen(false)} aria-label={t("common.close")} title={t("common.close")}>
            {icons.x}
          </button>
        </header>
        <div className="about-scroll">
          <dl className="about-facts">
            <dt>{t("about.web")}</dt>
            <dd><ExtLink href={PRODUCT_URL}>ideonetworks.com/software/lanzador-claude</ExtLink></dd>
            <dt>{t("about.phone")}</dt>
            <dd>
              <span className="mono">{PHONE}</span>
              <button className="ibtn" onClick={copyPhone} aria-label={t("about.copyPhone")} title={t("about.copyPhone")}>{icons.copy}</button>
            </dd>
            <dt>{t("about.whatsapp")}</dt>
            <dd>
              {WHATSAPP_URL ? <ExtLink href={WHATSAPP_URL}>WhatsApp</ExtLink> : <span className="muted">{t("about.soon")}</span>}
            </dd>
          </dl>
          <p className="about-made">{rich(t("about.made"))}</p>
          <section className="about-story">
            <div className="lead">
              <h3>{t("about.story.leadTitle")}</h3>
              <p>{t("about.story.leadBody")}</p>
            </div>
            {STORY_SECTIONS.map((s) => (
              <div key={s.title}>
                <h4>{t(`about.story.${s.title}`)}</h4>
                {s.list ? (
                  <ul>{s.items.map((k) => <li key={k}>{rich(t(`about.story.${k}`))}</li>)}</ul>
                ) : (
                  s.items.map((k) => <p key={k}>{rich(t(`about.story.${k}`))}</p>)
                )}
              </div>
            ))}
          </section>
        </div>
        <footer className="about-foot">
          <span>{t("about.license")}</span>
          <span className="about-orig">{rich(ORIGIN_NOTICE)}</span>
        </footer>
      </div>
    </div>
  );
}

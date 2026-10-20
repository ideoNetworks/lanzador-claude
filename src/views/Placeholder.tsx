import { useT } from "../i18n";

/** Stand-in for views built in later tasks (9-11). */
export default function Placeholder({ title }: { title: string }) {
  const t = useT();
  return (
    <section className="placeholder">
      <h3>{title}</h3>
      <p>{t("placeholder.body")}</p>
    </section>
  );
}

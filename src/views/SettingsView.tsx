import { useStore } from "../store";
import { useT } from "../i18n";
import GeneralSection from "./settings/GeneralSection";
import WindowsSection from "./settings/WindowsSection";
import SkillsSection from "./settings/SkillsSection";
import UpdatesSection from "./settings/UpdatesSection";
import BrandingSection from "./settings/BrandingSection";
import ConfigSection from "./settings/ConfigSection";

/** Settings (spec 4.8); each section lives in views/settings/. */
export default function SettingsView() {
  const t = useT();
  const ready = useStore((s) => s.config !== null);
  if (!ready) return null;
  return (
    <section className="view">
      <div className="view-head">
        <h2>{t("settings.title")}</h2>
      </div>
      <div className="sets">
        <GeneralSection />
        <WindowsSection />
        <SkillsSection />
        <UpdatesSection />
        <BrandingSection />
        <ConfigSection />
      </div>
    </section>
  );
}

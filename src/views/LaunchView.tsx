import { useEffect } from "react";
import { useStore } from "../store";
import FolderTree from "../components/FolderTree";
import FolderInfo from "../components/FolderInfo";
import OptionsPanel from "../components/OptionsPanel";
import CommandFooter from "../components/CommandFooter";

/** "Iniciar": tree column | folder card + options + command footer. Ctrl+Enter launches. */
export default function LaunchView() {
  const launchNow = useStore((s) => s.launchNow);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter" && !useStore.getState().paletteOpen) {
        e.preventDefault();
        void launchNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [launchNow]);

  return (
    <div className="launch">
      <FolderTree />
      <div className="lmain">
        <FolderInfo />
        <OptionsPanel />
        <CommandFooter />
      </div>
    </div>
  );
}

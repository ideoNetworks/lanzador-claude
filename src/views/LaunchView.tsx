import { useEffect } from "react";
import { useStore } from "../store";
import FolderTree from "../components/FolderTree";
import FolderInfo from "../components/FolderInfo";
import OptionsPanel from "../components/OptionsPanel";
import CommandFooter from "../components/CommandFooter";

/** "Iniciar": tree column | folder card + options + command footer. Ctrl+Enter launches. */
export default function LaunchView() {
  const launchPreviewed = useStore((s) => s.launchPreviewed);
  const flushPinned = useStore((s) => s.flushPinned);

  // Pending pinned values are saved when leaving the view or closing the window.
  useEffect(() => {
    window.addEventListener("beforeunload", flushPinned);
    return () => {
      window.removeEventListener("beforeunload", flushPinned);
      flushPinned();
    };
  }, [flushPinned]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter" && !useStore.getState().paletteOpen) {
        e.preventDefault();
        void launchPreviewed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [launchPreviewed]);

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

import { useEffect } from "react";
import { ping } from "../api";
import { useStore } from "../store";
import { useT } from "../i18n";

export const HEARTBEAT_MS = 5000;

export default function StatusBar() {
  const t = useT();
  const up = useStore((s) => s.engineUp);
  const version = useStore((s) => s.engineVersion);
  const setEngine = useStore((s) => s.setEngine);

  useEffect(() => {
    let alive = true;
    const beat = () =>
      ping().then(
        (p) => alive && setEngine(p.ok, p.version),
        () => alive && setEngine(false),
      );
    void beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [setEngine]);

  return (
    <div className={`status${up ? " ok" : ""}`} role="status">
      <span className="dot" />
      <span className="engine">{up ? t("status.connected") : t("status.disconnected")}</span>
      <span className="ml">{version ? `v${version}` : ""}</span>
    </div>
  );
}

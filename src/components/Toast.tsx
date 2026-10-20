import { useStore } from "../store";

export default function Toast() {
  const toast = useStore((s) => s.toast);
  return toast ? <div className="toast" role="alert">{toast}</div> : null;
}

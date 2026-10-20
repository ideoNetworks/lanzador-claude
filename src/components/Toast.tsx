import { useStore } from "../store";

export default function Toast() {
  const toast = useStore((s) => s.toast);
  const code = useStore((s) => s.toastCode);
  if (!toast) return null;
  return (
    <div className="toast" role="alert">
      {toast}
      {code && <code className="toast-code">{code}</code>}
    </div>
  );
}

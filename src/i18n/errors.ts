import { t, hasKey } from "./index";

/** invoke rejects with `{code, message}`; map the code through `errors.<code>` else show the message. */
export function errorText(e: unknown): string {
  if (e && typeof e === "object") {
    const { code, message } = e as { code?: unknown; message?: unknown };
    if (typeof code === "string" && hasKey(`errors.${code}`)) return t(`errors.${code}`);
    if (typeof message === "string") return message;
  }
  return typeof e === "string" ? e : String(e);
}

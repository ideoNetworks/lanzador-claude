import type { ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

export const HOME_URL = "https://ideonetworks.com";
export const MAPS_URL = "https://www.google.com/maps/search/?api=1&query=Avenida%20Madrid%2C%203%2C%20Madrid%2C%20Espa%C3%B1a";

/** Link that opens in the system browser through the opener plugin (never navigates the webview). */
export function ExtLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        try {
          void Promise.resolve(openUrl(href)).catch(() => {});
        } catch {
          /* no opener available */
        }
      }}
    >
      {children}
    </a>
  );
}

const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\[[^\]]+\]\]|https:\/\/ideonetworks\.com|iDeo)/g;

/**
 * Tiny inline markup used by the About texts: `**bold**`, `*italic*`, `` `code` ``,
 * `[[Madrid]]` (link to the maps URL) and every "iDeo" word (link to the home page).
 */
export function rich(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (part === "iDeo" || part === HOME_URL) return <ExtLink key={i} href={HOME_URL}>{part}</ExtLink>;
    if (part.startsWith("[[")) return <ExtLink key={i} href={MAPS_URL}>{part.slice(2, -2)}</ExtLink>;
    if (part.startsWith("**")) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith("*") && part.length > 2) return <i key={i}>{part.slice(1, -1)}</i>;
    if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

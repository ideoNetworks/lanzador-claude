import { useEffect, useState } from "react";
import * as api from "../api";

/** Branding image read by the engine as a `data:` URL (the CSP allows no file/asset URLs).
 * Null while loading, without a path, or when the file cannot be used. */
export function useImageDataUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!path) return;
    let alive = true;
    api.readImageDataUrl(path).then(
      (u) => alive && setUrl(u),
      () => alive && setUrl(null),
    );
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api";
import type { DirEntry } from "../api";
import { useStore } from "../store";
import { useT } from "../i18n";
import { baseName } from "../logic/tree";
import { searchFolders, type Candidate } from "../logic/search";
import { icons } from "./icons";

const CACHE_MS = 60_000;
const MAX_SECOND_LEVEL = 200;
let cache: { key: string; at: number; entries: DirEntry[] } | null = null;

/** Root's first two levels, cached for a minute per root/hidden setting. */
async function rootFolders(root: string, showHidden: boolean): Promise<DirEntry[]> {
  const key = `${showHidden}|${root.toLowerCase()}`;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.entries;
  const first = await api.listDir(root, showHidden).catch(() => [] as DirEntry[]);
  const second = await Promise.all(
    first.filter((e) => e.hasChildren).slice(0, MAX_SECOND_LEVEL).map((e) => api.listDir(e.path, showHidden).catch(() => [] as DirEntry[])),
  );
  const entries = [...first, ...second.flat()];
  cache = { key, at: Date.now(), entries };
  return entries;
}

/** Ctrl+K overlay: favourites, recents and the root's first two levels. Enter picks. */
export default function SearchPalette() {
  const t = useT();
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  const config = useStore((s) => s.config);
  const selectPath = useStore((s) => s.selectPath);
  const setView = useStore((s) => s.setView);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [tree, setTree] = useState<DirEntry[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useStore.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => {
    if (!open || !config) return;
    setQ("");
    setIdx(0);
    let alive = true;
    void rootFolders(config.rootFolder, config.showHidden).then((e) => alive && setTree(e));
    return () => {
      alive = false;
    };
  }, [open, config?.rootFolder, config?.showHidden]);

  const results = useMemo(() => {
    const favs = config?.favorites ?? [];
    const recs = config?.recents ?? [];
    const cands: Candidate[] = [
      ...favs.map((p) => ({ path: p, name: baseName(p), fav: true, recent: false })),
      ...recs.map((p) => ({ path: p, name: baseName(p), fav: false, recent: true })),
      ...tree.map((e) => ({ path: e.path, name: e.name, fav: false, recent: false })),
    ];
    return searchFolders(cands, q, 40);
  }, [config?.favorites, config?.recents, tree, q]);

  useEffect(() => {
    listRef.current?.querySelector(".pal-item.on")?.scrollIntoView?.({ block: "nearest" });
  }, [idx]);

  if (!open) return null;
  const close = () => setOpen(false);
  const pick = (c: Candidate | undefined) => {
    if (!c) return;
    selectPath(c.path);
    setView("launch");
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") setIdx((i) => Math.min(i + 1, results.length - 1));
    else if (e.key === "ArrowUp") setIdx((i) => Math.max(i - 1, 0));
    else if (e.key === "Enter") pick(results[idx]);
    else if (e.key === "Escape") close();
    else return;
    e.preventDefault();
  };

  return (
    <div className="pal-bg" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("palette.label")} onKeyDown={onKeyDown}>
        <div className="pal-in">
          {icons.search}
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            placeholder={t("palette.placeholder")}
            aria-label={t("palette.placeholder")}
            role="combobox"
            aria-expanded="true"
            aria-controls="pal-list"
            aria-activedescendant={results[idx] ? `pal-${idx}` : undefined}
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="pal-list" id="pal-list" role="listbox" ref={listRef}>
          {results.length === 0 && <div className="pal-empty">{t("palette.empty")}</div>}
          {results.map((c, i) => (
            <div
              key={c.path}
              id={`pal-${i}`}
              role="option"
              aria-selected={i === idx}
              className={`pal-item${i === idx ? " on" : ""}`}
              onMouseMove={() => setIdx(i)}
              onClick={() => pick(c)}
            >
              <span className="pal-ic">{c.fav ? icons.star : icons.folder}</span>
              <span className="pal-txt">
                <span className="pal-name">{c.name}</span>
                <span className="pal-path">{c.path}</span>
              </span>
              {c.fav && <span className="badge">{t("palette.fav")}</span>}
              {!c.fav && c.recent && <span className="badge">{t("palette.recent")}</span>}
            </div>
          ))}
        </div>
        <div className="pal-hint">{t("palette.hint")}</div>
      </div>
    </div>
  );
}

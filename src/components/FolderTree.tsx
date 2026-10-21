import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import * as api from "../api";
import { useStore } from "../store";
import { useT } from "../i18n";
import { errorText } from "../i18n/errors";
import { ancestorsUnder, baseName, shortenPath, treeKey, type TreeRow } from "../logic/tree";
import { findKey, projectKind } from "../logic/projects";
import { useTreeData } from "./useTreeData";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import { icons } from "./icons";

type Menu = { x: number; y: number; items: MenuItem[] } | null;

const MAX_CHIPS = 8;
const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

const rowIcon = (r: TreeRow, proj: "claude" | "code" | null) =>
  r.kind === "pc" ? icons.pc : r.kind === "net" ? icons.net : r.kind === "drive" ? icons.drive
    : proj === "claude" ? icons.projClaude : proj === "code" ? icons.projCode : icons.folder;

const NO_MARKS: Record<string, boolean> = {};

/** Left column: recents/favourites chips, lazy folder tree from the root, and "This PC". */
export default function FolderTree() {
  const t = useT();
  const config = useStore((s) => s.config);
  const selected = useStore((s) => s.selectedPath);
  const selectPath = useStore((s) => s.selectPath);
  const saveConfig = useStore((s) => s.saveConfig);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const showError = useStore((s) => s.showError);
  const root = config?.rootFolder ?? "C:\\Desarrollo";
  const showHidden = config?.showHidden ?? false;
  const favorites = config?.favorites ?? [];
  const marks = config?.projectMarks ?? NO_MARKS;
  const projects = config?.projects;
  const expandOnClick = config?.expandProjectsOnClick ?? false;
  /** Project kind of a folder row (detection + manual marks). */
  const projOf = (r: TreeRow) => (r.kind === "folder" && r.path ? projectKind(r.project, marks, r.path) : null);
  const { rows, expand, collapse, reveal, refresh } = useTreeData(root, showHidden);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef(false);
  const keyboardFocus = useRef(false);

  const isFav = (p: string) => favorites.some((f) => same(f, p));

  // Reveal a selection made elsewhere (chips, search palette) inside the root subtree.
  useEffect(() => {
    if (!selected) return;
    pendingScroll.current = true;
    reveal(ancestorsUnder(root, selected));
  }, [selected, root, reveal]);

  useEffect(() => {
    if (!pendingScroll.current || !selected) return;
    const row = rows.find((r) => r.id.startsWith("r|") && same(r.path, selected));
    if (!row) return;
    pendingScroll.current = false;
    listRef.current?.querySelector(`[data-id="${CSS.escape(row.id)}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [rows, selected]);

  useEffect(() => {
    if (!keyboardFocus.current || !focusId) return;
    keyboardFocus.current = false;
    listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(focusId)}"]`)?.focus();
  }, [focusId, rows]);

  const toggle = (r: TreeRow) => (r.expanded ? collapse(r.id) : expand(r));

  const activate = (r: TreeRow) => {
    setFocusId(r.id);
    if (r.kind === "pc") return toggle(r);
    if (r.path) selectPath(r.path);
    // A project only opens with its + button, so the tree stays tidy (unless Settings says otherwise).
    if (r.hasChildren && !r.expanded && (expandOnClick || !projOf(r))) expand(r);
  };

  const setMark = (path: string, mark: boolean | null) => {
    const key = findKey(marks, path);
    const next = Object.fromEntries(Object.entries(marks).filter(([k]) => k !== key));
    void saveConfig({ projectMarks: mark === null ? next : { ...next, [path]: mark } });
  };

  const folderMenu = (path: string, detected?: "claude" | "code" | null): MenuItem[] => {
    const marked = findKey(marks, path) !== undefined;
    const isProj = !!projectKind(detected, marks, path);
    return [
      { label: isFav(path) ? t("tree.favRemove") : t("tree.favAdd"), icon: isFav(path) ? icons.starOff : icons.star, onSelect: () => toggleFavorite(path) },
      { label: t("tree.openExplorer"), icon: icons.open, onSelect: () => void api.openExplorer(path).catch(showError) },
      isProj
        ? { label: t("tree.unmarkProject"), icon: icons.folder, onSelect: () => setMark(path, detected ? false : null) }
        : { label: t("tree.markProject"), icon: icons.projCode, onSelect: () => setMark(path, detected ? null : true) },
      ...(marked ? [{ label: t("tree.autoDetect"), icon: icons.refresh, onSelect: () => setMark(path, null) }] : []),
    ];
  };

  const openMenuAt = (el: HTMLElement, items: MenuItem[]) => {
    const r = el.getBoundingClientRect();
    setMenu({ x: r.left + 24, y: r.bottom, items });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const cur = rows.find((r) => r.id === focusId);
    if (cur?.path && (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) {
      e.preventDefault();
      openMenuAt(e.target as HTMLElement, folderMenu(cur.path, cur.project ?? null));
      return;
    }
    const a = treeKey(rows, focusId, e.key);
    if (!a) return;
    e.preventDefault();
    const row = rows.find((r) => r.id === a.id)!;
    if (a.type === "focus") {
      keyboardFocus.current = true;
      setFocusId(a.id);
    } else if (a.type === "expand") expand(row);
    else if (a.type === "collapse") collapse(a.id);
    else activate(row);
  };

  const changeRoot = async () => {
    try {
      const picked = await open({ directory: true, defaultPath: root, title: t("tree.pickRoot") });
      if (typeof picked === "string" && picked) void saveConfig({ rootFolder: picked });
    } catch (e) {
      showError(e);
    }
  };

  const headerMenu = (e: React.MouseEvent) =>
    openMenuAt(e.currentTarget as HTMLElement, [
      { label: t("tree.showHidden"), checked: showHidden, onSelect: () => void saveConfig({ showHidden: !showHidden }) },
      { label: t("tree.refresh"), icon: icons.refresh, onSelect: refresh },
      { label: t("tree.changeRoot"), icon: icons.folder, onSelect: () => void changeRoot() },
    ]);

  const recents = config?.recents ?? [];
  const chips = [...favorites.map((p) => ({ p, fav: true })), ...recents.filter((p) => !isFav(p)).map((p) => ({ p, fav: false }))].slice(0, MAX_CHIPS);
  // Only the first row showing the selected path is highlighted (a drive can also be the root).
  const selId = rows.find((r) => r.path !== null && same(r.path, selected))?.id;
  const tabTarget = focusId && rows.some((r) => r.id === focusId) ? focusId : rows[0]?.id;

  return (
    <aside className="tree">
      <div className="sect">{t("tree.recent")}</div>
      <div className="chips">
        {chips.length === 0 && <span className="chips-empty">{t("tree.noRecents")}</span>}
        {chips.map(({ p, fav }) => (
          <button
            key={p}
            className={`chip${same(p, selected) ? " on" : ""}`}
            title={p}
            onClick={() => selectPath(p)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, items: folderMenu(p) });
            }}
          >
            {fav && <span className="star">{icons.star}</span>}
            {baseName(p)}
          </button>
        ))}
      </div>
      <div className="sect">
        <span>{t("tree.folders")}</span>
        <span className="sect-act">
          <button className="lnk" onClick={() => void changeRoot()}>{t("tree.changeRoot")}</button>
          <button className="ibtn" onClick={headerMenu} aria-label={t("tree.menu")} title={t("tree.menu")} aria-haspopup="menu">{icons.dots}</button>
        </span>
      </div>
      <div className="rootbox" title={root}>{shortenPath(root, 34)}</div>
      <div className="tlist" role="tree" aria-label={t("tree.label")} ref={listRef} onKeyDown={onKeyDown}>
        {rows.map((r) => {
          const pad = { paddingLeft: 8 + r.depth * 16 };
          if (r.kind === "loading") return <div key={r.id} className="tn ghost" style={pad}><span className="car" /><span className="spin" />{t("tree.loading")}</div>;
          if (r.kind === "error") return <div key={r.id} className="tn err" style={pad} role="alert"><span className="car" />{icons.warn}<span className="nm">{errorText({ code: r.hint })}</span></div>;
          const sel = r.id === selId;
          const fav = r.path !== null && isFav(r.path);
          const proj = projOf(r);
          const own = !!r.path && !!projects && findKey(projects, r.path) !== undefined;
          return (
            <div
              key={r.id}
              data-id={r.id}
              className={`tn${sel ? " sel" : ""}`}
              style={pad}
              role="treeitem"
              aria-level={r.depth + 1}
              aria-expanded={r.hasChildren ? r.expanded : undefined}
              aria-selected={sel}
              tabIndex={r.id === tabTarget ? 0 : -1}
              onFocus={() => setFocusId(r.id)}
              onClick={() => activate(r)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (r.path) setMenu({ x: e.clientX, y: e.clientY, items: folderMenu(r.path, r.project ?? null) });
              }}
            >
              <span
                className={`car${r.expanded ? " open" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (r.hasChildren) toggle(r);
                }}
              >
                {r.hasChildren && !proj && icons.caret}
              </span>
              {rowIcon(r, proj)}
              <span className="nm" title={proj ? t(proj === "claude" ? "tree.projClaude" : "tree.projCode") : undefined}>{r.kind === "pc" ? t("tree.pc") : r.name}</span>
              {proj && r.hasChildren && (
                <button
                  className={`plus${r.expanded ? " open" : ""}`}
                  tabIndex={-1}
                  aria-label={r.expanded ? t("tree.collapse") : t("tree.expand")}
                  title={r.expanded ? t("tree.collapse") : t("tree.expand")}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(r);
                  }}
                >
                  {r.expanded ? "−" : "+"}
                </button>
              )}
              {own && <span className="pdot" title={t("tree.ownOptions")} aria-label={t("tree.ownOptions")} />}
              {r.label && <span className="lbl2">{r.label}</span>}
              {r.path && (
                <button
                  className={`fav${fav ? " on" : ""}`}
                  tabIndex={-1}
                  aria-label={fav ? t("tree.favRemove") : t("tree.favAdd")}
                  title={fav ? t("tree.favRemove") : t("tree.favAdd")}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(r.path!);
                  }}
                >
                  {fav ? icons.star : icons.starOff}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </aside>
  );
}

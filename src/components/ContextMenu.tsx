import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { icons } from "./icons";

export interface MenuItem {
  label: string;
  /** Secondary text shown under the label (e.g. a date). */
  sub?: string;
  icon?: ReactNode;
  checked?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** Custom (non-native) menu at viewport coordinates. Arrow keys move, Enter picks, Esc / outside click closes. */
export default function ContextMenu({ x, y, items, onClose, label, empty }: {
  x: number; y: number; items: MenuItem[]; onClose: () => void; label?: string; empty?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(4, y + r.height > window.innerHeight - 8 ? y - r.height : y),
    });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const blur = () => onClose();
    document.addEventListener("mousedown", down, true);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", blur);
    return () => {
      document.removeEventListener("mousedown", down, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", blur);
    };
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = e.key === "ArrowDown" ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
      btns[n]?.focus();
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return createPortal(
    <div ref={ref} className="ctxmenu" role="menu" aria-label={label} style={pos} onKeyDown={onKeyDown}>
      {items.length === 0 && empty && <div className="ctx-empty">{empty}</div>}
      {items.map((it, i) => (
        <button
          key={i}
          role={it.checked === undefined ? "menuitem" : "menuitemcheckbox"}
          aria-checked={it.checked}
          disabled={it.disabled}
          onClick={() => {
            onClose();
            it.onSelect();
          }}
        >
          <span className="ctx-ic">{it.checked !== undefined ? (it.checked ? icons.ok : null) : it.icon}</span>
          <span className="ctx-txt">
            <span>{it.label}</span>
            {it.sub && <small>{it.sub}</small>}
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

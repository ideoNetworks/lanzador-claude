import { cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";

export const TOOLTIP_DELAY_MS = 300;
const WIDTH = 340;

type Pos = { left: number; top?: number; bottom?: number };

type AnchorProps = {
  onMouseEnter?: (e: SyntheticEvent) => void;
  onMouseLeave?: (e: SyntheticEvent) => void;
  onFocus?: (e: SyntheticEvent) => void;
  onBlur?: (e: SyntheticEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  "aria-describedby"?: string;
};

/** Custom tooltip: shows after 300 ms on hover or keyboard focus, Esc hides it. Positioned in a portal. */
export default function Tooltip({ content, children }: { content: ReactNode; children: ReactElement<AnchorProps> }) {
  const id = useId();
  const [pos, setPos] = useState<Pos | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (e: SyntheticEvent) => {
    const el = e.currentTarget as HTMLElement;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const w = Math.min(WIDTH, window.innerWidth * 0.8);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 12));
      const below = window.innerHeight - r.bottom > 150;
      setPos(below ? { left, top: r.bottom + 6 } : { left, bottom: window.innerHeight - r.top + 6 });
    }, TOOLTIP_DELAY_MS);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setPos(null);
  };

  const p = children.props;
  const anchor = cloneElement(children, {
    onMouseEnter: (e: SyntheticEvent) => { p.onMouseEnter?.(e); show(e); },
    onMouseLeave: (e: SyntheticEvent) => { p.onMouseLeave?.(e); hide(); },
    onFocus: (e: SyntheticEvent) => { p.onFocus?.(e); show(e); },
    onBlur: (e: SyntheticEvent) => { p.onBlur?.(e); hide(); },
    onKeyDown: (e: React.KeyboardEvent) => { p.onKeyDown?.(e); if (e.key === "Escape") hide(); },
    "aria-describedby": pos ? id : undefined,
  });

  return (
    <>
      {anchor}
      {pos &&
        createPortal(
          <div className="tip" role="tooltip" id={id} style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}>
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}

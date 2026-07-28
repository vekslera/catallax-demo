/**
 * Term — a labelled parameter with an explanation on hover, focus or tap.
 *
 * Two things make this less trivial than it looks:
 *
 * 1. The desktop columns scroll internally (`overflow-y: auto`), which clips
 *    absolutely positioned descendants. The bubble is therefore `position:
 *    fixed` with coordinates measured when it opens — fixed elements are laid
 *    out against the viewport, so an overflow ancestor cannot clip them.
 *
 * 2. Hover alone is not an interaction. The trigger is a real button, so it is
 *    reachable by keyboard and works on touch, and the bubble is always in the
 *    DOM so `aria-describedby` always resolves.
 */

import { useCallback, useId, useRef, useState, type ReactNode } from 'react';

interface TermProps {
  /** Plain-English name, shown first. */
  label: ReactNode;
  /** The specification's symbol, kept as a secondary annotation. */
  symbol?: string;
  tip: string;
  className?: string;
}

/** Keep the bubble inside the viewport. */
const HALF_WIDTH = 132;
const GAP = 9;

interface Position {
  left: number;
  top: number;
  above: boolean;
}

export function Term({ label, symbol, tip, className }: TermProps) {
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<Position | null>(null);

  const open = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();

    // Prefer above, and decide from the bubble's real height rather than a
    // guessed threshold. Getting this wrong flips the hero's explanation
    // downward, straight over the 1.0000 — the one number that has to stay
    // readable. The bubble is always in the DOM (hidden by `visibility`, which
    // still lays out), so it can be measured before it is shown.
    const tipHeight = tipRef.current?.offsetHeight ?? 110;
    const above = r.top - GAP - tipHeight >= 8;

    setPos({
      left: Math.min(Math.max(r.left + r.width / 2, HALF_WIDTH + 8), window.innerWidth - HALF_WIDTH - 8),
      top: above ? r.top - GAP : r.bottom + GAP,
      above,
    });
  }, []);

  const close = useCallback(() => setPos(null), []);

  return (
    <span className={`term${className ? ` ${className}` : ''}`}>
      <button
        ref={ref}
        type="button"
        className="term__trigger"
        aria-describedby={id}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onClick={() => (pos ? close() : open())}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
        }}
      >
        {label}
        {/* The space is load-bearing: without a text node between them the
            accessible name runs together as "Backing ration". */}
        {symbol && (
          <>
            {' '}
            <span className="term__symbol">{symbol}</span>
          </>
        )}
      </button>
      <span
        ref={tipRef}
        role="tooltip"
        id={id}
        className={`term__tip${pos ? ' is-open' : ''}${pos?.above ? ' is-above' : ' is-below'}`}
        style={pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : undefined}
      >
        {tip}
      </span>
    </span>
  );
}

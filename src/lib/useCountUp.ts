import { useEffect, useRef, useState } from 'react';

/**
 * Ease a displayed figure toward its true value so V and S are visibly moving
 * *together*. Purely cosmetic: the store's number is always the truth.
 *
 * The animation is belt-and-braces on purpose. `requestAnimationFrame` does
 * not fire in a backgrounded or non-compositing tab, and a half-finished
 * count-up would leave a stale balance sheet on screen — the one thing this
 * demo cannot afford to get wrong. A timeout therefore always lands the exact
 * value, whether or not a single frame was ever painted.
 */
export function useCountUp(value: number, reducedMotion: boolean, ms = 520): number {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  displayRef.current = display;

  useEffect(() => {
    if (reducedMotion) {
      setDisplay(value);
      return;
    }

    const from = displayRef.current;
    if (from === value) return;

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    const land = window.setTimeout(() => setDisplay(value), ms + 100);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(land);
    };
  }, [value, reducedMotion, ms]);

  return display;
}

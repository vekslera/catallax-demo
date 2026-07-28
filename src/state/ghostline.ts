/**
 * ghostline.ts — the orderbook counterfactual.
 *
 * A precomputed collapse curve, drawn in grey behind the real n line during
 * the redemption run. It is explicitly labelled as a simulation of a *different
 * design*: an orderbook-backed token whose NAV craters when 40% of holders sell
 * into finite liquidity. Catallax has no such curve to draw, because redemption
 * contracts both sides of the balance sheet instead of consuming a book.
 *
 * One chart, the entire NAV argument.
 */

/** n for a hypothetical orderbook design as a run proceeds. 1.00 → 0.13. */
export const GHOST_CURVE: readonly number[] = [
  1.0, 0.97, 0.9, 0.78, 0.61, 0.43, 0.28, 0.18, 0.13,
];

export const GHOST_FLOOR = GHOST_CURVE[GHOST_CURVE.length - 1];

export const GHOST_LABEL = 'hypothetical: orderbook design';

/**
 * Shown beneath the chart whenever the comparison is on. It has one job: make
 * it impossible to read the grey band as something Catallax did, or as a
 * forecast of something Catallax might do.
 */
export const GHOST_CAPTION =
  'Hypothetical — an orderbook design under the same run. Not Catallax, not a forecast.';

/**
 * Value of the counterfactual at sequence index `t`, given the anchor at which
 * the run began. Before the anchor there is no line; after the curve is
 * exhausted it holds at the insolvency floor.
 */
export function ghostAt(t: number, anchorT: number | null): number | null {
  if (anchorT === null) return null;
  const i = t - anchorT;
  if (i < 0) return null;
  if (i >= GHOST_CURVE.length) return GHOST_FLOOR;
  return GHOST_CURVE[i];
}

/** Index at which the counterfactual is flagged insolvent. */
export const GHOST_INSOLVENT_INDEX = GHOST_CURVE.length - 1;

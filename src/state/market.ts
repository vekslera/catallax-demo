/**
 * market.ts — the price layer (spec §3.4).
 *
 * Two numbers. No order book, no liquidity depth, no slippage, no LP
 * mechanics.
 *
 *   P — exogenous market price of compute, USD per CU. The protocol never
 *       sets it; it represents energy and hardware costs.
 *   q — secondary-market quote for 1 CTLX, USD. Moves by arbitrage only.
 *
 * Par identity: redemption yields exactly 1 CU per CTLX, therefore par = P.
 */

import type { ArbLeg } from './types';

/** Arbitrage wakes up outside this band. */
export const ARB_BAND = 0.02;

/** Fraction of the remaining gap each arbitrage step closes. */
const CLOSE_RATE = 0.4;

/** Trade size as a fraction of supply, per unit of relative gap. */
const DEPTH = 0.02;

/** Premium (positive) or discount (negative) of the quote against par. */
export function premium(quoteUSD: number, computePriceUSD: number): number {
  if (computePriceUSD === 0) return 0;
  return (quoteUSD - computePriceUSD) / computePriceUSD;
}

export function insideBand(quoteUSD: number, computePriceUSD: number): boolean {
  return Math.abs(premium(quoteUSD, computePriceUSD)) <= ARB_BAND;
}

/**
 * Which leg the arbitrageur runs, if any.
 *
 *   q > P → mint-and-sell: a scored provider mints and sells. V and S rise
 *           together, q falls toward P.
 *   q < P → buy-and-redeem: an arbitrageur buys CTLX and redeems it for
 *           compute. V and S fall together, q rises toward P.
 *
 * Either way both sides of the balance sheet move by the same quantity, so the
 * invariant is untouched. The gap closes because redemption is at par, not
 * because anyone defends a peg.
 */
export function arbLeg(quoteUSD: number, computePriceUSD: number): ArbLeg | null {
  if (insideBand(quoteUSD, computePriceUSD)) return null;
  return quoteUSD > computePriceUSD ? 'mint-and-sell' : 'buy-and-redeem';
}

export interface ArbStep {
  leg: ArbLeg;
  /** CU (and, at par, CTLX) traded on this step. */
  volume: number;
  nextQuoteUSD: number;
}

/**
 * One deterministic step of gap-closing. Called on a timer by the store; the
 * gap closes over roughly two seconds.
 */
export function arbitrageStep(
  quoteUSD: number,
  computePriceUSD: number,
  supply: number,
  headroom: number,
): ArbStep | null {
  const leg = arbLeg(quoteUSD, computePriceUSD);
  if (!leg) return null;

  const gap = Math.abs(premium(quoteUSD, computePriceUSD));
  const raw = Math.round(supply * DEPTH * gap);
  const volume = Math.max(0, Math.min(raw, Math.floor(Math.max(headroom, 0))));

  const nextQuoteUSD = quoteUSD + (computePriceUSD - quoteUSD) * CLOSE_RATE;

  if (volume <= 0) {
    // No inventory to trade with, but the quote still converges — the
    // opportunity is what moves the price, and it stays open until it closes.
    return { leg, volume: 0, nextQuoteUSD };
  }
  return { leg, volume, nextQuoteUSD };
}

/** USD cost of one CU obtained by buying CTLX on the secondary market. */
export function costViaBuy(quoteUSD: number): number {
  return quoteUSD;
}

/** USD cost of one CU obtained on the compute market directly. */
export function costViaMarket(computePriceUSD: number): number {
  return computePriceUSD;
}

/**
 * The holder always has two ways to obtain compute; the cheaper one closes the
 * gap. Returned as the buyer panel's route badge.
 */
export function cheaperRoute(quoteUSD: number, computePriceUSD: number): 'buy' | 'redeem' {
  return quoteUSD < computePriceUSD ? 'buy' : 'redeem';
}

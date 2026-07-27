/**
 * settlement.ts — the GENERIC monetary core.
 *
 * This file must not import React, and must not mention compute, CU,
 * attestation, GPUs or reliability. It knows only:
 *   - a two-sided ledger (vault of collateral units, supply of tokens)
 *   - issuance and retirement at par, always matched (ΔS = ΔV)
 *   - stake accounting against a caller-supplied collateral ratio
 *   - penalty routing from stake to a claimant, with a slice to a default fund
 *   - matched write-down of dead collateral, funded stake-first then fund
 *
 * The import direction is one-way: compute.ts may import from here, never the
 * reverse (spec §11). The monetary core is commodity-agnostic in principle;
 * compute is simply the only commodity that currently satisfies its
 * verification precondition.
 *
 * EXACTNESS NOTE: every function that moves both sides of the balance sheet
 * applies the *same* JavaScript number to `vault` and `supply`. Given a ledger
 * that starts at vault === supply, `v + d` and `s + d` are bit-identical
 * floats, so `vault / supply` is exactly 1 — not 1 within tolerance. The only
 * operation that can separate the two sides is an uncovered write-down, and
 * that is reported explicitly.
 */

export interface Ledger {
  /** V — collateral units committed. */
  vault: number;
  /** S — outstanding tokens. */
  supply: number;
  /** Protocol-owned token reserve, denominated in supply units. */
  defaultFund: number;
}

export interface StakeSplit {
  staked: number;
  liquid: number;
}

export interface PenaltyRouting {
  /** Total penalty drawn from stake. */
  delta: number;
  /** Portion paid to the harmed claimant. */
  toClaimant: number;
  /** Portion accrued to the default fund. */
  toFund: number;
  stakeRemaining: number;
}

export interface WriteDownResult {
  ledger: Ledger;
  fromStake: number;
  fromFund: number;
  /** Collateral removed from the vault that no tokens were burned against. */
  shortfall: number;
  uncovered: boolean;
  stakeRemaining: number;
}

/** Fraction of a penalty that accrues to the default fund rather than the claimant. */
export const FUND_SLICE = 0.2;

/** Premium added to the claimant's escrow when sizing a penalty. */
export const PENALTY_PREMIUM = 0.1;

/**
 * n = V/S. Derived, never stored. An empty ledger is defined as 1 so the hero
 * number never renders NaN at the edges.
 */
export function parity(l: Pick<Ledger, 'vault' | 'supply'>): number {
  if (l.supply === 0) return 1;
  return l.vault / l.supply;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * ISSUE — deposit collateral, mint tokens at par. ΔS = ΔV exactly.
 * There is no fee, no ε, no wedge.
 */
export function issue(l: Ledger, delta: number): Ledger {
  if (delta <= 0) return l;
  return { ...l, vault: l.vault + delta, supply: l.supply + delta };
}

/**
 * RETIRE — burn tokens, release collateral at par. Both sides contract
 * together. Used by redemption and by voluntary exit alike: the protocol does
 * not distinguish, which is the point.
 */
export function retire(l: Ledger, delta: number): Ledger {
  if (delta <= 0) return l;
  return { ...l, vault: l.vault - delta, supply: l.supply - delta };
}

/** Split a freshly issued amount into locked stake and liquid balance. */
export function splitCollateral(amount: number, collateralRatio: number): StakeSplit {
  const staked = amount * clamp(collateralRatio, 0, 1);
  return { staked, liquid: amount - staked };
}

/**
 * Size and route a penalty. δ = min(stake, claim · (1 + premium)); a fixed
 * slice accrues to the default fund instead of the claimant.
 */
export function routePenalty(
  stake: number,
  claim: number,
  premium: number = PENALTY_PREMIUM,
  fundSlice: number = FUND_SLICE,
): PenaltyRouting {
  const delta = Math.min(Math.max(stake, 0), Math.max(claim, 0) * (1 + premium));
  const toFund = delta * fundSlice;
  return {
    delta,
    toClaimant: delta - toFund,
    toFund,
    stakeRemaining: stake - delta,
  };
}

/**
 * MATCHED WRITE-DOWN — dead collateral leaves the vault and an equal quantity
 * of tokens is burned against it, funded from the defaulter's remaining stake
 * first and the default fund second.
 *
 * If stake + fund cannot cover the burn, the vault still loses the dead
 * collateral but the supply does not shrink to match: n breaks below 1 and
 * `uncovered` is set. This is the one path in the entire system that can move
 * n, and it is reachable only by exhausting both the stake and the fund —
 * which is exactly what the fund exists to prevent.
 */
export function writeDown(l: Ledger, deadUnits: number, stakeAvailable: number): WriteDownResult {
  const dead = Math.max(deadUnits, 0);
  const stake = Math.max(stakeAvailable, 0);

  const fromStake = Math.min(dead, stake);
  const fromFund = Math.min(dead - fromStake, Math.max(l.defaultFund, 0));

  // `a + (b - a)` is not guaranteed to reproduce `b` bit-for-bit in binary
  // floating point. When the two funding legs cover the write-down to within a
  // rounding error, snap the burn to the exact dead quantity so the vault and
  // the supply move by the identical number and n stays exactly 1. A genuine
  // shortfall is orders of magnitude larger than this epsilon.
  const EPS = 1e-9 * Math.max(1, dead);
  const covered = fromStake + fromFund >= dead - EPS;
  const burned = covered ? dead : fromStake + fromFund;
  const shortfall = covered ? 0 : dead - burned;

  return {
    ledger: {
      vault: l.vault - dead,
      supply: l.supply - burned,
      defaultFund: l.defaultFund - fromFund,
    },
    fromStake,
    fromFund,
    shortfall,
    uncovered: shortfall > 0,
    stakeRemaining: stake - fromStake,
  };
}

/**
 * EXIT SIZING — how much collateral a holder of stake + liquid tokens can
 * withdraw. Withdrawal burns exactly what it withdraws, so the withdrawable
 * amount is capped by the tokens the exiting party can actually present.
 */
export function withdrawable(committed: number, staked: number, liquid: number): number {
  return Math.max(0, Math.min(committed, staked + liquid));
}

/** Draw `amount` from stake first, then liquid. Returns the new balances. */
export function drawStakeFirst(
  staked: number,
  liquid: number,
  amount: number,
): { staked: number; liquid: number; drawn: number } {
  const fromStake = Math.min(staked, amount);
  const fromLiquid = Math.min(liquid, amount - fromStake);
  return {
    staked: staked - fromStake,
    liquid: liquid - fromLiquid,
    drawn: fromStake + fromLiquid,
  };
}

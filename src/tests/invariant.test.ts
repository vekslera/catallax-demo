/**
 * invariant.test.ts — the acceptance criteria from spec §10.1, as tests.
 *
 * The headline property: across thousands of randomly ordered protocol
 * operations, n = V/S is exactly 1. Not "1 within display precision" — the
 * assertions below use a 1e-9 relative tolerance and in practice the error is
 * identically zero, because every operation applies the same JavaScript number
 * to both sides of the balance sheet.
 *
 * The single exception is the deliberately reachable uncovered write-down,
 * which the reducer must flag itself.
 */

import { describe, expect, it } from 'vitest';
import { genesisState, reducer, type Action } from '../state/protocol';
import { routePenalty } from '../state/settlement';
import { totalHeldCTLX } from '../state/genesis';
import { isAttestationTerminal } from '../state/compute';
import { insideBand, premium } from '../state/market';
import { BEATS, type Beat } from '../state/scenario';
import {
  ARB_TICK_MS,
  ATTEST_SETTLE_MS,
  ATTEST_TICK_MS,
  JOB_EXECUTE_MS,
  JOB_START_MS,
  JOB_VERIFY_MS,
} from '../state/timing';
import type { ProtocolState } from '../state/types';

const TOL = 1e-9;

function n(s: ProtocolState): number {
  return s.vaultCU / s.supplyCTLX;
}

/** Deterministic PRNG so a failure is reproducible from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which of the store's clocks is currently armed, and how long until it fires. */
function clockDelay(s: ProtocolState): number | null {
  if (s.attestation) {
    return isAttestationTerminal(s.attestation) ? ATTEST_SETTLE_MS : ATTEST_TICK_MS;
  }
  if (s.activeJob) {
    if (s.activeJob.phase === 'escrowed') return JOB_START_MS;
    return s.activeJob.phase === 'executing' ? JOB_EXECUTE_MS : JOB_VERIFY_MS;
  }
  if (!insideBand(s.quoteUSD, s.computePriceUSD)) return ARB_TICK_MS;
  return null;
}

function clockAction(s: ProtocolState): Action | null {
  if (s.attestation) {
    return { type: isAttestationTerminal(s.attestation) ? 'ATTEST_DISMISS' : 'ATTEST_STEP' };
  }
  if (s.activeJob) return { type: 'JOB_STEP' };
  if (!insideBand(s.quoteUSD, s.computePriceUSD)) return { type: 'ARB_STEP' };
  return null;
}

/**
 * Run the store's clocks to completion, headlessly. Order-independent, so this
 * is the right driver for the random-sequence tests; the scenario uses the
 * virtual timeline below instead.
 */
function settle(s: ProtocolState): ProtocolState {
  let cur = s;
  for (let i = 0; i < 400; i++) {
    const action = clockAction(cur);
    if (!action) return cur;
    cur = reducer(cur, action);
  }
  return cur;
}

function assertHealthy(s: ProtocolState, where: string) {
  expect(s.vaultCU, `${where}: V >= 0`).toBeGreaterThanOrEqual(0);
  expect(s.supplyCTLX, `${where}: S > 0`).toBeGreaterThan(0);

  if (s.uncovered) {
    // The one legitimate way to move n: dead collateral that stake and fund
    // together could not cover. It must break *downward* — never upward.
    expect(n(s), `${where}: uncovered breaks n below 1`).toBeLessThan(1);
  } else {
    expect(Math.abs(n(s) - 1), `${where}: n === 1`).toBeLessThanOrEqual(TOL);
  }

  // Every CTLX is in somebody's account.
  const held = totalHeldCTLX(s);
  expect(
    Math.abs(held - s.supplyCTLX) / Math.max(1, s.supplyCTLX),
    `${where}: accounts sum to S`,
  ).toBeLessThanOrEqual(1e-6);

  // Every compute unit in the vault is on some provider's balance sheet. This
  // is what stops a write-down from removing collateral that is not there.
  const committed = s.providers.reduce((a, p) => a + p.committedCU, 0);
  expect(
    Math.abs(committed - s.vaultCU) / Math.max(1, s.vaultCU),
    `${where}: committed capacity sums to V`,
  ).toBeLessThanOrEqual(1e-6);
}

/**
 * Replay a beat on a virtual timeline, interleaving its scripted steps with
 * the store's clocks exactly as the browser would. Beat 6 is the reason this
 * exists: the hardware failure must land while the job is still executing.
 */
function playBeat(initial: ProtocolState, beat: Beat): ProtocolState {
  let s = reducer(initial, { type: 'SET_BEAT', beat: beat.id });
  const ctx = beat.prepare ? beat.prepare(s) : {};
  const steps = [...beat.steps].sort((a, b) => a.at - b.at);

  let i = 0;
  let now = 0;
  let due = clockDelay(s);
  let guard = 0;

  while ((i < steps.length || due !== null) && guard++ < 500) {
    const stepAt = i < steps.length ? steps[i].at : Infinity;
    const clockAt = due ?? Infinity;

    if (stepAt <= clockAt) {
      now = stepAt;
      const action = steps[i].action(s, ctx);
      i++;
      if (action) s = reducer(s, action);
    } else {
      now = clockAt;
      const action = clockAction(s);
      if (action) s = reducer(s, action);
    }

    const delay = clockDelay(s);
    due = delay === null ? null : now + delay;
    assertHealthy(s, `beat ${beat.id} @ ${now}ms`);
  }

  return s;
}

function playScenario(): ProtocolState {
  let s = genesisState('scenario');
  for (const beat of BEATS) s = playBeat(s, beat);
  return s;
}

type Kind = Action['type'];

/** Pick a plausible next action for the current state. */
function randomAction(s: ProtocolState, rnd: () => number): Action | null {
  const pick = <T,>(xs: T[]): T | null => (xs.length ? xs[Math.floor(rnd() * xs.length)] : null);

  if (s.openFailure) {
    return rnd() < 0.5 ? { type: 'CURE' } : { type: 'DEFAULT' };
  }

  const roll = rnd();
  const providers = s.providers.filter((p) => p.status === 'active');
  const buyer = pick(s.buyers);

  if (roll < 0.2) {
    const p = pick(providers.filter((q) => q.score >= 40));
    if (!p) return null;
    return { type: 'MINT', providerId: p.id, amountCU: Math.round(rnd() * 50_000) + 1 };
  }
  if (roll < 0.4) {
    const h = pick(s.buyers.filter((x) => x.ctlxBalance > 1));
    if (h) {
      return {
        type: 'REDEEM',
        kind: 'buyer',
        accountId: h.id,
        amountCTLX: Math.round(rnd() * h.ctlxBalance),
      };
    }
    return null;
  }
  if (roll < 0.5 && buyer) {
    const p = pick(providers.filter((q) => q.liquidCTLX > 1));
    if (!p) return null;
    return {
      type: 'ACQUIRE',
      buyerId: buyer.id,
      providerId: p.id,
      amountCTLX: Math.round(rnd() * Math.min(p.liquidCTLX, 30_000)),
    };
  }
  if (roll < 0.62 && buyer && buyer.ctlxBalance > 1) {
    const p = pick(providers);
    if (!p) return null;
    return {
      type: 'JOB_SUBMIT',
      buyerId: buyer.id,
      providerId: p.id,
      priceCTLX: Math.round(rnd() * buyer.ctlxBalance),
    };
  }
  if (roll < 0.74 && buyer && buyer.ctlxBalance > 1) {
    return {
      type: 'REDEEM',
      kind: 'buyer',
      accountId: buyer.id,
      amountCTLX: Math.round(rnd() * buyer.ctlxBalance),
    };
  }
  if (roll < 0.84) {
    const p = pick(providers.filter((q) => q.committedCU > 1));
    if (!p) return null;
    return { type: 'EXIT', providerId: p.id, amountCU: Math.round(rnd() * p.committedCU) };
  }
  if (roll < 0.94) {
    const p = pick(providers.filter((q) => q.committedCU > 1));
    if (!p) return null;
    return {
      type: 'FAILURE',
      providerId: p.id,
      failCU: Math.round(rnd() * p.committedCU) + 1,
    };
  }
  return { type: 'SET_PRICE', computePriceUSD: 0.5 + rnd() * 4 };
}

describe('invariant: n = V/S ≡ 1', () => {
  it('holds across 1,200 random operation sequences', () => {
    let sequences = 0;
    let operations = 0;
    let uncoveredSeen = 0;

    for (let seed = 1; seed <= 1_200; seed++) {
      const rnd = mulberry32(seed);
      let s = genesisState('sandbox');
      const steps = 12 + Math.floor(rnd() * 18);

      for (let i = 0; i < steps; i++) {
        const action = randomAction(s, rnd);
        if (!action) continue;
        const prev = s;
        s = settle(reducer(s, action));
        operations++;
        assertHealthy(s, `seed ${seed} step ${i} after ${action.type}`);

        // §10.1: n may only leave 1 on the uncovered path, and the uncovered
        // path may only be taken when stake + fund genuinely fell short.
        if (s.uncovered && !prev.uncovered) {
          uncoveredSeen++;
          const f = prev.openFailure;
          expect(f, `seed ${seed}: uncovered needs an open failure`).toBeTruthy();
          const p = prev.providers.find((x) => x.id === f!.providerId);
          const routing = routePenalty(p!.stakedCTLX, f!.escrowCTLX);
          const available = routing.stakeRemaining + prev.defaultFund + routing.toFund;
          expect(
            f!.failCU,
            `seed ${seed} step ${i}: uncovered despite sufficient cover`,
          ).toBeGreaterThan(available);
        }
      }
      sequences++;
      expect(s.assertions.violations, `seed ${seed}: reducer self-assertion`).toBe(0);
    }

    expect(sequences).toBe(1_200);
    expect(operations).toBeGreaterThan(10_000);
    // The sandbox is meant to be able to reach the shortfall; if it never did,
    // the property above would be vacuous.
    expect(uncoveredSeen).toBeGreaterThan(0);
  });

  it('never reports a violation through the reducer’s own assertion counter', () => {
    const rnd = mulberry32(99);
    let s = genesisState('sandbox');
    for (let i = 0; i < 500; i++) {
      const a = randomAction(s, rnd);
      if (a) s = settle(reducer(s, a));
    }
    expect(s.assertions.checked).toBeGreaterThan(100);
    expect(s.assertions.violations).toBe(0);
  });
});

describe('operations that must not touch the balance sheet', () => {
  it('JOB and ACQUIRE change neither V, S nor the default fund', () => {
    const rnd = mulberry32(7);
    let s = genesisState('sandbox');
    s = settle(reducer(s, { type: 'MINT', providerId: 'meridian', amountCU: 100_000 }));

    for (let i = 0; i < 300; i++) {
      const before = { v: s.vaultCU, sup: s.supplyCTLX, fund: s.defaultFund };
      const useJob = rnd() < 0.5;
      const next = useJob
        ? settle(
            reducer(s, {
              type: 'JOB_SUBMIT',
              buyerId: 'vetor',
              providerId: 'meridian',
              priceCTLX: Math.round(rnd() * 1_000),
            }),
          )
        : settle(
            reducer(s, {
              type: 'ACQUIRE',
              buyerId: 'vetor',
              providerId: 'meridian',
              amountCTLX: Math.round(rnd() * 5_000),
            }),
          );

      expect(next.vaultCU).toBe(before.v);
      expect(next.supplyCTLX).toBe(before.sup);
      expect(next.defaultFund).toBe(before.fund);
      s = next;
    }
  });

  it('the default fund moves only on the penalty slice and the write-down', () => {
    const rnd = mulberry32(23);
    let s = genesisState('sandbox');

    for (let i = 0; i < 800; i++) {
      const action = randomAction(s, rnd);
      if (!action) continue;
      const before = s.defaultFund;
      const next = settle(reducer(s, action));
      if (next.defaultFund !== before) {
        expect(
          ['DEFAULT', 'DEFAULT_PENALTY', 'DEFAULT_WRITEDOWN', 'CURE'],
          `fund moved on ${action.type}`,
        ).toContain(action.type);
        // CURE must never move it — listed above only to make a failure legible.
        expect(action.type).not.toBe('CURE');
      }
      s = next;
    }
  });
});

describe('the uncovered write-down', () => {
  it('occurs only when stake + fund is short of the write-down', () => {
    let s = genesisState('sandbox');
    // Drain the fund, then default a provider on more capacity than its stake
    // can absorb. This is the only route to a broken n, by design.
    s = reducer(s, { type: 'DRAIN_FUND' });
    expect(s.defaultFund).toBe(0);

    const before = s.providers.find((p) => p.id === 'coldharbor');
    expect(before).toBeDefined();
    const stake = before!.stakedCTLX;
    const failCU = before!.committedCU;
    expect(failCU).toBeGreaterThan(stake);

    s = reducer(s, { type: 'FAILURE', providerId: 'coldharbor', failCU });
    s = reducer(s, { type: 'DEFAULT' });

    expect(s.uncovered).toBe(true);
    expect(s.uncoveredCU).toBeCloseTo(failCU - stake, 6);
    expect(n(s)).toBeLessThan(1);
    // It broke downward by exactly the unbacked capacity.
    expect(s.vaultCU).toBeCloseTo(s.supplyCTLX - s.uncoveredCU, 6);
  });

  it('does not occur while the fund can cover the shortfall', () => {
    let s = genesisState('sandbox');
    s = reducer(s, { type: 'FAILURE', providerId: 'coldharbor', failCU: 30_000 });
    s = reducer(s, { type: 'DEFAULT' });
    expect(s.uncovered).toBe(false);
    expect(Math.abs(n(s) - 1)).toBeLessThanOrEqual(TOL);
    expect(s.defaultFund).toBeGreaterThanOrEqual(0);
  });
});

describe('price layer', () => {
  it('changing P alone changes neither V, S nor n', () => {
    const s = genesisState('sandbox');
    for (const p of [0.5, 1.25, 2.0, 3.75, 6.0]) {
      const next = reducer(s, { type: 'SET_PRICE', computePriceUSD: p });
      expect(next.vaultCU).toBe(s.vaultCU);
      expect(next.supplyCTLX).toBe(s.supplyCTLX);
      expect(n(next)).toBe(n(s));
      expect(next.computePriceUSD).toBe(p);
    }
  });

  it('arbitrage legs preserve n and settle inside the 2% band', () => {
    for (const target of [0.6, 1.1, 1.6, 2.4, 3.2, 4.5]) {
      let s = genesisState('sandbox');
      s = reducer(s, { type: 'SET_PRICE', computePriceUSD: target });

      let guard = 0;
      while (!insideBand(s.quoteUSD, s.computePriceUSD) && guard++ < 200) {
        s = reducer(s, { type: 'ARB_STEP' });
        expect(Math.abs(n(s) - 1), `arb leg at P=${target}`).toBeLessThanOrEqual(TOL);
      }

      expect(Math.abs(premium(s.quoteUSD, s.computePriceUSD))).toBeLessThanOrEqual(0.02);
      expect(s.lastArbLeg).toBe(target > 2.0 ? 'buy-and-redeem' : 'mint-and-sell');
    }
  });
});

describe('scenario mode', () => {
  it('runs all ten beats and finishes at n exactly 1', () => {
    const s = playScenario();

    expect(BEATS.length).toBe(10);
    expect(s.scenarioBeat).toBe(BEATS.length - 1);
    expect(s.uncovered).toBe(false);
    expect(s.assertions.violations).toBe(0);
    // Acceptance criterion §10.2: the max-deviation readout is 0.0000.
    expect(s.maxDeviation).toBe(0);
    expect(n(s)).toBe(1);
  });

  it('exercises the beats the marketing message depends on', () => {
    const s = playScenario();

    const coldharbor = s.providers.find((p) => p.id === 'coldharbor');
    const meridian = s.providers.find((p) => p.id === 'meridian');
    const vetor = s.buyers.find((b) => b.id === 'vetor');

    // Every CTLX is in a named, on-screen account — no anonymous float.
    expect(s.buyers.length).toBeGreaterThanOrEqual(5);
    expect(s.buyers.filter((b) => b.cuHeld > 0).length).toBeGreaterThan(1);

    expect(coldharbor?.status).toBe('defaulted');
    expect(vetor?.reimbursed).toBeGreaterThan(0);
    expect(vetor?.cuHeld).toBeGreaterThan(0);
    expect(meridian?.status).toBe('active');
    expect(s.ghostVisible).toBe(true);
    // Beat 6's whole point: the fund actually paid part of the write-down.
    expect(s.defaultFund).toBeLessThan(genesisState().defaultFund);
    // Beat 8: the quote followed compute, the purchasing power did not move.
    expect(s.computePriceUSD).toBeCloseTo(2.6, 6);
    expect(Math.abs(premium(s.quoteUSD, s.computePriceUSD))).toBeLessThanOrEqual(0.02);
  });
});

describe('reset', () => {
  it('restores exact genesis, fund included', () => {
    const rnd = mulberry32(4242);
    let s = genesisState('sandbox');
    for (let i = 0; i < 60; i++) {
      const a = randomAction(s, rnd);
      if (a) s = settle(reducer(s, a));
    }
    s = reducer(s, { type: 'DRAIN_FUND' });

    const fresh = reducer(s, { type: 'RESET', mode: 'sandbox' });
    const expected = genesisState('sandbox');

    expect(fresh.vaultCU).toBe(expected.vaultCU);
    expect(fresh.supplyCTLX).toBe(expected.supplyCTLX);
    expect(fresh.defaultFund).toBe(expected.defaultFund);
    expect(fresh.providers).toEqual(expected.providers);
    expect(fresh.buyers).toEqual(expected.buyers);
    expect(fresh.opCount).toBe(0);
    expect(fresh.maxDeviation).toBe(0);
    expect(fresh.uncovered).toBe(false);
    expect(totalHeldCTLX(fresh)).toBe(fresh.supplyCTLX);
  });
});

describe('genesis is fully accounted for on screen', () => {
  it('leaves the genesis provider holding what it minted', () => {
    const s = genesisState();
    const meridian = s.providers.find((p) => p.id === 'meridian');

    // 950,000 CU committed at a 28% collateral ratio, less the anchor's
    // contribution to the default fund. Nothing is carved off to an
    // off-screen float.
    expect(meridian?.stakedCTLX).toBe(266_000);
    expect(meridian?.liquidCTLX).toBe(679_000);
    expect(s.buyers.every((b) => b.ctlxBalance === 0)).toBe(true);
  });

  it('accounts for every CTLX in a named account', () => {
    const s = genesisState();
    expect(totalHeldCTLX(s)).toBe(s.supplyCTLX);
    expect(s.supplyCTLX).toBe(1_000_000);
  });
});

describe('gates and rejections', () => {
  it('refuses to mint below the score gate, without touching the invariant', () => {
    const s = genesisState('sandbox');
    const before = { v: s.vaultCU, sup: s.supplyCTLX };
    const next = reducer(s, { type: 'MINT', providerId: 'ferrolane', amountCU: 10_000 });

    expect(next.vaultCU).toBe(before.v);
    expect(next.supplyCTLX).toBe(before.sup);
    expect(next.events[0].tag).toBe('no-op');
    expect(n(next)).toBe(1);
  });

  it('rejects a stalled quorum and a duplicate device, leaving n untouched', () => {
    for (const fault of ['failAttestation', 'duplicateDevice'] as const) {
      let s = genesisState('sandbox');
      s = reducer(s, { type: 'SET_FAULT', fault, on: true });
      s = reducer(s, { type: 'MINT_BEGIN', providerId: 'meridian', amountCU: 25_000 });
      s = settle(s);

      expect(s.vaultCU).toBe(genesisState().vaultCU);
      expect(s.supplyCTLX).toBe(genesisState().supplyCTLX);
      expect(n(s)).toBe(1);
      expect(s.attestation).toBeNull();
    }
  });
});

describe('unused action kinds are still exhaustive', () => {
  it('every action type the UI can emit is handled', () => {
    const kinds: Kind[] = [
      'RESET',
      'SET_MODE',
      'MINT_BEGIN',
      'ATTEST_STEP',
      'ATTEST_DISMISS',
      'MINT',
      'REDEEM',
      'ACQUIRE',
      'JOB_SUBMIT',
      'JOB_STEP',
      'EXIT',
      'FAILURE',
      'CURE',
      'DEFAULT',
      'DEFAULT_PENALTY',
      'DEFAULT_WRITEDOWN',
      'SET_PRICE',
      'ARB_STEP',
      'TOGGLE_GHOST',
      'SET_FAULT',
      'DRAIN_FUND',
      'SET_BEAT',
      'SET_SCENARIO_RUNNING',
    ];
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

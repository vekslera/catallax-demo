/**
 * scenario.ts — the guided walkthrough, as data.
 *
 * Beats are scripted dispatches of the *same* actions the sandbox buttons
 * emit. There is no parallel logic path: if a beat produces a number, the
 * reducer produced it (spec §6).
 *
 * Amounts that the spec states as proportions (the 40% run) are computed from
 * live state when the beat starts, via `prepare`. Nothing here hardcodes a
 * result.
 */

import type { Action } from './protocol';
import type { ProtocolState } from './types';

export type Focus = 'provider' | 'buyer' | 'vault' | 'market';

export type BeatContext = Record<string, number>;

export interface BeatStep {
  /** Milliseconds from the start of the beat. */
  at: number;
  action: (s: ProtocolState, ctx: BeatContext) => Action | null;
}

export interface Beat {
  id: number;
  actor: string;
  focus: Focus;
  /** Verbatim UI copy from spec §6. */
  narration: string;
  /** Computed once, from live state, when the beat starts. */
  prepare?: (s: ProtocolState) => BeatContext;
  steps: BeatStep[];
  /** Milliseconds until the beat has finished animating. */
  duration: number;
}

const MERIDIAN = 'meridian';
const COLDHARBOR = 'coldharbor';
const VETOR = 'vetor';

/*
 * Note on clocks: attestation stepping, job execution/verification and the
 * arbitrage loop are driven by the store's own timers, in both modes. A beat
 * only kicks them off — otherwise the scenario would be a second clock racing
 * the first.
 */

/**
 * Beat 4: eight staggered redemptions totalling 40% of supply at beat start.
 *
 * The run is executed by the named buyers that took up the float in Beat 2 —
 * every CTLX burned here comes out of an account the viewer can see drain.
 * Vetor Labs sits it out: it is the protagonist buyer and still has a job to
 * place in Beat 6.
 */
const RUN_BUYERS = ['halcyon', 'northwind', 'kestrel', 'ridgeline'] as const;
const RUN_TRANCHES = 2;
const RUN_FRACTION = 0.4;

/** Beat 2: the float forms through visible purchases, not a genesis carve-out. */
const FLOAT_PURCHASES: ReadonlyArray<{ id: string; amount: number }> = [
  { id: 'halcyon', amount: 130_000 },
  { id: 'northwind', amount: 120_000 },
  { id: 'kestrel', amount: 110_000 },
  { id: 'ridgeline', amount: 100_000 },
];

export const BEATS: readonly Beat[] = [
  {
    id: 0,
    actor: 'Genesis',
    focus: 'vault',
    narration:
      'A currency backed by computation. The vault holds one committed compute unit behind every token: n = V/S = 1. Exactly. Watch it not move.',
    steps: [],
    duration: 1200,
  },
  {
    id: 1,
    actor: 'Meridian DC',
    focus: 'provider',
    narration:
      'A data center proves its hardware is real — TEE attestation, then a 3-of-5 certifier quorum — and mints currency against committed compute, one for one. Its delivery record sets its collateral: reputation is the credit line.',
    steps: [
      {
        at: 300,
        action: (): Action => ({ type: 'MINT_BEGIN', providerId: MERIDIAN, amountCU: 100_000 }),
      },
    ],
    duration: 3600,
  },
  {
    id: 2,
    actor: 'Vetor Labs',
    focus: 'buyer',
    narration:
      "A buyer acquires CTLX and pays for a training run. Transfers, not mints — the vault doesn't notice. Commerce rides on top of the money.",
    steps: [
      {
        at: 200,
        action: (): Action => ({
          type: 'ACQUIRE',
          buyerId: VETOR,
          providerId: MERIDIAN,
          amountCTLX: 20_000,
        }),
      },
      // The rest of the market takes up the float from the same provider.
      ...FLOAT_PURCHASES.map(({ id, amount }, i) => ({
        at: 500 + i * 220,
        action: (): Action => ({
          type: 'ACQUIRE' as const,
          buyerId: id,
          providerId: MERIDIAN,
          amountCTLX: amount,
        }),
      })),
      {
        at: 1600,
        action: (): Action => ({
          type: 'JOB_SUBMIT',
          buyerId: VETOR,
          providerId: MERIDIAN,
          priceCTLX: 5_000,
        }),
      },
    ],
    duration: 5600,
  },
  {
    id: 3,
    actor: 'Vetor Labs',
    focus: 'buyer',
    narration:
      'Redemption is the promise: burn a token, withdraw a compute unit. Exactly one. Both sides of the balance sheet contract together.',
    steps: [
      {
        at: 300,
        action: (): Action => ({
          type: 'REDEEM',
          kind: 'buyer',
          accountId: VETOR,
          amountCTLX: 10_000,
        }),
      },
    ],
    duration: 1600,
  },
  {
    id: 4,
    actor: 'Many holders',
    focus: 'vault',
    narration:
      'The stress test. A run: 40% of supply redeems at once. An orderbook design goes insolvent here — the grey line. Catallax contracts elastically. n never moves. There is no first-mover advantage, so there is no reason to run.',
    // Each running buyer redeems its pro-rata share of 40% of supply, split
    // into tranches so the run is staggered rather than instantaneous.
    prepare: (s) => {
      const target = s.supplyCTLX * RUN_FRACTION;
      const pool = RUN_BUYERS.reduce(
        (a, id) => a + (s.buyers.find((b) => b.id === id)?.ctlxBalance ?? 0),
        0,
      );
      const ctx: BeatContext = {};
      for (const id of RUN_BUYERS) {
        const held = s.buyers.find((b) => b.id === id)?.ctlxBalance ?? 0;
        ctx[id] = pool > 0 ? (held / pool) * target : 0;
      }
      return ctx;
    },
    steps: [
      { at: 0, action: (): Action => ({ type: 'TOGGLE_GHOST', visible: true }) },
      ...Array.from({ length: RUN_BUYERS.length * RUN_TRANCHES }, (_, i) => ({
        at: 200 + i * 600,
        action: (_s: ProtocolState, ctx: BeatContext): Action => ({
          type: 'REDEEM' as const,
          kind: 'buyer' as const,
          accountId: RUN_BUYERS[i % RUN_BUYERS.length],
          amountCTLX: ctx[RUN_BUYERS[i % RUN_BUYERS.length]] / RUN_TRANCHES,
        }),
      })),
    ],
    duration: 5600,
  },
  {
    id: 5,
    actor: 'Meridian DC',
    focus: 'provider',
    narration:
      "Hardware dies — routinely. The protocol's first answer isn't punishment; it's a duty to cure: buy replacement delivery on the open market and pledge it. The vault never felt the failure.",
    steps: [
      { at: 300, action: (): Action => ({ type: 'FAILURE', providerId: MERIDIAN, failCU: 15_000 }) },
      { at: 2000, action: (): Action => ({ type: 'CURE' }) },
    ],
    duration: 3000,
  },
  {
    id: 6,
    actor: 'Coldharbor',
    focus: 'provider',
    narration:
      'And when a provider abandons its promises: its stake pays the harmed buyer, and the matched write-down — stake first, default fund second — erases the dead capacity against an equal burn. Watch n: still 1.0000. The 1:1 promise survives defaults, not just fair weather.',
    steps: [
      {
        at: 200,
        action: (): Action => ({
          type: 'JOB_SUBMIT',
          buyerId: VETOR,
          providerId: COLDHARBOR,
          priceCTLX: 5_000,
        }),
      },
      {
        at: 1800,
        action: (): Action => ({ type: 'FAILURE', providerId: COLDHARBOR, failCU: 30_000 }),
      },
      { at: 3400, action: (): Action => ({ type: 'DEFAULT_PENALTY' }) },
      { at: 4600, action: (): Action => ({ type: 'DEFAULT_WRITEDOWN' }) },
    ],
    duration: 6000,
  },
  {
    id: 7,
    actor: 'Meridian DC',
    focus: 'provider',
    narration:
      "Providers can leave. Withdrawal burns exactly what it withdraws — the institution doesn't depend on anyone staying.",
    steps: [
      { at: 300, action: (): Action => ({ type: 'EXIT', providerId: MERIDIAN, amountCU: 50_000 }) },
    ],
    duration: 1800,
  },
  {
    id: 8,
    actor: 'Market',
    focus: 'market',
    narration:
      "Energy prices jump; compute gets more expensive. CTLX's dollar price rises with it — and its compute price doesn't move at all. One token still buys exactly one compute unit. A dollar-pegged coin would have done the opposite: held the dollar, lost the compute. That is what adiabatic means.",
    steps: [
      { at: 300, action: (): Action => ({ type: 'SET_PRICE', computePriceUSD: 2.6 }) },
    ],
    duration: 3400,
  },
  {
    id: 9,
    actor: 'Close',
    focus: 'vault',
    narration:
      'Every operation you watched — minting, running, failing, defaulting, leaving, repricing — left n at exactly one. That’s the whole design. Now try to break it yourself.',
    steps: [],
    duration: 1000,
  },
];

export const LAST_BEAT = BEATS.length - 1;

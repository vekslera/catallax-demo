/**
 * protocol.ts — composes settlement.ts (generic money) and compute.ts
 * (the collateral adapter) and market.ts (the price layer) into the single
 * reducer that both modes run through.
 *
 * There is exactly one code path. Scenario beats are scripted dispatches of
 * the same actions the sandbox buttons emit; nothing in this file knows which
 * mode asked.
 */

import {
  drawStakeFirst,
  issue,
  parity,
  retire,
  routePenalty,
  splitCollateral,
  withdrawable,
  writeDown,
  type Ledger,
} from './settlement';
import {
  advanceAttestation,
  beginAttestation,
  canMint,
  collateralRatio,
  cureCost,
  deviceAlreadyBound,
  isAttestationTerminal,
  scoreAfterCure,
  scoreAfterJob,
} from './compute';
import { arbitrageStep } from './market';
import { genesisState } from './genesis';
import type {
  Flow,
  LedgerEvent,
  LedgerTag,
  Mode,
  ProtocolState,
  Provider,
} from './types';

/** Relative tolerance for the invariant assertion. */
export const N_TOLERANCE = 1e-9;

/**
 * Only named buyers hold redeemable CTLX. Provider stake and liquid balances
 * are held by providers, and neither is redeemed through this path.
 */
export type AccountKind = 'buyer';

export type Action =
  | { type: 'RESET'; mode?: Mode }
  | { type: 'SET_MODE'; mode: Mode }
  // --- minting, with and without the attestation animation ---
  | { type: 'MINT_BEGIN'; providerId: string; amountCU: number }
  | { type: 'ATTEST_STEP' }
  | { type: 'ATTEST_DISMISS' }
  | { type: 'MINT'; providerId: string; amountCU: number }
  // --- core operations ---
  | { type: 'REDEEM'; kind: AccountKind; accountId: string; amountCTLX: number }
  | { type: 'ACQUIRE'; buyerId: string; providerId: string; amountCTLX: number }
  | { type: 'JOB_SUBMIT'; buyerId: string; providerId: string; priceCTLX: number }
  | { type: 'JOB_STEP' }
  | { type: 'EXIT'; providerId: string; amountCU: number }
  // --- failure resolution ---
  | { type: 'FAILURE'; providerId: string; failCU: number }
  | { type: 'CURE' }
  | { type: 'DEFAULT' }
  | { type: 'DEFAULT_PENALTY' }
  | { type: 'DEFAULT_WRITEDOWN' }
  // --- price layer ---
  | { type: 'SET_PRICE'; computePriceUSD: number }
  | { type: 'ARB_STEP' }
  // --- presentation / sandbox ---
  | { type: 'TOGGLE_GHOST'; visible?: boolean }
  | { type: 'SET_FAULT'; fault: 'failAttestation' | 'duplicateDevice'; on: boolean }
  | { type: 'DRAIN_FUND' }
  | { type: 'SET_BEAT'; beat: number }
  | { type: 'SET_SCENARIO_RUNNING'; running: boolean };

// ---------------------------------------------------------------------------
// ledger <-> state adapters
// ---------------------------------------------------------------------------

export function toLedger(s: ProtocolState): Ledger {
  return { vault: s.vaultCU, supply: s.supplyCTLX, defaultFund: s.defaultFund };
}

export function withLedger(s: ProtocolState, l: Ledger): ProtocolState {
  return { ...s, vaultCU: l.vault, supplyCTLX: l.supply, defaultFund: l.defaultFund };
}

/** n = V/S. Derived on read, never stored. */
export function n(s: ProtocolState): number {
  return parity({ vault: s.vaultCU, supply: s.supplyCTLX });
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function fmt(x: number): string {
  return Math.round(x).toLocaleString('en-US');
}

function mapProvider(
  s: ProtocolState,
  id: string,
  f: (p: Provider) => Provider,
): ProtocolState {
  return { ...s, providers: s.providers.map((p) => (p.id === id ? f(p) : p)) };
}

function getProvider(s: ProtocolState, id: string): Provider | undefined {
  return s.providers.find((p) => p.id === id);
}

/**
 * Redemption delivers compute out of somebody's committed capacity. Draw it
 * down largest-first, so that Σ committedCU === V is preserved.
 *
 * Without this the vault could be redeemed down below the capacity providers
 * still claim to have committed, and a later default would write down more
 * collateral than the vault holds — driving V negative. Every operation that
 * removes collateral has to remove it from a named balance sheet.
 */
function releaseCapacity(providers: Provider[], units: number): Provider[] {
  let remaining = units;
  if (remaining <= 0) return providers;

  const taken = new Map<string, number>();
  const order = [...providers].sort((a, b) => b.committedCU - a.committedCU);
  for (const p of order) {
    if (remaining <= 0) break;
    const take = Math.min(p.committedCU, remaining);
    if (take > 0) {
      taken.set(p.id, take);
      remaining -= take;
    }
  }

  return providers.map((p) =>
    taken.has(p.id) ? { ...p, committedCU: p.committedCU - (taken.get(p.id) as number) } : p,
  );
}

interface Note {
  text: string;
  tag: LedgerTag;
  side: LedgerEvent['side'];
  /** Beam direction for FlowAnimation. Defaults to no animation. */
  flow?: Flow;
}

const MAX_EVENTS = 200;
const MAX_HISTORY = 600;

/**
 * Append the ledger entry, push the n sample, and run the invariant assertion.
 * Every state transition that counts as an "operation" goes through here.
 */
function commit(next: ProtocolState, note: Note): ProtocolState {
  const seq = next.seq + 1;
  const nVal = parity({ vault: next.vaultCU, supply: next.supplyCTLX });
  const deviation = Math.abs(nVal - 1);
  // A deviation is only legitimate on the uncovered path. Anywhere else it is
  // a bug, and the dev-mode counter says so out loud.
  const violation = !next.uncovered && deviation > N_TOLERANCE;

  const event: LedgerEvent = {
    id: seq,
    t: seq,
    text: note.text,
    tag: note.tag,
    side: note.side,
    n: nVal,
    flow: note.flow ?? 'none',
  };

  return {
    ...next,
    seq,
    opCount: next.opCount + 1,
    maxDeviation: Math.max(next.maxDeviation, deviation),
    events: [event, ...next.events].slice(0, MAX_EVENTS),
    nHistory: [...next.nHistory, { t: seq, n: nVal }].slice(-MAX_HISTORY),
    assertions: {
      checked: next.assertions.checked + 1,
      violations: next.assertions.violations + (violation ? 1 : 0),
    },
  };
}

/** A rejected operation: recorded, but nothing moved. */
function noop(s: ProtocolState, text: string, side: LedgerEvent['side']): ProtocolState {
  return commit(s, { text, tag: 'no-op', side });
}

// ---------------------------------------------------------------------------
// operations
// ---------------------------------------------------------------------------

/**
 * MINT — issuance is exactly ΔS = ΔV. Of the minted CTLX, s(score) is locked
 * as stake and the remainder is liquid.
 */
function applyMint(s: ProtocolState, providerId: string, amountCU: number): ProtocolState {
  const p = getProvider(s, providerId);
  if (!p) return s;
  if (!canMint(p)) return noop(s, `Mint refused — ${p.name} below gate`, 'provider');
  if (deviceAlreadyBound(s.providers, p.deviceId, p.id))
    return noop(s, 'Device already bound — mint rejected', 'provider');

  const amount = Math.max(0, amountCU);
  if (amount <= 0) return s;

  const { staked, liquid } = splitCollateral(amount, collateralRatio(p.score));
  const next = mapProvider(withLedger(s, issue(toLedger(s), amount)), providerId, (q) => ({
    ...q,
    committedCU: q.committedCU + amount,
    stakedCTLX: q.stakedCTLX + staked,
    liquidCTLX: q.liquidCTLX + liquid,
  }));

  return commit(next, {
    text: `${p.name} minted ${fmt(amount)} CU`,
    tag: 'invariant',
    side: 'provider',
    flow: 'provider-in',
  });
}

/** REDEEM — burn ΔS CTLX, withdraw ΔV = ΔS CU. */
function applyRedeem(
  s: ProtocolState,
  _kind: AccountKind,
  accountId: string,
  amountCTLX: number,
): ProtocolState {
  const holder = s.buyers.find((b) => b.id === accountId);
  if (!holder) return s;

  // Guard: ΔS ≤ balance and ΔS ≤ V. The second cannot bind while the
  // invariant holds — we assert it anyway.
  const amount = Math.max(0, Math.min(amountCTLX, holder.ctlxBalance, s.vaultCU));
  if (amount <= 0) return s;

  let next = withLedger(s, retire(toLedger(s), amount));
  next = {
    ...next,
    providers: releaseCapacity(next.providers, amount),
    buyers: next.buyers.map((b) =>
      b.id === accountId
        ? { ...b, ctlxBalance: b.ctlxBalance - amount, cuHeld: b.cuHeld + amount }
        : b,
    ),
  };
  const who = holder.name;

  return commit(next, {
    text: `${who} redeemed ${fmt(amount)} CTLX`,
    tag: 'invariant',
    side: 'buyer',
    flow: 'buyer-out',
  });
}

/** ACQUIRE — OTC at par. A transfer of existing CTLX; the vault never notices. */
function applyAcquire(
  s: ProtocolState,
  buyerId: string,
  providerId: string,
  amountCTLX: number,
): ProtocolState {
  const p = getProvider(s, providerId);
  const b = s.buyers.find((x) => x.id === buyerId);
  if (!p || !b) return s;

  const amount = Math.max(0, Math.min(amountCTLX, p.liquidCTLX));
  if (amount <= 0) return noop(s, 'No liquid CTLX offered — no trade', 'buyer');

  const next: ProtocolState = {
    ...mapProvider(s, providerId, (q) => ({ ...q, liquidCTLX: q.liquidCTLX - amount })),
    buyers: s.buyers.map((x) =>
      x.id === buyerId ? { ...x, ctlxBalance: x.ctlxBalance + amount } : x,
    ),
  };

  return commit(next, {
    text: `${b.name} acquired ${fmt(amount)} CTLX at par`,
    tag: 'no-op',
    side: 'buyer',
    flow: 'cross',
  });
}

/** JOB — buyer escrows CTLX for computation. Transfer only. */
function applyJobSubmit(
  s: ProtocolState,
  buyerId: string,
  providerId: string,
  priceCTLX: number,
): ProtocolState {
  const b = s.buyers.find((x) => x.id === buyerId);
  const p = getProvider(s, providerId);
  if (!b || !p || s.activeJob) return s;

  const price = Math.max(0, Math.min(priceCTLX, b.ctlxBalance));
  if (price <= 0) return noop(s, 'Insufficient balance — job not submitted', 'buyer');

  const next: ProtocolState = {
    ...s,
    buyers: s.buyers.map((x) =>
      x.id === buyerId ? { ...x, ctlxBalance: x.ctlxBalance - price } : x,
    ),
    escrowCTLX: s.escrowCTLX + price,
    activeJob: { buyerId, providerId, priceCTLX: price, phase: 'escrowed' },
  };

  return commit(next, {
    text: `${b.name} escrowed ${fmt(price)} CTLX`,
    tag: 'no-op',
    side: 'buyer',
    flow: 'cross',
  });
}

/** Advance the simulated execution → verification → settlement sequence. */
function applyJobStep(s: ProtocolState): ProtocolState {
  const job = s.activeJob;
  if (!job) return s;

  if (job.phase === 'escrowed') return { ...s, activeJob: { ...job, phase: 'executing' } };
  if (job.phase === 'executing') return { ...s, activeJob: { ...job, phase: 'verifying' } };
  if (job.phase === 'settled') return s;

  // verifying → settled: escrow releases to the provider, delivery record grows.
  const next: ProtocolState = {
    ...mapProvider(s, job.providerId, (q) => ({
      ...q,
      liquidCTLX: q.liquidCTLX + job.priceCTLX,
      score: scoreAfterJob(q.score),
    })),
    escrowCTLX: s.escrowCTLX - job.priceCTLX,
    buyers: s.buyers.map((b) =>
      b.id === job.buyerId ? { ...b, jobsCompleted: b.jobsCompleted + 1 } : b,
    ),
    activeJob: null,
  };

  return commit(next, {
    text: 'Transfer only — invariant untouched',
    tag: 'no-op',
    side: 'buyer',
    flow: 'cross',
  });
}

/** EXIT — withdrawal burns exactly what it withdraws. */
function applyExit(s: ProtocolState, providerId: string, amountCU: number): ProtocolState {
  const p = getProvider(s, providerId);
  if (!p) return s;

  const cap = withdrawable(p.committedCU, p.stakedCTLX, p.liquidCTLX);
  const dV = Math.max(0, Math.min(amountCU, cap, s.vaultCU));
  if (dV <= 0) return noop(s, 'Nothing withdrawable — stake exhausted', 'provider');

  const drawn = drawStakeFirst(p.stakedCTLX, p.liquidCTLX, dV);
  const next = mapProvider(withLedger(s, retire(toLedger(s), dV)), providerId, (q) => ({
    ...q,
    committedCU: q.committedCU - dV,
    stakedCTLX: drawn.staked,
    liquidCTLX: drawn.liquid,
    status: q.committedCU - dV <= 0 && q.status === 'active' ? 'exited' : q.status,
  }));

  return commit(next, {
    text: `${p.name} exited ${fmt(dV)} CU`,
    tag: 'invariant',
    side: 'provider',
    flow: 'provider-out',
  });
}

/**
 * HARDWARE FAILURE — marks capacity dead and opens the cure window. Nothing
 * monetary happens yet: the protocol's first answer is a duty, not a penalty.
 */
function applyFailure(s: ProtocolState, providerId: string, failCU: number): ProtocolState {
  const p = getProvider(s, providerId);
  if (!p || s.openFailure) return s;

  const dead = Math.max(0, Math.min(failCU, p.committedCU));
  if (dead <= 0) return s;

  // An in-flight job on this provider dies with the hardware. Its escrow stays
  // held by the protocol until the failure resolves.
  const job = s.activeJob && s.activeJob.providerId === providerId ? s.activeJob : null;

  const next: ProtocolState = {
    ...mapProvider(s, providerId, (q) => ({ ...q, status: 'failed' })),
    activeJob: job ? null : s.activeJob,
    openFailure: {
      providerId,
      failCU: dead,
      harmedBuyerId: job ? job.buyerId : null,
      escrowCTLX: job ? job.priceCTLX : 0,
      phase: 'open',
    },
  };

  return commit(next, {
    text: `${p.name} lost ${fmt(dead)} CU capacity`,
    tag: 'no-op',
    side: 'provider',
    flow: 'pulse',
  });
}

/**
 * CURE — the substitution duty. The provider buys replacement delivery on the
 * auction and pledges it. V and S untouched; the score takes a small ding.
 */
function applyCure(s: ProtocolState): ProtocolState {
  const f = s.openFailure;
  if (!f) return s;
  const p = getProvider(s, f.providerId);
  if (!p) return s;

  const cost = cureCost(f.failCU);
  if (p.liquidCTLX < cost)
    return noop(s, 'Cannot fund substitution — cure unavailable', 'provider');

  // The counterparty is another active provider selling delivery on the
  // auction. A transfer between providers: S does not move. Without a
  // counterparty there is no replacement to buy — the duty to cure cannot be
  // discharged, and the payment must not simply vanish.
  const seller = s.providers.find(
    (q) => q.id !== p.id && q.status === 'active' && q.committedCU > 0,
  );
  if (!seller) return noop(s, 'No replacement offered — cure unavailable', 'provider');

  let next: ProtocolState = mapProvider(s, p.id, (q) => ({
    ...q,
    liquidCTLX: q.liquidCTLX - cost,
    score: scoreAfterCure(q.score),
    status: 'active',
  }));
  next = mapProvider(next, seller.id, (q) => ({ ...q, liquidCTLX: q.liquidCTLX + cost }));

  // The buyer's job was substituted, so the escrow releases to the provider.
  if (f.harmedBuyerId && f.escrowCTLX > 0) {
    next = {
      ...mapProvider(next, p.id, (q) => ({ ...q, liquidCTLX: q.liquidCTLX + f.escrowCTLX })),
      escrowCTLX: next.escrowCTLX - f.escrowCTLX,
      buyers: next.buyers.map((b) =>
        b.id === f.harmedBuyerId ? { ...b, jobsCompleted: b.jobsCompleted + 1 } : b,
      ),
    };
  }

  next = { ...next, openFailure: null };

  return commit(next, {
    text: 'Cured by substitution — invariant untouched',
    tag: 'no-op',
    side: 'provider',
    flow: 'provider-in',
  });
}

/**
 * DEFAULT, step 1 — penalty routing. The dead job's escrow returns to the
 * buyer, and δ = min(stake, escrow + 10%) is drawn from stake: most of it
 * compensates the buyer, a fixed slice accrues to the default fund.
 *
 * Split from the write-down so the UI can animate the sequence (spec §4).
 */
function applyDefaultPenalty(s: ProtocolState): ProtocolState {
  const f = s.openFailure;
  if (!f || f.phase !== 'open') return s;
  const p = getProvider(s, f.providerId);
  if (!p) return s;

  const routing = routePenalty(p.stakedCTLX, f.escrowCTLX);
  let next = s;

  if (f.harmedBuyerId) {
    next = {
      ...next,
      buyers: next.buyers.map((b) =>
        b.id === f.harmedBuyerId
          ? {
              ...b,
              ctlxBalance: b.ctlxBalance + f.escrowCTLX + routing.toClaimant,
              reimbursed: b.reimbursed + routing.toClaimant,
            }
          : b,
      ),
      escrowCTLX: next.escrowCTLX - f.escrowCTLX,
    };
  }
  next = mapProvider(next, p.id, (q) => ({ ...q, stakedCTLX: routing.stakeRemaining }));
  next = {
    ...next,
    defaultFund: next.defaultFund + routing.toFund,
    openFailure: { ...f, phase: 'penalized' },
  };

  if (routing.delta <= 0) return next;

  return commit(next, {
    text: `Stake penalty ${fmt(routing.delta)} CTLX routed`,
    tag: 'no-op',
    side: 'protocol',
    flow: 'cross',
  });
}

/**
 * DEFAULT, step 2 — the matched write-down. Dead capacity leaves the vault and
 * an equal quantity of CTLX is burned against it, stake first and default fund
 * second. n survives; that is the headline.
 */
function applyDefaultWriteDown(s: ProtocolState): ProtocolState {
  const f = s.openFailure;
  if (!f || f.phase !== 'penalized') return s;
  const p = getProvider(s, f.providerId);
  if (!p) return s;

  let next = s;
  const wd = writeDown(toLedger(next), f.failCU, p.stakedCTLX);
  next = withLedger(next, wd.ledger);
  next = mapProvider(next, p.id, (q) => ({
    ...q,
    committedCU: q.committedCU - f.failCU,
    stakedCTLX: wd.stakeRemaining,
    status: 'defaulted',
    score: 0,
  }));
  next = {
    ...next,
    openFailure: null,
    uncovered: next.uncovered || wd.uncovered,
    uncoveredCU: next.uncoveredCU + wd.shortfall,
  };

  next = commit(next, {
    text: `Write-down burned ${fmt(wd.fromStake + wd.fromFund)} CTLX`,
    tag: wd.uncovered ? 'uncovered' : 'invariant',
    side: 'protocol',
    flow: 'provider-out',
  });

  // 3. Shortfall, if any, gets its own line. Sandbox-only.
  if (wd.uncovered) {
    next = commit(next, {
      text: `Uncovered write-down — ${fmt(wd.shortfall)} CU unbacked`,
      tag: 'uncovered',
      side: 'protocol',
    });
  }

  return next;
}

// ---------------------------------------------------------------------------
// price layer
// ---------------------------------------------------------------------------

/**
 * One arbitrage step. Both legs move V and S by the same quantity, so the
 * invariant is untouched by construction.
 */
function applyArbStep(s: ProtocolState): ProtocolState {
  const holderFloat = s.buyers.reduce((a, b) => a + b.ctlxBalance, 0);
  const step = arbitrageStep(
    s.quoteUSD,
    s.computePriceUSD,
    s.supplyCTLX,
    // Mint-and-sell has no inventory constraint. Buy-and-redeem can only
    // redeem CTLX that someone actually holds, and can only withdraw compute
    // the vault actually has — which are different limits once an uncovered
    // write-down has pushed V below S.
    s.quoteUSD > s.computePriceUSD
      ? Number.MAX_SAFE_INTEGER
      : Math.min(holderFloat, s.vaultCU),
  );
  if (!step) return s;

  // The quote converges whether or not a trade clears: it is the open
  // opportunity that moves the price.
  let next: ProtocolState = { ...s, quoteUSD: step.nextQuoteUSD, lastArbLeg: step.leg };
  if (step.volume <= 0) return next;

  if (step.leg === 'mint-and-sell') {
    const minter = s.providers.find((p) => canMint(p));
    if (!minter) return next;

    const { staked, liquid } = splitCollateral(step.volume, collateralRatio(minter.score));
    next = mapProvider(withLedger(next, issue(toLedger(next), step.volume)), minter.id, (q) => ({
      ...q,
      committedCU: q.committedCU + step.volume,
      stakedCTLX: q.stakedCTLX + staked,
      // The liquid portion is immediately sold into the float.
      liquidCTLX: q.liquidCTLX,
    }));
    next = distributeToFloat(next, liquid);

    return commit(next, {
      text: 'Arbitrage: minted and sold',
      tag: 'invariant',
      side: 'market',
      flow: 'provider-in',
    });
  }

  // buy-and-redeem: the arbitrageur buys CTLX from the float and redeems it.
  next = takeFromFloat(next, step.volume);
  next = withLedger(next, retire(toLedger(next), step.volume));
  next = { ...next, providers: releaseCapacity(next.providers, step.volume) };

  return commit(next, {
    text: 'Arbitrage: bought and redeemed',
    tag: 'invariant',
    side: 'market',
    flow: 'buyer-out',
  });
}

/** Sell CTLX into the float — that is, spread it evenly across named buyers. */
function distributeToFloat(s: ProtocolState, amount: number): ProtocolState {
  if (amount <= 0 || s.buyers.length === 0) return s;
  const per = amount / s.buyers.length;
  return { ...s, buyers: s.buyers.map((b) => ({ ...b, ctlxBalance: b.ctlxBalance + per })) };
}

/** Draw `amount` pro-rata from the float, capped by what is actually held. */
function takeFromFloat(s: ProtocolState, amount: number): ProtocolState {
  const total = s.buyers.reduce((a, b) => a + b.ctlxBalance, 0);
  if (total <= 0) return s;
  const take = Math.min(amount, total);
  return {
    ...s,
    buyers: s.buyers.map((b) => ({
      ...b,
      ctlxBalance: b.ctlxBalance - (b.ctlxBalance / total) * take,
    })),
  };
}

// ---------------------------------------------------------------------------
// reducer
// ---------------------------------------------------------------------------

export function reducer(s: ProtocolState, action: Action): ProtocolState {
  switch (action.type) {
    case 'RESET':
      return genesisState(action.mode ?? s.mode);

    case 'SET_MODE':
      return { ...s, mode: action.mode, scenarioRunning: false };

    case 'MINT_BEGIN': {
      const p = getProvider(s, action.providerId);
      if (!p || s.attestation) return s;
      if (!canMint(p)) return noop(s, `Mint refused — ${p.name} below gate`, 'provider');
      return {
        ...s,
        attestation: beginAttestation(action.providerId, action.amountCU, s.faults),
      };
    }

    case 'ATTEST_STEP': {
      if (!s.attestation) return s;
      if (isAttestationTerminal(s.attestation)) return s;
      return { ...s, attestation: advanceAttestation(s.attestation, s.certifiers.k, s.faults) };
    }

    case 'ATTEST_DISMISS': {
      const a = s.attestation;
      if (!a) return s;
      if (a.phase === 'authorized') {
        return { ...applyMint(s, a.providerId, a.amountCU), attestation: null };
      }
      if (a.phase === 'rejected-quorum')
        return { ...noop(s, 'Quorum stalled — mint rejected', 'provider'), attestation: null };
      if (a.phase === 'rejected-device')
        return {
          ...noop(s, 'Device already bound — mint rejected', 'provider'),
          attestation: null,
        };
      return { ...s, attestation: null };
    }

    case 'MINT':
      return applyMint(s, action.providerId, action.amountCU);

    case 'REDEEM':
      return applyRedeem(s, action.kind, action.accountId, action.amountCTLX);

    case 'ACQUIRE':
      return applyAcquire(s, action.buyerId, action.providerId, action.amountCTLX);

    case 'JOB_SUBMIT':
      return applyJobSubmit(s, action.buyerId, action.providerId, action.priceCTLX);

    case 'JOB_STEP':
      return applyJobStep(s);

    case 'EXIT':
      return applyExit(s, action.providerId, action.amountCU);

    case 'FAILURE':
      return applyFailure(s, action.providerId, action.failCU);

    case 'CURE':
      return applyCure(s);

    case 'DEFAULT':
      return applyDefaultWriteDown(applyDefaultPenalty(s));

    case 'DEFAULT_PENALTY':
      return applyDefaultPenalty(s);

    case 'DEFAULT_WRITEDOWN':
      return applyDefaultWriteDown(s);

    case 'SET_PRICE': {
      // P alone never moves V, S or n. It is exogenous — the protocol does not
      // set it and does not react to it except through arbitrage.
      const price = Math.max(0.01, action.computePriceUSD);
      return { ...s, computePriceUSD: price };
    }

    case 'ARB_STEP':
      return applyArbStep(s);

    case 'TOGGLE_GHOST': {
      const visible = action.visible ?? !s.ghostVisible;
      // Pin the counterfactual to wherever the run starts, so the grey line
      // collapses across the same sequence indices the real redemptions occupy.
      const anchor = visible ? (s.ghostAnchorT ?? s.seq) : s.ghostAnchorT;
      return { ...s, ghostVisible: visible, ghostAnchorT: anchor };
    }

    case 'SET_FAULT':
      return { ...s, faults: { ...s.faults, [action.fault]: action.on } };

    case 'DRAIN_FUND': {
      // Sandbox only. The CTLX is not destroyed — it moves to the float, so
      // total holdings still equal S. Draining is what makes the uncovered
      // write-down reachable from an *ordinary* failure; a large enough
      // default outruns stake and fund together in any case.
      if (s.defaultFund <= 0) return s;
      const drained = s.defaultFund;
      const next = distributeToFloat({ ...s, defaultFund: 0 }, drained);
      return commit(next, {
        text: 'Default fund drained to float',
        tag: 'no-op',
        side: 'protocol',
      });
    }

    case 'SET_BEAT':
      return { ...s, scenarioBeat: action.beat };

    case 'SET_SCENARIO_RUNNING':
      return { ...s, scenarioRunning: action.running };

    default:
      return s;
  }
}

export { genesisState };

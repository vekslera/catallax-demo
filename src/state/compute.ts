/**
 * compute.ts — the COMPUTE-SPECIFIC adapter.
 *
 * CU semantics, attestation simulation, device registry, reliability scoring,
 * failure and cure. May import from settlement.ts; settlement.ts never imports
 * from here (spec §11).
 */

import { clamp } from './settlement';
import type { Attestation, Provider } from './types';

/** Providers below this score cannot mint. Mint access is earned. */
export const MINT_SCORE_GATE = 40;

/** Score awarded per completed job, capped. */
export const SCORE_PER_JOB = 1;
export const SCORE_CAP = 100;

/** Score dinged when a provider cures a failure by substitution. */
export const CURE_SCORE_PENALTY = 2;

/** Default certifier quorum. */
export const QUORUM_K = 3;
export const QUORUM_N = 5;

/**
 * Stake curve (demo form): s(score) = clamp(1 − score/125, 0.10, 1.0).
 *
 * Score 0 → 100% of the mint locked; score 90 → 28%; the curve floors at 10%
 * and never reaches zero. The exact curve is illustrative — the *shape*
 * (decreasing to a floor, never zero) is the requirement. Displayed to the
 * user as "collateral ratio": reputation is the credit line.
 */
export function collateralRatio(score: number): number {
  return clamp(1 - score / 125, 0.1, 1.0);
}

export function canMint(p: Provider): boolean {
  return p.status === 'active' && p.score >= MINT_SCORE_GATE;
}

export function mintGateReason(p: Provider): string | null {
  if (p.status === 'defaulted') return 'Defaulted providers cannot mint.';
  if (p.status === 'exited') return 'This provider has exited.';
  if (p.status === 'failed') return 'Resolve the open failure first.';
  if (p.score < MINT_SCORE_GATE)
    return 'Mint access is earned — sell through the auction to build a delivery record';
  return null;
}

export function scoreAfterJob(score: number): number {
  return Math.min(SCORE_CAP, score + SCORE_PER_JOB);
}

export function scoreAfterCure(score: number): number {
  return Math.max(0, score - CURE_SCORE_PENALTY);
}

/**
 * Device registry: one device, one account. A duplicate binding is refused
 * before any monetary operation runs, so the invariant is never even consulted.
 */
export function deviceAlreadyBound(providers: Provider[], deviceId: string, selfId: string): boolean {
  return providers.some((p) => p.id !== selfId && p.deviceId === deviceId);
}

/**
 * Attestation simulation (§3.3). Deterministic three-step sequence:
 * TEE attestation → certifier quorum → mint authorized.
 *
 * The two fault injections both terminate the sequence *before* any ledger
 * operation. Failure that cannot touch the invariant is itself a selling point.
 */
export function beginAttestation(
  providerId: string,
  amountCU: number,
  faults: { failAttestation: boolean; duplicateDevice: boolean },
): Attestation {
  if (faults.duplicateDevice) {
    return {
      providerId,
      amountCU,
      phase: 'rejected-device',
      signed: 0,
      detail: 'Device already bound — one device, one account',
    };
  }
  return {
    providerId,
    amountCU,
    phase: 'tee',
    signed: 0,
    detail: 'NVIDIA CC / Intel Trust Authority — JWT verified',
  };
}

/**
 * Advance the attestation one step. With `failAttestation` set, the quorum
 * stalls at k−1 signatures and the mint is rejected.
 */
export function advanceAttestation(
  a: Attestation,
  k: number,
  faults: { failAttestation: boolean },
): Attestation {
  switch (a.phase) {
    case 'tee':
      return { ...a, phase: 'quorum', signed: 0, detail: `Certifier quorum — 0 of ${k}` };
    case 'quorum': {
      const target = faults.failAttestation ? k - 1 : k;
      const signed = Math.min(a.signed + 1, target);
      if (signed < target) {
        return { ...a, signed, detail: `Certifier quorum — ${signed} of ${k}` };
      }
      if (faults.failAttestation) {
        return {
          ...a,
          signed,
          phase: 'rejected-quorum',
          detail: `Quorum stalled at ${signed} of ${k} — mint rejected`,
        };
      }
      return { ...a, signed, phase: 'authorized', detail: 'Mint authorized' };
    }
    default:
      return a;
  }
}

export function isAttestationTerminal(a: Attestation): boolean {
  return a.phase === 'authorized' || a.phase === 'rejected-quorum' || a.phase === 'rejected-device';
}

/**
 * Cost of curing a failure by substitution: buying `failCU` of replacement
 * delivery on the auction. Redemption is at par, so replacement delivery
 * clears at par too — 1 CTLX per CU.
 */
export function cureCost(failCU: number): number {
  return failCU;
}

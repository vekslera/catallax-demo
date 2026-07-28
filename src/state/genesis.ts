/**
 * genesis.ts — the opening balance sheet.
 *
 * V = S = 1,000,000 → n = 1.0000, and every one of those CTLX sits in a named
 * account that the demo actually shows:
 *
 *   Meridian DC   stake    266,000   liquid   679,000
 *   Coldharbor    stake     32,000   liquid    18,000
 *   default fund                       5,000   (anchor-seeded, out of Meridian)
 *                                  ---------
 *                                  1,000,000
 *
 * The genesis provider keeps everything it minted apart from the anchor's fund
 * contribution. Buyers start at zero and acquire CTLX on the open market in
 * Beat 2, so the float forms through visible transactions rather than being
 * conjured into off-screen accounts.
 *
 * Coldharbor's committed capacity is tuned (50,000 CU) so that after the stake
 * penalty its remaining stake is *less* than Beat 6's 30,000 CU write-down —
 * the only way the default fund visibly does its job. See docs/DEVIATIONS.md.
 */

import { collateralRatio } from './compute';
import type { Buyer, ProtocolState, Provider } from './types';
import { QUORUM_K, QUORUM_N } from './compute';

export const GENESIS_VAULT_CU = 1_000_000;
export const GENESIS_FUND = 5_000;
export const GENESIS_PRICE_USD = 2.0;

const MERIDIAN_CU = 950_000;
const COLDHARBOR_CU = 50_000;

function seedProvider(
  id: string,
  name: string,
  region: string,
  hardware: string,
  score: number,
  committedCU: number,
): Provider {
  const staked = committedCU * collateralRatio(score);
  return {
    id,
    name,
    region,
    hardware,
    score,
    committedCU,
    stakedCTLX: staked,
    liquidCTLX: committedCU - staked,
    status: 'active',
    deviceId: `dev-${id}`,
  };
}

function seedBuyer(id: string, name: string, useCase: string): Buyer {
  return { id, name, useCase, ctlxBalance: 0, cuHeld: 0, jobsCompleted: 0, reimbursed: 0 };
}

export function genesisState(mode: ProtocolState['mode'] = 'scenario'): ProtocolState {
  const meridian = seedProvider(
    'meridian',
    'Meridian DC',
    'Energy-sited region',
    'H100 · Confidential Computing',
    90,
    MERIDIAN_CU,
  );
  const coldharbor = seedProvider(
    'coldharbor',
    'Coldharbor',
    'Coastal region',
    'A100 · Confidential Computing',
    45,
    COLDHARBOR_CU,
  );
  // Score 25 — below the mint gate. Exists to make the gate visible (§3.2).
  const ferrolane = seedProvider(
    'ferrolane',
    'Ferrolane',
    'Inland region',
    'L40S · Confidential Computing',
    25,
    0,
  );

  // The anchor seeds the default fund out of the genesis provider's balance.
  // No CTLX is conjured: it is a transfer, not an issuance.
  meridian.liquidCTLX -= GENESIS_FUND;

  return {
    vaultCU: GENESIS_VAULT_CU,
    supplyCTLX: GENESIS_VAULT_CU,
    defaultFund: GENESIS_FUND,
    certifiers: { k: QUORUM_K, n: QUORUM_N },

    providers: [meridian, coldharbor, ferrolane],
    buyers: [
      seedBuyer('vetor', 'Vetor Labs', 'model fine-tuning'),
      seedBuyer('halcyon', 'Halcyon Bio', 'protein folding'),
      seedBuyer('northwind', 'Northwind Robotics', 'policy training'),
      seedBuyer('kestrel', 'Kestrel Analytics', 'risk simulation'),
      seedBuyer('ridgeline', 'Ridgeline AI', 'inference at scale'),
    ],
    escrowCTLX: 0,

    computePriceUSD: GENESIS_PRICE_USD,
    quoteUSD: GENESIS_PRICE_USD,
    lastArbLeg: null,

    events: [
      {
        id: 0,
        t: 0,
        text: 'Genesis — vault opened',
        tag: 'invariant',
        side: 'protocol',
        n: 1,
        flow: 'none',
      },
    ],
    nHistory: [{ t: 0, n: 1 }],
    mode,
    scenarioBeat: 0,
    scenarioRunning: false,
    ghostVisible: false,
    ghostAnchorT: null,
    attestation: null,
    activeJob: null,
    openFailure: null,

    uncovered: false,
    uncoveredCU: 0,
    opCount: 0,
    maxDeviation: 0,
    seq: 0,

    faults: { failAttestation: false, duplicateDevice: false },
    assertions: { checked: 0, violations: 0 },
  };
}

/**
 * Total CTLX across every account. Must always equal S — the demo's second
 * invariant, and the one the n-check cannot see (n stays 1 if you burn from the
 * vault and forget to debit an account).
 */
export function totalHeldCTLX(s: ProtocolState): number {
  const fromProviders = s.providers.reduce((a, p) => a + p.stakedCTLX + p.liquidCTLX, 0);
  const fromBuyers = s.buyers.reduce((a, b) => a + b.ctlxBalance, 0);
  return fromProviders + fromBuyers + s.escrowCTLX + s.defaultFund;
}

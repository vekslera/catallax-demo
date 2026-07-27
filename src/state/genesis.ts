/**
 * genesis.ts — the opening balance sheet.
 *
 * V = S = 1,000,000 → n = 1.0000. Every CTLX in existence is held by someone:
 * provider stake, provider liquid balances, the anchor-seeded default fund,
 * and a public float. That last account is not decoration — it is what makes
 * the redemption run in Beat 4 a real sequence of redemptions against real
 * balances rather than a number typed into the vault.
 *
 * Coldharbor is pre-seeded so that Beat 6's default uses its own numbers.
 * Its committed capacity is tuned (50,000 CU) so that after the stake penalty
 * its remaining stake is *less* than the 30,000 CU write-down — which is the
 * only way the default fund visibly does its job. See docs/DEVIATIONS.md.
 */

import { collateralRatio } from './compute';
import type { Holder, ProtocolState, Provider } from './types';
import { QUORUM_K, QUORUM_N } from './compute';

export const GENESIS_VAULT_CU = 1_000_000;
export const GENESIS_FUND = 5_000;
export const GENESIS_PRICE_USD = 2.0;

const MERIDIAN_CU = 950_000;
const COLDHARBOR_CU = 50_000;

/** Public float carved out of the genesis provider's liquid balance. */
const PUBLIC_FLOAT = 600_000;
const HOLDER_COUNT = 8;

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

const HOLDER_NAMES = [
  'Ashgrove Holdings',
  'Ninefold Treasury',
  'Marlowe & Co.',
  'Bramber Fund',
  'Ostrand Capital',
  'Quillon Partners',
  'Redwater Trust',
  'Silverkeep',
];

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

  // The anchor seeds the default fund, and the public float is distributed,
  // out of the genesis provider's liquid balance. No CTLX is conjured.
  meridian.liquidCTLX -= GENESIS_FUND + PUBLIC_FLOAT;

  const per = PUBLIC_FLOAT / HOLDER_COUNT;
  const holders: Holder[] = HOLDER_NAMES.slice(0, HOLDER_COUNT).map((name, i) => ({
    id: `h${i + 1}`,
    name,
    ctlxBalance: per,
  }));

  return {
    vaultCU: GENESIS_VAULT_CU,
    supplyCTLX: GENESIS_VAULT_CU,
    defaultFund: GENESIS_FUND,
    certifiers: { k: QUORUM_K, n: QUORUM_N },

    providers: [meridian, coldharbor, ferrolane],
    buyers: [
      {
        id: 'vetor',
        name: 'Vetor Labs',
        useCase: 'model fine-tuning',
        ctlxBalance: 0,
        cuHeld: 0,
        jobsCompleted: 0,
        reimbursed: 0,
      },
    ],
    holders,
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
 * invariant, and the one that catches accounting bugs the n-check cannot see
 * (n stays 1 if you burn from the vault and forget to debit an account).
 */
export function totalHeldCTLX(s: ProtocolState): number {
  const fromProviders = s.providers.reduce((a, p) => a + p.stakedCTLX + p.liquidCTLX, 0);
  const fromBuyers = s.buyers.reduce((a, b) => a + b.ctlxBalance, 0);
  const fromHolders = s.holders.reduce((a, h) => a + h.ctlxBalance, 0);
  return fromProviders + fromBuyers + fromHolders + s.escrowCTLX + s.defaultFund;
}

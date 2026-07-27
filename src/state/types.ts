/**
 * Shared types for the Catallax demo.
 *
 * Note the deliberate seam described in spec §11: `settlement.ts` owns the
 * generic monetary types (Ledger, StakeSplit, WriteDown) and knows nothing
 * about compute. Everything in this file that mentions CU or attestation is
 * compute-adapter territory.
 */

export type Mode = 'scenario' | 'sandbox';

export type ProviderStatus = 'active' | 'failed' | 'defaulted' | 'exited';

export interface Provider {
  id: string;
  name: string;
  region: string;
  hardware: string;
  /** Reliability score, 0..100. Prices collateral via compute.collateralRatio. */
  score: number;
  /** Compute units this provider currently has pledged into the vault. */
  committedCU: number;
  stakedCTLX: number;
  liquidCTLX: number;
  status: ProviderStatus;
  /** One device, one account — the registry, in one field. */
  deviceId: string;
}

export interface Buyer {
  id: string;
  name: string;
  useCase: string;
  ctlxBalance: number;
  /** Compute units withdrawn by redemption. */
  cuHeld: number;
  jobsCompleted: number;
  /** CTLX received from a defaulting provider's stake. */
  reimbursed: number;
}

/** Anonymous public float. Exists so the redemption run (Beat 4) uses real balances. */
export interface Holder {
  id: string;
  name: string;
  ctlxBalance: number;
}

export type LedgerTag = 'invariant' | 'no-op' | 'uncovered';

/**
 * Direction hint for the beam animation (spec §4). CU flows in the acting
 * panel's colour; transfers that never touch the vault cross the layout
 * horizontally instead.
 */
export type Flow =
  | 'provider-in'
  | 'provider-out'
  | 'buyer-in'
  | 'buyer-out'
  | 'cross'
  | 'pulse'
  | 'none';

export interface LedgerEvent {
  id: number;
  /** Sequence index, also the x-axis of nHistory. */
  t: number;
  /** Terse entry, <= 8 words (spec §9). */
  text: string;
  tag: LedgerTag;
  side: 'provider' | 'buyer' | 'market' | 'protocol';
  /** n as of this event, for the `n =` tag. */
  n: number;
  flow: Flow;
}

export interface NPoint {
  t: number;
  n: number;
}

export type AttestationPhase =
  | 'tee'
  | 'quorum'
  | 'authorized'
  | 'rejected-quorum'
  | 'rejected-device';

export interface Attestation {
  providerId: string;
  amountCU: number;
  phase: AttestationPhase;
  /** Certifier signatures collected so far. */
  signed: number;
  detail: string;
}

export type JobPhase = 'escrowed' | 'executing' | 'verifying' | 'settled';

export interface ActiveJob {
  buyerId: string;
  providerId: string;
  priceCTLX: number;
  phase: JobPhase;
}

export interface OpenFailure {
  providerId: string;
  failCU: number;
  /** Buyer whose in-flight job died with the hardware, if any. */
  harmedBuyerId: string | null;
  escrowCTLX: number;
  /**
   * The default runs in two dispatches so the UI can animate it stepwise
   * (δ → buyer, slice → fund, then the matched burn). 'open' means the cure
   * window is still live; 'penalized' means the stake has already paid.
   */
  phase: 'open' | 'penalized';
}

/** Direction of the arbitrage leg that last ran (spec §3.4). */
export type ArbLeg = 'mint-and-sell' | 'buy-and-redeem';

export interface ProtocolState {
  // --- monetary core ---
  vaultCU: number; // V
  supplyCTLX: number; // S — n is DERIVED (see selectors.n), never stored
  defaultFund: number;
  certifiers: { k: number; n: number };

  // --- participants ---
  providers: Provider[];
  buyers: Buyer[];
  holders: Holder[];
  /** CTLX held by the protocol against in-flight jobs. Part of S. */
  escrowCTLX: number;

  // --- price layer (§3.4) ---
  computePriceUSD: number; // P
  quoteUSD: number; // q
  lastArbLeg: ArbLeg | null;

  // --- narrative / interaction ---
  events: LedgerEvent[];
  nHistory: NPoint[];
  mode: Mode;
  scenarioBeat: number;
  scenarioRunning: boolean;
  ghostVisible: boolean;
  /** Sequence index the orderbook counterfactual is pinned to. */
  ghostAnchorT: number | null;
  attestation: Attestation | null;
  activeJob: ActiveJob | null;
  openFailure: OpenFailure | null;

  // --- instrumentation ---
  /** True once a write-down could not be fully funded. Sandbox-only path. */
  uncovered: boolean;
  uncoveredCU: number;
  opCount: number;
  maxDeviation: number;
  seq: number;

  // --- sandbox fault injection (§3.3) ---
  faults: { failAttestation: boolean; duplicateDevice: boolean };

  /** Dev-mode assertion counter (§3.2). */
  assertions: { checked: number; violations: number };
}

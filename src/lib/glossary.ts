/**
 * glossary.ts — every parameter explanation, in one place.
 *
 * The demo asks a cold visitor to read a balance sheet. Single-letter symbols
 * (V, S, P, q, n) are fine in a whitepaper and useless on first contact, so the
 * UI leads with a plain-English name and keeps the symbol as a secondary
 * annotation — the guided narration still says "n = V/S", and that has to
 * resolve against something on screen.
 *
 * Copy rules (spec §9) apply here as much as anywhere: no "stablecoin" except
 * to negate it, no "marketplace", no "token price", no "yield", and no
 * internal jargon — no "waterfall", "tenor", "covenant" or "s-curve".
 */

export const GLOSSARY = {
  // --- the monetary core ---
  backingRatio:
    'The vault divided by the supply. One CTLX is backed by exactly one committed compute unit, and every operation preserves that — including provider failures and defaults. It is not a peg; it is an accounting identity.',
  vault:
    'Compute units that providers have committed and the protocol can deliver against on redemption.',
  supply:
    'Every CTLX in existence, across all accounts — provider stake, liquid balances, job escrow and the default fund.',
  computeUnit:
    'One unit of verified computation, and the commodity behind the currency. Redeeming one CTLX withdraws exactly one.',

  // --- the price layer ---
  computePrice:
    'What one compute unit costs on the open market, in dollars. Exogenous: it tracks energy and hardware costs, and the protocol never sets it.',
  quote:
    'What one CTLX trades for on the secondary market, in dollars. It moves only by arbitrage, toward par.',
  premium:
    'How far the quote sits from par. Redemption always yields one compute unit, so par is the compute price. Beyond two percent either way, an arbitrageur closes the gap.',
  purchasingPower:
    'Fixed in compute, floating in dollars. One CTLX buys one compute unit whatever happens to the dollar — a dollar-pegged coin does the opposite.',

  // --- credit and failure ---
  defaultFund:
    'A protocol-owned CTLX reserve. It covers the part of a write-down that a defaulting provider’s own stake could not, which is what keeps the invariant intact through a default.',
  quorum:
    'Independent certifiers who must sign before a mint is authorised. Hardware attestation alone is not enough — a stalled quorum simply refuses the mint.',
  reliabilityScore:
    'Measured delivery history, from 0 to 100. It prices this provider’s collateral and gates access to minting. Collateral is priced by measured delivery history.',
  collateralRatio:
    'The share of each mint locked as stake. It falls as the delivery record grows and never reaches zero: reputation is the credit line.',
  committed: 'Compute units this provider has pledged into the vault.',
  staked:
    'CTLX locked as collateral. If this provider defaults it pays the harmed buyer first, then funds the matched write-down.',
  liquid:
    'CTLX this provider can spend — buying replacement delivery to cure a failure, or presenting it to withdraw committed capacity.',

  // --- the buyer's side ---
  balance: 'CTLX this buyer holds: spendable, escrowable against a job, or redeemable for compute.',
  computeHeld: 'Compute units already withdrawn by redemption and available to run.',
  jobsCompleted: 'Jobs this buyer has paid for and had verified.',
  reimbursed: 'CTLX received from a defaulting provider’s forfeited stake.',
  route:
    'Two ways to obtain compute: buy CTLX at the quote and redeem it for one compute unit, or buy compute directly at the market price. The two costs are exactly the quote and the compute price shown alongside. Whichever is cheaper is the route that closes the gap.',
  float:
    'CTLX held by buyers rather than by providers. Every token is in a named account on this screen — there is no anonymous pool.',

  // --- reading the dashboard ---
  ledgerTag:
    'Every entry records what it did to the invariant. Operations that move the balance sheet show the resulting ratio; transfers that never touch the vault are marked no-op.',
  ghostLine:
    'A simulated orderbook-backed design under the same redemption run. Its backing craters because a run consumes a finite book; Catallax contracts both sides of the balance sheet instead.',
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;

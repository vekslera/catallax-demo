# Deviations from the build specification

Everything in the build specification (Catallax demo spec v2.1 — held
internally, not included in this repository) is implemented. This file records
the places where the spec was internally inconsistent, or where following it
literally would have produced a demo that contradicted its own narration. Each
entry quotes what the spec asked for, states what was built, and says why, so it
stands on its own without the source document.

---

## 1. Coldharbor is seeded at 50,000 CU, not 60,000

**Spec:** §6 implementation notes — "Coldharbor is pre-seeded at genesis
(committed 60,000 CU, score 45, stake per curve)". The beat table gives Beat 6 a
failure of 30,000 CU and states the fund gauge dips.

**Built:** Coldharbor commits 50,000 CU at genesis. Beat 6 still kills 30,000 CU.

**Why:** the two spec numbers cannot both hold. With 60,000 CU committed and
score 45, the stake curve gives `s(45) = 0.64` → 38,400 CTLX staked. The
penalty δ takes 5,500, leaving 32,900 — which is *more* than the 30,000
write-down. The stake covers the whole burn on its own, the default fund is
never touched, and the gauge does not dip. The beat's stated behaviour, and its
narration ("stake first, default fund second"), require the fund to actually
pay.

At 50,000 CU committed the arithmetic works out to exactly the story the
narration tells, with every figure computed by the reducer:

| step | value |
|---|---|
| stake at genesis (`s(45) = 0.64`) | 32,000 CTLX |
| δ = min(stake, escrow × 1.1) | 5,500 CTLX |
| → harmed buyer | 4,400 CTLX |
| → default fund (20% slice) | 1,100 CTLX (fund: 5,000 → 6,100) |
| stake remaining | 26,500 CTLX |
| write-down 30,000, stake first | 26,500 from stake |
| …then the fund | 3,500 from fund (fund: 6,100 → **2,600**) |
| n | **1.0000** |

The fund visibly fills, then visibly drains by more than half. Verified in the
browser: the gauge ends at 2,600 CTLX.

## 2. Beat 6 includes an in-flight job

**Spec:** §6 beat table lists Beat 6's operation as `HARDWARE FAILURE (30,000 CU)
→ DEFAULT`, while the narration says "its stake pays the harmed buyer".

**Built:** Beat 6 first submits a 5,000 CTLX job from Vetor Labs to Coldharbor,
then kills the hardware 1.6s later, while the job is still executing.

**Why:** without an escrowed job there is no harmed buyer and no claim, so
δ = min(stake, 0) = 0 and nothing is reimbursed — the narration would describe a
payment that never happened. Sizing the penalty off a real in-flight job is also
the honest mechanism: the buyer is harmed *because* their work died with the
hardware. The reimbursement counter fills with 4,400 CTLX, computed by the
reducer.

This makes the beat timing-sensitive, so the test suite replays the scenario on
a virtual timeline that reproduces the store's clocks exactly
(`src/state/timing.ts`), rather than settling each action to completion.

## 3. The uncovered write-down is reachable without draining the fund

**Spec:** §3.2 — the shortfall "is intentionally reachable in sandbox ONLY by
draining the fund".

**Built:** draining the fund is offered as a control, and the shortfall is also
reachable by defaulting a provider on capacity far exceeding its stake.

**Why:** this one is arithmetic, not a design choice. A provider at score 90
stakes 28% of what it mints, and the stake curve floors at 10%. Any default on
more than ~30% of a large provider's committed capacity outruns stake plus a
5,000 CTLX fund, whatever the fund contains. The "only" in the spec holds for
small failures, not in general.

The property test therefore asserts the *real* invariant from §10.1 — that
`uncovered` is set only when stake + fund genuinely fell short of the write-down
— rather than the stronger claim, which is false. The test also asserts the
shortfall path is reached at least once across the random sequences, so the
property is not vacuous.

## 4. The redemption run is executed by named buyers, not generated holders

**Spec:** §6 implementation notes — Beat 4 is "~8 staggered REDEEM actions from
generated holder names".

**Built:** the run is 8 staggered redemptions by four *named buyers* — Halcyon
Bio, Northwind Robotics, Kestrel Analytics and Ridgeline AI — each redeeming its
pro-rata share of 40% of supply, in two tranches. They take up the float through
visible purchases in Beat 2 rather than being seeded with it at genesis.

**Why:** generated holder names were exactly what the spec asked for, and the
result was unreadable. Those holders existed only inside the state, so roughly
600,000 CTLX — 60% of the supply — sat in accounts that never appeared on
screen, and the genesis provider showed 79,000 spendable when its own committed
capacity implied 684,000. The supply could not be accounted for by looking at
the demo, which is the one thing a demo about an accounting identity has to make
easy.

Now every CTLX is in a named account that is visible: provider stake, provider
liquid balance, a named buyer, job escrow, or the default fund. The genesis
provider keeps everything it minted apart from the anchor's 5,000 CTLX fund
contribution. `totalHeldCTLX() === supplyCTLX` is asserted at genesis and after
every action in the property tests.

The anonymous `Holder` account type is gone from the state entirely.

## 5. The orderbook comparison is drawn as a hypothetical, not a series

**Spec:** §4.3 — a "ghost line toggle (orderbook counterfactual)": during the run
beat, "a precomputed grey line plunges to ~0.13 and flags 'insolvent' while the
real line stays flat".

**Built:** the same comparison, restyled so it cannot be read as something
Catallax did. It is a shaded region rather than a dashed line, carries a
"hypothetical" tag pinned to its own leading edge, is captioned underneath
whenever it is on, and its toggle reads "Compare with an orderbook design"
rather than "Orderbook counterfactual".

**Why:** sharing a plot box, a y-axis and a time axis with measured data is
exactly how a comparison gets mistaken for a second reading of the same system.
Dashes made it worse — in a financial chart, dashed usually means *projection of
this thing*, which is the opposite of the intent. And "counterfactual" is not a
word a cold visitor should have to parse.

There is also a genuine conflation underneath, which the tooltip now states
outright: the y-axis is Catallax's n, and the other design has no n. It has
asset coverage against a finite book, which merely happens to start at 1.0 as
well. The two quantities coincide at the origin and nowhere else.

The comparison still switches on automatically during Beat 4, so the run keeps
its dramatic beat — but the caption appears in the same moment, so the band is
never on screen unlabelled.

## 6. Redemption draws down providers' committed capacity

**Spec:** silent on this. REDEEM is specified as `V ← V − ΔS` only.

**Built:** redemption (and the buy-and-redeem arbitrage leg) also decrements
providers' `committedCU`, largest-first, keeping `Σ committedCU === V`.

**Why:** without it the two numbers drift apart — holders redeem the vault down
while providers still claim to have committed the original capacity. A later
default then writes down more collateral than the vault holds and drives **V
negative**. The 1,200-sequence property test found this immediately (`V >= 0:
expected -12451`). Physically it is also the correct reading: a redeemed compute
unit is delivered out of some provider's committed capacity.

`Σ committedCU === V` is now asserted after every action in the test suite,
alongside `Σ all CTLX balances === S`.

## 7. The buyer's route badge has a third state, and moved to the price strip

**Spec:** §3.4 — a badge reading "Cheaper to buy" (`q < P`) or "Cheaper to
redeem" (`q > P`).

**Built:** both labels, plus "At par — either route" whenever `|q − P|/P ≤ 0.02`.
The badge sits inline in the vault's price strip rather than in the buyer panel.

**Why (third state):** at genesis `q = P = 2.00` exactly, so a two-state badge
has to claim one route is cheaper when neither is. Inside the arbitrage band the
two routes cost the same to within the band width; asserting otherwise would be
the one dishonest number on the page.

**Why (moved):** the badge originally carried its own two-row breakdown of the
cost of each route. Those two costs are the quote and the compute price — the
same two numbers the price strip already displays a few pixels away. Restating
them was duplication, so only the verdict moved, and it now sits beside the
prices it compares. The freed column space lists the buyers instead.

> Note for review: the spec's parenthetical mapping is worth a second look.
> Under the demo's own arbitrage mechanism, `q < P` is the condition that makes
> *buying CTLX and redeeming it* the cheap route — which matches "Cheaper to
> buy". The `q > P` case is less clear-cut, since a holder facing a premium
> would generally sell rather than redeem. The spec's literal labels are
> implemented as written; if the intent was the other mapping, it is a one-line
> change in `market.ts`.

## 8. Fonts are a local-first stack, not webfonts

**Spec:** §8 asks for IBM Plex Mono / JetBrains Mono and Inter / IBM Plex Sans.
§10.5 requires the static build to make **no network requests at runtime**.

**Built:** `'Inter', 'IBM Plex Sans', system-ui, …` and `'JetBrains Mono',
'IBM Plex Mono', ui-monospace, …`. The brand faces are used when the visitor
already has them; otherwise the system grotesque and mono stand in.

**Why:** the two requirements conflict — loading either family from a CDN or as
a self-hosted file is a network request. Zero-network was treated as the harder
constraint, since it is an explicit acceptance criterion. Self-hosting the WOFF2
files in `public/` would satisfy the letter of §8 at the cost of ~120 kB and
still be zero-*external*-network; say the word and it is a small change.

## 9. Implementation notes (not deviations)

- **Clocks live in the store.** Attestation stepping, job execution/verification
  and the arbitrage loop are driven by `store.tsx` in both modes. Scenario beats
  only start them, so the script never races a second timer.
- **DEFAULT is split into two dispatches.** `DEFAULT_PENALTY` then
  `DEFAULT_WRITEDOWN`, so §4's stepwise animation (δ → buyer, slice → fund,
  matched burn) is a real sequence. `DEFAULT` still applies both atomically for
  tests and for the sandbox button.
- **Recharts is 400 kB of the bundle.** Total is 572 kB raw / 165 kB gzipped. It
  is one flat line and one dashed line; hand-rolled SVG would cut the bundle by
  roughly two thirds. Kept because the spec names Recharts.

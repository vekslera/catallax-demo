<p align="center">
  <img src="public/catallax-mark.svg" alt="Catallax" width="76" height="76" />
</p>

<h1 align="center">Catallax — interactive demo</h1>

<p align="center">
  A compute-collateralized currency institution, running entirely in your browser.<br />
  <strong>n = V/S ≡ 1</strong> — one CTLX is one compute unit, always, by construction.
</p>

---

## What this is

A single-page, client-side demonstration that Catallax is a **currency
institution, not a compute marketplace**. The vault holds one committed compute
unit behind every token, and every protocol operation — minting, redemption
runs, hardware failure, provider default, voluntary exit, an energy shock —
preserves that identity exactly.

The layout is a shared-state triptych: a provider panel on the left, a buyer
panel on the right, and the monetary dashboard in the centre. The dashboard is
the protagonist. Neither side panel holds a balance of its own; both are pure
views over one reducer, because the demo's message *is* the shared state.

The headline moment is not the redemption run. It is **n holding at exactly
1.0000 through a provider default**.

Two modes:

- **Play the story** — a scripted ten-beat walkthrough, roughly two minutes.
- **Sandbox: try to break n** — every control live, including the paths that
  genuinely can break it.

## Running it

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

`npm run build` typechecks and emits a static `dist/`. There are no network
requests at runtime — no fonts, no analytics, no API.

## The invariant, and how it is enforced

`n` is **derived, never stored**: `n = vaultCU / supplyCTLX`. Every operation
that moves the balance sheet applies the *same* JavaScript number to both sides,
so `v + d` and `s + d` are bit-identical floats and `n` is exactly `1` — not
"1 within display precision". The scenario finishes with a max-deviation readout
of `0.0000`, and that is a measured value, not a formatted one.

There is exactly one way to move `n`, and it is deliberate: a **write-down that
stake and the default fund together cannot cover**. The vault loses the dead
capacity, the supply does not shrink to match, and the reducer sets
`uncovered: true`. Reachable in sandbox by draining the fund and defaulting a
provider — which is precisely what the fund exists to prevent.

### Test coverage

`npm test` runs 14 tests, including a property test over **1,200 randomly
ordered operation sequences** (~13,000 operations). After every single action it
asserts:

- `n === 1` to a 1e-9 relative tolerance — except on the flagged uncovered path,
  where `n` must break *downward*
- `V ≥ 0`, `S > 0`
- `Σ all CTLX balances === S` — every token is in somebody's account
- `Σ providers' committedCU === V` — every compute unit is on somebody's balance
  sheet
- `JOB` and `ACQUIRE` never touch V, S or the fund
- the default fund moves only on the penalty slice (in) and write-down
  completion (out)
- `uncovered` is set only when stake + fund genuinely fell short
- arbitrage legs preserve `n`; the quote settles inside the 2% band; changing
  `P` alone changes nothing on the balance sheet
- the scenario, replayed on a virtual timeline matching the store's real clocks,
  runs all ten beats and ends at `maxDeviation === 0`

Three real bugs were found by these tests during the build and fixed: a negative
vault, a CTLX leak on the cure path, and an unclamped arbitrage redemption. See
[docs/DEVIATIONS.md](docs/DEVIATIONS.md) §4.

## Architecture

```
src/
  state/
    settlement.ts   GENERIC monetary core: issue/retire at par, matched
                    contraction (ΔS = ΔV), stake accounting, penalty routing,
                    default fund. Knows nothing about compute.
    compute.ts      COMPUTE-SPECIFIC: CU semantics, attestation simulation,
                    device registry, reliability scoring, failure/cure.
    market.ts       Price layer: P, q, the simulated arbitrageur.
    protocol.ts     Composes the above into the single reducer.
    genesis.ts      Opening balance sheet.
    scenario.ts     The ten beats, as data.
    ghostline.ts    Precomputed orderbook counterfactual.
    timing.ts       Clock constants, shared with the tests.
  store.tsx         React context, the reducer, and the three clocks.
  components/       VaultDashboard, ProviderPanel, BuyerPanel, NarrationBar,
                    FlowAnimation, and the dashboard's parts.
  tests/            The property tests above.
```

The seam between `settlement.ts` and `compute.ts` is deliberate and enforced by
a one-way import rule: **`compute.ts` may import from `settlement.ts`, never the
reverse.** `settlement.ts` contains no React and no compute concepts — no CU, no
attestation, no GPUs. The monetary core is commodity-agnostic in principle;
compute is simply the only commodity that currently satisfies its verification
precondition. There is no abstraction layer and no plugin system, because file
separation and a clean import direction are the entire requirement.

## Deploying to Cloudflare Pages

The demo is fully static and makes zero runtime network requests, which is
exactly what Pages serves best. No Workers, no Functions, no KV.

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | pinned by `.node-version` (22) |
| Root directory | repository root |

The Vite `base` is `'./'`, so the same `dist/` works unchanged whether Pages
serves it at `/` or the demo is mounted at `/demo` on the marketing site. The
spec's preferred layout is one Pages project serving marketing at `/` and this
demo at `/demo`, so the demo becomes a conversion path rather than a separate
destination.

No SPA fallback is needed — there is no routing. If client routes are ever
added, add a `_redirects` file containing `/* /index.html 200`.

Analytics, if wanted, via Cloudflare Web Analytics (free, cookieless,
snippet-only).

### Connecting the repo

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**
2. Pick this repository, set the build settings above
3. Add the custom domain `catallax.xyz` under the project's **Custom domains**

## Design

Dark theme only for v1. The palette is sampled directly from the brand mark:

| Token | Hex | Use |
|---|---|---|
| `indigo` | `#5B50E8` | Provider accent (upper-left arm) |
| `cyan` | `#23CFEE` | Provider secondary (lower-left arm) |
| `teal` | `#2DCFAF` | Buyer accent (upper-right arm) |
| `violet` | `#A78BF6` | Buyer secondary (lower-right arm) |
| `ink` | `#0B0D14` | Background, taken from `catallax-mark-ink.svg` |
| `paper` | `#F5F7FA` | Text, and the vault's deliberately neutral accents |
| `alarm` | `#FF5C68` | Uncovered write-down and the insolvency marker only |

The left/right colour mapping mirrors the mark's arm geometry, and the panels'
inner edges curve toward the centre gap the way the arms do: the layout is the
logo. The vault takes neither side's colour — the monetary core belongs to no
one.

`catallax-mark-transparent.svg` is used in-page so it composites over panel
surfaces; `catallax-mark-ink.svg` is the favicon, where an opaque tile is
wanted.

Motion respects `prefers-reduced-motion`: beams and pulses are suppressed and
state changes land instantly. The count-up animation always lands on the exact
figure even if no frame is ever painted — a stale balance sheet is the one thing
this page cannot afford to show.

## Not this

No blockchain, wallet, or network call. No real attestation — TEE and certifier
steps are simulated with deterministic delays. No accounts, no persistence, no
backend; `Reset` returns to genesis.

Not a stablecoin demo. `n = 1` is not a peg; it is an accounting identity that
every operation preserves, including failures.

---

Catallax · CTLX · [catallax.xyz](https://catallax.xyz)

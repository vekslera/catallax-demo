/**
 * PriceStrip — P, q, the premium/discount chip and the purchasing-power line
 * (spec §4.4). Visually subordinate to the hero: a band, not a panel.
 *
 * One line, two truths: the unit is fixed in compute and floats in dollars.
 */

import { useStore } from '../store';
import { cheaperRoute, insideBand, premium } from '../state/market';
import { fmtN, fmtSignedPct, fmtUSD } from '../lib/format';
import { GLOSSARY } from '../lib/glossary';
import { Term } from './Term';

export function PriceStrip() {
  const { state, dispatch } = useStore();
  const live = state.mode === 'sandbox';
  const prem = premium(state.quoteUSD, state.computePriceUSD);
  const settled = insideBand(state.quoteUSD, state.computePriceUSD);
  // Inside the band the two routes cost the same to within noise; claiming one
  // is cheaper would be the one dishonest number on the page.
  const atPar = settled;
  const route = cheaperRoute(state.quoteUSD, state.computePriceUSD);

  return (
    <div className="pricestrip">
      <div className="pricestrip__figures">
        <div className="pricefig">
          <span className="pricefig__label">
            <Term label="Compute price" symbol="P" tip={GLOSSARY.computePrice} />
          </span>
          <span className="pricefig__value">{fmtUSD(state.computePriceUSD)}</span>
          <span className="pricefig__unit">per CU</span>
        </div>
        <div className="pricefig">
          <span className="pricefig__label">
            <Term label="CTLX quote" symbol="q" tip={GLOSSARY.quote} />
          </span>
          <span className="pricefig__value">{fmtUSD(state.quoteUSD)}</span>
          <span className="pricefig__unit">per CTLX</span>
        </div>
        <div
          className={`chip${settled ? '' : ' chip--wide'}${prem < 0 ? ' chip--discount' : ''}`}
          aria-live="polite"
        >
          <Term
            label={fmtSignedPct(prem)}
            tip={GLOSSARY.premium}
            className="term--plain"
          />
          <span className="chip__caption">{settled ? 'at par' : 'arbitrage open'}</span>
        </div>
      </div>

      {/* The purchasing-power line and the cheaper-route verdict share a row:
          the verdict's two costs are exactly the q and P above, so it belongs
          with them, and a row of its own would cost the vault column 24px. */}
      <div className="pricestrip__foot">
        <p className="purchasing">
          <Term
            label={
              <>
                1 CTLX buys <strong>{fmtN(1)} compute units</strong>
              </>
            }
            tip={GLOSSARY.purchasingPower}
            className="term--plain"
          />
          <span className="purchasing__sep">·</span> ≈ {fmtUSD(state.computePriceUSD)}
        </p>

        <p className={`routebadge routebadge--${atPar ? 'par' : route}`} aria-live="polite">
          <Term
            label={
              atPar
                ? 'At par — either route'
                : route === 'buy'
                  ? 'Cheaper to buy CTLX'
                  : 'Cheaper to redeem'
            }
            tip={GLOSSARY.route}
            className="term--plain"
          />
        </p>
      </div>


      {live && (
        <label className="field field--slider">
          <span className="field__label">
            Drag the compute price {state.lastArbLeg && <em>last leg: {state.lastArbLeg}</em>}
          </span>
          <input
            type="range"
            min={0.5}
            max={6}
            step={0.05}
            value={state.computePriceUSD}
            aria-label="Market price of compute, USD per compute unit"
            onChange={(e) => dispatch({ type: 'SET_PRICE', computePriceUSD: Number(e.target.value) })}
          />
        </label>
      )}
    </div>
  );
}

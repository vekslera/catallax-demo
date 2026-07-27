/**
 * PriceStrip — P, q, the premium/discount chip and the purchasing-power line
 * (spec §4.4). Visually subordinate to the hero: a band, not a panel.
 *
 * One line, two truths: the unit is fixed in compute and floats in dollars.
 */

import { useStore } from '../store';
import { insideBand, premium } from '../state/market';
import { fmtN, fmtSignedPct, fmtUSD } from '../lib/format';

export function PriceStrip() {
  const { state, dispatch } = useStore();
  const live = state.mode === 'sandbox';
  const prem = premium(state.quoteUSD, state.computePriceUSD);
  const settled = insideBand(state.quoteUSD, state.computePriceUSD);

  return (
    <div className="pricestrip">
      <div className="pricestrip__figures">
        <div className="pricefig">
          <span className="pricefig__label">P · compute</span>
          <span className="pricefig__value">{fmtUSD(state.computePriceUSD)}</span>
          <span className="pricefig__unit">per CU</span>
        </div>
        <div className="pricefig">
          <span className="pricefig__label">q · quote</span>
          <span className="pricefig__value">{fmtUSD(state.quoteUSD)}</span>
          <span className="pricefig__unit">per CTLX</span>
        </div>
        <div
          className={`chip${settled ? '' : ' chip--wide'}${prem < 0 ? ' chip--discount' : ''}`}
          aria-live="polite"
        >
          {fmtSignedPct(prem)}
          <span className="chip__caption">{settled ? 'at par' : 'arbitrage open'}</span>
        </div>
      </div>

      <p className="purchasing">
        1 CTLX buys <strong>{fmtN(1)} CU</strong> <span className="purchasing__sep">·</span> ≈{' '}
        {fmtUSD(state.computePriceUSD)}
      </p>

      {live && (
        <label className="field field--slider">
          <span className="field__label">
            Compute price P {state.lastArbLeg && <em>last leg: {state.lastArbLeg}</em>}
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

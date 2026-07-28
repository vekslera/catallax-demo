/**
 * FundGauge — the default fund (spec §4.5).
 *
 * It fills when a defaulting provider's penalty slice arrives and drains when
 * it finishes a write-down the stake could not cover. The gauge is the only
 * part of the dashboard that is *supposed* to move during a default; n is not.
 */

import { useStore } from '../store';
import { GENESIS_FUND } from '../state/genesis';
import { fmtInt } from '../lib/format';
import { GLOSSARY } from '../lib/glossary';
import { Term } from './Term';

export function FundGauge() {
  const { state, dispatch } = useStore();
  const live = state.mode === 'sandbox';
  const pct = Math.max(0, Math.min(100, (state.defaultFund / (GENESIS_FUND * 1.5)) * 100));

  return (
    <div className="gauge">
      <div className="gauge__head">
        <h3 className="gauge__title">
          <Term label="Default fund" tip={GLOSSARY.defaultFund} />
        </h3>
        <span className="gauge__value">{fmtInt(state.defaultFund)} CTLX</span>
      </div>
      <div
        className="gauge__track"
        role="meter"
        aria-valuenow={Math.round(state.defaultFund)}
        aria-valuemin={0}
        aria-valuemax={Math.round(GENESIS_FUND * 1.5)}
        aria-label="Default fund balance"
      >
        <div className={`gauge__fill${state.defaultFund === 0 ? ' is-empty' : ''}`} style={{ width: `${pct}%` }} />
      </div>

      {state.uncovered && (
        <p className="banner banner--alarm" role="alert">
          Uncovered write-down — {fmtInt(state.uncoveredCU)} CU left unbacked. n is below 1. This is
          what the fund exists to prevent.
        </p>
      )}

      {live && (
        <button
          type="button"
          className="btn btn--tiny btn--danger-ghost"
          disabled={state.defaultFund <= 0}
          onClick={() => dispatch({ type: 'DRAIN_FUND' })}
        >
          Drain the fund
        </button>
      )}
    </div>
  );
}

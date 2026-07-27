/**
 * BuyerPanel — a pure view over the shared store (spec §7).
 */

import { useState } from 'react';
import { useStore } from '../store';
import { cheaperRoute, costViaBuy, costViaMarket, insideBand } from '../state/market';
import { fmtInt, fmtN, fmtUSD } from '../lib/format';

const JOB_PHASE_LABEL: Record<string, string> = {
  escrowed: 'Escrowed',
  executing: 'Executing',
  verifying: 'Verifying',
  settled: 'Settled',
};

export function BuyerPanel() {
  const { state, dispatch } = useStore();
  const live = state.mode === 'sandbox';

  const buyer = state.buyers[0];
  const [acquireAmount, setAcquireAmount] = useState(20_000);
  const [jobPrice, setJobPrice] = useState(5_000);
  const [redeemAmount, setRedeemAmount] = useState(10_000);

  const seller =
    state.providers.find((p) => p.status === 'active' && p.liquidCTLX > 0) ?? state.providers[0];
  const jobProvider = state.providers.find((p) => p.status === 'active') ?? state.providers[0];

  // Inside the arbitrage band the two routes cost the same to within noise;
  // claiming one is cheaper would be the one dishonest number on the page.
  const atPar = insideBand(state.quoteUSD, state.computePriceUSD);
  const route = cheaperRoute(state.quoteUSD, state.computePriceUSD);
  const redeemable = Math.min(redeemAmount, buyer.ctlxBalance);

  return (
    <section className="panel panel--buyer" aria-label="Buyer">
      <header className="panel__header">
        <h2>Buyer</h2>
        <p className="panel__sub">Holds CTLX. Pays for computation. Redeems at par.</p>
      </header>

      <div className="idcard idcard--static is-active">
        <span className="idcard__name">{buyer.name}</span>
        <span className="idcard__meta">{buyer.useCase}</span>
      </div>

      <dl className="figures">
        <div>
          <dt>Balance</dt>
          <dd>{fmtInt(buyer.ctlxBalance)} CTLX</dd>
        </div>
        <div>
          <dt>Compute held</dt>
          <dd>{fmtInt(buyer.cuHeld)} CU</dd>
        </div>
        <div>
          <dt>Jobs</dt>
          <dd>{fmtInt(buyer.jobsCompleted)}</dd>
        </div>
      </dl>

      <div className={`route route--${atPar ? 'par' : route}`} aria-live="polite">
        <p className="route__badge">
          {atPar ? 'At par — either route' : route === 'buy' ? 'Cheaper to buy' : 'Cheaper to redeem'}
        </p>
        <dl className="route__legs">
          <div>
            <dt>Buy CTLX, redeem</dt>
            <dd>{fmtUSD(costViaBuy(state.quoteUSD))} / CU</dd>
          </div>
          <div>
            <dt>Compute market</dt>
            <dd>{fmtUSD(costViaMarket(state.computePriceUSD))} / CU</dd>
          </div>
        </dl>
      </div>

      {buyer.reimbursed > 0 && (
        <div className="reimbursed">
          <span>Reimbursed from stake</span>
          <strong>{fmtInt(buyer.reimbursed)} CTLX</strong>
        </div>
      )}

      {state.activeJob && (
        <div className="job" aria-live="polite">
          <p className="job__title">
            {fmtInt(state.activeJob.priceCTLX)} CTLX ·{' '}
            {JOB_PHASE_LABEL[state.activeJob.phase] ?? state.activeJob.phase}
          </p>
          <div className={`job__bar job__bar--${state.activeJob.phase}`} />
        </div>
      )}

      <fieldset className="controls" disabled={!live}>
        <legend className="sr-only">Buyer controls</legend>

        <label className="field">
          <span className="field__label">Acquire CTLX</span>
          <span className="field__input">
            <input
              type="number"
              min={0}
              step={1000}
              value={acquireAmount}
              onChange={(e) => setAcquireAmount(Math.max(0, Number(e.target.value)))}
            />
            <span className="field__unit">CTLX</span>
          </span>
        </label>
        <button
          type="button"
          className="btn btn--block"
          disabled={!live || acquireAmount <= 0}
          onClick={() =>
            dispatch({
              type: 'ACQUIRE',
              buyerId: buyer.id,
              providerId: seller.id,
              amountCTLX: acquireAmount,
            })
          }
        >
          OTC at par (AMM simulated)
        </button>
        <p className="preview">n after: no-op — transfer only</p>

        <hr className="rule" />

        <label className="field">
          <span className="field__label">Submit job</span>
          <span className="field__input">
            <input
              type="number"
              min={0}
              step={500}
              value={jobPrice}
              onChange={(e) => setJobPrice(Math.max(0, Number(e.target.value)))}
            />
            <span className="field__unit">CTLX</span>
          </span>
        </label>
        <button
          type="button"
          className="btn btn--block"
          disabled={!live || !!state.activeJob || jobPrice <= 0 || buyer.ctlxBalance <= 0}
          onClick={() =>
            dispatch({
              type: 'JOB_SUBMIT',
              buyerId: buyer.id,
              providerId: jobProvider.id,
              priceCTLX: jobPrice,
            })
          }
        >
          Run on {jobProvider.name}
        </button>
        <p className="preview">n after: no-op — transfer only</p>

        <hr className="rule" />

        <label className="field">
          <span className="field__label">Redeem</span>
          <span className="field__input">
            <input
              type="number"
              min={0}
              step={1000}
              value={redeemAmount}
              onChange={(e) => setRedeemAmount(Math.max(0, Number(e.target.value)))}
            />
            <span className="field__unit">CTLX</span>
          </span>
        </label>
        <p className="preview">
          Burn {fmtInt(redeemable)} CTLX → receive {fmtInt(redeemable)} CU · n after: {fmtN(1)} —
          unchanged
        </p>
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={!live || redeemable <= 0}
          onClick={() =>
            dispatch({
              type: 'REDEEM',
              kind: 'buyer',
              accountId: buyer.id,
              amountCTLX: redeemable,
            })
          }
        >
          Redeem
        </button>
        <p className="microcopy">Redemption at par, always. No fee, no haircut.</p>
      </fieldset>
    </section>
  );
}

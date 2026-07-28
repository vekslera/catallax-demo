/**
 * BuyerPanel — a pure view over the shared store (spec §7).
 *
 * Shows every buyer, not just the protagonist. The float is held by named
 * accounts, so the supply can be accounted for by looking at the screen: the
 * redemption run visibly drains these balances rather than draining an
 * anonymous pool nobody can see.
 *
 * The cheaper-route indicator lives in the vault's price strip, next to the
 * two prices it compares.
 */

import { useState } from 'react';
import { useStore } from '../store';
import { fmtInt, fmtN } from '../lib/format';
import { GLOSSARY } from '../lib/glossary';
import { Term } from './Term';

const JOB_PHASE_LABEL: Record<string, string> = {
  escrowed: 'Escrowed',
  executing: 'Executing',
  verifying: 'Verifying',
  settled: 'Settled',
};

export function BuyerPanel() {
  const { state, dispatch } = useStore();
  const live = state.mode === 'sandbox';

  const [selectedId, setSelectedId] = useState('vetor');
  const [acquireAmount, setAcquireAmount] = useState(20_000);
  const [jobPrice, setJobPrice] = useState(5_000);
  const [redeemAmount, setRedeemAmount] = useState(10_000);

  // In scenario mode follow whichever buyer the story is acting through, so
  // the card you are looking at is the one the narration is talking about.
  const storyActor =
    state.activeJob?.buyerId ?? state.openFailure?.harmedBuyerId ?? selectedId;
  const activeId = state.mode === 'scenario' ? storyActor : selectedId;
  const buyer = state.buyers.find((b) => b.id === activeId) ?? state.buyers[0];

  const seller =
    state.providers.find((p) => p.status === 'active' && p.liquidCTLX > 0) ?? state.providers[0];
  const jobProvider = state.providers.find((p) => p.status === 'active') ?? state.providers[0];
  const redeemable = Math.min(redeemAmount, buyer.ctlxBalance);
  const float = state.buyers.reduce((a, b) => a + b.ctlxBalance, 0);

  return (
    <section className="panel panel--buyer" aria-label="Buyers">
      <header className="panel__header">
        <h2>Buyers</h2>
        <p className="panel__sub">Hold CTLX. Pay for computation. Redeem at par.</p>
      </header>

      <ul className="idcards" role="tablist" aria-label="Buyers">
        {state.buyers.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              role="tab"
              aria-selected={b.id === buyer.id}
              className={`idcard${b.id === buyer.id ? ' is-active' : ''}`}
              onClick={() => setSelectedId(b.id)}
            >
              <span className="idcard__name">{b.name}</span>
              <span className="idcard__meta">{b.useCase}</span>
              <span className="idcard__figure">{fmtInt(b.ctlxBalance)}</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="floatline">
        <Term label="Held by buyers" tip={GLOSSARY.float} />
        <strong>{fmtInt(float)} CTLX</strong>
      </p>

      <dl className="figures">
        <div>
          <dt>
            <Term label="Balance" tip={GLOSSARY.balance} />
          </dt>
          <dd>{fmtInt(buyer.ctlxBalance)} CTLX</dd>
        </div>
        <div>
          <dt>
            <Term label="Compute held" tip={GLOSSARY.computeHeld} />
          </dt>
          <dd>{fmtInt(buyer.cuHeld)} CU</dd>
        </div>
        <div>
          <dt>
            <Term label="Jobs" tip={GLOSSARY.jobsCompleted} />
          </dt>
          <dd>{fmtInt(buyer.jobsCompleted)}</dd>
        </div>
      </dl>

      {buyer.reimbursed > 0 && (
        <div className="reimbursed">
          <Term label="Reimbursed from stake" tip={GLOSSARY.reimbursed} />
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

      {!live && (
        <p className="microcopy microcopy--standalone">
          Redemption at par, always. No fee, no haircut.
        </p>
      )}

      {live && (
        <fieldset className="controls">
          <legend className="sr-only">Buyer controls</legend>

          <label className="field">
            <span className="field__label">Acquire CTLX for {buyer.name}</span>
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
            disabled={acquireAmount <= 0}
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
            disabled={!!state.activeJob || jobPrice <= 0 || buyer.ctlxBalance <= 0}
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
            disabled={redeemable <= 0}
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
      )}
    </section>
  );
}

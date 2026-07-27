/**
 * ProviderPanel — a pure view over the shared store (spec §7).
 *
 * Holds no balances. Input boxes hold *intent* (how much to mint, how much
 * capacity to kill); every number displayed comes from the reducer.
 */

import { useState } from 'react';
import { useStore } from '../store';
import {
  MINT_SCORE_GATE,
  canMint,
  collateralRatio,
  cureCost,
  mintGateReason,
} from '../state/compute';
import { withdrawable } from '../state/settlement';
import { fmtInt, fmtN, fmtPct } from '../lib/format';
import type { Provider } from '../state/types';

function statusLabel(p: Provider): string {
  switch (p.status) {
    case 'active':
      return 'Active';
    case 'failed':
      return 'Failure open';
    case 'defaulted':
      return 'Defaulted';
    case 'exited':
      return 'Exited';
  }
}

export function ProviderPanel() {
  const { state, dispatch } = useStore();
  const live = state.mode === 'sandbox';

  const [selectedId, setSelectedId] = useState('meridian');
  const [mintAmount, setMintAmount] = useState(100_000);
  const [failAmount, setFailAmount] = useState(30_000);
  const [exitAmount, setExitAmount] = useState(50_000);

  // In scenario mode the acting panel follows the beat, so the card the story
  // is talking about is the card you are looking at.
  const scenarioActor =
    state.mode === 'scenario' && state.openFailure
      ? state.openFailure.providerId
      : state.mode === 'scenario'
        ? (state.attestation?.providerId ?? selectedId)
        : selectedId;

  const activeId = state.mode === 'scenario' ? scenarioActor : selectedId;
  const p = state.providers.find((x) => x.id === activeId) ?? state.providers[0];

  const ratio = collateralRatio(p.score);
  const gate = mintGateReason(p);
  const exitCap = withdrawable(p.committedCU, p.stakedCTLX, p.liquidCTLX);
  const failure = state.openFailure?.providerId === p.id ? state.openFailure : null;
  const attestation = state.attestation?.providerId === p.id ? state.attestation : null;

  return (
    <section className="panel panel--provider" aria-label="Provider">
      <header className="panel__header">
        <h2>Provider</h2>
        <p className="panel__sub">Commits compute. Mints against it. Collateralises with stake.</p>
      </header>

      <ul className="idcards" role="tablist" aria-label="Providers">
        {state.providers.map((q) => (
          <li key={q.id}>
            <button
              type="button"
              role="tab"
              aria-selected={q.id === p.id}
              className={`idcard${q.id === p.id ? ' is-active' : ''} idcard--${q.status}`}
              onClick={() => setSelectedId(q.id)}
            >
              <span className="idcard__name">{q.name}</span>
              <span className="idcard__meta">
                score {Math.round(q.score)} · {fmtInt(q.committedCU)} CU
              </span>
              <span className={`idcard__status idcard__status--${q.status}`}>{statusLabel(q)}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="idmeta">
        <span>{p.region}</span>
        <span>{p.hardware}</span>
      </div>

      <div className="strip">
        <div className="strip__row">
          <span className="strip__label">
            Reliability score
            <span
              className="hint"
              tabIndex={0}
              role="note"
              aria-label="Collateral is priced by measured delivery history."
            >
              ?<span className="hint__bubble">Collateral is priced by measured delivery history.</span>
            </span>
          </span>
          <span className="strip__value">{Math.round(p.score)}</span>
        </div>
        <div className="meter">
          <div className="meter__fill" style={{ width: `${p.score}%` }} />
          <div className="meter__gate" style={{ left: `${MINT_SCORE_GATE}%` }} aria-hidden="true" />
        </div>
        <div className="strip__row">
          <span className="strip__label">Collateral ratio</span>
          <span className="strip__value">{fmtPct(ratio)}</span>
        </div>
      </div>

      <dl className="figures">
        <div>
          <dt>Committed</dt>
          <dd>{fmtInt(p.committedCU)} CU</dd>
        </div>
        <div>
          <dt>Staked</dt>
          <dd>{fmtInt(p.stakedCTLX)} CTLX</dd>
        </div>
        <div>
          <dt>Liquid</dt>
          <dd>{fmtInt(p.liquidCTLX)} CTLX</dd>
        </div>
      </dl>

      {attestation && (
        <div className={`attest attest--${attestation.phase}`} aria-live="polite">
          <div className="attest__steps">
            <span className={attestation.phase !== 'rejected-device' ? 'is-on' : ''}>
              TEE attestation
            </span>
            <span
              className={
                attestation.phase === 'quorum' ||
                attestation.phase === 'authorized' ||
                attestation.phase === 'rejected-quorum'
                  ? 'is-on'
                  : ''
              }
            >
              Certifier quorum
            </span>
            <span className={attestation.phase === 'authorized' ? 'is-on' : ''}>
              Mint authorized
            </span>
          </div>
          <p className="attest__detail">{attestation.detail}</p>
        </div>
      )}

      {failure && (
        <div className="alert" role="alert">
          <p className="alert__title">
            Hardware failure — {fmtInt(failure.failCU)} CU dead
            {failure.escrowCTLX > 0 && `, ${fmtInt(failure.escrowCTLX)} CTLX job in flight`}
          </p>
          <p className="alert__body">
            Cure by substitution costs {fmtInt(cureCost(failure.failCU))} CTLX from the liquid
            balance. Defaulting forfeits stake to the harmed buyer and burns the dead capacity.
          </p>
          <div className="btnrow">
            <button
              type="button"
              className="btn btn--primary"
              disabled={!live || p.liquidCTLX < cureCost(failure.failCU)}
              onClick={() => dispatch({ type: 'CURE' })}
            >
              Cure — buy replacement
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={!live}
              onClick={() => dispatch({ type: 'DEFAULT' })}
            >
              Default
            </button>
          </div>
          <p className="preview">n after either: {fmtN(1)} — unchanged</p>
        </div>
      )}

      <fieldset className="controls" disabled={!live}>
        <legend className="sr-only">Provider controls</legend>

        <label className="field">
          <span className="field__label">Deposit committed capacity</span>
          <span className="field__input">
            <input
              type="number"
              min={0}
              step={1000}
              value={mintAmount}
              onChange={(e) => setMintAmount(Math.max(0, Number(e.target.value)))}
            />
            <span className="field__unit">CU</span>
          </span>
        </label>

        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={!live || !canMint(p) || !!state.attestation || mintAmount <= 0}
          title={gate ?? undefined}
          onClick={() =>
            dispatch({ type: 'MINT_BEGIN', providerId: p.id, amountCU: mintAmount })
          }
        >
          Mint {fmtInt(mintAmount)} CTLX
        </button>
        {gate && <p className="gate">{gate}</p>}
        <p className="microcopy">Issuance: 1 CTLX per CU. Collateral: s(score) locked.</p>
        <p className="preview">
          n after: {fmtN(1)} — unchanged · stake {fmtInt(mintAmount * ratio)} CTLX
        </p>

        <div className="toggles">
          <label className="toggle">
            <input
              type="checkbox"
              checked={state.faults.failAttestation}
              onChange={(e) =>
                dispatch({ type: 'SET_FAULT', fault: 'failAttestation', on: e.target.checked })
              }
            />
            <span>Simulate failed attestation</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={state.faults.duplicateDevice}
              onChange={(e) =>
                dispatch({ type: 'SET_FAULT', fault: 'duplicateDevice', on: e.target.checked })
              }
            />
            <span>Simulate duplicate device</span>
          </label>
        </div>

        <hr className="rule" />

        <label className="field">
          <span className="field__label">Withdraw committed capacity</span>
          <span className="field__input">
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.floor(exitCap))}
              step={1000}
              value={Math.min(exitAmount, Math.floor(exitCap))}
              onChange={(e) => setExitAmount(Number(e.target.value))}
            />
          </span>
        </label>
        <p className="preview">
          Withdraw {fmtInt(Math.min(exitAmount, exitCap))} CU → burn{' '}
          {fmtInt(Math.min(exitAmount, exitCap))} CTLX · n after: {fmtN(1)} — unchanged
        </p>
        <button
          type="button"
          className="btn btn--block"
          disabled={!live || exitCap <= 0}
          onClick={() =>
            dispatch({ type: 'EXIT', providerId: p.id, amountCU: Math.min(exitAmount, exitCap) })
          }
        >
          Exit
        </button>
        <p className="microcopy">Your stake and balance collateralize your exit.</p>

        <hr className="rule" />

        <label className="field">
          <span className="field__label">Trigger hardware failure</span>
          <span className="field__input">
            <input
              type="number"
              min={0}
              step={1000}
              value={failAmount}
              onChange={(e) => setFailAmount(Math.max(0, Number(e.target.value)))}
            />
            <span className="field__unit">CU</span>
          </span>
        </label>
        <button
          type="button"
          className="btn btn--block btn--danger-ghost"
          disabled={!live || !!state.openFailure || p.committedCU <= 0}
          onClick={() => dispatch({ type: 'FAILURE', providerId: p.id, failCU: failAmount })}
        >
          Kill {fmtInt(failAmount)} CU of capacity
        </button>
      </fieldset>
    </section>
  );
}

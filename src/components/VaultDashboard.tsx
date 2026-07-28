/**
 * VaultDashboard — the protagonist (spec §4).
 *
 * The hero number should be almost boring. That is the message: the drama
 * belongs to the ledger and the fund gauge, and n simply does not move.
 */

import { useStore } from '../store';
import { n as parityOf } from '../state/protocol';
import { useCountUp } from '../lib/useCountUp';
import { fmtInt, fmtN } from '../lib/format';
import { GLOSSARY } from '../lib/glossary';
import { Term } from './Term';
import { NChart } from './NChart';
import { PriceStrip } from './PriceStrip';
import { FundGauge } from './FundGauge';
import { QuorumStrip } from './QuorumStrip';
import { EventLedger } from './EventLedger';

export function VaultDashboard() {
  const { state, reducedMotion } = useStore();
  const nValue = parityOf(state);
  const v = useCountUp(state.vaultCU, reducedMotion);
  const s = useCountUp(state.supplyCTLX, reducedMotion);

  return (
    <section className="vault" aria-label="The vault">
      {/* Pinned while the column scrolls: the invariant must never leave the
          screen, since watching it *not* move is the entire demonstration. */}
      <div className="vault__pin">
        <header className="vault__head">
          <h2 className="vault__title">The vault</h2>
          <span className={`chip chip--flat${state.uncovered ? ' chip--broken' : ''}`}>
            {state.uncovered ? 'invariant broken' : 'flat since genesis'}
          </span>
        </header>

        <div className="hero">
          <span className="hero__label">
            <Term label="Backing ratio" symbol="n" tip={GLOSSARY.backingRatio} />
          </span>
          <output className={`hero__value${state.uncovered ? ' is-alarm' : ''}`} aria-live="polite">
            {fmtN(nValue)}
          </output>
        </div>

        <dl className="balance">
          <div className="balance__side balance__side--v">
            <dt>
              <Term label="Vault" symbol="V" tip={GLOSSARY.vault} />
            </dt>
            <dd>
              {fmtInt(v)} <span>CU</span>
            </dd>
          </div>
          <div className="balance__link" aria-hidden="true" />
          <div className="balance__side balance__side--s">
            <dt>
              <Term label="Supply" symbol="S" tip={GLOSSARY.supply} />
            </dt>
            <dd>
              {fmtInt(s)} <span>CTLX</span>
            </dd>
          </div>
        </dl>
      </div>

      <NChart />
      <PriceStrip />
      <FundGauge />
      <QuorumStrip />
      <EventLedger />
    </section>
  );
}

/**
 * The mobile sticky header (spec §4). Below 1024px the columns stack, so the
 * invariant has to travel with the user or the demo loses its point.
 */
export function VaultBar() {
  const { state } = useStore();
  const nValue = parityOf(state);

  return (
    <div className="vaultbar" aria-hidden="true">
      <span className="vaultbar__n">
        n <strong className={state.uncovered ? 'is-alarm' : undefined}>{fmtN(nValue)}</strong>
      </span>
      <span className="vaultbar__fig">
        V <strong>{fmtInt(state.vaultCU)}</strong>
      </span>
      <span className="vaultbar__fig">
        S <strong>{fmtInt(state.supplyCTLX)}</strong>
      </span>
      <span className="vaultbar__fig">
        fund <strong>{fmtInt(state.defaultFund)}</strong>
      </span>
    </div>
  );
}

/**
 * EventLedger — reverse-chronological, terse, every entry tagged with its
 * effect on the invariant (spec §4.7).
 *
 * The tag column is the argument: a long run of `n = 1.0000` interrupted only
 * by `no-op`.
 */

import { useStore } from '../store';
import { fmtN } from '../lib/format';

export function EventLedger() {
  const { state } = useStore();

  return (
    <div className="ledger">
      <h3 className="ledger__title">Event ledger</h3>
      <ol className="ledger__list" aria-live="polite" aria-label="Protocol event ledger">
        {state.events.map((e) => (
          <li key={e.id} className={`ledger__row ledger__row--${e.side}`}>
            <span className="ledger__seq">{String(e.t).padStart(3, '0')}</span>
            <span className="ledger__text">{e.text}</span>
            <span className={`ledger__tag ledger__tag--${e.tag}`}>
              {e.tag === 'no-op' ? 'no-op' : `n = ${fmtN(e.n)}`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * NarrationBar — the scenario's narration card, and the sandbox's banner.
 *
 * In scenario mode the panels are read-only and this card advances the story.
 * In sandbox mode it becomes the persistent challenge: "Try to break n," with
 * the operation count and the largest deviation from 1 ever observed.
 */

import { useStore } from '../store';
import { BEATS, LAST_BEAT } from '../state/scenario';
import { fmtInt, fmtN } from '../lib/format';

export function NarrationBar() {
  const { state, dispatch, scenario } = useStore();

  if (state.mode === 'sandbox') {
    return (
      <section className="narration narration--sandbox" aria-label="Sandbox status">
        <div className="narration__body">
          <p className="narration__title">Try to break n.</p>
          <p className="narration__text">
            Every control is live. Mint, redeem, run jobs, kill hardware, default a provider, drag
            the compute price. The vault is watching.
          </p>
        </div>
        <dl className="narration__stats">
          <div>
            <dt>Operations</dt>
            <dd>{fmtInt(state.opCount)}</dd>
          </div>
          <div>
            <dt>Max |n − 1|</dt>
            <dd className={state.maxDeviation > 0 ? 'is-alarm' : undefined}>
              {state.maxDeviation.toFixed(4)}
            </dd>
          </div>
          <div>
            <dt>Assertions</dt>
            <dd className={state.assertions.violations > 0 ? 'is-alarm' : undefined}>
              {fmtInt(state.assertions.checked - state.assertions.violations)}/
              {fmtInt(state.assertions.checked)}
            </dd>
          </div>
        </dl>
        <div className="narration__actions">
          <button type="button" className="btn" onClick={() => dispatch({ type: 'RESET' })}>
            Reset to genesis
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              dispatch({ type: 'RESET', mode: 'scenario' });
              scenario.playBeat(0);
            }}
          >
            Play the story
          </button>
        </div>
      </section>
    );
  }

  const beat = scenario.beat;

  return (
    <section className="narration" aria-label="Guided scenario">
      <div className="narration__body">
        <p className="narration__eyebrow">
          <span className="narration__beat">
            Beat {beat.id} / {LAST_BEAT}
          </span>
          <span className={`narration__actor narration__actor--${beat.focus}`}>{beat.actor}</span>
        </p>
        <p className="narration__text" aria-live="polite">
          {beat.narration}
        </p>
      </div>

      <div className="narration__actions">
        {beat.id === 0 && state.opCount === 0 ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => scenario.playBeat(1)}
            disabled={scenario.playing}
          >
            Play the story
          </button>
        ) : scenario.isLast ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => dispatch({ type: 'SET_MODE', mode: 'sandbox' })}
          >
            Try to break it yourself
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={scenario.next}
            disabled={scenario.playing}
          >
            {scenario.playing ? 'Running…' : 'Next'}
          </button>
        )}

        <button type="button" className="btn btn--ghost" onClick={scenario.restart}>
          Restart
        </button>
      </div>

      <ol className="beatdots" aria-label="Scenario progress">
        {BEATS.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              className={`beatdot${b.id === beat.id ? ' is-current' : ''}${
                b.id < beat.id ? ' is-done' : ''
              }`}
              aria-label={`Beat ${b.id}: ${b.actor}`}
              aria-current={b.id === beat.id ? 'step' : undefined}
              disabled={scenario.playing}
              onClick={() => scenario.playBeat(b.id)}
            />
          </li>
        ))}
      </ol>

      <p className="narration__readout">
        Max |n − 1| so far <strong>{fmtN(state.maxDeviation)}</strong>
      </p>
    </section>
  );
}

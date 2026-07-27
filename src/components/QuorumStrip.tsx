/**
 * QuorumStrip — k-of-n certifier dots (spec §4.6).
 */

import { useStore } from '../store';

export function QuorumStrip() {
  const { state } = useStore();
  const { k, n } = state.certifiers;
  const a = state.attestation;
  const signed = a && (a.phase === 'quorum' || a.phase === 'authorized' || a.phase === 'rejected-quorum')
    ? a.signed
    : 0;
  const stalled = a?.phase === 'rejected-quorum';

  return (
    <div className="quorum">
      <h3 className="quorum__title">
        Certifier quorum <span className="quorum__ratio">{k} of {n}</span>
      </h3>
      <div className="quorum__dots" role="img" aria-label={`${signed} of ${k} required signatures collected`}>
        {Array.from({ length: n }, (_, i) => (
          <span
            key={i}
            className={
              'dot' +
              (i < signed ? (stalled ? ' dot--stalled' : ' dot--signed') : '') +
              (i < k ? ' dot--required' : '')
            }
          />
        ))}
      </div>
    </div>
  );
}

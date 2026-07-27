/**
 * FlowAnimation — the beam layer (spec §4).
 *
 * CU flowing into or out of the vault travels in the acting panel's colour.
 * Transfers that never touch the vault — a job, an OTC purchase, a stake
 * penalty paid to a buyer — cross the layout horizontally instead, passing
 * *over* the vault without entering it. That distinction is the animation's
 * entire job: you can see which operations are monetary and which are merely
 * commerce.
 *
 * Silent under `prefers-reduced-motion`.
 */

import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Flow } from '../state/types';

interface Beam {
  id: number;
  /** 'none' never reaches the layer — those events simply do not animate. */
  flow: Exclude<Flow, 'none'>;
  alarm: boolean;
}

const TRACK: Record<Exclude<Flow, 'none' | 'pulse'>, { from: string; to: string; tone: string }> = {
  'provider-in': { from: '8%', to: '44%', tone: 'var(--indigo)' },
  'provider-out': { from: '44%', to: '8%', tone: 'var(--cyan)' },
  'buyer-in': { from: '92%', to: '56%', tone: 'var(--teal)' },
  'buyer-out': { from: '56%', to: '92%', tone: 'var(--violet)' },
  cross: { from: '10%', to: '86%', tone: 'var(--paper)' },
};

const BEAM_MS = 950;

export function FlowAnimation() {
  const { state, reducedMotion } = useStore();
  const latest = state.events[0];
  const latestId = latest?.id ?? -1;
  const [beams, setBeams] = useState<Beam[]>([]);

  useEffect(() => {
    if (reducedMotion || !latest || latest.flow === 'none') return;
    const beam: Beam = { id: latest.id, flow: latest.flow, alarm: latest.tag === 'uncovered' };
    setBeams((prev) => [...prev, beam].slice(-5));
    const t = window.setTimeout(
      () => setBeams((prev) => prev.filter((b) => b.id !== beam.id)),
      BEAM_MS,
    );
    return () => window.clearTimeout(t);
    // Keyed on the event id: one beam per ledger entry.
  }, [latestId, reducedMotion, latest]);

  if (reducedMotion) return null;

  return (
    <div className="flow-layer" aria-hidden="true">
      {beams.map((b) =>
        b.flow === 'pulse' ? (
          <span key={b.id} className={`pulse${b.alarm ? ' pulse--alarm' : ''}`} />
        ) : (
          <span
            key={b.id}
            className="beam"
            style={
              {
                '--beam-from': TRACK[b.flow].from,
                '--beam-to': TRACK[b.flow].to,
                '--beam-tone': b.alarm ? 'var(--alarm)' : TRACK[b.flow].tone,
              } as React.CSSProperties
            }
          />
        ),
      )}
    </div>
  );
}

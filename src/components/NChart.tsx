/**
 * NChart — n over time, and the orderbook counterfactual.
 *
 * The real line is flat at 1.0000 and always will be. The interesting content
 * is the grey line: a simulated orderbook-backed design collapsing to
 * insolvency under the same redemption run. One chart, the entire NAV
 * argument (spec §4.3).
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  YAxis,
} from 'recharts';
import { useStore } from '../store';
import { GHOST_FLOOR, GHOST_LABEL, ghostAt } from '../state/ghostline';
import { fmtN } from '../lib/format';
import { GLOSSARY } from '../lib/glossary';
import { Term } from './Term';

export function NChart() {
  const { state, dispatch, reducedMotion } = useStore();

  const data = state.nHistory.map((p) => ({
    t: p.t,
    n: p.n,
    ghost: state.ghostVisible ? ghostAt(p.t, state.ghostAnchorT) : null,
  }));

  const ghostPoints = data.filter((d) => d.ghost !== null);
  const collapsed = ghostPoints[ghostPoints.length - 1];
  const showInsolvent = !!collapsed && collapsed.ghost !== null && collapsed.ghost <= GHOST_FLOOR;

  return (
    <div className="chart">
      <div className="chart__head">
        <h3 className="chart__title">
          <Term label="Backing ratio over time" tip={GLOSSARY.backingRatio} />
        </h3>
        <label className="toggle toggle--inline">
          <input
            type="checkbox"
            checked={state.ghostVisible}
            onChange={(e) => dispatch({ type: 'TOGGLE_GHOST', visible: e.target.checked })}
          />
          <span>Orderbook counterfactual</span>
        </label>
      </div>

      <div
        className="chart__canvas"
        role="img"
        aria-label={
          `n has held at ${fmtN(1)} across ${state.opCount} operations. ` +
          (state.ghostVisible
            ? `A simulated orderbook design falls to ${fmtN(GHOST_FLOOR)} over the same run.`
            : '')
        }
      >
        {/* Height comes from the flex row on desktop, where the chart absorbs
            the column's leftover space; the fallback keeps it usable when the
            layout is a normal document (mobile). */}
        <ResponsiveContainer width="100%" height="100%" minHeight={96}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <YAxis
              domain={[0, 1.2]}
              ticks={[0, 0.5, 1]}
              width={34}
              tick={{ fill: 'var(--faint)', fontSize: 11, fontFamily: 'var(--mono)' }}
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine y={1} stroke="var(--line)" strokeDasharray="2 4" />
            {state.ghostVisible && (
              <Line
                type="monotone"
                dataKey="ghost"
                stroke="var(--ghost)"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
                connectNulls={false}
                isAnimationActive={!reducedMotion}
                name={GHOST_LABEL}
              />
            )}
            <Line
              type="linear"
              dataKey="n"
              stroke="var(--paper)"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
              name="n = V/S"
            />
            {showInsolvent && (
              <ReferenceDot
                x={collapsed.t}
                y={collapsed.ghost as number}
                r={4}
                fill="var(--alarm)"
                stroke="none"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart__legend">
        <span className="legend legend--real">n = V/S</span>
        {state.ghostVisible && (
          <span className="legend legend--ghost">
            <Term label={GHOST_LABEL} tip={GLOSSARY.ghostLine} className="term--plain" />
            {showInsolvent && <em className="legend__flag">insolvent</em>}
          </span>
        )}
      </div>

      <p className="footnote">
        Catallax is not a stablecoin. n = 1 is not a peg — it is an accounting identity that every
        operation preserves, including failures.
      </p>
    </div>
  );
}

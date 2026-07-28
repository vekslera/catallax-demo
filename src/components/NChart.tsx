/**
 * NChart — the backing ratio over time, and the orderbook comparison.
 *
 * The real line is flat at 1.0000 and always will be. The interesting content
 * is the grey band: what a *different* design would do under the same
 * redemption run.
 *
 * That band is a hypothetical, and it is drawn to look like one. Sharing a plot
 * box with measured data is exactly how a comparison gets mistaken for a
 * second reading of the same system, so it gets its own visual dialect:
 *
 *   - a shaded region rather than a line, because regions read as annotation
 *     and lines read as series;
 *   - no dashes, since dashed in a financial chart usually means "projection of
 *     this thing", which is the opposite of the point;
 *   - a tag pinned to the band itself, so the disclaimer travels with the
 *     shape rather than living in a legend the eye skips;
 *   - a caption underneath whenever it is on.
 *
 * A note on the y-axis, since it is a real conflation: the axis is Catallax's
 * n. The other design has no n — it has asset coverage against a finite book,
 * which merely happens to start at 1.0 too. The tooltip says so.
 */

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  YAxis,
} from 'recharts';
import { useStore } from '../store';
import { GHOST_CAPTION, GHOST_FLOOR, GHOST_LABEL, ghostAt } from '../state/ghostline';
import { fmtN } from '../lib/format';
import { GLOSSARY } from '../lib/glossary';
import { Term } from './Term';

/** A pill pinned to the leading edge of the comparison band. */
function HypotheticalTag({ viewBox }: { viewBox?: { x?: number; y?: number } }) {
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  const w = 82;
  const h = 17;
  // Above and to the left of the leading point. Above rather than centred so
  // the pill cannot hang below the plot when the band reaches its floor near
  // the bottom of the axis.
  const tx = Math.max(2, x - w - 7);
  const ty = Math.max(1, y - h - 5);

  return (
    <g pointerEvents="none">
      <rect
        x={tx}
        y={ty}
        width={w}
        height={h}
        rx={8.5}
        fill="var(--ink-3)"
        stroke="var(--ghost)"
        strokeWidth={1}
      />
      <text
        x={tx + w / 2}
        y={ty + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fill="var(--paper)"
      >
        hypothetical
      </text>
    </g>
  );
}

export function NChart() {
  const { state, dispatch, reducedMotion } = useStore();

  const data = state.nHistory.map((p) => ({
    t: p.t,
    n: p.n,
    ghost: state.ghostVisible ? ghostAt(p.t, state.ghostAnchorT) : null,
  }));

  const ghostPoints = data.filter((d) => d.ghost !== null);
  const leading = ghostPoints[ghostPoints.length - 1];
  const showInsolvent = !!leading && leading.ghost !== null && leading.ghost <= GHOST_FLOOR;

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
          <span>Compare with an orderbook design</span>
        </label>
      </div>

      <div
        className="chart__canvas"
        role="img"
        aria-label={
          `Catallax's backing ratio has held at ${fmtN(1)} across ${state.opCount} operations. ` +
          (state.ghostVisible
            ? `Shown alongside for comparison only: a hypothetical orderbook-backed design, ` +
              `which falls to ${fmtN(GHOST_FLOOR)} over the same run. It is not Catallax.`
            : '')
        }
      >
        {/* `minHeight` must stay below the desktop canvas's inner height, or it
            overrides the container and the chart spills out of its box. */}
        <ResponsiveContainer width="100%" height="100%" minHeight={60}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
              <Area
                type="monotone"
                dataKey="ghost"
                stroke="var(--ghost)"
                strokeWidth={1.5}
                fill="var(--ghost-fill)"
                fillOpacity={1}
                dot={false}
                activeDot={false}
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
              name="Catallax — n = V/S"
            />

            {leading && leading.ghost !== null && (
              <ReferenceDot
                x={leading.t}
                y={leading.ghost}
                r={0}
                isFront
                label={<HypotheticalTag />}
              />
            )}
            {showInsolvent && (
              <ReferenceDot
                x={leading.t}
                y={leading.ghost as number}
                r={3.5}
                fill="var(--alarm)"
                stroke="none"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart__legend">
        <span className="legend legend--real">Catallax</span>
        {state.ghostVisible && (
          <span className="legend legend--ghost">
            <Term label={GHOST_LABEL} tip={GLOSSARY.ghostLine} className="term--plain" />
            {showInsolvent && <em className="legend__flag">insolvent</em>}
          </span>
        )}
      </div>

      {state.ghostVisible && <p className="ghostnote">{GHOST_CAPTION}</p>}

      <p className="footnote">
        Catallax is not a stablecoin. n = 1 is not a peg — it is an accounting identity that every
        operation preserves, including failures.
      </p>
    </div>
  );
}

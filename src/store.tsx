/**
 * store.tsx — the single shared state, plus the clocks that drive it.
 *
 * Provider and buyer panels are pure views and dispatchers over this store.
 * No component holds a balance. That is an architectural requirement, not a
 * preference: the demo's message *is* the shared state (spec §2).
 *
 * Three clocks live here and nowhere else:
 *   1. attestation stepping (TEE → quorum → authorized/rejected)
 *   2. job execution (~2s) and verification (~1s)
 *   3. the arbitrage loop, whenever |q − P|/P leaves the 2% band
 *
 * All three respect `prefers-reduced-motion` by collapsing to instant.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { genesisState, reducer, type Action } from './state/protocol';
import { isAttestationTerminal } from './state/compute';
import { insideBand } from './state/market';
import { BEATS, LAST_BEAT, type Beat, type BeatContext } from './state/scenario';
import type { ProtocolState } from './state/types';
import {
  ARB_TICK_MS,
  ATTEST_SETTLE_MS,
  ATTEST_TICK_MS,
  JOB_EXECUTE_MS,
  JOB_START_MS,
  JOB_VERIFY_MS,
} from './state/timing';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

interface ScenarioControls {
  playing: boolean;
  beat: Beat;
  isLast: boolean;
  playBeat: (index: number) => void;
  next: () => void;
  restart: () => void;
}

interface StoreValue {
  state: ProtocolState;
  dispatch: (a: Action) => void;
  scenario: ScenarioControls;
  reducedMotion: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <ProtocolProvider>');
  return ctx;
}

export function ProtocolProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => genesisState('scenario'));
  const reducedMotion = usePrefersReducedMotion();

  // Latest state, readable from inside scheduled callbacks without making them
  // dependencies of every effect.
  const stateRef = useRef(state);
  stateRef.current = state;

  const timers = useRef<number[]>([]);
  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const after = useCallback(
    (ms: number, fn: () => void) => {
      const id = window.setTimeout(fn, reducedMotion ? 0 : ms);
      timers.current.push(id);
    },
    [reducedMotion],
  );

  const [playing, setPlaying] = useState(false);

  // --- clock 1: attestation ------------------------------------------------
  const attestation = state.attestation;
  useEffect(() => {
    if (!attestation) return;
    if (isAttestationTerminal(attestation)) {
      const id = window.setTimeout(
        () => dispatch({ type: 'ATTEST_DISMISS' }),
        reducedMotion ? 0 : ATTEST_SETTLE_MS,
      );
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(
      () => dispatch({ type: 'ATTEST_STEP' }),
      reducedMotion ? 0 : ATTEST_TICK_MS,
    );
    return () => window.clearTimeout(id);
  }, [attestation, reducedMotion]);

  // --- clock 2: job execution ---------------------------------------------
  const job = state.activeJob;
  useEffect(() => {
    if (!job) return;
    const delay =
      job.phase === 'escrowed'
        ? JOB_START_MS
        : job.phase === 'executing'
          ? JOB_EXECUTE_MS
          : JOB_VERIFY_MS;
    const id = window.setTimeout(() => dispatch({ type: 'JOB_STEP' }), reducedMotion ? 0 : delay);
    return () => window.clearTimeout(id);
  }, [job, reducedMotion]);

  // --- clock 3: the simulated arbitrageur ----------------------------------
  const { quoteUSD, computePriceUSD, seq } = state;
  useEffect(() => {
    if (insideBand(quoteUSD, computePriceUSD)) return;
    const id = window.setTimeout(
      () => dispatch({ type: 'ARB_STEP' }),
      reducedMotion ? 0 : ARB_TICK_MS,
    );
    return () => window.clearTimeout(id);
    // `seq` is included so a step that clears no volume still re-arms the loop.
  }, [quoteUSD, computePriceUSD, seq, reducedMotion]);

  // --- scenario beat runner ------------------------------------------------
  const playBeat = useCallback(
    (index: number) => {
      const beat = BEATS[Math.max(0, Math.min(index, LAST_BEAT))];
      clearTimers();
      dispatch({ type: 'SET_BEAT', beat: beat.id });

      const ctx: BeatContext = beat.prepare ? beat.prepare(stateRef.current) : {};
      if (beat.steps.length === 0) {
        setPlaying(false);
        return;
      }

      setPlaying(true);
      beat.steps.forEach((step) => {
        after(step.at, () => {
          const action = step.action(stateRef.current, ctx);
          if (action) dispatch(action);
        });
      });
      after(beat.duration, () => setPlaying(false));
    },
    [after, clearTimers],
  );

  const next = useCallback(() => {
    const current = stateRef.current.scenarioBeat;
    if (current >= LAST_BEAT) {
      dispatch({ type: 'SET_MODE', mode: 'sandbox' });
      return;
    }
    playBeat(current + 1);
  }, [playBeat]);

  const restart = useCallback(() => {
    clearTimers();
    setPlaying(false);
    dispatch({ type: 'RESET', mode: 'scenario' });
  }, [clearTimers]);

  const guardedDispatch = useCallback(
    (a: Action) => {
      // Leaving scenario mode by hand should not leave beat timers running.
      if (a.type === 'SET_MODE' || a.type === 'RESET') {
        clearTimers();
        setPlaying(false);
      }
      dispatch(a);
    },
    [clearTimers],
  );

  const value = useMemo<StoreValue>(
    () => ({
      state,
      dispatch: guardedDispatch,
      reducedMotion,
      scenario: {
        playing,
        beat: BEATS[Math.min(state.scenarioBeat, LAST_BEAT)],
        isLast: state.scenarioBeat >= LAST_BEAT,
        playBeat,
        next,
        restart,
      },
    }),
    [state, guardedDispatch, reducedMotion, playing, playBeat, next, restart],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

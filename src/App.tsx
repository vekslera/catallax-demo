/**
 * App — the shared-state triptych.
 *
 * Provider on the left, buyer on the right, the monetary dashboard in the
 * middle and visually dominant. The left/right colour mapping mirrors the
 * brand mark's arm geometry: the layout is the logo (spec §8).
 */

import { useStore } from './store';
import { ProviderPanel } from './components/ProviderPanel';
import { BuyerPanel } from './components/BuyerPanel';
import { VaultBar, VaultDashboard } from './components/VaultDashboard';
import { NarrationBar } from './components/NarrationBar';
import { FlowAnimation } from './components/FlowAnimation';

export function App() {
  const { state, dispatch, scenario } = useStore();

  return (
    <div className={`app app--${state.mode}`}>
      <a className="skip" href="#vault">
        Skip to the vault
      </a>

      <header className="masthead">
        <div className="brand">
          <img className="brand__mark" src="./catallax-mark.svg" alt="" width={36} height={36} />
          <div className="brand__words">
            <span className="brand__name">Catallax</span>
            <span className="brand__tag">compute-collateralized currency</span>
          </div>
        </div>

        <div className="modeswitch" role="group" aria-label="Mode">
          <button
            type="button"
            className={`modebtn${state.mode === 'scenario' ? ' is-active' : ''}`}
            aria-pressed={state.mode === 'scenario'}
            onClick={() => {
              dispatch({ type: 'SET_MODE', mode: 'scenario' });
              if (state.opCount === 0) scenario.playBeat(0);
            }}
          >
            Play the story
          </button>
          <button
            type="button"
            className={`modebtn${state.mode === 'sandbox' ? ' is-active' : ''}`}
            aria-pressed={state.mode === 'sandbox'}
            onClick={() => dispatch({ type: 'SET_MODE', mode: 'sandbox' })}
          >
            Sandbox: try to break n
          </button>
        </div>
      </header>

      <VaultBar />

      <main className={`triptych focus--${state.mode === 'scenario' ? scenario.beat.focus : 'none'}`}>
        <FlowAnimation />
        <ProviderPanel />
        <div className="vaultcol" id="vault">
          <VaultDashboard />
        </div>
        <BuyerPanel />
      </main>

      <NarrationBar />

      <footer className="footer">
        <p>This demo runs entirely in your browser. The protocol runs on Arbitrum.</p>
        <p className="footer__brand">
          Catallax · CTLX · <span>catallax.xyz</span>
        </p>
      </footer>
    </div>
  );
}

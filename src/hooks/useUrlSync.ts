import { useEffect, useRef } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { readUrlState, replaceUrlState } from '@/utils/urlState';
import type { UrlState } from '@/utils/urlState';

/**
 * Two-way sync between the address bar and the console.
 *
 * - On first load the URL is applied to the store (invalid values fall back).
 * - Back/forward re-applies the URL (popstate).
 * - Page / 3D view / component / scenario / seed changes are written back with
 *   replaceState so the URL is always shareable without flooding history.
 *
 * The write is guarded against redundant updates, so this cannot loop.
 */
export function useUrlSync(): void {
  const mounted = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const apply = (search: string) => {
      const state = readUrlState(search);
      const store = useSimulationStore.getState();
      if (state.view) store.setReactorView(state.view);
      if (state.selectedComponent) store.setSelectedComponent(state.selectedComponent);
      if (state.seed !== null) store.setConfig({ seed: state.seed });
      if (state.scenario) store.applyScenario(state.scenario);
      store.setPage(state.page);
      mounted.current = true;
    };

    apply(window.location.search);

    const onPopState = () => apply(window.location.search);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const write = () => {
      if (!mounted.current) return;
      const state = useSimulationStore.getState();
      const urlState: UrlState = {
        page: state.activePage,
        scenario: state.scenarioId,
        seed: state.frame.config.seed,
        view: state.reactorView,
        selectedComponent: state.selectedComponent,
        replayRunId: null,
      };
      replaceUrlState(urlState);
    };
    // Write once immediately, then on every relevant change.
    write();
    const unsubscribe = useSimulationStore.subscribe((state, previous) => {
      if (
        state.activePage !== previous.activePage ||
        state.reactorView !== previous.reactorView ||
        state.selectedComponent !== previous.selectedComponent ||
        state.scenarioId !== previous.scenarioId ||
        state.frame.config.seed !== previous.frame.config.seed
      ) {
        write();
      }
    });
    return unsubscribe;
  }, []);
}

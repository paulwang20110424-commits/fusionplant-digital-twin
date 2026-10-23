import { lazy, Suspense, useEffect } from 'react';
import { TopStatusBar } from '@/components/layout/TopStatusBar';
import { NavBar } from '@/components/layout/NavBar';
import { ToastStack } from '@/components/ui/ToastStack';
import { startSimulationRuntime, simulationEngine, useSimulationStore } from '@/store/simulationStore';
import { historyBuffer } from '@/store/historyBuffer';
import type { PageId } from '@/store/simulationStore';
// Route-level code splitting: the console shell paints immediately and each
// page (plus its charts / 3D scene) is fetched on demand.
const Overview = lazy(() => import('@/pages/Overview').then((module) => ({ default: module.Overview })));
const Reactor = lazy(() => import('@/pages/Reactor').then((module) => ({ default: module.Reactor })));
const MagneticField = lazy(() =>
  import('@/pages/MagneticField').then((module) => ({ default: module.MagneticField })),
);
const Heating = lazy(() => import('@/pages/Heating').then((module) => ({ default: module.Heating })));
const Cooling = lazy(() => import('@/pages/Cooling').then((module) => ({ default: module.Cooling })));
const PowerGrid = lazy(() => import('@/pages/PowerGrid').then((module) => ({ default: module.PowerGrid })));
const Diagnostics = lazy(() => import('@/pages/Diagnostics').then((module) => ({ default: module.Diagnostics })));
const SimulationLab = lazy(() =>
  import('@/pages/SimulationLab').then((module) => ({ default: module.SimulationLab })),
);
const History = lazy(() => import('@/pages/History').then((module) => ({ default: module.History })));

function LoadingPanel({ page }: { page: PageId }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="hud-panel w-[320px] px-4 py-3 text-center">
        <div className="label">LOADING CONSOLE MODULE</div>
        <div className="mt-1 text-[12px] tracking-[0.2em] text-sys">{page}</div>
        <div className="mt-2 h-[2px] w-full overflow-hidden bg-edge">
          <span className="block h-full w-1/3 animate-pulse bg-sys/70" />
        </div>
      </div>
    </div>
  );
}

function renderPage(page: PageId) {
  switch (page) {
    case 'OVERVIEW':
      return <Overview />;
    case 'REACTOR':
      return <Reactor />;
    case 'MAGNETIC':
      return <MagneticField />;
    case 'HEATING':
      return <Heating />;
    case 'COOLING':
      return <Cooling />;
    case 'POWER':
      return <PowerGrid />;
    case 'DIAGNOSTICS':
      return <Diagnostics />;
    case 'SIMULATION':
      return <SimulationLab />;
    case 'HISTORY':
      return <History />;
    default:
      return <Overview />;
  }
}

export default function App() {
  const activePage = useSimulationStore((state) => state.activePage);

  useEffect(() => {
    const stop = startSimulationRuntime();
    return stop;
  }, []);

  // Development-only debug handle used by the automated smoke / audit scripts.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__FUSION_DEBUG__ = {
      engine: simulationEngine,
      store: useSimulationStore,
      historyBuffer,
      snapshot: () => simulationEngine.snapshot(),
    };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-void text-ink">
      <TopStatusBar />
      <NavBar />
      <main className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<LoadingPanel page={activePage} />}>{renderPage(activePage)}</Suspense>
      </main>
      <ToastStack />
    </div>
  );
}

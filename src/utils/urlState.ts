import type { PageId } from '@/store/simulationStore';
import type { ReactorComponentId, ReactorViewMode, ScenarioId } from '@/types/simulation';
import { componentFromSlug, COMPONENT_REGISTRY } from '@/reactor/componentRegistry';
import { normalizeSeed, randomSeed } from '@/simulation/random';

/** Stable lowercase slug for every console page. */
export const PAGE_SLUGS: Record<PageId, string> = {
  OVERVIEW: 'overview',
  REACTOR: 'reactor',
  MAGNETIC: 'magnetic',
  HEATING: 'heating',
  COOLING: 'cooling',
  POWER: 'power',
  DIAGNOSTICS: 'diagnostics',
  SIMULATION: 'simulation',
  HISTORY: 'history',
};

const SLUG_TO_PAGE = Object.fromEntries(
  Object.entries(PAGE_SLUGS).map(([page, slug]) => [slug, page as PageId]),
) as Record<string, PageId>;

export const SCENARIO_SLUGS: Record<ScenarioId, string> = {
  BASELINE: 'baseline',
  HIGH_HEATING: 'high-heating',
  COOLING_STRESS: 'cooling-stress',
  MAGNETIC_DISTURBANCE: 'magnetic-disturbance',
  CUSTOM: 'custom',
};

const SLUG_TO_SCENARIO = Object.fromEntries(
  Object.entries(SCENARIO_SLUGS).map(([scenario, slug]) => [slug, scenario as ScenarioId]),
) as Record<string, ScenarioId>;

const VIEWS: ReactorViewMode[] = ['FULL', 'CUTAWAY', 'PLASMA'];

export interface UrlState {
  page: PageId;
  scenario: ScenarioId | null;
  seed: number | null;
  view: ReactorViewMode | null;
  selectedComponent: ReactorComponentId | null;
  replayRunId: string | null;
}

export function pageFromSlug(slug: string | null | undefined): PageId {
  if (!slug) return 'OVERVIEW';
  return SLUG_TO_PAGE[slug.trim().toLowerCase()] ?? 'OVERVIEW';
}

export function scenarioFromSlug(slug: string | null | undefined): ScenarioId | null {
  if (!slug) return null;
  return SLUG_TO_SCENARIO[slug.trim().toLowerCase()] ?? null;
}

export function viewFromSlug(slug: string | null | undefined): ReactorViewMode | null {
  if (!slug) return null;
  const upper = slug.trim().toUpperCase();
  return (VIEWS as string[]).includes(upper) ? (upper as ReactorViewMode) : null;
}

/** Parse the query string into a validated state. Unknown values fall back safely. */
export function readUrlState(search: string): UrlState {
  const params = new URLSearchParams(search);
  const rawSeed = params.get('seed');
  const parsedSeed = rawSeed === null ? null : normalizeSeed(rawSeed);
  return {
    page: pageFromSlug(params.get('page')),
    scenario: scenarioFromSlug(params.get('scenario')),
    seed: rawSeed === null ? null : parsedSeed,
    view: viewFromSlug(params.get('view')),
    selectedComponent: componentFromSlug(params.get('selectedComponent')),
    replayRunId: params.get('replayRunId'),
  };
}

/**
 * Serialise state back to a query string.
 * Only navigation/configuration data is stored: no secrets, no personal data.
 */
export function buildSearch(state: Partial<UrlState>): string {
  const params = new URLSearchParams();
  if (state.page) params.set('page', PAGE_SLUGS[state.page]);
  if (state.scenario) params.set('scenario', SCENARIO_SLUGS[state.scenario]);
  if (state.seed !== null && state.seed !== undefined) params.set('seed', String(state.seed));
  if (state.view) params.set('view', state.view.toLowerCase());
  if (state.selectedComponent) {
    params.set('selectedComponent', COMPONENT_REGISTRY[state.selectedComponent].slug);
  }
  if (state.replayRunId) params.set('replayRunId', state.replayRunId);
  return params.toString();
}

/** Build a full shareable URL for the current console state. */
export function buildShareUrl(state: Partial<UrlState>, base?: string): string {
  const origin =
    base ?? (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '');
  const query = buildSearch(state);
  return query ? `${origin}?${query}` : origin;
}

/** Write the state into the address bar without adding a history entry. */
export function replaceUrlState(state: Partial<UrlState>): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const query = buildSearch(state);
  const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (next === current) return;
  window.history.replaceState({ ...(window.history.state ?? {}), urlState: state }, '', next);
}

/** Write the state and add a history entry (used for explicit navigation). */
export function pushUrlState(state: Partial<UrlState>): void {
  if (typeof window === 'undefined' || !window.history?.pushState) return;
  const query = buildSearch(state);
  const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (next === current) return;
  window.history.pushState({ ...(window.history.state ?? {}), urlState: state }, '', next);
}

/** True when the value looks like a run id this app could have produced. */
export function isRunId(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^FUS-\d+-[0-9A-Z]+$/.test(value);
}

/** Seed used for a share link that omitted one (read-only, never persisted). */
export function seedForShareLink(): number {
  return randomSeed();
}

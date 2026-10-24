import { describe, expect, it } from 'vitest';
import {
  PAGE_SLUGS,
  buildSearch,
  buildShareUrl,
  isRunId,
  pageFromSlug,
  readUrlState,
  scenarioFromSlug,
  viewFromSlug,
} from '@/utils/urlState';

describe('v1.2.0 — URL state', () => {
  it('maps every page to a stable lowercase slug', () => {
    for (const [page, slug] of Object.entries(PAGE_SLUGS)) {
      expect(slug).toBe(slug.toLowerCase());
      expect(pageFromSlug(slug)).toBe(page);
    }
  });

  it('falls back to overview for unknown or empty page values', () => {
    expect(pageFromSlug(null)).toBe('OVERVIEW');
    expect(pageFromSlug('')).toBe('OVERVIEW');
    expect(pageFromSlug('does-not-exist')).toBe('OVERVIEW');
    expect(pageFromSlug('REACTOR')).toBe('REACTOR');
  });

  it('parses a full share link', () => {
    const state = readUrlState(
      '?page=reactor&view=cutaway&selectedComponent=tf-coils&scenario=high-heating&seed=12345&replayRunId=FUS-1-ABC',
    );
    expect(state.page).toBe('REACTOR');
    expect(state.view).toBe('CUTAWAY');
    expect(state.selectedComponent).toBe('tf-coil');
    expect(state.scenario).toBe('HIGH_HEATING');
    expect(state.seed).toBe(12345);
    expect(state.replayRunId).toBe('FUS-1-ABC');
  });

  it('ignores invalid optional values without failing', () => {
    const state = readUrlState('?page=nope&view=sideways&scenario=unknown&selectedComponent=reactor-core');
    expect(state.page).toBe('OVERVIEW');
    expect(state.view).toBeNull();
    expect(state.scenario).toBeNull();
    expect(state.selectedComponent).toBeNull();
  });

  it('round-trips through buildSearch', () => {
    const search = buildSearch({
      page: 'MAGNETIC',
      view: 'PLASMA',
      selectedComponent: 'coolant-manifold',
      scenario: 'COOLING_STRESS',
      seed: 777,
    });
    const parsed = readUrlState(`?${search}`);
    expect(parsed.page).toBe('MAGNETIC');
    expect(parsed.view).toBe('PLASMA');
    expect(parsed.selectedComponent).toBe('coolant-manifold');
    expect(parsed.scenario).toBe('COOLING_STRESS');
    expect(parsed.seed).toBe(777);
  });

  it('never emits empty or undefined parameters', () => {
    const search = buildSearch({ page: 'OVERVIEW' });
    expect(search).toBe('page=overview');
    expect(search).not.toContain('undefined');
    expect(search).not.toContain('null');
  });

  it('builds an absolute share URL', () => {
    const url = buildShareUrl({ page: 'HISTORY', replayRunId: 'FUS-42-X' }, 'https://example.test/app');
    expect(url).toBe('https://example.test/app?page=history&replayRunId=FUS-42-X');
  });

  it('validates scenario, view and run id inputs', () => {
    expect(scenarioFromSlug('baseline')).toBe('BASELINE');
    expect(scenarioFromSlug('bogus')).toBeNull();
    expect(viewFromSlug('cutaway')).toBe('CUTAWAY');
    expect(viewFromSlug('CUTAWAY')).toBe('CUTAWAY');
    expect(viewFromSlug('x')).toBeNull();
    expect(isRunId('FUS-20260101-LX9Z2K')).toBe(true);
    expect(isRunId('not-a-run')).toBe(false);
    expect(isRunId(null)).toBe(false);
  });
});

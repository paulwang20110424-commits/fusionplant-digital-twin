// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NavBar, PAGES } from '@/components/layout/NavBar';
import { TopStatusBar } from '@/components/layout/TopStatusBar';
import { FaultPanel } from '@/components/controls/FaultPanel';
import { ControlSlider } from '@/components/controls/ControlSlider';
import { Toggle } from '@/components/controls/Fields';
import { useSimulationStore } from '@/store/simulationStore';

/**
 * Accessibility contract tests (E.13).
 *
 * These render the real components in jsdom and assert the accessible names,
 * roles and ARIA state that the CI axe run also checks at runtime. They are the
 * unit-level counterpart to `npm run test:a11y`.
 */

beforeEach(() => {
  cleanup();
  useSimulationStore.getState().reset();
});

describe('accessibility — navigation', () => {
  it('every navigation button has an accessible name', () => {
    render(<NavBar />);
    for (const page of PAGES) {
      expect(screen.getByRole('button', { name: page.label })).toBeTruthy();
    }
  });

  it('the active page is marked with aria-current="page"', () => {
    useSimulationStore.getState().setPage('REACTOR');
    render(<NavBar />);
    const active = screen.getByRole('button', { name: 'REACTOR' });
    expect(active.getAttribute('aria-current')).toBe('page');
    const inactive = screen.getByRole('button', { name: 'HISTORY' });
    expect(inactive.getAttribute('aria-current')).toBeNull();
  });

  it('exposes a labelled navigation landmark', () => {
    render(<NavBar />);
    expect(screen.getByRole('navigation', { name: 'Console pages' })).toBeTruthy();
  });
});

describe('accessibility — transport controls', () => {
  it('START, RESET, E-STOP and fullscreen have distinct accessible names', () => {
    render(<TopStatusBar />);
    expect(
      screen.getByRole('button', { name: /start simulation|pause simulation|resume simulation/i }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset simulation' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /emergency stop/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /fullscreen console/i })).toBeTruthy();
  });

  it('announces run state and alarm counts in a live region', () => {
    render(<TopStatusBar />);
    const live = document.querySelector('[role="status"][aria-live="polite"]');
    expect(live).toBeTruthy();
    expect(live?.textContent ?? '').toMatch(/simulation|active alarm/i);
  });
});

describe('accessibility — controls', () => {
  it('every INJECT button is distinguishable by its accessible name', () => {
    render(<FaultPanel />);
    const buttons = screen.getAllByRole('button', { name: /^inject .+ at \d+ percent severity$/i });
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    const names = new Set(buttons.map((button) => button.getAttribute('aria-label')));
    expect(names.size).toBe(buttons.length);
  });

  it('range sliders expose label, min, max, value and value text', () => {
    render(<ControlSlider controlKey="nbiPowerMW" />);
    const slider = screen.getByRole('slider', { name: 'Neutral Beam Injection Power' });
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('50');
    expect(slider.getAttribute('aria-valuenow')).not.toBeNull();
    expect(slider.getAttribute('aria-valuetext')).toMatch(/MW$/);
  });

  it('toggle controls use role="switch" with aria-checked', () => {
    render(<Toggle label="Fault injection enabled" checked onChange={() => {}} />);
    const toggle = screen.getByRole('switch', { name: 'Fault injection enabled' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });
});

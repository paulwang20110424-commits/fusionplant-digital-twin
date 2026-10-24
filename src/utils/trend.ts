/**
 * Display-unit helpers for KPI tiles.
 *
 * The history buffer stores raw physical units (m⁻³, 0..1 index, MW, …). A KPI
 * tile may render a scaled value (10.50 ×10¹⁹ m⁻³, 86 %). The trend delta must be
 * computed and formatted in the *display* unit, never in the raw unit — otherwise
 * density deltas render as ~1e17 and stability deltas as 0.02 instead of 2 %.
 */
import { formatSigned } from './units';

/** Multiply a raw channel value into its display unit, rejecting invalid input. */
export function scaleChannelValue(value: unknown, scale = 1): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (!Number.isFinite(scale) || scale === 0) return null;
  const scaled = value * scale;
  return Number.isFinite(scaled) ? scaled : null;
}

/**
 * Delta between two raw samples, expressed in the display unit.
 * Returns null when either sample (or the scale) is unusable.
 */
export function computeTrendDelta(latest: unknown, reference: unknown, scale = 1): number | null {
  const end = scaleChannelValue(latest, scale);
  const start = scaleChannelValue(reference, scale);
  if (end === null || start === null) return null;
  const delta = end - start;
  return Number.isFinite(delta) ? delta : null;
}

export interface TrendFormatOptions {
  /** Decimal places for the signed value (default 1). */
  digits?: number;
  /** Unit suffix appended to the formatted delta, e.g. "×10¹⁹" or "%". */
  unit?: string;
  /** Full custom formatter; takes precedence over digits. */
  formatter?: (delta: number) => string;
}

/**
 * Format a display-unit delta. Never returns NaN/Infinity text: invalid input
 * renders as "N/A", matching the rest of the console.
 */
export function formatTrendDelta(delta: number | null | undefined, options: TrendFormatOptions = {}): string {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return 'N/A';
  const digits = options.digits ?? 1;
  const magnitude = Math.abs(delta);
  let text: string;
  if (options.formatter) {
    text = options.formatter(delta);
  } else if (magnitude >= 100_000) {
    // Defensive: a legitimate delta should never reach this after scaling.
    text = `${delta > 0 ? '+' : ''}${delta.toExponential(1)}`;
  } else {
    text = formatSigned(delta, digits);
  }
  return options.unit ? `${text} ${options.unit}` : text;
}

/** Semantic direction of a delta, used for colouring (never the only signal). */
export function trendDirection(delta: number | null): 'up' | 'down' | 'flat' | 'invalid' {
  if (delta === null || !Number.isFinite(delta)) return 'invalid';
  if (Math.abs(delta) < 1e-9) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

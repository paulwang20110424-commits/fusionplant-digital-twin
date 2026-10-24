/** Small numeric helpers shared by every model. Guard against NaN/Infinity at the source. */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function safeDiv(
  numerator: number,
  denominator: number,
  fallback: number | null = null,
): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

/** Ratio guard that returns null when the denominator is not usable. */
export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 1e-12) {
    return null;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) && result >= 0 ? result : null;
}

/** Ratio that may be negative (e.g. net electric / plant load). Null when undefined. */
export function signedRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) {
    return null;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/** First-order lag: exponential approach of `current` towards `target`. */
export function approach(current: number, target: number, dt: number, tau: number): number {
  if (!Number.isFinite(current)) return target;
  if (!Number.isFinite(target)) return current;
  if (tau <= 0) return target;
  const alpha = 1 - Math.exp(-dt / tau);
  return current + (target - current) * alpha;
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  const sum = values.reduce((acc, v) => (Number.isFinite(v) ? acc + v : acc), 0);
  return sum / values.length;
}

export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Deterministic PRNG (mulberry32) so experiments are reproducible from a seed. */
export function createRandom(seed: number): () => number {
  let a = Math.trunc(seed) || 1;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Symmetric random in [-1, 1]. */
export function symmetric(random: () => number): number {
  return random() * 2 - 1;
}

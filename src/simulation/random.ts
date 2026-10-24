/**
 * Deterministic random-number utilities.
 *
 * The simulation engine must never call Math.random(): every stochastic effect
 * (disturbance walk, measurement noise) draws from a seeded generator so that a
 * run can be reproduced exactly from (seed, controls, scenario, initial state,
 * fault timeline, time step).
 */
import { createRandom } from '@/utils/math';

/** Smallest and largest seeds accepted by the UI and the engine. */
export const SEED_MIN = 1;
export const SEED_MAX = 2147483647;
export const DEFAULT_SEED = 20260101;

/** Coerce any input into a usable integer seed inside [SEED_MIN, SEED_MAX]. */
export function normalizeSeed(seed: number | string | null | undefined): number {
  if (seed === null || seed === undefined) return DEFAULT_SEED;
  const numeric = typeof seed === 'string' ? Number(seed.trim()) : seed;
  if (!Number.isFinite(numeric)) return DEFAULT_SEED;
  const truncated = Math.trunc(numeric);
  if (truncated < SEED_MIN) return SEED_MIN;
  if (truncated > SEED_MAX) return SEED_MAX;
  return truncated === 0 ? SEED_MIN : truncated;
}

/**
 * Create a seeded PRNG (mulberry32). Same seed => same sequence, always.
 * Returns a function producing numbers in [0, 1).
 */
export function createSeededRandom(seed: number): () => number {
  return createRandom(normalizeSeed(seed));
}

/** A stable, human-readable run identifier: FUS-<seed>-<base36 time>. */
export function generateRunId(seed: number, startedAtMs: number = Date.now()): string {
  const safeSeed = normalizeSeed(seed);
  const time = Math.max(0, Math.trunc(startedAtMs)).toString(36).toUpperCase();
  return `FUS-${safeSeed}-${time}`;
}

/** Random seed for the "Randomize seed" button (not used by the engine itself). */
export function randomSeed(): number {
  return Math.floor(Math.random() * (SEED_MAX - SEED_MIN)) + SEED_MIN;
}

/** Parse a seed from an untrusted source (URL, imported JSON). */
export function parseSeed(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return normalizeSeed(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return normalizeSeed(numeric);
  }
  return null;
}

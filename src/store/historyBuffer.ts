import type { HistorySample, PersistedSession, SessionMeta } from '@/types/simulation';

/**
 * HistoryBuffer — bounded ring-style buffer of samples.
 *
 * Kept outside React state deliberately: the engine writes to it at up to ~10 Hz
 * and charts read slices at 4 Hz, without triggering component re-renders.
 */
export class HistoryBuffer {
  private samples: HistorySample[] = [];
  private readonly capacity: number;

  constructor(capacity = 4800) {
    this.capacity = Math.max(60, capacity);
  }

  push(sample: HistorySample): void {
    this.samples.push(sample);
    if (this.samples.length > this.capacity) {
      this.samples.splice(0, this.samples.length - this.capacity);
    }
  }

  get size(): number {
    return this.samples.length;
  }

  get isEmpty(): boolean {
    return this.samples.length === 0;
  }

  /** First and last simulated timestamps. */
  get timeRange(): { start: number; end: number } {
    if (!this.samples.length) return { start: 0, end: 0 };
    return { start: this.samples[0].t, end: this.samples[this.samples.length - 1].t };
  }

  /** Copy of the samples inside the last `seconds` of simulated time. */
  window(seconds: number): HistorySample[] {
    if (!this.samples.length) return [];
    const end = this.samples[this.samples.length - 1].t;
    const start = end - seconds;
    const startIndex = this.lowerBound(start);
    return this.samples.slice(startIndex);
  }

  /** Copy of all retained samples. */
  all(): HistorySample[] {
    return this.samples.slice();
  }

  /** Copy of samples within an explicit simulated-time range. */
  range(startS: number, endS: number): HistorySample[] {
    const from = this.lowerBound(startS);
    const to = Math.max(from + 1, this.lowerBound(endS) + 1);
    return this.samples.slice(from, Math.min(to, this.samples.length));
  }

  latest(): HistorySample | null {
    return this.samples.length ? this.samples[this.samples.length - 1] : null;
  }

  /** Sample nearest to (or immediately before) a simulated timestamp. */
  sampleAt(tS: number): HistorySample | null {
    if (!this.samples.length) return null;
    const index = Math.min(this.lowerBound(tS), this.samples.length - 1);
    return this.samples[index] ?? null;
  }

  clear(): void {
    this.samples = [];
  }

  private lowerBound(tS: number): number {
    let low = 0;
    let high = this.samples.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.samples[mid].t < tS) low = mid + 1;
      else high = mid;
    }
    return low;
  }
}

/** Process-wide live history used by every chart on the console. */
export const historyBuffer = new HistoryBuffer(4800);

/* ------------------------------------------------------------------ */
/* Persistence helpers                                                 */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'fusionplant.sessions.v2';
const MAX_PERSISTED_SESSIONS = 2;
const MAX_PERSISTED_SAMPLES = 1400;

/** Fixed channel order for the compact row encoding. */
const CHANNEL_ORDER: Array<keyof HistorySample> = [
  't',
  'temperature',
  'density',
  'current',
  'pressure',
  'storedEnergy',
  'fusionPower',
  'heatingPower',
  'alphaPower',
  'qPlasma',
  'qEngineering',
  'toroidalField',
  'poloidalField',
  'coilCurrent',
  'coilTemperature',
  'fieldStability',
  'coolantIn',
  'coolantOut',
  'coolantFlow',
  'thermalPower',
  'electricalOutput',
  'plantAuxiliary',
  'netElectric',
  'stability',
  'betaN',
  'greenwald',
  'heatExchangerLoad',
  'vacuumPressure',
  'cryoLoad',
  'confinementTime',
];

type Row = Array<number | null>;

interface StoredSession {
  id: string;
  name: string;
  createdAt: number;
  scenarioName: string;
  channels: string[];
  rows: Row[];
  events: PersistedSession['events'];
  alarms: PersistedSession['alarms'];
  controls: PersistedSession['controls'];
  config: PersistedSession['config'];
  durationS: number;
}

function storageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const probe = '__fusion_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Downsample so that persisted sessions stay inside the storage budget. */
function downsample(samples: HistorySample[], maxSamples = MAX_PERSISTED_SAMPLES): HistorySample[] {
  if (samples.length <= maxSamples) return samples;
  const stride = samples.length / maxSamples;
  const result: HistorySample[] = [];
  for (let i = 0; i < maxSamples; i += 1) {
    result.push(samples[Math.min(samples.length - 1, Math.floor(i * stride))]);
  }
  const last = samples[samples.length - 1];
  if (result[result.length - 1] !== last) result[result.length - 1] = last;
  return result;
}

function encodeSamples(samples: HistorySample[]): Row[] {
  return samples.map((sample) =>
    CHANNEL_ORDER.map((channel) => {
      const value = sample[channel];
      if (value === null || value === undefined) return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Number(numeric.toFixed(4)) : null;
    }),
  );
}

function decodeSamples(rows: Row[], channels: string[]): HistorySample[] {
  const order = channels as Array<keyof HistorySample>;
  return rows.map((row) => {
    const sample = { t: 0, wallMs: Date.now() } as HistorySample;
    order.forEach((channel, index) => {
      const value = row[index];
      (sample as unknown as Record<string, number | null>)[channel] = value === null ? null : value;
    });
    return sample;
  });
}

function readRaw(): StoredSession[] {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredSession[]) : [];
  } catch {
    return [];
  }
}

export function listSessions(): SessionMeta[] {
  return readRaw()
    .map((session) => ({
      id: session.id,
      name: session.name,
      createdAt: session.createdAt,
      scenarioName: session.scenarioName,
      sampleCount: session.rows.length,
      durationS: session.durationS,
      approxBytes: JSON.stringify(session).length,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function loadSession(id: string): PersistedSession | null {
  const stored = readRaw().find((session) => session.id === id);
  if (!stored) return null;
  return {
    id: stored.id,
    name: stored.name,
    createdAt: stored.createdAt,
    scenarioName: stored.scenarioName,
    samples: decodeSamples(stored.rows, stored.channels),
    events: stored.events ?? [],
    alarms: stored.alarms ?? [],
    controls: stored.controls,
    config: stored.config,
    durationS: stored.durationS,
    sampleCount: stored.rows.length,
    approxBytes: JSON.stringify(stored).length,
  };
}

export interface SaveResult {
  ok: boolean;
  error?: string;
  evicted?: number;
}

/**
 * Persist a session, evicting the oldest entries and retrying on quota errors.
 * Never throws: the UI shows the returned message instead.
 */
export function saveSession(session: PersistedSession): SaveResult {
  if (!storageAvailable()) {
    return { ok: false, error: 'Browser storage is unavailable — recording kept in memory only.' };
  }
  const compact: StoredSession = {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    scenarioName: session.scenarioName,
    channels: CHANNEL_ORDER as string[],
    rows: encodeSamples(downsample(session.samples)),
    events: session.events.slice(-150),
    alarms: session.alarms.slice(-100),
    controls: session.controls,
    config: session.config,
    durationS: session.durationS,
  };

  let existing = readRaw().filter((entry) => entry.id !== session.id);
  let evicted = 0;
  existing.unshift(compact);
  if (existing.length > MAX_PERSISTED_SESSIONS) {
    evicted = existing.length - MAX_PERSISTED_SESSIONS;
    existing = existing.slice(0, MAX_PERSISTED_SESSIONS);
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
      return { ok: true, evicted };
    } catch (error) {
      // Quota exceeded: drop the oldest session and retry once more.
      if (existing.length <= 1) {
        return {
          ok: false,
          error: `Could not save session: ${(error as Error).message}. Reduce the recorded duration or clear saved sessions.`,
        };
      }
      existing = existing.slice(0, existing.length - 1);
      evicted += 1;
    }
  }
  return { ok: false, error: 'Storage quota exceeded even after evicting older sessions.' };
}

export function deleteSession(id: string): boolean {
  if (!storageAvailable()) return false;
  const remaining = readRaw().filter((session) => session.id !== id);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    return true;
  } catch {
    return false;
  }
}

export function clearAllSessions(): void {
  try {
    if (storageAvailable()) window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function storageUsage(): { sessions: number; bytes: number; available: boolean } {
  const raw = readRaw();
  return {
    sessions: raw.length,
    bytes: raw.reduce((acc, session) => acc + JSON.stringify(session).length, 0),
    available: storageAvailable(),
  };
}

export { MAX_PERSISTED_SAMPLES, STORAGE_KEY };

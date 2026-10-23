/** Unit conversion + display formatting. Every number shown in the UI passes through here. */

export const UNITS = {
  temperature: 'keV',
  density: 'm⁻³',
  current: 'MA',
  field: 'T',
  coilCurrent: 'kA',
  power: 'MW',
  energy: 'MJ',
  time: 's',
  volume: 'm³',
  pressure: 'kPa',
  vacuum: 'Pa',
  coolant: '°C',
  flow: 'kg/s',
  mass: 'kg',
  kelvin: 'K',
  percent: '%',
  q: '—',
} as const;

/** Format a possibly-null number; never renders NaN, Infinity or -Infinity. */
export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return value.toFixed(digits);
}

/** Integer formatting with thousands separators. */
export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return Math.round(value).toLocaleString('en-US');
}

/** Density in units of 1e19 m^-3, e.g. "10.00e19 m⁻³". */
export function formatDensity(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${(value / 1e19).toFixed(digits)}e19 m⁻³`;
}

/** Compact scientific notation for vacuum pressure. */
export function formatScientific(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return 'N/A';
  return value.toExponential(digits);
}

/** Energy gain factors. Undefined gain (division by zero) renders as N/A. */
export function formatQ(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return value.toFixed(digits);
}

/** Signed value with explicit plus sign. */
export function formatSigned(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}`;
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(digits)} %`;
}

/** Wall-clock style duration: 00:03:24. */
export function formatClock(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds)) return '--:--:--';
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');
}

/** Simulated-clock label, e.g. "T+ 00:03:24.5". */
export function formatSimClock(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds)) return 'T+ --:--.--';
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `T+ ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${seconds
    .toFixed(1)
    .padStart(4, '0')}`;
}

/** Local wall-clock timestamp used for event rows. */
export function formatTimestamp(wallMs: number): string {
  if (!Number.isFinite(wallMs)) return '--:--:--';
  const d = new Date(wallMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatDateTime(wallMs: number): string {
  if (!Number.isFinite(wallMs)) return '—';
  const d = new Date(wallMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

/* ------------------------- conversions ------------------------- */

export const cm3ToM3 = (value: number): number => value * 1e-6;
export const m3ToCm3 = (value: number): number => value * 1e6;
export const mwToW = (value: number): number => value * 1e6;
export const wToMW = (value: number): number => value * 1e-6;
export const mjToGj = (value: number): number => value * 1e-3;
export const celsiusToKelvin = (value: number): number => value + 273.15;
export const kelvinToCelsius = (value: number): number => value - 273.15;
export const densityDisplay = (m3Value: number): number => m3Value / 1e19;

/** Format bytes for the storage usage read-out. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

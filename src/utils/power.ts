/** Percentage helpers used by the power and performance views. */

export function pctShare(part: number, whole: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 'N/A';
  const ratio = (part / whole) * 100;
  if (!Number.isFinite(ratio)) return 'N/A';
  return `${ratio.toFixed(0)} %`;
}

export function deviationPct(measured: number | null, simulated: number): string {
  if (measured === null || !Number.isFinite(measured) || !Number.isFinite(simulated)) return 'N/A';
  if (Math.abs(simulated) < 1e-12) return 'N/A';
  const deviation = ((measured - simulated) / simulated) * 100;
  return `${deviation > 0 ? '+' : ''}${deviation.toFixed(1)} %`;
}

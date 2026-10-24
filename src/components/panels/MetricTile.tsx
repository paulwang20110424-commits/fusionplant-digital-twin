import { useMemo } from 'react';
import { historyBuffer, useSimulationStore } from '@/store/simulationStore';
import type { HistoryChannel } from '@/types/simulation';
import { Sparkline } from '@/components/charts/TrendChart';
import { computeTrendDelta, formatTrendDelta, trendDirection } from '@/utils/trend';

export interface MetricTileProps {
  label: string;
  value: string;
  unit: string;
  channel?: HistoryChannel;
  color?: string;
  status?: 'ok' | 'warn' | 'crit' | 'idle';
  hint?: string;
  showTrend?: boolean;
  /**
   * Multiplier applied to the raw channel value before the trend delta is
   * computed. Use it whenever `value` is displayed in a scaled unit.
   *
   *   density   raw m⁻³      → valueScale 1e-19, unit ×10¹⁹ m⁻³
   *   stability raw 0..1     → valueScale 100,   unit %
   *   power     raw MW       → valueScale 1,     unit MW
   */
  valueScale?: number;
  /** Decimal places for the trend delta, in display units (default 2). */
  trendDigits?: number;
  /** Unit suffix for the trend delta, e.g. "%" or "×10¹⁹". */
  trendUnit?: string;
  /** Fully custom trend formatter (takes precedence over trendDigits/trendUnit). */
  trendFormatter?: (delta: number) => string;
}

const STATUS_TEXT = {
  ok: 'text-emerald-200',
  warn: 'text-amber-300',
  crit: 'text-red-300',
  idle: 'text-ink',
} as const;

const STATUS_BORDER = {
  ok: 'border-edge/70',
  warn: 'border-amber-500/40',
  crit: 'border-red-500/45',
  idle: 'border-edge/70',
} as const;

const TREND_COLOR = {
  up: 'text-emerald-400/80',
  down: 'text-rose-400/80',
  flat: 'text-faint',
  invalid: 'text-faint',
} as const;

/** Accessibility label for the trend, e.g. "+0.14 ×10¹⁹ in the last 10 s". */
function trendAriaLabel(delta: number | null, text: string, unit?: string): string {
  if (delta === null) return 'trend unavailable';
  const direction = trendDirection(delta);
  const phrase = direction === 'flat' ? 'unchanged' : direction === 'up' ? 'rising' : 'falling';
  return `trend ${phrase} ${text}${unit ? '' : ''} over the last 10 seconds`;
}

export function MetricTile({
  label,
  value,
  unit,
  channel,
  color = '#22d3ee',
  status = 'idle',
  hint,
  showTrend = true,
  valueScale = 1,
  trendDigits = 2,
  trendUnit,
  trendFormatter,
}: MetricTileProps) {
  const epoch = useSimulationStore((state) => state.chartEpoch);

  const delta = useMemo(() => {
    if (!channel || !showTrend) return null;
    // `epoch` invalidates the memo on every chart tick.
    void epoch;
    const samples = historyBuffer.window(30);
    if (samples.length < 4) return null;
    const latest = samples[samples.length - 1][channel];
    const reference = samples[Math.max(0, samples.length - 20)][channel];
    return computeTrendDelta(latest, reference, valueScale);
  }, [epoch, channel, showTrend, valueScale]);

  const trendText = formatTrendDelta(delta, {
    digits: trendDigits,
    unit: trendUnit,
    formatter: trendFormatter,
  });
  const direction = trendDirection(delta);

  return (
    <div
      className={`relative overflow-hidden rounded-sm border bg-[#061120]/70 px-2 py-1.5 transition-colors ${STATUS_BORDER[status]}`}
      title={hint}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="label truncate" title={label}>
          {label}
        </span>
        {delta !== null && (
          <span
            className={`num shrink-0 text-[8.5px] ${TREND_COLOR[direction]}`}
            aria-label={trendAriaLabel(delta, trendText, trendUnit)}
            title={`Change over ~10 s: ${trendText}`}
          >
            {trendText}
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`metric-value text-[17px] ${STATUS_TEXT[status]}`}>{value}</span>
        <span className="metric-unit">{unit}</span>
      </div>
      {channel && showTrend && <Sparkline channel={channel} color={color} height={18} />}
    </div>
  );
}

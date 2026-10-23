import { useMemo } from 'react';
import { historyBuffer, useSimulationStore } from '@/store/simulationStore';
import type { HistoryChannel } from '@/types/simulation';
import { Sparkline } from '@/components/charts/TrendChart';
import { formatSigned } from '@/utils/units';

interface MetricTileProps {
  label: string;
  value: string;
  unit: string;
  channel?: HistoryChannel;
  color?: string;
  status?: 'ok' | 'warn' | 'crit' | 'idle';
  hint?: string;
  trendDigits?: number;
  showTrend?: boolean;
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

export function MetricTile({
  label,
  value,
  unit,
  channel,
  color = '#22d3ee',
  status = 'idle',
  hint,
  trendDigits = 1,
  showTrend = true,
}: MetricTileProps) {
  const epoch = useSimulationStore((state) => state.chartEpoch);

  const delta = useMemo(() => {
    if (!channel || !showTrend) return null;
    const samples = historyBuffer.window(30);
    if (samples.length < 4) return null;
    const latest = samples[samples.length - 1][channel];
    const reference = samples[Math.max(0, samples.length - 20)][channel];
    if (typeof latest !== 'number' || typeof reference !== 'number') return null;
    if (!Number.isFinite(latest) || !Number.isFinite(reference)) return null;
    return latest - reference;
  }, [epoch, channel, showTrend]);

  return (
    <div
      className={`relative overflow-hidden rounded-sm border bg-[#061120]/70 px-2 py-1.5 transition-colors ${STATUS_BORDER[status]}`}
      title={hint}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="label truncate">{label}</span>
        {delta !== null && (
          <span
            className={`num text-[8.5px] ${
              Math.abs(delta) < 1e-9 ? 'text-faint' : delta > 0 ? 'text-emerald-400/80' : 'text-rose-400/80'
            }`}
          >
            {formatSigned(delta, trendDigits)}
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

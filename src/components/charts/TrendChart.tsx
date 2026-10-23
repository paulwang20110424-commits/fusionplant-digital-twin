import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { useSimulationStore, historyBuffer } from '@/store/simulationStore';
import type { HistoryChannel } from '@/types/simulation';
import { EChart } from './EChart';
import {
  CHART_LABEL,
  NO_ANIMATION,
  axisStyle,
  fmtWithUnit,
  gridStyle,
  legendStyle,
  timeAxis,
  tooltipStyle,
  zoomStyle,
} from './chartTheme';

export interface TrendSeries {
  key: HistoryChannel;
  name: string;
  color: string;
  unit: string;
  digits?: number;
  axis?: 'left' | 'right';
  area?: boolean;
  dashed?: boolean;
  /** Multiplier applied for display (e.g. 1e-19 to show density in 1e19 units). */
  scale?: number;
}

export interface ThresholdLine {
  value: number;
  label: string;
  color: string;
  axis?: 'left' | 'right';
  digits?: number;
}

interface TrendChartProps {
  series: TrendSeries[];
  height?: number | string;
  leftUnit?: string;
  rightUnit?: string;
  showLegend?: boolean;
  showZoom?: boolean;
  thresholds?: ThresholdLine[];
  className?: string;
  windowOverride?: number;
}

interface TooltipParam {
  value: [number, number];
  seriesName: string;
  color: string;
  dataIndex: number;
}

/**
 * Live trend chart bound to the shared history buffer.
 * Re-renders only on the throttled chart tick (CHART_HZ), never per animation frame.
 */
export function TrendChart({
  series,
  height = '100%',
  leftUnit,
  rightUnit,
  showLegend = series.length > 1,
  showZoom = true,
  thresholds = [],
  className = '',
  windowOverride,
}: TrendChartProps) {
  const epoch = useSimulationStore((state) => state.chartEpoch);
  const windowSec = useSimulationStore((state) => state.chartWindowSec);
  const effectiveWindow = windowOverride ?? windowSec;

  const samples = useMemo(() => historyBuffer.window(effectiveWindow), [epoch, effectiveWindow]);

  const option = useMemo<EChartsOption>(() => {
    const hasRight = series.some((item) => item.axis === 'right');
    const end = samples.length ? samples[samples.length - 1].t : 0;
    const start = Math.max(0, end - effectiveWindow);

    const tooltip: EChartsOption['tooltip'] = {
      ...(tooltipStyle() as object),
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as TooltipParam[];
        if (!params.length) return '';
        const t = params[0].value?.[0] ?? 0;
        const rows = params
          .map((param) => {
            const config = series.find((item) => item.name === param.seriesName);
            const digits = config?.digits ?? 2;
            const unit = config?.unit ?? '';
            const value = param.value?.[1];
            return `<div style="display:flex;justify-content:space-between;gap:14px;line-height:1.5">
              <span style="color:${param.color}">${param.seriesName}</span>
              <span style="color:#e6f6ff">${fmtWithUnit(value as number, unit, digits)}</span>
            </div>`;
          })
          .join('');
        return `<div style="color:#8aa6be;font-size:9px;letter-spacing:.08em;margin-bottom:3px">T+ ${Number(t).toFixed(1)} s</div>${rows}`;
      },
    } as EChartsOption['tooltip'];

    const yAxes = [axisStyle(leftUnit), axisStyle(rightUnit)].slice(0, hasRight ? 2 : 1) as EChartsOption['yAxis'];

    return {
      ...NO_ANIMATION,
      backgroundColor: 'transparent',
      grid: gridStyle({ left: leftUnit ? 54 : 46, right: hasRight ? 52 : 16 }, showZoom),
      tooltip,
      legend: legendStyle(showLegend),
      xAxis: { ...(timeAxis() as object), min: start, max: end || 1 } as EChartsOption['xAxis'],
      yAxis: yAxes,
      dataZoom: zoomStyle(showZoom),
      series: series.map((item) => {
        const axisIndex = item.axis === 'right' ? 1 : 0;
        const scale = item.scale ?? 1;
        const data = samples.map((sample) => {
          const raw = sample[item.key];
          const value = typeof raw === 'number' && Number.isFinite(raw) ? raw * scale : null;
          return [sample.t, value];
        });

        const markLines =
          axisIndex === 0
            ? thresholds
                .filter((threshold) => (threshold.axis ?? 'left') === 'left')
                .map((threshold) => ({
                  yAxis: threshold.value,
                  label: {
                    formatter: threshold.label,
                    position: 'insideEndTop' as const,
                    color: threshold.color,
                    fontSize: 8,
                    fontFamily: 'monospace',
                  },
                  lineStyle: { color: threshold.color, type: 'dashed' as const, width: 1, opacity: 0.6 },
                }))
            : [];

        return {
          id: item.key,
          name: item.name,
          type: 'line' as const,
          yAxisIndex: axisIndex,
          data,
          showSymbol: false,
          symbol: 'circle',
          symbolSize: 3,
          smooth: 0.2,
          lineStyle: {
            width: 1.4,
            color: item.color,
            type: (item.dashed ? 'dashed' : 'solid') as 'dashed' | 'solid',
          },
          itemStyle: { color: item.color },
          areaStyle: item.area
            ? {
                opacity: 0.9,
                color: {
                  type: 'linear',
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: `${item.color}38` },
                    { offset: 1, color: `${item.color}00` },
                  ],
                },
              }
            : undefined,
          markLine: markLines.length ? { silent: true, symbol: 'none', data: markLines } : undefined,
          emphasis: { disabled: true },
          connectNulls: false,
          sampling: 'lttb' as const,
        };
      }),
    } as EChartsOption;
  }, [samples, series, leftUnit, rightUnit, showLegend, showZoom, thresholds, effectiveWindow]);

  return (
    <div className={`relative ${className}`} style={{ height }}>
      <EChart option={option} />
      {samples.length < 2 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="label animate-pulse text-faint">AWAITING TELEMETRY — PRESS START</span>
        </div>
      )}
      <span className="pointer-events-none absolute bottom-1 right-2 text-[8px] tracking-wider text-faint">
        {CHART_LABEL && `${samples.length} pts · ${effectiveWindow}s window`}
      </span>
    </div>
  );
}

/** Pure-SVG sparkline for dense KPI tiles (no ECharts instance per tile). */
export function Sparkline({
  channel,
  color = '#22d3ee',
  height = 26,
  samples = 90,
}: {
  channel: HistoryChannel;
  color?: string;
  height?: number;
  samples?: number;
}) {
  const epoch = useSimulationStore((state) => state.chartEpoch);
  const points = useMemo(() => {
    const window = historyBuffer.window(30);
    const values = window
      .map((sample) => sample[channel])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (values.length < 2) return '';
    const slice = values.slice(-samples);
    const min = Math.min(...slice);
    const max = Math.max(...slice);
    const span = max - min || Math.abs(max) || 1;
    const step = 100 / (slice.length - 1);
    return slice
      .map((value, index) => {
        const x = index * step;
        const y = 22 - ((value - min) / span) * 20;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [epoch, channel, samples]);

  if (!points) {
    return <div style={{ height }} className="w-full rounded-sm bg-white/[0.015]" />;
  }

  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" style={{ height }} className="w-full">
      <path d={points} fill="none" stroke={color} strokeWidth="1.1" vectorEffect="non-scaling-stroke" opacity={0.9} />
    </svg>
  );
}

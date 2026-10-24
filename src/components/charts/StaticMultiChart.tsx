import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { EChart } from './EChart';
import {
  NO_ANIMATION,
  axisStyle,
  fmtWithUnit,
  gridStyle,
  legendStyle,
  timeAxis,
  tooltipStyle,
  zoomStyle,
} from './chartTheme';

export interface StaticSeries {
  name: string;
  color: string;
  data: Array<[number, number | null]>;
  unit: string;
  digits?: number;
  axis?: 'left' | 'right';
  dashed?: boolean;
  area?: boolean;
}

/**
 * Non-live chart for headless results and recorded-history playback.
 * Accepts explicit series so it never touches the live engine or buffer.
 */
export function StaticMultiChart({
  series,
  leftUnit,
  rightUnit,
  height = '100%',
  showLegend = true,
  showZoom = true,
  cursor,
  cursorLabel,
  className = '',
}: {
  series: StaticSeries[];
  leftUnit: string;
  rightUnit?: string;
  height?: number | string;
  showLegend?: boolean;
  showZoom?: boolean;
  /** Optional vertical cursor (simulated seconds). */
  cursor?: number | null;
  cursorLabel?: string;
  className?: string;
}) {
  const option = useMemo<EChartsOption>(() => {
    const hasRight = series.some((item) => item.axis === 'right');
    const allPoints = series.flatMap((item) => item.data.map((point) => point[0]));
    const start = allPoints.length ? Math.min(...allPoints) : 0;
    const end = allPoints.length ? Math.max(...allPoints) : 1;

    const annotations =
      cursor !== undefined && cursor !== null
        ? [
            {
              xAxis: cursor,
              label: {
                formatter: cursorLabel ?? `T+${cursor.toFixed(0)}s`,
                position: 'insideEndTop' as const,
                color: '#22d3ee',
                fontSize: 8,
                fontFamily: 'monospace',
              },
              lineStyle: { color: '#22d3ee', type: 'solid' as const, width: 1, opacity: 0.85 },
            },
          ]
        : [];

    return {
      ...NO_ANIMATION,
      backgroundColor: 'transparent',
      grid: gridStyle({ left: 52, right: hasRight ? 52 : 18, top: 20 }, showZoom),
      tooltip: {
        ...(tooltipStyle() as object),
        formatter: (raw: unknown) => {
          const params = (Array.isArray(raw) ? raw : [raw]) as Array<{
            value: [number, number];
            seriesName: string;
            color: string;
          }>;
          if (!params.length) return '';
          const t = params[0].value?.[0] ?? 0;
          const rows = params
            .map((param) => {
              const config = series.find((item) => item.name === param.seriesName);
              return `<div style="display:flex;justify-content:space-between;gap:14px">
                <span style="color:${param.color}">${param.seriesName}</span>
                <span style="color:#e6f6ff">${fmtWithUnit(param.value[1], config?.unit ?? '', config?.digits ?? 2)}</span>
              </div>`;
            })
            .join('');
          return `<div style="color:#8aa6be;font-size:9px;margin-bottom:3px">T+ ${Number(t).toFixed(1)} s</div>${rows}`;
        },
      } as EChartsOption['tooltip'],
      legend: legendStyle(showLegend),
      xAxis: { ...(timeAxis() as object), min: start, max: end || 1 } as EChartsOption['xAxis'],
      yAxis: [axisStyle(leftUnit), axisStyle(rightUnit)].slice(0, hasRight ? 2 : 1) as EChartsOption['yAxis'],
      dataZoom: zoomStyle(showZoom),
      series: series.map((item, index) => ({
        id: `${item.name}-${index}`,
        name: item.name,
        type: 'line' as const,
        yAxisIndex: item.axis === 'right' ? 1 : 0,
        data: item.data,
        showSymbol: false,
        smooth: 0.2,
        connectNulls: false,
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
                type: 'linear' as const,
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: `${item.color}33` },
                  { offset: 1, color: `${item.color}00` },
                ],
              },
            }
          : undefined,
        markLine:
          index === 0 && annotations.length ? { silent: true, symbol: 'none', data: annotations } : undefined,
        emphasis: { disabled: true },
      })),
    } as EChartsOption;
  }, [series, leftUnit, rightUnit, showLegend, showZoom, cursor, cursorLabel]);

  return (
    <div className={`relative ${className}`} style={{ height }}>
      <EChart option={option} />
    </div>
  );
}

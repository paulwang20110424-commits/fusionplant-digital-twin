import type { EChartsOption } from 'echarts';

export const CHART_COLORS = {
  temperature: '#22d3ee',
  density: '#7dd3fc',
  fusion: '#d946ef',
  heating: '#f59e0b',
  alpha: '#c084fc',
  qPlasma: '#a78bfa',
  qEngineering: '#fb923c',
  field: '#38bdf8',
  poloidal: '#818cf8',
  coilCurrent: '#6366f1',
  coilTemp: '#fb7185',
  coolantIn: '#22d3ee',
  coolantOut: '#f97316',
  thermal: '#f59e0b',
  electric: '#34d399',
  auxiliary: '#ef4444',
  net: '#facc15',
  stability: '#a3e635',
  betaN: '#f472b6',
  greenwald: '#fbbf24',
  pressure: '#2dd4bf',
} as const;

export const CHART_GRID = '#0f2237';
export const CHART_AXIS = '#1b3a54';
export const CHART_LABEL = '#6d89a6';

export function axisStyle(name?: string, nameColor = '#46617a'): EChartsOption['yAxis'] {
  return {
    type: 'value',
    name,
    nameTextStyle: { color: nameColor, fontSize: 9, padding: [0, 0, 2, 0] },
    nameGap: 8,
    axisLine: { show: true, lineStyle: { color: CHART_AXIS } },
    axisTick: { show: false },
    axisLabel: { color: CHART_LABEL, fontSize: 9, margin: 4, fontFamily: 'monospace' },
    splitLine: { show: true, lineStyle: { color: CHART_GRID, type: 'dashed', opacity: 0.65 } },
  };
}

export function timeAxis(): EChartsOption['xAxis'] {
  return {
    type: 'value',
    min: 'dataMin',
    max: 'dataMax',
    axisLine: { show: true, lineStyle: { color: CHART_AXIS } },
    axisTick: { show: false },
    axisLabel: {
      color: CHART_LABEL,
      fontSize: 9,
      fontFamily: 'monospace',
      formatter: (value: number) => `${value.toFixed(0)}s`,
    },
    splitLine: { show: true, lineStyle: { color: CHART_GRID, type: 'dashed', opacity: 0.4 } },
  };
}

export function tooltipStyle(): EChartsOption['tooltip'] {
  return {
    trigger: 'axis',
    axisPointer: {
      type: 'cross',
      lineStyle: { color: '#22d3ee', opacity: 0.35, width: 1 },
      crossStyle: { color: '#22d3ee', opacity: 0.25 },
      label: { backgroundColor: '#0b2235', color: '#c9daea', fontSize: 9 },
    },
    backgroundColor: 'rgba(4, 12, 22, 0.95)',
    borderColor: '#1d3d5c',
    borderWidth: 1,
    padding: [6, 9],
    textStyle: { color: '#c9daea', fontSize: 10, fontFamily: 'monospace' },
    extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.55); border-radius: 2px;',
    confine: true,
  };
}

export function legendStyle(show: boolean): EChartsOption['legend'] {
  return {
    show,
    top: 0,
    right: 6,
    itemWidth: 10,
    itemHeight: 2,
    itemGap: 10,
    textStyle: { color: '#8aa6be', fontSize: 9, fontFamily: 'monospace' },
    icon: 'roundRect',
    selectedMode: true,
  };
}

export function zoomStyle(show: boolean): EChartsOption['dataZoom'] {
  if (!show) return [];
  return [
    { type: 'inside', xAxisIndex: 0, filterMode: 'none', throttle: 50 },
    {
      type: 'slider',
      xAxisIndex: 0,
      height: 10,
      bottom: 2,
      filterMode: 'none',
      borderColor: '#13263a',
      backgroundColor: 'rgba(8,18,32,0.5)',
      fillerColor: 'rgba(34,211,238,0.12)',
      handleStyle: { color: '#22d3ee', borderColor: '#22d3ee' },
      moveHandleStyle: { color: '#1d3d5c' },
      dataBackground: {
        lineStyle: { color: '#22d3ee', opacity: 0.4 },
        areaStyle: { color: 'rgba(34,211,238,0.1)' },
      },
      selectedDataBackground: {
        lineStyle: { color: '#22d3ee', opacity: 0.8 },
        areaStyle: { color: 'rgba(34,211,238,0.18)' },
      },
      textStyle: { color: '#46617a', fontSize: 8, fontFamily: 'monospace' },
      labelFormatter: (value: number) => `${Number(value).toFixed(0)}s`,
    },
  ];
}

export interface GridLayout {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

export function gridStyle(layout: GridLayout = {}, showZoom = false): EChartsOption['grid'] {
  return {
    left: layout.left ?? 46,
    right: layout.right ?? 16,
    top: layout.top ?? 22,
    bottom: layout.bottom ?? (showZoom ? 26 : 20),
    containLabel: false,
  };
}

/** Format a value with its unit for tooltips and point labels. */
export function fmtWithUnit(value: number | null | undefined, unit: string, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(digits)} ${unit}`;
}

/** Shared animation settings: disabled for live data so charts never "catch up". */
export const NO_ANIMATION = {
  animation: false,
  animationDuration: 0,
  animationDurationUpdate: 0,
} as const;

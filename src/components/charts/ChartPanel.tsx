import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { historyBuffer, useSimulationStore } from '@/store/simulationStore';
import { EChart } from './EChart';
import {
  CHART_COLORS,
  NO_ANIMATION,
  axisStyle,
  gridStyle,
  legendStyle,
  timeAxis,
  tooltipStyle,
} from './chartTheme';
import { Panel } from '@/components/ui/Panel';
import { TrendChart } from './TrendChart';
import { ChartExportButton } from './ChartToolbar';
import type { ChartConfig } from './chartConfigs';

interface ChartPanelProps {
  config: ChartConfig;
  className?: string;
  height?: number | string;
  showZoom?: boolean;
}

/** Panel-wrapped live trend chart with its own export action. */
export function ChartPanel({ config, className = '', height = '100%', showZoom = true }: ChartPanelProps) {
  return (
    <Panel
      title={config.title}
      subtitle={config.subtitle}
      className={className}
      scroll={false}
      bodyClassName="!p-1"
      right={<ChartExportButton />}
    >
      <TrendChart
        series={config.series}
        leftUnit={config.leftUnit}
        rightUnit={config.rightUnit}
        thresholds={config.thresholds}
        height={height}
        showZoom={showZoom}
      />
    </Panel>
  );
}

/**
 * Correlation scatter between two simulated channels with a least-squares trend
 * line and Pearson coefficient. Purely descriptive: it shows what the model
 * produced, it does not imply a physical causal law.
 */
export function CorrelationScatter({ className = '' }: { className?: string }) {
  const epoch = useSimulationStore((state) => state.chartEpoch);
  const windowSec = useSimulationStore((state) => state.chartWindowSec);
  const samples = useMemo(() => {
    // `epoch` changes on every chart tick; touching it forces a fresh window.
    void epoch;
    return historyBuffer.window(windowSec);
  }, [epoch, windowSec]);

  const { option, correlation, count } = useMemo(() => {
    const points = samples
      .filter((sample) => Number.isFinite(sample.temperature) && Number.isFinite(sample.fusionPower))
      .map(
        (sample) => [sample.temperature, sample.fusionPower, sample.stability] as [number, number, number],
      );

    if (points.length < 3) {
      return {
        option: {
          ...NO_ANIMATION,
          xAxis: axisStyle('keV'),
          yAxis: axisStyle('MW'),
          series: [],
        } as EChartsOption,
        correlation: null,
        count: points.length,
      };
    }

    const n = points.length;
    const meanX = points.reduce((acc, point) => acc + point[0], 0) / n;
    const meanY = points.reduce((acc, point) => acc + point[1], 0) / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (const [x, y] of points) {
      sxy += (x - meanX) * (y - meanY);
      sxx += (x - meanX) ** 2;
      syy += (y - meanY) ** 2;
    }
    const slope = sxx === 0 ? 0 : sxy / sxx;
    const intercept = meanY - slope * meanX;
    const r = sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
    const minX = Math.min(...points.map((point) => point[0]));
    const maxX = Math.max(...points.map((point) => point[0]));

    const chartOption: EChartsOption = {
      ...NO_ANIMATION,
      backgroundColor: 'transparent',
      grid: gridStyle({ left: 52, right: 14, top: 26, bottom: 22 }),
      tooltip: {
        ...(tooltipStyle() as object),
        trigger: 'item',
        formatter: (raw: unknown) => {
          const param = raw as { value: [number, number, number] };
          return `<div style="font-size:9px;color:#8aa6be">CORRELATION SAMPLE</div>
            <div style="font-size:10px">T = ${param.value[0].toFixed(2)} keV</div>
            <div style="font-size:10px">P_fus = ${param.value[1].toFixed(1)} MW</div>
            <div style="font-size:10px">stability = ${param.value[2].toFixed(3)}</div>`;
        },
      } as EChartsOption['tooltip'],
      legend: legendStyle(true),
      xAxis: axisStyle('Plasma temperature (keV)') as EChartsOption['xAxis'],
      yAxis: axisStyle('Fusion power (MW)') as EChartsOption['yAxis'],
      series: [
        {
          id: 'scatter',
          name: 'Samples',
          type: 'scatter',
          data: points.map(([x, y, stability]) => ({
            value: [x, y, stability],
            itemStyle: {
              color:
                stability > 0.8
                  ? CHART_COLORS.temperature
                  : stability > 0.6
                    ? CHART_COLORS.heating
                    : CHART_COLORS.auxiliary,
              opacity: 0.65,
            },
          })),
          symbolSize: 4,
          emphasis: { scale: 1.6 },
        },
        {
          id: 'fit',
          name: 'Least-squares fit',
          type: 'line',
          data: [
            [minX, slope * minX + intercept],
            [maxX, slope * maxX + intercept],
          ],
          showSymbol: false,
          lineStyle: { color: '#a78bfa', width: 1, type: 'dashed' },
          itemStyle: { color: '#a78bfa' },
          tooltip: { show: false },
        },
      ],
    };

    return { option: chartOption, correlation: r, count: n };
  }, [samples]);

  return (
    <Panel
      title="Correlation — Temperature vs Fusion Power"
      subtitle="descriptive scatter of simulated samples"
      className={className}
      scroll={false}
      bodyClassName="!p-1"
      right={
        <span className="num text-[9px] text-muted">
          r = {correlation === null ? 'N/A' : correlation.toFixed(3)} · n={count}
        </span>
      }
    >
      <div className="relative h-full">
        <EChart option={option} />
        <div className="pointer-events-none absolute bottom-1 left-2 flex gap-2 text-[8px] text-faint">
          <span>● stability &gt; 0.8</span>
          <span className="text-amber-400/80">● 0.6–0.8</span>
          <span className="text-red-400/80">● &lt; 0.6</span>
        </div>
      </div>
    </Panel>
  );
}

/** Small inline dual-metric chart used on subsystem pages. */
export function CompactTrend({
  series,
  leftUnit,
  rightUnit,
  height = 140,
}: {
  series: ChartConfig['series'];
  leftUnit: string;
  rightUnit?: string;
  height?: number;
}) {
  return (
    <TrendChart series={series} leftUnit={leftUnit} rightUnit={rightUnit} height={height} showZoom={false} />
  );
}

export { timeAxis };

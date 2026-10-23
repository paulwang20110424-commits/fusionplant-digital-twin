import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

interface EChartProps {
  option: EChartsOption;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Thin ECharts wrapper.
 *  - initialises once per mount and disposes on unmount (no leaked instances)
 *  - resizes with its container via ResizeObserver
 *  - updates in place (series merged by id) so dataZoom / legend state survives
 */
export function EChart({ option, className = '', style }: EChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const chart = echarts.init(element, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    const observer = new ResizeObserver(() => {
      // Guard against zero-size containers during layout transitions.
      if (element.clientWidth > 0 && element.clientHeight > 0) chart.resize();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(option, { replaceMerge: ['series'], lazyUpdate: true });
  }, [option]);

  return <div ref={containerRef} className={`h-full w-full ${className}`} style={style} />;
}

import { CHART_COLORS } from './chartTheme';
import type { TrendSeries } from './TrendChart';
import type { ThresholdLine } from './TrendChart';

export interface ChartConfig {
  id: string;
  title: string;
  subtitle: string;
  series: TrendSeries[];
  leftUnit: string;
  rightUnit?: string;
  thresholds?: ThresholdLine[];
}

const densitySeries: TrendSeries = {
  key: 'density',
  name: 'Electron density',
  color: CHART_COLORS.density,
  unit: '×10¹⁹ m⁻³',
  digits: 2,
  axis: 'right',
  scale: 1e-19,
};

export const CHART_CONFIGS: Record<string, ChartConfig> = {
  temperature: {
    id: 'temperature',
    title: 'Plasma Temperature & Density',
    subtitle: 'core energy balance output',
    leftUnit: 'keV',
    rightUnit: '×10¹⁹ m⁻³',
    series: [
      {
        key: 'temperature',
        name: 'Temperature',
        color: CHART_COLORS.temperature,
        unit: 'keV',
        digits: 2,
        axis: 'left',
        area: true,
      },
      densitySeries,
    ],
    thresholds: [{ value: 24, label: '24 keV warn', color: '#f59e0b', axis: 'left' }],
  },
  fusion: {
    id: 'fusion',
    title: 'Fusion Power & Auxiliary Heating',
    subtitle: 'P_fus vs delivered auxiliary power',
    leftUnit: 'MW',
    series: [
      { key: 'fusionPower', name: 'Fusion power', color: CHART_COLORS.fusion, unit: 'MW', digits: 1, area: true },
      { key: 'heatingPower', name: 'Aux heating (delivered)', color: CHART_COLORS.heating, unit: 'MW', digits: 1 },
      { key: 'alphaPower', name: 'Alpha self-heating', color: CHART_COLORS.alpha, unit: 'MW', digits: 1, dashed: true },
    ],
  },
  q: {
    id: 'q',
    title: 'Energy Gain Factors',
    subtitle: 'Q_plasma vs Q_engineering (site boundary)',
    leftUnit: '—',
    series: [
      { key: 'qPlasma', name: 'Q_plasma', color: CHART_COLORS.qPlasma, unit: '—', digits: 2, area: true },
      { key: 'qEngineering', name: 'Q_engineering', color: CHART_COLORS.qEngineering, unit: '—', digits: 2 },
    ],
    thresholds: [{ value: 1, label: 'break-even 1.0', color: '#a3e635', axis: 'left', digits: 1 }],
  },
  field: {
    id: 'field',
    title: 'Toroidal Field & Coil Current',
    subtitle: 'magnetic confinement system',
    leftUnit: 'T',
    rightUnit: 'kA',
    series: [
      {
        key: 'toroidalField',
        name: 'Toroidal field',
        color: CHART_COLORS.field,
        unit: 'T',
        digits: 2,
        axis: 'left',
        area: true,
      },
      {
        key: 'poloidalField',
        name: 'Poloidal field',
        color: CHART_COLORS.poloidal,
        unit: 'T',
        digits: 2,
        axis: 'left',
        dashed: true,
      },
      { key: 'coilCurrent', name: 'Coil current', color: CHART_COLORS.coilCurrent, unit: 'kA', digits: 1, axis: 'right' },
    ],
  },
  cooling: {
    id: 'cooling',
    title: 'Coil Temperature & Coolant Loop',
    subtitle: 'cold mass vs primary loop temperatures',
    leftUnit: 'K',
    rightUnit: '°C',
    series: [
      { key: 'coilTemperature', name: 'Coil temperature', color: CHART_COLORS.coilTemp, unit: 'K', digits: 2, axis: 'left', area: true },
      { key: 'coolantOut', name: 'Coolant outlet', color: CHART_COLORS.coolantOut, unit: '°C', digits: 1, axis: 'right' },
      { key: 'coolantIn', name: 'Coolant inlet', color: CHART_COLORS.coolantIn, unit: '°C', digits: 1, axis: 'right', dashed: true },
    ],
    thresholds: [{ value: 22, label: '22 K coil warn', color: '#f59e0b', axis: 'left' }],
  },
  plantPower: {
    id: 'plantPower',
    title: 'Thermal, Electrical & House Load',
    subtitle: 'energy conversion chain',
    leftUnit: 'MW',
    series: [
      { key: 'thermalPower', name: 'Thermal output', color: CHART_COLORS.thermal, unit: 'MW', digits: 0 },
      { key: 'electricalOutput', name: 'Electrical output', color: CHART_COLORS.electric, unit: 'MW', digits: 0 },
      { key: 'plantAuxiliary', name: 'Plant auxiliary', color: CHART_COLORS.auxiliary, unit: 'MW', digits: 0 },
      { key: 'netElectric', name: 'Net electric', color: CHART_COLORS.net, unit: 'MW', digits: 0, dashed: true },
    ],
    thresholds: [{ value: 0, label: 'net zero', color: '#facc15', axis: 'left', digits: 1 }],
  },
  stability: {
    id: 'stability',
    title: 'Stability & Operating Limits',
    subtitle: 'composite index and limit utilisation',
    leftUnit: 'index',
    rightUnit: 'β_N / f_GW',
    series: [
      { key: 'stability', name: 'Stability index', color: CHART_COLORS.stability, unit: '—', digits: 3, axis: 'left', area: true },
      { key: 'betaN', name: 'β_N', color: CHART_COLORS.betaN, unit: '—', digits: 2, axis: 'right' },
      { key: 'greenwald', name: 'n / n_GW', color: CHART_COLORS.greenwald, unit: '—', digits: 2, axis: 'right', dashed: true },
    ],
    thresholds: [
      { value: 0.62, label: 'stability warn', color: '#f59e0b', axis: 'left' },
      { value: 0.4, label: 'critical', color: '#ef4444', axis: 'left' },
    ],
  },
  plasmaCurrent: {
    id: 'plasmaCurrent',
    title: 'Plasma Current & Stored Energy',
    subtitle: 'inductive drive response',
    leftUnit: 'MA',
    rightUnit: 'MJ',
    series: [
      { key: 'current', name: 'Plasma current', color: CHART_COLORS.field, unit: 'MA', digits: 2, axis: 'left', area: true },
      { key: 'storedEnergy', name: 'Stored energy', color: CHART_COLORS.fusion, unit: 'MJ', digits: 0, axis: 'right' },
    ],
  },
  heating: {
    id: 'heating',
    title: 'Heating Power & Q_plasma',
    subtitle: 'delivered auxiliary power versus gain',
    leftUnit: 'MW',
    rightUnit: '—',
    series: [
      { key: 'heatingPower', name: 'Delivered heating', color: CHART_COLORS.heating, unit: 'MW', digits: 1, axis: 'left', area: true },
      { key: 'qPlasma', name: 'Q_plasma', color: CHART_COLORS.qPlasma, unit: '—', digits: 2, axis: 'right' },
    ],
  },
  exchanger: {
    id: 'exchanger',
    title: 'Heat Exchanger Load & Coolant Flow',
    subtitle: 'heat rejection chain',
    leftUnit: '%',
    rightUnit: 'kg/s',
    series: [
      { key: 'heatExchangerLoad', name: 'Exchanger load', color: CHART_COLORS.coolantOut, unit: '%', digits: 1, axis: 'left', area: true },
      { key: 'coolantFlow', name: 'Coolant flow', color: CHART_COLORS.coolantIn, unit: 'kg/s', digits: 0, axis: 'right' },
    ],
    thresholds: [{ value: 92, label: '92% warn', color: '#f59e0b', axis: 'left' }],
  },
};

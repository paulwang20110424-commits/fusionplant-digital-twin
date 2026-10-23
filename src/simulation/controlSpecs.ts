import type { ControlInputs, SimConfig } from '@/types/simulation';

export interface ControlSpec {
  key: keyof ControlInputs;
  label: string;
  shortLabel: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  group: 'heating' | 'magnetic' | 'cooling' | 'plasma';
  description: string;
  /** Digits shown in read-outs. */
  precision: number;
}

export const CONTROL_SPECS: ControlSpec[] = [
  {
    key: 'nbiPowerMW',
    label: 'Neutral Beam Injection Power',
    shortLabel: 'NBI',
    unit: 'MW',
    min: 0,
    max: 50,
    step: 0.5,
    group: 'heating',
    description:
      'Commanded neutral beam power. Delivered power = setpoint x beamline transmission x coupling.',
    precision: 1,
  },
  {
    key: 'echPowerMW',
    label: 'Electron Cyclotron Heating Power',
    shortLabel: 'ECH',
    unit: 'MW',
    min: 0,
    max: 30,
    step: 0.5,
    group: 'heating',
    description: 'Gyrotron heating command, used for core electron heating and MHD control.',
    precision: 1,
  },
  {
    key: 'ichPowerMW',
    label: 'Ion Cyclotron Heating Power',
    shortLabel: 'ICH',
    unit: 'MW',
    min: 0,
    max: 30,
    step: 0.5,
    group: 'heating',
    description: 'RF ion heating command, coupled mainly to the thermal ion population.',
    precision: 1,
  },
  {
    key: 'coilCurrentSetpointKA',
    label: 'Toroidal Field Coil Current',
    shortLabel: 'TF Coil',
    unit: 'kA',
    min: 20,
    max: 80,
    step: 0.5,
    group: 'magnetic',
    description:
      'Total toroidal field coil current. B_tor = mu0 * N_turns * I / (2 pi R0). Coils slew with 1.4 s lag.',
    precision: 1,
  },
  {
    key: 'plasmaCurrentTargetMA',
    label: 'Plasma Current Request',
    shortLabel: 'Ip',
    unit: 'MA',
    min: 4,
    max: 17.5,
    step: 0.1,
    group: 'magnetic',
    description:
      'Requested plasma current. Sets poloidal field, confinement scaling and the Greenwald density limit.',
    precision: 2,
  },
  {
    key: 'targetDensity19',
    label: 'Gas Fuelling Density Request',
    shortLabel: 'n_e target',
    unit: '1e19 m^-3',
    min: 2,
    max: 20,
    step: 0.1,
    group: 'plasma',
    description:
      'Line-averaged electron density target. The density relaxes towards this value with a 4 s time constant.',
    precision: 2,
  },
  {
    key: 'coolantFlowKgS',
    label: 'Primary Coolant Flow',
    shortLabel: 'Flow',
    unit: 'kg/s',
    min: 3000,
    max: 16000,
    step: 100,
    group: 'cooling',
    description:
      'Primary loop mass flow. Temperature rise dT = Q / (m_dot * cp); pump power scales with flow^3.',
    precision: 0,
  },
  {
    key: 'coolantInletTargetC',
    label: 'Coolant Inlet Temperature Request',
    shortLabel: 'T_in',
    unit: 'degC',
    min: 180,
    max: 320,
    step: 1,
    group: 'cooling',
    description: 'Requested cold-leg temperature of the primary loop.',
    precision: 1,
  },
];

export const CONTROL_SPEC_MAP: Record<keyof ControlInputs, ControlSpec> = Object.fromEntries(
  CONTROL_SPECS.map((s) => [s.key, s]),
) as Record<keyof ControlInputs, ControlSpec>;

export const DEFAULT_CONTROLS: ControlInputs = {
  nbiPowerMW: 33,
  echPowerMW: 15,
  ichPowerMW: 12,
  coilCurrentSetpointKA: 68,
  plasmaCurrentTargetMA: 15,
  targetDensity19: 10,
  coolantFlowKgS: 12000,
  coolantInletTargetC: 240,
};

export const DEFAULT_CONFIG: SimConfig = {
  timeScale: 2,
  disturbanceLevel: 0.12,
  noiseLevel: 0.08,
  runDurationS: 180,
  confinementH: 1.2,
  auxHeatRecovery: 0.85,
  seed: 20260101,
};

/** Scenario presets for WHAT-IF analysis. All values are educational. */
export const SCENARIO_DEFINITIONS = [
  {
    id: 'BASELINE' as const,
    name: 'Baseline Scenario',
    tag: 'REF',
    description:
      'Reference flat-top operating point: 60 MW delivered auxiliary heating, 5.3 T field, 15 MA plasma current.',
    controls: { ...DEFAULT_CONTROLS },
    config: { disturbanceLevel: 0.12, noiseLevel: 0.08 },
    initial: {
      temperatureKeV: 1.2,
      densityM3: 0.4e19,
      coilTemperatureK: 4.8,
      coolantInletC: 240,
    },
    engineeringNotes:
      'Reference case used for every comparison. Should reproduce Q_plasma near 6 and a net-negative electrical balance, which is representative of a non-optimised pulsed plant model.',
  },
  {
    id: 'HIGH_HEATING' as const,
    name: 'High Heating',
    tag: 'AUX+',
    description:
      'Auxiliary heating pushed to 100 MW. Expect a temperature rise, higher fusion power, higher Q_plasma, but a larger recirculating electrical load.',
    controls: {
      ...DEFAULT_CONTROLS,
      nbiPowerMW: 50,
      echPowerMW: 30,
      ichPowerMW: 20,
    },
    config: { disturbanceLevel: 0.14, noiseLevel: 0.08 },
    initial: {
      temperatureKeV: 1.2,
      densityM3: 0.4e19,
      coilTemperatureK: 4.8,
      coolantInletC: 240,
    },
    engineeringNotes:
      'Demonstrates the trade-off between plasma gain and wall-plug power. Q_plasma rises while Q_engineering may fall.',
  },
  {
    id: 'COOLING_STRESS' as const,
    name: 'Cooling Stress Test',
    tag: 'THERM',
    description:
      'Coolant flow reduced to 3000 kg/s. The coolant outlet temperature and heat exchanger loading climb; a thermal trip is possible at high fusion power.',
    controls: {
      ...DEFAULT_CONTROLS,
      coolantFlowKgS: 3000,
      coolantInletTargetC: 262,
    },
    config: { disturbanceLevel: 0.1, noiseLevel: 0.08 },
    initial: {
      temperatureKeV: 1.2,
      densityM3: 0.4e19,
      coilTemperatureK: 4.8,
      coolantInletC: 262,
    },
    engineeringNotes:
      'Exercises the first-wall energy balance and the heat-rejection chain. Lower flow means a larger loop delta-T for the same thermal duty.',
  },
  {
    id: 'MAGNETIC_DISTURBANCE' as const,
    name: 'Magnetic Disturbance',
    tag: 'MHD',
    description:
      'Field setpoint detuned to 55 kA with elevated disturbance amplitude. Field quality and stability degrade, confinement is penalised.',
    controls: {
      ...DEFAULT_CONTROLS,
      coilCurrentSetpointKA: 55,
    },
    config: { disturbanceLevel: 0.55, noiseLevel: 0.14 },
    initial: {
      temperatureKeV: 1.2,
      densityM3: 0.4e19,
      coilTemperatureK: 4.8,
      coolantInletC: 240,
    },
    engineeringNotes:
      'Shows how a toroidal field error propagates into poloidal field balance, beta limits and the composite stability index.',
  },
  {
    id: 'CUSTOM' as const,
    name: 'Custom Scenario',
    tag: 'USER',
    description:
      'Free configuration. Edit any control in the SIMULATION LAB; this scenario tracks your current settings.',
    controls: { ...DEFAULT_CONTROLS, nbiPowerMW: 40 },
    config: {},
    initial: {
      temperatureKeV: 1.2,
      densityM3: 0.4e19,
      coilTemperatureK: 4.8,
      coolantInletC: 240,
    },
    engineeringNotes: 'User-defined scenario. Results are only as meaningful as the inputs.',
  },
];

export const INITIAL_CONDITIONS_DEFAULT = {
  temperatureKeV: 1.2,
  densityM3: 0.4e19,
  coilTemperatureK: 4.8,
  coolantInletC: 240,
};

/**
 * FusionPlant Digital Twin — shared domain types.
 *
 * IMPORTANT: every numeric value produced by this project comes from a local,
 * simplified educational simulation. Nothing here is measured, commanded or
 * validated against a real fusion device.
 */

/** Transport / run state of the simulation itself. */
export type SimStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'EMERGENCY_STOP';

/** Operational phase of the (virtual) plant. */
export type PlantPhase = 'STANDBY' | 'RAMP_UP' | 'FLAT_TOP' | 'RAMP_DOWN' | 'SCRAM';

/** Generic state machine used by balance-of-plant equipment models. */
export type EquipmentStatus =
  | 'OFFLINE'
  | 'STANDBY'
  | 'RUNNING'
  | 'DEGRADED'
  | 'FAULT'
  | 'TRIPPED';

export type AlarmLevel = 'INFO' | 'WARNING' | 'CRITICAL';

export type SensorStatus = 'OK' | 'LOST' | 'DEGRADED' | 'LAGGED';

/* ------------------------------------------------------------------ */
/* Operator / simulation inputs                                        */
/* ------------------------------------------------------------------ */

/** Everything an operator can command in the simulation. */
export interface ControlInputs {
  /** Neutral beam injection electrical setpoint (delivered power target), MW. */
  nbiPowerMW: number;
  /** Electron cyclotron resonance heating setpoint, MW. */
  echPowerMW: number;
  /** Ion cyclotron resonance heating setpoint, MW. */
  ichPowerMW: number;
  /** Toroidal field coil current setpoint, kA. */
  coilCurrentSetpointKA: number;
  /** Plasma current request, MA. */
  plasmaCurrentTargetMA: number;
  /** Gas-fuelling density request, in units of 1e19 m^-3. */
  targetDensity19: number;
  /** Primary coolant mass flow, kg/s. */
  coolantFlowKgS: number;
  /** Coolant inlet temperature request, degC. */
  coolantInletTargetC: number;
}

/** Simulation-engine knobs (SIMULATION LAB). */
export interface SimConfig {
  /** Simulated seconds per wall-clock second. */
  timeScale: number;
  /** Amplitude of slow plasma perturbations (0..1). */
  disturbanceLevel: number;
  /** Amplitude of fast measurement noise (0..1). */
  noiseLevel: number;
  /** Nominal experiment duration, simulated seconds. */
  runDurationS: number;
  /** Confinement H-factor (H98y2) used by the confinement scaling. */
  confinementH: number;
  /** Fraction of plant electricity recovered as heat (0..1). */
  auxHeatRecovery: number;
  /** Deterministic PRNG seed for reproducible experiments. */
  seed: number;
}

/* ------------------------------------------------------------------ */
/* Plant state snapshot                                                */
/* ------------------------------------------------------------------ */

export interface PlasmaState {
  /** Ion/electron temperature, keV. */
  temperatureKeV: number;
  /** Line-averaged electron density, m^-3. */
  electronDensity: number;
  /** Plasma current, MA. */
  currentMA: number;
  /** Plasma pressure (n*k*T summed over species), kPa. */
  pressureKPa: number;
  /** Energy confinement time, s. */
  confinementTimeS: number;
  /** Plasma volume, m3. */
  volumeM3: number;
  /** Elongation (kappa). */
  elongation: number;
  /** Triangularity (delta). */
  triangularity: number;
  /** Stored thermal energy, MJ. */
  storedEnergyMJ: number;
  /** Internal stability index, 0..1 (1 = nominal). */
  stability: number;
  /** Fusion reactivity <sigma v>, m3/s. */
  reactivity: number;
  /** Alpha (self-heating) power, MW. */
  alphaPowerMW: number;
  /** Radiated (bremsstrahlung proxy) power, MW. */
  radiatedPowerMW: number;
}

export interface MagneticState {
  /** On-axis toroidal field, T. */
  toroidalFieldT: number;
  /** Poloidal field at the plasma edge, T. */
  poloidalFieldT: number;
  /** Total toroidal field coil current, kA. */
  coilCurrentKA: number;
  /** Commanded coil current, kA. */
  coilCurrentSetpointKA: number;
  /** Field control quality, 0..1. */
  fieldStability: number;
  /** Coil (cold-mass) temperature, K. */
  coilTemperatureK: number;
  /** Cryogenic system load, % of capacity. */
  cryoLoadPct: number;
  /** Normalised beta (Troyon), %*m*T/MA. */
  betaN: number;
  /** Greenwald density fraction, n/n_GW. */
  greenwaldFraction: number;
  /** Cylindrical safety factor q95 proxy. */
  q95: number;
}

export interface HeatingState {
  nbiDeliveredMW: number;
  echDeliveredMW: number;
  ichDeliveredMW: number;
  /** Sum of delivered (absorbed) auxiliary heating. */
  totalDeliveredMW: number;
  /** Electricity drawn from the grid by the heating plant, MW. */
  wallPlugMW: number;
  nbiStatus: EquipmentStatus;
  echStatus: EquipmentStatus;
  ichStatus: EquipmentStatus;
}

export interface ThermalState {
  coolantInletC: number;
  coolantOutletC: number;
  coolantFlowKgS: number;
  /** Gross fusion + auxiliary heat delivered to the primary loop, MW. */
  thermalPowerMW: number;
  /** Heat exchanger / steam generator loading, % of rated duty. */
  heatExchangerLoadPct: number;
  turbineStatus: EquipmentStatus;
  generatorStatus: EquipmentStatus;
  cryoStatus: EquipmentStatus;
  vacuumPressurePa: number;
  /** Coolant loop temperature rise across the first wall, K. */
  coolantDeltaTK: number;
}

export interface PowerState {
  fusionPowerMW: number;
  auxiliaryHeatingMW: number;
  plasmaEnergyMJ: number;
  thermalOutputMW: number;
  /** Turbine/generator gross electrical output, MW. */
  electricalOutputMW: number;
  /** Electricity consumed on site (heating wall plug, magnets, cryo, pumps...). */
  plantAuxiliaryMW: number;
  /** electricalOutputMW - plantAuxiliaryMW (positive = export to grid). */
  netElectricMW: number;
  /** Fusion power / absorbed auxiliary heating power. null when undefined. */
  qPlasma: number | null;
  /** Net electric / total on-site electric input. null when undefined. */
  qEngineering: number | null;
  /** Breakdown of on-site electrical loads, MW. */
  loads: {
    heating: number;
    magnets: number;
    cryogenics: number;
    coolantPumps: number;
    vacuumPumps: number;
    controls: number;
  };
}

export interface StabilityMetrics {
  /** Composite plasma stability index, 0..1. */
  stability: number;
  /** Magnetic control quality, 0..1. */
  fieldQuality: number;
  /** Normalised beta limit utilisation (betaN / betaN_limit). */
  betaLimitFraction: number;
  /** Density limit utilisation (n / n_GW). */
  densityLimitFraction: number;
  /** Coil thermal margin, 1 = cold, 0 = at quench threshold. */
  coilThermalMargin: number;
  /** Aggregate risk score 0..1 used by the alarm engine. */
  riskScore: number;
  /** Dominant contributor label. */
  riskDriver: string;
}

export interface EquipmentItem {
  id: string;
  name: string;
  subsystem: 'MAGNET' | 'HEATING' | 'COOLING' | 'POWER' | 'VACUUM' | 'CONTROL';
  status: EquipmentStatus;
  online: boolean;
  detail: string;
}

/** Sensor readings as *measured* (may be biased, lost or lagged by faults). */
export interface SensorReadings {
  temperatureKeV: number | null;
  density: number | null;
  fusionPowerMW: number | null;
  coilTemperatureK: number | null;
  coolantFlowKgS: number | null;
  vacuumPressurePa: number | null;
  toroidalFieldT: number | null;
  status: Record<string, SensorStatus>;
}

/** One immutable snapshot of the whole plant. All UI reads from this. */
export interface SimFrame {
  simTimeS: number;
  wallTimeMs: number;
  stepCount: number;
  status: SimStatus;
  phase: PlantPhase;
  scenarioName: string;
  plasma: PlasmaState;
  magnetic: MagneticState;
  heating: HeatingState;
  thermal: ThermalState;
  power: PowerState;
  stability: StabilityMetrics;
  equipment: EquipmentItem[];
  sensors: SensorReadings;
  activeFaults: string[];
  alarms: AlarmRecord[];
  config: SimConfig;
  controls: ControlInputs;
  /** Number of modelled devices currently "online". */
  devicesOnline: number;
  devicesTotal: number;
  disturbances: {
    /** Current slow perturbation as a fraction (-1..1). */
    slow: number;
    /** Current measurement noise sample (-1..1). */
    noise: number;
  };
}

/* ------------------------------------------------------------------ */
/* Faults, alarms, events                                              */
/* ------------------------------------------------------------------ */

export type FaultKind =
  | 'HEATING_DROOP'
  | 'MAGNETIC_DISTURBANCE'
  | 'COIL_OVERHEAT'
  | 'COOLANT_LOSS'
  | 'VACUUM_LEAK'
  | 'SENSOR_BIAS'
  | 'SENSOR_DROPOUT'
  | 'SENSOR_LATENCY';

export interface FaultDefinition {
  kind: FaultKind;
  name: string;
  shortName: string;
  subsystem: 'HEATING' | 'MAGNET' | 'COOLING' | 'VACUUM' | 'CONTROL';
  description: string;
  /** Whether severity is user selectable (0..1). */
  adjustable: boolean;
  affectedParameters: string[];
  /** Expected diagnostic conclusion shown in the UI. */
  diagnosis: string;
  /** Simulated (non-operational) recovery guidance. */
  recoverySteps: string[];
}

export interface FaultInstance {
  id: string;
  kind: FaultKind;
  severity: number;
  injectedAtS: number;
  clearedAtS: number | null;
  active: boolean;
  /** Human readable summary of the consequence model in effect. */
  effect: string;
}

export interface AlarmRecord {
  id: string;
  ruleId: string;
  level: AlarmLevel;
  source: string;
  message: string;
  value: string;
  raisedAtS: number;
  clearedAtS: number | null;
  active: boolean;
}

export type EventCategory =
  | 'CONTROL'
  | 'PHASE'
  | 'FAULT'
  | 'ALARM'
  | 'SIM'
  | 'EXPORT'
  | 'PRESET';

export interface EventRecord {
  id: string;
  tS: number;
  wallMs: number;
  category: EventCategory;
  level: AlarmLevel;
  message: string;
  detail?: string;
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export interface HistorySample {
  t: number;
  wallMs: number;
  temperature: number;
  density: number;
  current: number;
  pressure: number;
  storedEnergy: number;
  fusionPower: number;
  heatingPower: number;
  alphaPower: number;
  qPlasma: number | null;
  qEngineering: number | null;
  toroidalField: number;
  poloidalField: number;
  coilCurrent: number;
  coilTemperature: number;
  fieldStability: number;
  coolantIn: number;
  coolantOut: number;
  coolantFlow: number;
  thermalPower: number;
  electricalOutput: number;
  plantAuxiliary: number;
  netElectric: number;
  stability: number;
  betaN: number;
  greenwald: number;
  heatExchangerLoad: number;
  vacuumPressure: number;
  cryoLoad: number;
  confinementTime: number;
}

export type HistoryChannel = Exclude<keyof HistorySample, 't' | 'wallMs'>;

/* ------------------------------------------------------------------ */
/* Scenarios / presets                                                 */
/* ------------------------------------------------------------------ */

export type ScenarioId =
  | 'BASELINE'
  | 'HIGH_HEATING'
  | 'COOLING_STRESS'
  | 'MAGNETIC_DISTURBANCE'
  | 'CUSTOM';

export interface ScenarioDefinition {
  id: ScenarioId;
  name: string;
  tag: string;
  description: string;
  controls: ControlInputs;
  config: Partial<SimConfig>;
  /** Initial plasma conditions used when the scenario is loaded. */
  initial: InitialConditions;
  engineeringNotes: string;
}

export interface InitialConditions {
  temperatureKeV: number;
  densityM3: number;
  coilTemperatureK: number;
  coolantInletC: number;
}

export interface ScenarioPreset {
  id: string;
  name: string;
  createdAt: number;
  controls: ControlInputs;
  config: SimConfig;
  initial: InitialConditions;
  source: ScenarioId;
}

/** Result of a headless what-if / comparative run. */
export interface WhatIfResult {
  scenarioId: ScenarioId | 'CUSTOM';
  label: string;
  controls: ControlInputs;
  config: SimConfig;
  durationS: number;
  summary: {
    finalTemperatureKeV: number;
    peakTemperatureKeV: number;
    finalFusionPowerMW: number;
    peakFusionPowerMW: number;
    meanHeatingMW: number;
    finalQPlasma: number | null;
    finalQEngineering: number | null;
    finalStability: number;
    minStability: number;
    finalNetElectricMW: number;
    integratedThermalGJ: number;
    integratedNetElectricGJ: number;
    integratedHeatingGJ: number;
    finalCoilTempK: number;
    finalDensity: number;
    alarms: number;
  };
  series: HistorySample[];
}

export interface ComparisonRow {
  metric: string;
  unit: string;
  baseline: string;
  variant: string;
  delta: string;
  deltaPct: number | null;
  better: 'higher' | 'lower' | 'neutral';
}

/* ------------------------------------------------------------------ */
/* 3D view                                                             */
/* ------------------------------------------------------------------ */

export type ReactorComponentId =
  | 'plasma'
  | 'vacuum-vessel'
  | 'tf-coil'
  | 'pf-coil'
  | 'central-solenoid'
  | 'divertor'
  | 'cryostat'
  | 'neutral-beam'
  | 'coolant-manifold';

export type ReactorViewMode = 'FULL' | 'CUTAWAY' | 'PLASMA';

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

export interface PersistedSession {
  id: string;
  name: string;
  createdAt: number;
  scenarioName: string;
  samples: HistorySample[];
  events: EventRecord[];
  alarms: AlarmRecord[];
  controls: ControlInputs;
  config: SimConfig;
  durationS: number;
  sampleCount: number;
  approxBytes: number;
}

export interface SessionMeta {
  id: string;
  name: string;
  createdAt: number;
  scenarioName: string;
  sampleCount: number;
  durationS: number;
  approxBytes: number;
}

import type {
  AlarmRecord,
  ControlInputs,
  EngineHooks,
  EventRecord,
  FaultInstance,
  FaultKind,
  HistorySample,
  InitialConditions,
  PlantPhase,
  PowerState,
  SensorReadings,
  SensorStatus,
  SimConfig,
  SimFrame,
  SimStatus,
  StabilityMetrics,
  WhatIfResult,
} from '@/types/engine';
import {
  COIL_LIMITS,
  DYNAMICS,
  FIXED_STEP_S,
  HEATING_EFFICIENCY,
  HISTORY_SAMPLE_INTERVAL_S,
  MACHINE,
  MAX_SUBSTEPS_PER_FRAME,
  PHYS,
} from './constants';
import {
  alphaPowerMW,
  confinementTimeS,
  fusionPowerMW as computeFusionPower,
  fusionReactivity,
  greenwaldFraction,
  integrateDensity,
  integratePlasmaTemperature,
  normalizedBeta,
  plasmaPressureKPa,
  radiatedPowerMW,
  safetyFactorProxy,
  storedEnergyMJ,
} from './PlasmaModel';
import {
  coilThermalMargin,
  cryoLoadPct,
  fieldQuality as computeFieldQuality,
  poloidalFieldT,
  stepCoilCurrent,
  stepCoilTemperature,
  toroidalFieldT,
} from './MagneticFieldModel';
import { computeHeatingDelivery, heatingWasteHeatMW, heatingSystemStatus } from './HeatingModel';
import { computePowerBalance, thermalEfficiencyFromCoolant } from './PowerBalanceModel';
import {
  cryoStatus,
  generatorStatus,
  heatExchangerLoadPct,
  stepCoolantTemperatures,
  stepVacuumPressure,
  turbineStatus,
} from './ThermalModel';
import { computeStability } from './StabilityModel';
import { AlarmEngine } from './AlarmEngine';
import { clamp, safeDiv, symmetric } from '@/utils/math';
import { createSeededRandom, generateRunId } from './random';
import {
  DEFAULT_CONFIG,
  DEFAULT_CONTROLS,
  INITIAL_CONDITIONS_DEFAULT,
  CONTROL_SPEC_MAP,
} from './controlSpecs';
import type { EquipmentItem, HistoryChannel } from '@/types/simulation';

export interface EngineOptions {
  controls?: ControlInputs;
  config?: SimConfig;
  initial?: InitialConditions;
  scenarioName?: string;
  hooks?: EngineHooks;
}

interface FaultEffects {
  heatingDroop: number;
  coilExtraHeatW: number;
  coolantLoss: number;
  vacuumLeakPaPerS: number;
  fieldBias: number;
  disturbanceBoost: number;
  sensorBias: number;
  sensorDropout: boolean;
  sensorLatency: number;
  magneticSeverity: number;
}

const ZERO_EFFECTS: FaultEffects = {
  heatingDroop: 0,
  coilExtraHeatW: 0,
  coolantLoss: 0,
  vacuumLeakPaPerS: 0,
  fieldBias: 0,
  disturbanceBoost: 0,
  sensorBias: 0,
  sensorDropout: false,
  sensorLatency: 0,
  magneticSeverity: 0,
};

interface LatencySample {
  t: number;
  temperature: number;
  density: number;
  fusionPower: number;
  coilTemp: number;
  vacuum: number;
  field: number;
  flow: number;
}

/**
 * FusionSimulationEngine — the authoritative model of the virtual plant.
 *
 * Design rules:
 *  - Fixed-step integration (50 ms simulated) with a wall-clock accumulator, so
 *    behaviour is rate independent.
 *  - Every derived display value is computed here; the UI never invents numbers.
 *  - All outputs are clamped; NaN / Infinity can never escape into components.
 *  - The engine is pure TypeScript with no React or DOM dependency, so it can be
 *    unit tested and run headless for WHAT-IF comparisons.
 */
export class FusionSimulationEngine {
  readonly controls: ControlInputs;
  config: SimConfig;
  initial: InitialConditions;
  scenarioName: string;
  hooks: EngineHooks;

  /* --- simulation clock --- */
  simTimeS = 0;
  wallTimeMs = 0;
  stepCount = 0;
  /** Stable identifier of the current run; regenerated on reset / seed change. */
  runId = '';
  /** Wall-clock start of the current run (ISO derived in exports). */
  startedAtMs = 0;
  status: SimStatus = 'IDLE';
  phase: PlantPhase = 'STANDBY';

  /* --- plasma state --- */
  temperatureKeV: number;
  density: number;
  plasmaCurrentMA: number;
  storedEnergyMJ = 0;
  tauE = 2;
  reactivity = 0;
  fusionPowerMW = 0;
  alphaMW = 0;
  radiatedMW = 0;
  betaN = 0;
  greenwald = 0;
  q95 = 3;

  /* --- magnet state --- */
  coilCurrentKA: number;
  coilTemperatureK: number;
  fieldToroidalT = 0;
  fieldPoloidalT = 0;
  fieldQuality = 1;
  cryoLoad = 46;

  /* --- thermal state --- */
  coolantInletC: number;
  coolantOutletC: number;
  coolantFlowKgS = 12000;
  coolantDeltaT = 0;
  thermalPowerMW = 0;
  heatExchangerLoadPct = 0;
  vacuumPressurePa = 4e-6;
  efficiency = 0.33;

  /* --- power state --- */
  power: PowerState;
  stabilityMetrics: StabilityMetrics;

  /* --- supervision --- */
  faults: FaultInstance[] = [];
  faultsSuspended = false;
  private alarmEngine = new AlarmEngine();
  private alarms: AlarmRecord[] = [];
  private raisedCount = 0;
  private lastAlarmEvalS = -1;
  private faultSequence = 0;
  private eventSequence = 0;

  /* --- disturbances / numerics --- */
  private random: () => number;
  private disturbanceSlow = 0;
  private disturbanceNoise = 0;
  private substepAccum = 0;
  private sampleAccum = 0;
  private previousCoilCurrentKA: number;
  private previousTemperatureKeV: number;
  private latencyBuffer: LatencySample[] = [];
  private latencyCursor = 0;
  private lastPhase: PlantPhase = 'STANDBY';
  private lastSample: HistorySample | null = null;

  constructor(options: EngineOptions = {}) {
    this.controls = { ...DEFAULT_CONTROLS, ...(options.controls ?? {}) };
    this.config = { ...DEFAULT_CONFIG, ...(options.config ?? {}) };
    this.initial = { ...INITIAL_CONDITIONS_DEFAULT, ...(options.initial ?? {}) };
    this.scenarioName = options.scenarioName ?? 'Baseline Scenario';
    this.hooks = options.hooks ?? {};
    this.startedAtMs = Date.now();
    this.random = createSeededRandom(this.config.seed);
    this.runId = generateRunId(this.config.seed, this.startedAtMs);

    this.temperatureKeV = this.initial.temperatureKeV;
    this.density = this.initial.densityM3;
    this.plasmaCurrentMA = 0;
    this.coilCurrentKA = 0;
    this.coilTemperatureK = this.initial.coilTemperatureK;
    this.coolantInletC = this.initial.coolantInletC;
    this.coolantOutletC = this.initial.coolantInletC;
    this.previousCoilCurrentKA = 0;
    this.previousTemperatureKeV = this.temperatureKeV;

    this.power = this.buildPowerState(0, 0, 0);
    this.stabilityMetrics = {
      stability: 1,
      fieldQuality: 1,
      betaLimitFraction: 0,
      densityLimitFraction: 0,
      coilThermalMargin: 1,
      riskScore: 0,
      riskDriver: 'Nominal',
    };
  }

  /* ------------------------------------------------------------------ */
  /* Transport control                                                   */
  /* ------------------------------------------------------------------ */

  start(): void {
    if (this.status === 'RUNNING') return;
    this.status = 'RUNNING';
    this.phase = 'RAMP_UP';
    this.emitEvent('SIM', 'INFO', 'Simulation started', `Scenario: ${this.scenarioName}`);
  }

  pause(): void {
    if (this.status !== 'RUNNING') return;
    this.status = 'PAUSED';
    this.emitEvent('SIM', 'INFO', 'Simulation paused', `t = ${this.simTimeS.toFixed(1)} s simulated`);
  }

  resume(): void {
    if (this.status !== 'PAUSED') return;
    this.status = 'RUNNING';
    this.emitEvent('SIM', 'INFO', 'Simulation resumed', `t = ${this.simTimeS.toFixed(1)} s simulated`);
  }

  emergencyStop(): void {
    this.status = 'EMERGENCY_STOP';
    this.phase = 'SCRAM';
    this.lastPhase = 'SCRAM';
    this.emitEvent(
      'PHASE',
      'CRITICAL',
      'EMERGENCY STOP latched',
      'All simulated heating commands are zeroed. Reset the run to re-initialise the plant.',
    );
  }

  reset(initial?: InitialConditions, scenarioName?: string): void {
    if (initial) this.initial = { ...this.initial, ...initial };
    if (scenarioName) this.scenarioName = scenarioName;

    this.simTimeS = 0;
    this.stepCount = 0;
    this.status = 'IDLE';
    this.phase = 'STANDBY';
    this.lastPhase = 'STANDBY';
    this.temperatureKeV = this.initial.temperatureKeV;
    this.density = this.initial.densityM3;
    this.plasmaCurrentMA = 0;
    this.coilCurrentKA = 0;
    this.previousCoilCurrentKA = 0;
    this.previousTemperatureKeV = this.temperatureKeV;
    this.coilTemperatureK = this.initial.coilTemperatureK;
    this.coolantInletC = this.initial.coolantInletC;
    this.coolantOutletC = this.initial.coolantInletC;
    this.coolantDeltaT = 0;
    this.vacuumPressurePa = 4e-6;
    this.thermalPowerMW = 0;
    this.fusionPowerMW = 0;
    this.alphaMW = 0;
    this.radiatedMW = 0;
    this.storedEnergyMJ = 0;
    this.tauE = 2;
    this.reactivity = 0;
    this.faults = [];
    this.substepAccum = 0;
    this.sampleAccum = 0;
    this.disturbanceSlow = 0;
    this.disturbanceNoise = 0;
    this.latencyBuffer = [];
    this.latencyCursor = 0;
    this.lastSample = null;
    this.alarmEngine.reset();
    this.alarms = [];
    this.raisedCount = 0;
    this.lastAlarmEvalS = -1;
    this.startedAtMs = Date.now();
    this.random = createSeededRandom(this.config.seed);
    this.runId = generateRunId(this.config.seed, this.startedAtMs);
    this.power = this.buildPowerState(0, 0, 0);
    this.emitEvent('SIM', 'INFO', 'Simulation reset', `Initial T = ${this.initial.temperatureKeV} keV`);
  }

  setControl<K extends keyof ControlInputs>(key: K, value: number): { ok: boolean; reason?: string } {
    if (!Number.isFinite(value)) return { ok: false, reason: 'Value must be a finite number' };
    const previous = this.controls[key];
    this.controls[key] = value;
    const spec = CONTROL_SPEC_MAP[key];
    this.emitEvent(
      'CONTROL',
      'INFO',
      `Setpoint changed: ${spec?.label ?? String(key)}`,
      `${previous.toFixed(spec?.precision ?? 2)} -> ${value.toFixed(spec?.precision ?? 2)} ${spec?.unit ?? ''}`,
    );
    return { ok: true };
  }

  setConfig(patch: Partial<SimConfig>): void {
    const previousSeed = this.config.seed;
    this.config = { ...this.config, ...patch };
    if (patch.seed !== undefined && patch.seed !== previousSeed) {
      this.random = createSeededRandom(this.config.seed);
      this.startedAtMs = Date.now();
      this.runId = generateRunId(this.config.seed, this.startedAtMs);
    }
    if (patch.seed !== undefined || patch.timeScale !== undefined) {
      this.emitEvent(
        'CONTROL',
        'INFO',
        'Simulation settings changed',
        `timeScale=${this.config.timeScale}x, seed=${this.config.seed}`,
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* Fault injection                                                     */
  /* ------------------------------------------------------------------ */

  injectFault(kind: FaultKind, severity: number): FaultInstance | null {
    if (this.faults.some((f) => f.active && f.kind === kind)) return null;
    const fault: FaultInstance = {
      id: `fault-${++this.faultSequence}`,
      kind,
      severity: clamp(severity, 0.05, 1),
      injectedAtS: this.simTimeS,
      clearedAtS: null,
      active: true,
      effect: '',
    };
    fault.effect = this.describeFaultEffect(kind, fault.severity);
    this.faults.push(fault);
    this.emitEvent('FAULT', severity > 0.6 ? 'CRITICAL' : 'WARNING', `Fault injected: ${kind}`, fault.effect);
    return fault;
  }

  clearFault(id: string): void {
    const fault = this.faults.find((f) => f.id === id);
    if (!fault || !fault.active) return;
    fault.active = false;
    fault.clearedAtS = this.simTimeS;
    this.emitEvent(
      'FAULT',
      'INFO',
      `Fault cleared: ${fault.kind}`,
      `Active for ${(this.simTimeS - fault.injectedAtS).toFixed(1)} s simulated`,
    );
  }

  clearAllFaults(): void {
    const active = this.faults.filter((f) => f.active);
    for (const fault of active) this.clearFault(fault.id);
    if (active.length === 0) this.emitEvent('FAULT', 'INFO', 'No active faults to clear');
  }

  /**
   * Suspend the physical consequences of every active fault without deleting the
   * fault records. Used for recovery rehearsals: the fault timeline is preserved
   * but the plant behaves as if it had been cleared.
   */
  setFaultsSuspended(suspended: boolean): void {
    this.faultsSuspended = suspended;
  }

  private describeFaultEffect(kind: FaultKind, severity: number): string {
    switch (kind) {
      case 'HEATING_DROOP':
        return `Auxiliary heating delivery reduced to ~${((1 - 0.68 * severity) * 100).toFixed(0)}% of command`;
      case 'MAGNETIC_DISTURBANCE':
        return `Field error injection: -${(6 * severity).toFixed(1)}% B_tor with ${(80 * severity).toFixed(0)}% added MHD activity`;
      case 'COIL_OVERHEAT':
        return `Additional ${(14 * severity).toFixed(1)} kW into the TF cold mass`;
      case 'COOLANT_LOSS':
        return `Primary flow reduced ${(65 * severity).toFixed(0)}%, cryo capacity down ${(55 * severity).toFixed(0)}%`;
      case 'VACUUM_LEAK':
        return `Air ingress ${(8 * severity).toFixed(1)}e-3 Pa/s, pumping cannot keep up`;
      case 'SENSOR_BIAS':
        return `Diagnostic channels offset by ~${(15 * severity).toFixed(0)}% (physics unaffected)`;
      case 'SENSOR_DROPOUT':
        return 'Core diagnostic channels return no signal; control falls back to estimation';
      case 'SENSOR_LATENCY':
        return `Diagnostic transport delay ${(2 + 6 * severity).toFixed(0)} simulated seconds`;
      default:
        return 'Simulated fault';
    }
  }

  private faultEffects(): FaultEffects {
    const effects: FaultEffects = { ...ZERO_EFFECTS };
    if (this.faultsSuspended) return effects;
    for (const fault of this.faults) {
      if (!fault.active) continue;
      switch (fault.kind) {
        case 'HEATING_DROOP':
          effects.heatingDroop = Math.max(effects.heatingDroop, fault.severity);
          break;
        case 'MAGNETIC_DISTURBANCE':
          effects.fieldBias -= 0.06 * fault.severity;
          effects.disturbanceBoost += 0.9 * fault.severity;
          effects.magneticSeverity = Math.max(effects.magneticSeverity, fault.severity);
          break;
        case 'COIL_OVERHEAT':
          effects.coilExtraHeatW += 14000 * fault.severity;
          break;
        case 'COOLANT_LOSS':
          effects.coolantLoss = Math.max(effects.coolantLoss, fault.severity);
          break;
        case 'VACUUM_LEAK':
          effects.vacuumLeakPaPerS += 8e-3 * fault.severity;
          break;
        case 'SENSOR_BIAS':
          effects.sensorBias = Math.max(effects.sensorBias, fault.severity);
          break;
        case 'SENSOR_DROPOUT':
          effects.sensorDropout = true;
          break;
        case 'SENSOR_LATENCY':
          effects.sensorLatency = Math.max(effects.sensorLatency, Math.round(2 + 6 * fault.severity));
          break;
        default:
          break;
      }
    }
    return effects;
  }

  /* ------------------------------------------------------------------ */
  /* Integration                                                         */
  /* ------------------------------------------------------------------ */

  /** Advance the simulation using wall-clock seconds (scaled by timeScale). */
  step(wallDeltaSeconds: number): void {
    this.wallTimeMs = Date.now();
    if (this.status !== 'RUNNING') return;
    const wall = clamp(wallDeltaSeconds, 0, 0.3);
    const simulated = wall * clamp(this.config.timeScale, 0.1, 50);
    this.substepAccum = Math.min(this.substepAccum + simulated, FIXED_STEP_S * MAX_SUBSTEPS_PER_FRAME);

    let steps = 0;
    while (this.substepAccum >= FIXED_STEP_S && steps < MAX_SUBSTEPS_PER_FRAME) {
      this.substep(FIXED_STEP_S);
      this.substepAccum -= FIXED_STEP_S;
      steps += 1;
    }
  }

  /**
   * Run a headless experiment of `durationS` simulated seconds and return a
   * summary suitable for WHAT-IF comparison. Does not disturb a live run because
   * it is normally called on a throw-away instance.
   */
  runHeadless(durationS: number): { summary: WhatIfResult['summary']; series: HistorySample[] } {
    const series: HistorySample[] = [];
    const originalHook = this.hooks.onSample;
    this.hooks.onSample = (sample) => {
      series.push(sample);
      originalHook?.(sample);
    };
    this.status = 'RUNNING';
    this.phase = 'RAMP_UP';

    const totalSteps = Math.min(Math.round(durationS / FIXED_STEP_S), 400000);
    for (let i = 0; i < totalSteps; i += 1) {
      this.substep(FIXED_STEP_S);
    }

    this.hooks.onSample = originalHook;
    const summary = summarizeSeries(series);
    summary.alarms = this.raisedCount;
    return { summary, series };
  }

  private substep(dt: number): void {
    this.simTimeS += dt;
    this.stepCount += 1;
    this.wallTimeMs = Date.now();

    const config = this.config;
    const controls = this.controls;
    const effects = this.faultEffects();

    /* --- disturbances ------------------------------------------------- */
    const period = DYNAMICS.disturbancePeriodS;
    const phase = (2 * Math.PI * this.simTimeS) / period;
    const slowTarget =
      (Math.sin(phase) * 0.6 + Math.sin(phase * 2.7 + 1.1) * 0.4) *
        config.disturbanceLevel *
        (1 + effects.disturbanceBoost) +
      effects.disturbanceBoost * 0.15 * Math.sin(phase * 5.3);
    this.disturbanceSlow += (slowTarget - this.disturbanceSlow) * (1 - Math.exp(-dt / 3));
    // Stochastic component: a seeded random walk on top of the deterministic
    // oscillation, so the same seed reproduces a run exactly while different seeds
    // explore different disturbance realisations.
    this.disturbanceSlow += symmetric(this.random) * config.disturbanceLevel * 0.09 * dt;
    this.disturbanceSlow = clamp(this.disturbanceSlow, -1.8, 1.8);
    this.disturbanceNoise = symmetric(this.random);

    /* --- magnetic system --------------------------------------------- */
    this.previousCoilCurrentKA = this.coilCurrentKA;
    const commandedCoilCurrent = this.status === 'EMERGENCY_STOP' ? 0 : controls.coilCurrentSetpointKA;
    this.coilCurrentKA = stepCoilCurrent(this.coilCurrentKA, commandedCoilCurrent, dt);
    const fieldNominal = toroidalFieldT(this.coilCurrentKA);
    this.fieldToroidalT = clamp(
      fieldNominal * (1 + effects.fieldBias + 0.012 * this.disturbanceSlow * (1 + effects.disturbanceBoost)),
      0,
      20,
    );
    this.fieldPoloidalT = poloidalFieldT(this.plasmaCurrentMA);

    /* --- plasma current ---------------------------------------------- */
    const currentTarget = this.status === 'EMERGENCY_STOP' ? 0 : controls.plasmaCurrentTargetMA;
    const currentDrive =
      this.status === 'EMERGENCY_STOP' ? 0 : currentTarget * (1 + 0.02 * this.disturbanceSlow);
    this.plasmaCurrentMA = clamp(
      this.plasmaCurrentMA +
        (currentDrive - this.plasmaCurrentMA) * (1 - Math.exp(-dt / DYNAMICS.currentTauS)),
      0,
      25,
    );

    /* --- heating ------------------------------------------------------ */
    const heatingAvailable = this.status === 'EMERGENCY_STOP' ? 0 : 1;
    const delivery = computeHeatingDelivery(
      {
        ...controls,
        nbiPowerMW: controls.nbiPowerMW * heatingAvailable,
        echPowerMW: controls.echPowerMW * heatingAvailable,
        ichPowerMW: controls.ichPowerMW * heatingAvailable,
      },
      {
        nbi: 1 - 0.78 * effects.heatingDroop,
        ech: 1 - 0.45 * effects.heatingDroop,
        ich: 1 - 0.4 * effects.heatingDroop,
      },
    );

    /* --- density ------------------------------------------------------ */
    const densityTarget =
      controls.targetDensity19 *
      1e19 *
      (1 + 0.15 * this.disturbanceSlow * config.disturbanceLevel + 0.0015 * controls.nbiPowerMW);
    this.density = integrateDensity({
      density: this.density,
      targetDensity: densityTarget,
      dt,
      tauS: DYNAMICS.densityTauS,
    });

    /* --- confinement -------------------------------------------------- */
    const auxiliaryPlusAlpha = Math.max(delivery.totalDeliveredMW + this.alphaMW, 1);
    const hFactor =
      clamp(config.confinementH, 0.3, 1.8) *
      (1 - 0.22 * effects.magneticSeverity) *
      (1 - clamp(Math.abs(this.disturbanceSlow), 0, 1) * 0.04);
    this.tauE = confinementTimeS({
      currentMA: this.plasmaCurrentMA,
      toroidalFieldT: this.fieldToroidalT,
      lossPowerMW: auxiliaryPlusAlpha,
      electronDensity: this.density,
      hFactor,
    });

    /* --- energy balance ---------------------------------------------- */
    this.radiatedMW = radiatedPowerMW(this.density, this.temperatureKeV);
    this.temperatureKeV = integratePlasmaTemperature({
      temperatureKeV: this.temperatureKeV,
      electronDensity: this.density,
      volumeM3: MACHINE.plasmaVolumeM3,
      absorbedAuxMW: delivery.totalDeliveredMW,
      alphaMW: this.alphaMW,
      radiatedMW: this.radiatedMW,
      confinementTimeS: this.tauE,
      dt,
    });

    /* --- fusion power ------------------------------------------------- */
    this.reactivity = fusionReactivity(this.temperatureKeV);
    this.fusionPowerMW = computeFusionPower(this.density, this.temperatureKeV);
    this.alphaMW = alphaPowerMW(this.fusionPowerMW);
    this.radiatedMW = radiatedPowerMW(this.density, this.temperatureKeV);
    this.storedEnergyMJ = storedEnergyMJ(this.density, this.temperatureKeV);

    /* --- thermal loop -------------------------------------------------- */
    const wasteHeatMW = heatingWasteHeatMW(delivery, config.auxHeatRecovery);
    this.thermalPowerMW = clamp(this.fusionPowerMW + delivery.totalDeliveredMW + wasteHeatMW, 0, 20000);
    this.coolantFlowKgS = clamp(controls.coolantFlowKgS * (1 - 0.65 * effects.coolantLoss), 500, 20000);
    const exchangerAvailability = 1 - 0.45 * effects.coolantLoss;
    const coolant = stepCoolantTemperatures({
      inletC: this.coolantInletC,
      outletC: this.coolantOutletC,
      thermalPowerMW: this.thermalPowerMW,
      flowKgS: this.coolantFlowKgS,
      requestedInletC: controls.coolantInletTargetC,
      exchangerAvailability,
      dt,
    });
    this.coolantInletC = coolant.inletC;
    this.coolantOutletC = coolant.outletC;
    this.coolantDeltaT = coolant.deltaTK;
    this.heatExchangerLoadPct = heatExchangerLoadPct(
      this.thermalPowerMW,
      this.coolantFlowKgS,
      exchangerAvailability,
    );

    /* --- cryogenics / coils -------------------------------------------- */
    const cryoCapacity = 1 - 0.55 * effects.coolantLoss;
    this.coilTemperatureK = stepCoilTemperature({
      temperatureK: this.coilTemperatureK,
      coilCurrentKA: this.coilCurrentKA,
      previousCurrentKA: this.previousCoilCurrentKA,
      extraHeatW: effects.coilExtraHeatW,
      cryoCapacity,
      dt,
    });
    this.cryoLoad = cryoLoadPct(this.coilTemperatureK, this.coilCurrentKA, effects.coilExtraHeatW);

    /* --- vacuum -------------------------------------------------------- */
    this.vacuumPressurePa = stepVacuumPressure({
      pressurePa: this.vacuumPressurePa,
      leakRatePaPerS: effects.vacuumLeakPaPerS,
      pumpingAvailability: 1 - 0.35 * effects.coolantLoss,
      dt,
    });

    /* --- electrical ---------------------------------------------------- */
    this.efficiency = thermalEfficiencyFromCoolant(this.coolantOutletC, this.coolantInletC);
    const exchangerTripped = this.heatExchangerLoadPct > 145;
    const electrical = exchangerTripped ? 0 : this.thermalPowerMW * this.efficiency;
    this.power = this.buildPowerState(this.fusionPowerMW, delivery.totalDeliveredMW, wasteHeatMW, {
      electricalOutputMWOverride: electrical,
      heatingGridMW: delivery.wallPlugMW,
    });

    /* --- derived stability --------------------------------------------- */
    this.betaN = normalizedBeta(this.density, this.temperatureKeV, this.fieldToroidalT, this.plasmaCurrentMA);
    this.greenwald = greenwaldFraction(this.density, this.plasmaCurrentMA);
    this.q95 = safetyFactorProxy(this.fieldToroidalT, this.plasmaCurrentMA);
    this.fieldQuality = computeFieldQuality({
      actualFieldT: this.fieldToroidalT,
      requestedFieldT: toroidalFieldT(controls.coilCurrentSetpointKA),
      coilTemperatureK: this.coilTemperatureK,
      disturbance: this.disturbanceSlow,
    });

    const stability = computeStability({
      betaLimitFraction: this.betaN / 3.5,
      densityLimitFraction: this.greenwald,
      coilThermalMargin: coilThermalMargin(this.coilTemperatureK),
      fieldQuality: this.fieldQuality,
      vacuumPressurePa: this.vacuumPressurePa,
      temperatureKeV: this.temperatureKeV,
      disturbance: this.disturbanceSlow,
      thermalOverloadPct: this.heatExchangerLoadPct,
    });
    this.stabilityMetrics = stability.metrics;

    /* --- phases -------------------------------------------------------- */
    this.updatePhase();

    /* --- alarms -------------------------------------------------------- */
    if (this.simTimeS - this.lastAlarmEvalS >= 0.25) {
      this.lastAlarmEvalS = this.simTimeS;
      const frame = this.snapshot();
      const { raised, cleared } = this.alarmEngine.evaluate(frame);
      this.raisedCount += raised.length;
      this.alarms = this.alarmEngine.activeAlarms();
      for (const alarm of raised) {
        this.emitEvent(
          'ALARM',
          alarm.level,
          `${alarm.level}: ${alarm.message}`,
          `${alarm.source} = ${alarm.value}`,
        );
      }
      for (const alarm of cleared) {
        this.emitEvent('ALARM', 'INFO', `Cleared: ${alarm.message}`, `${alarm.source} back in range`);
      }
      if (raised.length || cleared.length) {
        this.hooks.onAlarms?.(raised, cleared);
      }
    }

    /* --- sensor transport (latency buffer) ------------------------------ */
    this.pushLatencySample();

    /* --- history sampling ---------------------------------------------- */
    this.sampleAccum += dt;
    if (this.sampleAccum >= HISTORY_SAMPLE_INTERVAL_S) {
      this.sampleAccum -= HISTORY_SAMPLE_INTERVAL_S;
      const sample = this.historySample();
      this.lastSample = sample;
      this.hooks.onSample?.(sample);
    }
  }

  private updatePhase(): void {
    const ratePerSecond = safeDiv(this.temperatureKeV - this.previousTemperatureKeV, FIXED_STEP_S, 0) ?? 0;
    this.previousTemperatureKeV = this.temperatureKeV;

    let next: PlantPhase;
    if (this.status === 'EMERGENCY_STOP') next = 'SCRAM';
    else if (this.status === 'IDLE') next = 'STANDBY';
    else if (this.status === 'PAUSED') next = this.phase;
    else if (this.temperatureKeV < 0.6 && this.power.thermalOutputMW < 20) next = 'STANDBY';
    else if (ratePerSecond > 0.05) next = 'RAMP_UP';
    else if (ratePerSecond < -0.05) next = 'RAMP_DOWN';
    else next = 'FLAT_TOP';

    if (next !== this.lastPhase) {
      this.lastPhase = next;
      this.phase = next;
      if (next !== 'STANDBY') {
        this.emitEvent(
          'PHASE',
          'INFO',
          `Plant phase: ${next}`,
          `t = ${this.simTimeS.toFixed(1)} s simulated`,
        );
      }
    } else {
      this.phase = next;
    }
  }

  private pushLatencySample(): void {
    const entry: LatencySample = {
      t: this.simTimeS,
      temperature: this.temperatureKeV,
      density: this.density,
      fusionPower: this.fusionPowerMW,
      coilTemp: this.coilTemperatureK,
      vacuum: this.vacuumPressurePa,
      field: this.fieldToroidalT,
      flow: this.coolantFlowKgS,
    };
    this.latencyBuffer.push(entry);
    if (this.latencyBuffer.length > 400) this.latencyBuffer.shift();
  }

  private delayedSample(offsetS: number): LatencySample {
    if (!this.latencyBuffer.length) {
      return {
        t: this.simTimeS,
        temperature: this.temperatureKeV,
        density: this.density,
        fusionPower: this.fusionPowerMW,
        coilTemp: this.coilTemperatureK,
        vacuum: this.vacuumPressurePa,
        field: this.fieldToroidalT,
        flow: this.coolantFlowKgS,
      };
    }
    const target = this.simTimeS - offsetS;
    for (let i = this.latencyBuffer.length - 1; i >= 0; i -= 1) {
      if (this.latencyBuffer[i].t <= target) return this.latencyBuffer[i];
    }
    return this.latencyBuffer[0];
  }

  private buildPowerState(
    fusionMW: number,
    deliveredMW: number,
    wasteHeatMW: number,
    override?: { electricalOutputMWOverride: number; heatingGridMW: number },
  ): PowerState {
    const result = computePowerBalance(
      {
        fusionPowerMW: fusionMW,
        heatingDeliveredMW: deliveredMW,
        wasteHeatMW,
        toroidalFieldT: this.fieldToroidalT || toroidalFieldT(this.controls.coilCurrentSetpointKA),
        coilCurrentKA: this.coilCurrentKA || this.controls.coilCurrentSetpointKA,
        coolantFlowKgS: this.coolantFlowKgS || this.controls.coolantFlowKgS,
        cryoLoadPct: this.cryoLoad,
        thermalEfficiency: override ? this.efficiency : 0,
        controls: this.controls,
        heatingGridMW:
          override?.heatingGridMW ??
          this.controls.nbiPowerMW / HEATING_EFFICIENCY.nbiWallPlug +
            this.controls.echPowerMW / HEATING_EFFICIENCY.echWallPlug +
            this.controls.ichPowerMW / HEATING_EFFICIENCY.ichWallPlug,
      },
      this.storedEnergyMJ,
    );

    if (!override) {
      return {
        ...result,
        electricalOutputMW: 0,
        netElectricMW: -result.plantAuxiliaryMW,
        qEngineering: null,
      };
    }

    const netElectricMW = override.electricalOutputMWOverride - result.plantAuxiliaryMW;
    return {
      ...result,
      electricalOutputMW: override.electricalOutputMWOverride,
      netElectricMW,
      qEngineering: safeDiv(netElectricMW, result.plantAuxiliaryMW, null),
      qPlasma: safeDiv(fusionMW, deliveredMW, null),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Snapshot / UI projection                                            */
  /* ------------------------------------------------------------------ */

  historySample(): HistorySample {
    return {
      t: this.simTimeS,
      wallMs: this.wallTimeMs,
      temperature: this.temperatureKeV,
      density: this.density,
      current: this.plasmaCurrentMA,
      pressure: plasmaPressureKPa(this.density, this.temperatureKeV),
      storedEnergy: this.storedEnergyMJ,
      fusionPower: this.fusionPowerMW,
      heatingPower: this.power.auxiliaryHeatingMW,
      alphaPower: this.alphaMW,
      qPlasma: this.power.qPlasma,
      qEngineering: this.power.qEngineering,
      toroidalField: this.fieldToroidalT,
      poloidalField: this.fieldPoloidalT,
      coilCurrent: this.coilCurrentKA,
      coilTemperature: this.coilTemperatureK,
      fieldStability: this.fieldQuality,
      coolantIn: this.coolantInletC,
      coolantOut: this.coolantOutletC,
      coolantFlow: this.coolantFlowKgS,
      thermalPower: this.thermalPowerMW,
      electricalOutput: this.power.electricalOutputMW,
      plantAuxiliary: this.power.plantAuxiliaryMW,
      netElectric: this.power.netElectricMW,
      stability: this.stabilityMetrics.stability,
      betaN: this.betaN,
      greenwald: this.greenwald,
      heatExchangerLoad: this.heatExchangerLoadPct,
      vacuumPressure: this.vacuumPressurePa,
      cryoLoad: this.cryoLoad,
      confinementTime: this.tauE,
    };
  }

  latestSample(): HistorySample | null {
    return this.lastSample;
  }

  private buildSensors(effects: FaultEffects): SensorReadings {
    const noise = clamp(this.config.noiseLevel, 0, 1);
    const n = this.disturbanceNoise * noise;
    const bias = 1 + 0.15 * effects.sensorBias;
    const source = effects.sensorLatency > 0 ? this.delayedSample(effects.sensorLatency) : null;
    const base = source
      ? {
          temperature: source.temperature,
          density: source.density,
          fusionPower: source.fusionPower,
          coilTemp: source.coilTemp,
          vacuum: source.vacuum,
          field: source.field,
          flow: source.flow,
        }
      : {
          temperature: this.temperatureKeV,
          density: this.density,
          fusionPower: this.fusionPowerMW,
          coilTemp: this.coilTemperatureK,
          vacuum: this.vacuumPressurePa,
          field: this.fieldToroidalT,
          flow: this.coolantFlowKgS,
        };

    const status: Record<string, SensorStatus> = {
      temperature: effects.sensorDropout
        ? 'LOST'
        : effects.sensorLatency > 0
          ? 'LAGGED'
          : effects.sensorBias > 0
            ? 'DEGRADED'
            : 'OK',
      density: effects.sensorDropout
        ? 'LOST'
        : effects.sensorLatency > 0
          ? 'LAGGED'
          : effects.sensorBias > 0
            ? 'DEGRADED'
            : 'OK',
      fusionPower: effects.sensorDropout
        ? 'LOST'
        : effects.sensorLatency > 0
          ? 'LAGGED'
          : effects.sensorBias > 0
            ? 'DEGRADED'
            : 'OK',
      coilTemperature: effects.sensorLatency > 0 ? 'LAGGED' : effects.sensorBias > 0 ? 'DEGRADED' : 'OK',
      coolantFlow: effects.sensorLatency > 0 ? 'LAGGED' : effects.sensorBias > 0 ? 'DEGRADED' : 'OK',
      vacuumPressure: effects.sensorDropout ? 'LOST' : effects.sensorLatency > 0 ? 'LAGGED' : 'OK',
      toroidalField: effects.sensorLatency > 0 ? 'LAGGED' : effects.sensorBias > 0 ? 'DEGRADED' : 'OK',
    };

    const withNoise = (value: number, scale: number): number =>
      Math.max(0, value * (1 + n * scale) + n * scale * 0.01 * Math.abs(value));

    if (effects.sensorDropout) {
      return {
        temperatureKeV: null,
        density: null,
        fusionPowerMW: null,
        coilTemperatureK: withNoise(base.coilTemp, 0.01),
        coolantFlowKgS: withNoise(base.flow, 0.01),
        vacuumPressurePa: null,
        toroidalFieldT: withNoise(base.field, 0.01),
        status,
      };
    }

    return {
      temperatureKeV: withNoise(base.temperature * bias, 0.02),
      density: withNoise(base.density / bias, 0.02),
      fusionPowerMW: withNoise(base.fusionPower / bias, 0.03),
      coilTemperatureK: withNoise(base.coilTemp, 0.01),
      coolantFlowKgS: withNoise(base.flow, 0.01),
      vacuumPressurePa: Math.max(1e-8, base.vacuum * (1 + n * 0.05)),
      toroidalFieldT: withNoise(base.field, 0.005),
      status,
    };
  }

  private equipmentList(effects: FaultEffects): EquipmentItem[] {
    const heatingStatusNbi = heatingSystemStatus(
      this.controls.nbiPowerMW,
      1 - 0.78 * effects.heatingDroop,
      this.status === 'EMERGENCY_STOP',
    );
    const heatingStatusEch = heatingSystemStatus(
      this.controls.echPowerMW,
      1 - 0.45 * effects.heatingDroop,
      this.status === 'EMERGENCY_STOP',
    );
    const heatingStatusIch = heatingSystemStatus(
      this.controls.ichPowerMW,
      1 - 0.4 * effects.heatingDroop,
      this.status === 'EMERGENCY_STOP',
    );
    const tStatus = turbineStatus({
      thermalPowerMW: this.thermalPowerMW,
      outletC: this.coolantOutletC,
      exchangerLoadPct: this.heatExchangerLoadPct,
      tripped: this.heatExchangerLoadPct > 145,
    });
    const gStatus = generatorStatus(tStatus, this.power.electricalOutputMW);
    const cStatus = cryoStatus(this.cryoLoad, effects.coolantLoss > 0.7);

    const coilStatus: EquipmentItem['status'] =
      this.coilTemperatureK > COIL_LIMITS.quenchK
        ? 'FAULT'
        : this.coilTemperatureK > COIL_LIMITS.criticalK
          ? 'DEGRADED'
          : this.coilCurrentKA > 1
            ? 'RUNNING'
            : 'STANDBY';

    return [
      {
        id: 'tf-coil',
        name: 'Toroidal Field Coils',
        subsystem: 'MAGNET',
        status: coilStatus,
        online: coilStatus !== 'FAULT',
        detail: `${this.coilCurrentKA.toFixed(1)} kA / ${this.fieldToroidalT.toFixed(2)} T`,
      },
      {
        id: 'pf-coil',
        name: 'Poloidal Field Coils',
        subsystem: 'MAGNET',
        status: this.plasmaCurrentMA > 0.5 ? 'RUNNING' : 'STANDBY',
        online: true,
        detail: `${this.fieldPoloidalT.toFixed(2)} T edge`,
      },
      {
        id: 'cryo',
        name: 'Cryogenic Plant',
        subsystem: 'MAGNET',
        status: cStatus,
        online: cStatus !== 'FAULT',
        detail: `${this.cryoLoad.toFixed(0)} % load`,
      },
      {
        id: 'nbi',
        name: 'Neutral Beam Injector',
        subsystem: 'HEATING',
        status: heatingStatusNbi,
        online: heatingStatusNbi !== 'FAULT' && heatingStatusNbi !== 'TRIPPED',
        detail: `${this.controls.nbiPowerMW.toFixed(0)} MW command`,
      },
      {
        id: 'ech',
        name: 'Electron Cyclotron',
        subsystem: 'HEATING',
        status: heatingStatusEch,
        online: heatingStatusEch !== 'FAULT' && heatingStatusEch !== 'TRIPPED',
        detail: `${this.controls.echPowerMW.toFixed(0)} MW command`,
      },
      {
        id: 'ich',
        name: 'Ion Cyclotron',
        subsystem: 'HEATING',
        status: heatingStatusIch,
        online: heatingStatusIch !== 'FAULT' && heatingStatusIch !== 'TRIPPED',
        detail: `${this.controls.ichPowerMW.toFixed(0)} MW command`,
      },
      {
        id: 'coolant-pump',
        name: 'Primary Coolant Pumps',
        subsystem: 'COOLING',
        status: effects.coolantLoss > 0.4 ? 'DEGRADED' : this.coolantFlowKgS > 500 ? 'RUNNING' : 'STANDBY',
        online: true,
        detail: `${this.coolantFlowKgS.toFixed(0)} kg/s`,
      },
      {
        id: 'heat-exchanger',
        name: 'Heat Exchanger',
        subsystem: 'COOLING',
        status:
          this.heatExchangerLoadPct > 92 ? 'DEGRADED' : this.thermalPowerMW > 20 ? 'RUNNING' : 'STANDBY',
        online: this.heatExchangerLoadPct < 145,
        detail: `${this.heatExchangerLoadPct.toFixed(0)} % duty`,
      },
      {
        id: 'turbine',
        name: 'Steam Turbine',
        subsystem: 'POWER',
        status: tStatus,
        online: tStatus !== 'TRIPPED',
        detail: tStatus === 'STANDBY' ? 'awaiting thermal duty' : `${this.thermalPowerMW.toFixed(0)} MWth in`,
      },
      {
        id: 'generator',
        name: 'Generator',
        subsystem: 'POWER',
        status: gStatus,
        online: gStatus !== 'TRIPPED',
        detail: `${this.power.electricalOutputMW.toFixed(1)} MWe out`,
      },
      {
        id: 'vacuum-pumps',
        name: 'Vacuum Pumping',
        subsystem: 'VACUUM',
        status: effects.vacuumLeakPaPerS > 0 ? 'DEGRADED' : 'RUNNING',
        online: true,
        detail: `${this.vacuumPressurePa.toExponential(1)} Pa`,
      },
      {
        id: 'plasma-control',
        name: 'Plasma Control System',
        subsystem: 'CONTROL',
        status:
          this.stabilityMetrics.stability < 0.5 ? 'DEGRADED' : this.status === 'IDLE' ? 'STANDBY' : 'RUNNING',
        online: true,
        detail: `stability ${(this.stabilityMetrics.stability * 100).toFixed(0)} %`,
      },
    ];
  }

  snapshot(): SimFrame {
    const effects = this.faultEffects();
    const equipment = this.equipmentList(effects);
    const sensors = this.buildSensors(effects);
    const devicesOnline = equipment.filter((item) => item.online).length;

    return {
      simTimeS: this.simTimeS,
      wallTimeMs: this.wallTimeMs || Date.now(),
      stepCount: this.stepCount,
      status: this.status,
      phase: this.phase,
      scenarioName: this.scenarioName,
      runId: this.runId,
      plasma: {
        temperatureKeV: this.temperatureKeV,
        electronDensity: this.density,
        currentMA: this.plasmaCurrentMA,
        pressureKPa: plasmaPressureKPa(this.density, this.temperatureKeV),
        confinementTimeS: this.tauE,
        volumeM3: MACHINE.plasmaVolumeM3,
        elongation: MACHINE.elongation,
        triangularity: MACHINE.triangularity,
        storedEnergyMJ: this.storedEnergyMJ,
        stability: this.stabilityMetrics.stability,
        reactivity: this.reactivity,
        alphaPowerMW: this.alphaMW,
        radiatedPowerMW: this.radiatedMW,
      },
      magnetic: {
        toroidalFieldT: this.fieldToroidalT,
        poloidalFieldT: this.fieldPoloidalT,
        coilCurrentKA: this.coilCurrentKA,
        coilCurrentSetpointKA: this.controls.coilCurrentSetpointKA,
        fieldStability: this.fieldQuality,
        coilTemperatureK: this.coilTemperatureK,
        cryoLoadPct: this.cryoLoad,
        betaN: this.betaN,
        greenwaldFraction: this.greenwald,
        q95: this.q95,
      },
      heating: {
        nbiDeliveredMW:
          this.controls.nbiPowerMW * HEATING_EFFICIENCY.nbiCoupling * (1 - 0.78 * effects.heatingDroop),
        echDeliveredMW:
          this.controls.echPowerMW * HEATING_EFFICIENCY.echCoupling * (1 - 0.45 * effects.heatingDroop),
        ichDeliveredMW:
          this.controls.ichPowerMW * HEATING_EFFICIENCY.ichCoupling * (1 - 0.4 * effects.heatingDroop),
        totalDeliveredMW: this.power.auxiliaryHeatingMW,
        wallPlugMW: this.power.loads.heating,
        nbiStatus: heatingSystemStatus(
          this.controls.nbiPowerMW,
          1 - 0.78 * effects.heatingDroop,
          this.status === 'EMERGENCY_STOP',
        ),
        echStatus: heatingSystemStatus(
          this.controls.echPowerMW,
          1 - 0.45 * effects.heatingDroop,
          this.status === 'EMERGENCY_STOP',
        ),
        ichStatus: heatingSystemStatus(
          this.controls.ichPowerMW,
          1 - 0.4 * effects.heatingDroop,
          this.status === 'EMERGENCY_STOP',
        ),
      },
      thermal: {
        coolantInletC: this.coolantInletC,
        coolantOutletC: this.coolantOutletC,
        coolantFlowKgS: this.coolantFlowKgS,
        thermalPowerMW: this.thermalPowerMW,
        heatExchangerLoadPct: this.heatExchangerLoadPct,
        turbineStatus: turbineStatus({
          thermalPowerMW: this.thermalPowerMW,
          outletC: this.coolantOutletC,
          exchangerLoadPct: this.heatExchangerLoadPct,
          tripped: this.heatExchangerLoadPct > 145,
        }),
        generatorStatus: generatorStatus(
          turbineStatus({
            thermalPowerMW: this.thermalPowerMW,
            outletC: this.coolantOutletC,
            exchangerLoadPct: this.heatExchangerLoadPct,
            tripped: this.heatExchangerLoadPct > 145,
          }),
          this.power.electricalOutputMW,
        ),
        cryoStatus: cryoStatus(this.cryoLoad, effects.coolantLoss > 0.7),
        vacuumPressurePa: this.vacuumPressurePa,
        coolantDeltaTK: this.coolantDeltaT,
      },
      power: this.power,
      stability: this.stabilityMetrics,
      equipment,
      sensors,
      activeFaults: this.faults.filter((f) => f.active).map((f) => f.kind),
      alarms: this.alarms,
      config: { ...this.config },
      controls: { ...this.controls },
      devicesOnline,
      devicesTotal: equipment.length,
      disturbances: {
        slow: this.disturbanceSlow,
        noise: this.disturbanceNoise,
      },
    };
  }

  /** All faults (active and historical) for the diagnostics timeline. */
  faultHistory(): FaultInstance[] {
    return this.faults;
  }

  alarmHistory(): AlarmRecord[] {
    return this.alarms;
  }

  raisedAlarmCount(): number {
    return this.raisedCount;
  }

  private emitEvent(
    category: EventRecord['category'],
    level: EventRecord['level'],
    message: string,
    detail?: string,
  ): void {
    const event: EventRecord = {
      id: `evt-${++this.eventSequence}-${Math.round(this.simTimeS * 1000)}`,
      tS: this.simTimeS,
      wallMs: Date.now(),
      category,
      level,
      message,
      detail,
    };
    this.hooks.onEvent?.(event);
  }
}

/** Reduce a history series into the metric summary used for comparisons. */
export function summarizeSeries(series: HistorySample[]): WhatIfResult['summary'] {
  const empty: WhatIfResult['summary'] = {
    finalTemperatureKeV: 0,
    peakTemperatureKeV: 0,
    finalFusionPowerMW: 0,
    peakFusionPowerMW: 0,
    meanHeatingMW: 0,
    finalQPlasma: null,
    finalQEngineering: null,
    finalStability: 1,
    minStability: 1,
    finalNetElectricMW: 0,
    integratedThermalGJ: 0,
    integratedNetElectricGJ: 0,
    integratedHeatingGJ: 0,
    finalCoilTempK: 0,
    finalCoolantOutC: 0,
    finalDensity: 0,
    alarms: 0,
  };
  if (!series.length) return empty;

  let integratedThermalGJ = 0;
  let integratedNetElectricGJ = 0;
  let integratedHeatingGJ = 0;
  let peakTemperature = 0;
  let peakFusion = 0;
  let minStability = 1;

  for (let i = 0; i < series.length; i += 1) {
    const sample = series[i];
    peakTemperature = Math.max(peakTemperature, sample.temperature);
    peakFusion = Math.max(peakFusion, sample.fusionPower);
    minStability = Math.min(minStability, sample.stability);
    if (i > 0) {
      const dt = Math.max(0, sample.t - series[i - 1].t);
      const prev = series[i - 1];
      integratedThermalGJ += ((sample.thermalPower + prev.thermalPower) / 2) * dt * 1e-3;
      integratedNetElectricGJ += ((sample.netElectric + prev.netElectric) / 2) * dt * 1e-3;
      integratedHeatingGJ += ((sample.heatingPower + prev.heatingPower) / 2) * dt * 1e-3;
    }
  }

  const last = series[series.length - 1];
  const meanHeating = series.reduce((acc, s) => acc + s.heatingPower, 0) / Math.max(series.length, 1);

  return {
    finalTemperatureKeV: last.temperature,
    peakTemperatureKeV: peakTemperature,
    finalFusionPowerMW: last.fusionPower,
    peakFusionPowerMW: peakFusion,
    meanHeatingMW: meanHeating,
    finalQPlasma: last.qPlasma,
    finalQEngineering: last.qEngineering,
    finalStability: last.stability,
    minStability,
    finalNetElectricMW: last.netElectric,
    integratedThermalGJ,
    integratedNetElectricGJ,
    integratedHeatingGJ,
    finalCoilTempK: last.coilTemperature,
    finalCoolantOutC: last.coolantOut,
    finalDensity: last.density,
    alarms: 0,
  };
}

export type { HistoryChannel, InitialConditions, SimConfig, ControlInputs };
export { PHYS };

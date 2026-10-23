/**
 * Physical constants, machine reference geometry and model coefficients.
 *
 * The device defined here is a *generic ITER-like DEMO geometry* used to give the
 * simplified models plausible orders of magnitude. It is NOT the parameter set of
 * any operating machine and must not be used for engineering decisions.
 */

export const PHYS = {
  /** Elementary charge, J/keV. */
  keVToJoule: 1.602176634e-16,
  /** Vacuum permeability, H/m. */
  mu0: 4 * Math.PI * 1e-7,
  /** D-T fusion energy release, MeV. */
  dTFusionMeV: 17.59,
  /** D-T fusion energy release, J. */
  dTFusionJoule: 17.59 * 1.602176634e-13,
  /** Fraction of D-T energy carried by the alpha particle. */
  alphaFraction: 0.2,
  /** Specific heat of the primary coolant (water-like), J/(kg*K). */
  coolantCp: 4180,
} as const;

/** Reference machine geometry — generic ITER-like tokamak, DEMO values only. */
export const MACHINE = {
  majorRadiusM: 6.2,
  minorRadiusM: 2.0,
  plasmaVolumeM3: 830,
  elongation: 1.7,
  triangularity: 0.33,
  /** Toroidal field coils. */
  tfCoilCount: 18,
  /** Turns per toroidal field coil. */
  tfTurnsPerCoil: 134,
  /** Total ampere-turns factor (18 x 134). */
  tfTotalTurns: 18 * 134,
  /** Reference on-axis toroidal field at the reference coil current, T. */
  referenceToroidalFieldT: 5.3,
  /** Reference total TF coil current, kA. */
  referenceCoilCurrentKA: 68,
  /** Number of poloidal field coils modelled. */
  pfCoilCount: 6,

  /* --- thermal / electrical plant --- */
  /** Rankine cycle thermal-to-electric efficiency at design point. */
  thermalEfficiency: 0.33,
  /** Heat exchanger / steam generator rated duty, MW. */
  heatExchangerRatedMW: 700,
  /** Turbine minimum thermal input to stay on line, MW. */
  turbineMinThermalMW: 60,

  /* --- electrical loads (MW) --- */
  cryoNominalMW: 32,
  magnetSupplyNominalMW: 22,
  coolantPumpNominalMW: 18,
  vacuumPumpNominalMW: 6,
  controlRackMW: 4.5,
  /** Coolant pump power scales with the cube of flow fraction. */
  pumpFlowExponent: 3,
} as const;

/** Wall-plug efficiencies of the auxiliary heating systems. */
export const HEATING_EFFICIENCY = {
  /** Neutral beam: acceleration + beamline. */
  nbiWallPlug: 0.35,
  /** Electron cyclotron: gyrotron efficiency. */
  echWallPlug: 0.5,
  /** Ion cyclotron: RF source efficiency. */
  ichWallPlug: 0.6,
  /** Fraction of delivered power actually coupled to the plasma. */
  nbiCoupling: 0.85,
  echCoupling: 0.82,
  ichCoupling: 0.76,
} as const;

/** Lumped time constants. Compressed for interactive demonstration. */
export const DYNAMICS = {
  /** Plasma current ramp rate time constant, s. */
  currentTauS: 3.0,
  /** Density response time constant, s. */
  densityTauS: 4.0,
  /** Coil current L/R time constant, s. */
  coilCurrentTauS: 1.4,
  /** Coil cold-mass thermal capacitance, J/K (lumped, demo-scale). */
  coilHeatCapacityJK: 9000,
  /** Coil-to-cryogen conductance, W/K. */
  coilCoolingConductanceWK: 260,
  /** Cryogen temperature, K. */
  cryogenTemperatureK: 4.3,
  /** Coil ohmic resistance, ohm (joints + leads). */
  coilResistanceOhm: 1.4e-7,
  /** Coolant loop thermal inertia time constant, s. */
  coolantTauS: 6.0,
  /** Vacuum vessel wall / first wall thermal time constant, s. */
  wallTauS: 2.5,
  /** Slow disturbance period, simulated seconds. */
  disturbancePeriodS: 42,
} as const;

/** Coil quench / thermal limits used by the diagnostics. */
export const COIL_LIMITS = {
  warningK: 22,
  criticalK: 45,
  quenchK: 60,
  nominalK: 5.5,
} as const;

/** Engineering limits used by alarms and stability scoring. */
export const LIMITS = {
  temperatureWarnKeV: 24,
  temperatureCritKeV: 32,
  temperatureMinKeV: 1.0,
  betaNwarn: 2.9,
  betaNcrit: 3.6,
  betaNLimit: 3.5,
  greenwaldWarn: 0.92,
  greenwaldCrit: 1.0,
  vacuumWarnPa: 1e-3,
  vacuumCritPa: 1e-2,
  coolantOutWarnC: 330,
  coolantOutCritC: 380,
  inletWarnC: 275,
  inletCritC: 300,
  cryoWarnPct: 85,
  cryoCritPct: 98,
  fieldDeviationWarnPct: 5,
  stabilityWarn: 0.62,
  stabilityCrit: 0.4,
  heatExchangerWarnPct: 92,
} as const;

/** Sample interval for the in-memory history ring buffer, simulated seconds. */
export const HISTORY_SAMPLE_INTERVAL_S = 0.5;
/** Maximum samples retained in memory. */
export const HISTORY_CAPACITY = 4800;
/** Simulation substep (integrator step), simulated seconds. */
export const FIXED_STEP_S = 0.05;
/** Maximum substeps consumed in a single animation frame (guards against stalls). */
export const MAX_SUBSTEPS_PER_FRAME = 40;
/** UI publish rate for the live snapshot, Hz. */
export const PUBLISH_HZ = 12;
/** Chart refresh rate, Hz. */
export const CHART_HZ = 4;

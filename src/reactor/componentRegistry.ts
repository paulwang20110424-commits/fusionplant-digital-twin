import type { FaultKind, ReactorComponentId, SimFrame } from '@/types/simulation';
import type { PageId } from '@/store/simulationStore';

/**
 * Device registry: the single mapping between 3D components, equipment-list
 * rows, console pages and fault types.
 *
 * `slug` is the stable external identifier used in the URL
 * (?selectedComponent=tf-coils) and in documentation.
 */
export interface ComponentDescriptor {
  id: ReactorComponentId;
  slug: string;
  label: string;
  short: string;
  page: PageId;
  /** IDs used by the equipment list (frame.equipment[].id). */
  equipmentIds: string[];
  /** Faults that directly affect this component. */
  affectedBy: FaultKind[];
  description: string;
  /** "Target" value, i.e. the commanded setpoint for this component. */
  target: (frame: SimFrame) => string;
  metrics: (frame: SimFrame) => Array<{ label: string; value: string }>;
}

const num = (value: number | null | undefined, digits = 2): string =>
  value === null || value === undefined || !Number.isFinite(value) ? 'N/A' : value.toFixed(digits);

export const COMPONENT_REGISTRY: Record<ReactorComponentId, ComponentDescriptor> = {
  plasma: {
    id: 'plasma',
    slug: 'plasma',
    label: 'Plasma Column',
    short: 'Plasma',
    page: 'REACTOR',
    equipmentIds: ['plasma-control'],
    affectedBy: ['HEATING_DROOP', 'MAGNETIC_DISTURBANCE', 'COOLANT_LOSS', 'VACUUM_LEAK'],
    description:
      'The D-T plasma torus. Colour and intensity follow the simulated core temperature; the glow is a schematic illustration, not a radiation transport solution.',
    target: (frame) => `${num(frame.controls.nbiPowerMW, 1)} MW NBI commanded`,
    metrics: (frame) => [
      { label: 'Temperature', value: `${num(frame.plasma.temperatureKeV)} keV` },
      { label: 'Density', value: `${num(frame.plasma.electronDensity / 1e19)} ×10¹⁹ m⁻³` },
      { label: 'Plasma current', value: `${num(frame.plasma.currentMA)} MA` },
      { label: 'Stored energy', value: `${num(frame.plasma.storedEnergyMJ, 1)} MJ` },
      { label: 'Fusion power', value: `${num(frame.power.fusionPowerMW, 1)} MW` },
      { label: 'Stability index', value: `${num(frame.stability.stability * 100, 0)} %` },
    ],
  },
  'vacuum-vessel': {
    id: 'vacuum-vessel',
    slug: 'vacuum-vessel',
    label: 'Vacuum Vessel',
    short: 'Vessel',
    page: 'REACTOR',
    equipmentIds: ['vacuum-pumps'],
    affectedBy: ['VACUUM_LEAK'],
    description:
      'Double-wall toroidal vessel enclosing the plasma. Rendered transparent so the internal components stay visible.',
    target: (frame) => `${num(frame.thermal.vacuumPressurePa * 1000, 1)}e-3 Pa target band`,
    metrics: (frame) => [
      { label: 'Vessel pressure', value: `${frame.thermal.vacuumPressurePa.toExponential(2)} Pa` },
      { label: 'Thermal load', value: `${num(frame.thermal.thermalPowerMW, 0)} MW` },
      { label: 'Coolant outlet', value: `${num(frame.thermal.coolantOutletC, 1)} °C` },
      { label: 'Plasma volume', value: `${num(frame.plasma.volumeM3, 0)} m³` },
    ],
  },
  'tf-coil': {
    id: 'tf-coil',
    slug: 'tf-coils',
    label: 'Toroidal Field Coils',
    short: 'TF Coils',
    page: 'MAGNETIC',
    equipmentIds: ['tf-coil'],
    affectedBy: ['COIL_OVERHEAT', 'MAGNETIC_DISTURBANCE'],
    description:
      '18 D-shaped superconducting coils. Field follows B = mu0·N·I/(2πR0); the cold mass has a lumped thermal balance.',
    target: (frame) => `${num(frame.magnetic.coilCurrentSetpointKA, 1)} kA setpoint`,
    metrics: (frame) => [
      { label: 'Coil current', value: `${num(frame.magnetic.coilCurrentKA, 1)} kA` },
      { label: 'Toroidal field', value: `${num(frame.magnetic.toroidalFieldT)} T` },
      { label: 'Coil temperature', value: `${num(frame.magnetic.coilTemperatureK)} K` },
      { label: 'Cryogenic load', value: `${num(frame.magnetic.cryoLoadPct, 0)} %` },
      { label: 'Field quality', value: `${num(frame.magnetic.fieldStability * 100, 0)} %` },
    ],
  },
  'pf-coil': {
    id: 'pf-coil',
    slug: 'pf-coils',
    label: 'Poloidal Field Coils',
    short: 'PF Coils',
    page: 'MAGNETIC',
    equipmentIds: ['pf-coil'],
    affectedBy: ['MAGNETIC_DISTURBANCE'],
    description:
      'Seven ring coils that shape the plasma equilibrium and provide vertical position control. Only the aggregate field is modelled.',
    target: (frame) => `${num(frame.controls.plasmaCurrentTargetMA, 2)} MA plasma current request`,
    metrics: (frame) => [
      { label: 'Poloidal field', value: `${num(frame.magnetic.poloidalFieldT)} T` },
      { label: 'Plasma current', value: `${num(frame.plasma.currentMA)} MA` },
      { label: 'Safety factor q95', value: num(frame.magnetic.q95) },
      { label: 'Elongation κ', value: num(frame.plasma.elongation) },
    ],
  },
  'central-solenoid': {
    id: 'central-solenoid',
    slug: 'central-solenoid',
    label: 'Central Solenoid',
    short: 'Solenoid',
    page: 'MAGNETIC',
    equipmentIds: ['pf-coil'],
    affectedBy: ['MAGNETIC_DISTURBANCE'],
    description:
      'Six-module solenoid that drives the plasma current inductively in this simplified model. No current-drive physics is represented.',
    target: (frame) => `${num(frame.controls.plasmaCurrentTargetMA, 2)} MA request`,
    metrics: (frame) => [
      { label: 'Plasma current', value: `${num(frame.plasma.currentMA)} MA` },
      { label: 'Flux state', value: frame.plasma.currentMA > 1 ? 'DISCHARGING' : 'CHARGED' },
    ],
  },
  divertor: {
    id: 'divertor',
    slug: 'divertor',
    label: 'Divertor',
    short: 'Divertor',
    page: 'COOLING',
    equipmentIds: ['heat-exchanger'],
    affectedBy: ['COOLANT_LOSS'],
    description:
      'Exhaust region. In this model the full fusion + auxiliary thermal power leaves through the first wall and divertor into the primary coolant.',
    target: (frame) => `${num(frame.controls.coolantFlowKgS, 0)} kg/s coolant flow`,
    metrics: (frame) => [
      { label: 'Exhaust power', value: `${num(frame.thermal.thermalPowerMW, 0)} MW` },
      { label: 'Coolant ΔT', value: `${num(frame.thermal.coolantDeltaTK, 1)} K` },
      { label: 'Heat exchanger', value: `${num(frame.thermal.heatExchangerLoadPct, 0)} %` },
    ],
  },
  cryostat: {
    id: 'cryostat',
    slug: 'cryostat',
    label: 'Cryostat',
    short: 'Cryostat',
    page: 'MAGNETIC',
    equipmentIds: ['cryo'],
    affectedBy: ['COIL_OVERHEAT', 'COOLANT_LOSS'],
    description: 'Thermal envelope around the superconducting magnets, rendered as a wireframe shell.',
    target: () => 'cryo load < 85 %',
    metrics: (frame) => [
      { label: 'Cryo load', value: `${num(frame.magnetic.cryoLoadPct, 0)} %` },
      { label: 'Cryo status', value: frame.thermal.cryoStatus },
      { label: 'Cold mass', value: `${num(frame.magnetic.coilTemperatureK)} K` },
    ],
  },
  'neutral-beam': {
    id: 'neutral-beam',
    slug: 'neutral-beam-injector',
    label: 'Neutral Beam Injector',
    short: 'NBI',
    page: 'HEATING',
    equipmentIds: ['nbi'],
    affectedBy: ['HEATING_DROOP'],
    description:
      'Not modelled geometrically — select it from the component list. Beamline delivery and wall-plug load are simulated.',
    target: (frame) => `${num(frame.controls.nbiPowerMW, 1)} MW commanded`,
    metrics: (frame) => [
      { label: 'Delivered', value: `${num(frame.heating.nbiDeliveredMW, 1)} MW` },
      { label: 'Commanded', value: `${num(frame.controls.nbiPowerMW, 1)} MW` },
      { label: 'Grid draw', value: `${num(frame.controls.nbiPowerMW / 0.35, 1)} MW` },
    ],
  },
  'coolant-manifold': {
    id: 'coolant-manifold',
    slug: 'coolant-manifold',
    label: 'Coolant Manifold',
    short: 'Coolant',
    page: 'COOLING',
    equipmentIds: ['coolant-pump', 'heat-exchanger'],
    affectedBy: ['COOLANT_LOSS'],
    description: 'Aggregate primary loop representation — no individual pipework is modelled.',
    target: (frame) => `${num(frame.controls.coolantFlowKgS, 0)} kg/s requested`,
    metrics: (frame) => [
      { label: 'Flow', value: `${num(frame.thermal.coolantFlowKgS, 0)} kg/s` },
      {
        label: 'Inlet / outlet',
        value: `${num(frame.thermal.coolantInletC, 0)} / ${num(frame.thermal.coolantOutletC, 0)} °C`,
      },
      { label: 'Pump power', value: `${num(frame.power.loads.coolantPumps, 1)} MW` },
    ],
  },
};

export const COMPONENT_LIST = Object.values(COMPONENT_REGISTRY);

/** External slug → internal component id (accepts the singular legacy forms too). */
export function componentFromSlug(slug: string | null | undefined): ReactorComponentId | null {
  if (!slug) return null;
  const normalized = slug.trim().toLowerCase();
  const direct = COMPONENT_LIST.find((entry) => entry.slug === normalized);
  if (direct) return direct.id;
  const aliases: Record<string, ReactorComponentId> = {
    'tf-coil': 'tf-coil',
    'pf-coil': 'pf-coil',
    'vacuum-vessel': 'vacuum-vessel',
    'central-solenoid': 'central-solenoid',
    divertor: 'divertor',
    cryostat: 'cryostat',
    plasma: 'plasma',
    'neutral-beam': 'neutral-beam',
    'coolant-manifold': 'coolant-manifold',
  };
  return aliases[normalized] ?? null;
}

/** Equipment-list row id → component id. */
export function componentFromEquipmentId(equipmentId: string): ReactorComponentId | null {
  const entry = COMPONENT_LIST.find((candidate) => candidate.equipmentIds.includes(equipmentId));
  return entry ? entry.id : null;
}

/** Components directly affected by each fault type. */
export const FAULT_AFFECTED_COMPONENTS: Record<FaultKind, ReactorComponentId[]> = {
  HEATING_DROOP: ['neutral-beam', 'plasma'],
  MAGNETIC_DISTURBANCE: ['tf-coil', 'pf-coil', 'plasma'],
  COIL_OVERHEAT: ['tf-coil', 'cryostat'],
  COOLANT_LOSS: ['coolant-manifold', 'divertor', 'plasma'],
  VACUUM_LEAK: ['vacuum-vessel', 'plasma'],
  SENSOR_BIAS: [],
  SENSOR_DROPOUT: [],
  SENSOR_LATENCY: [],
};

/**
 * Illustrative propagation chain for the selected fault.
 * This is a schematic ordering of affected sub-systems, not a fault tree
 * calculation — the UI labels it "simulated propagation".
 */
export const FAULT_PROPAGATION: Record<FaultKind, ReactorComponentId[]> = {
  HEATING_DROOP: ['neutral-beam', 'plasma', 'divertor', 'coolant-manifold'],
  MAGNETIC_DISTURBANCE: ['tf-coil', 'pf-coil', 'plasma', 'divertor'],
  COIL_OVERHEAT: ['tf-coil', 'cryostat', 'plasma'],
  COOLANT_LOSS: ['coolant-manifold', 'divertor', 'plasma', 'cryostat'],
  VACUUM_LEAK: ['vacuum-vessel', 'plasma'],
  SENSOR_BIAS: [],
  SENSOR_DROPOUT: [],
  SENSOR_LATENCY: [],
};

/** Set of 3D components that should show a fault state right now. */
export function faultedComponents(activeFaults: FaultKind[]): ReactorComponentId[] {
  const set = new Set<ReactorComponentId>();
  for (const fault of activeFaults) {
    for (const component of FAULT_AFFECTED_COMPONENTS[fault] ?? []) set.add(component);
  }
  return [...set];
}

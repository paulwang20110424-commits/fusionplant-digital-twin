import type { FaultDefinition, FaultKind } from '@/types/simulation';

/**
 * Virtual fault catalogue. Every entry has a real consequence model inside
 * FusionSimulationEngine — nothing here is decorative.
 *
 * Recovery steps are SIMULATION instructions (what to click), not real reactor
 * procedures. This platform does not represent any safety system.
 */
export const FAULT_DEFINITIONS: FaultDefinition[] = [
  {
    kind: 'HEATING_DROOP',
    name: 'Auxiliary Heating Power Droop',
    shortName: 'HEATING DROOP',
    subsystem: 'HEATING',
    description:
      'Beamline / RF source degradation. Delivered power falls below the commanded value, so the plasma loses heating and the burn condition decays.',
    adjustable: true,
    affectedParameters: [
      'NBI delivered power',
      'ECH delivered power',
      'Plasma temperature',
      'Fusion power',
      'Q_plasma',
    ],
    diagnosis:
      'Commanded versus delivered auxiliary power diverge. Every heating channel reports below command while plasma temperature falls with the confinement-limited time constant.',
    recoverySteps: [
      'Clear the HEATING_DROOP fault in the FAULT INJECTION panel.',
      'If the plasma has cooled, raise auxiliary heating gradually in the SIMULATION LAB.',
      'Check that density and field setpoints remain inside the operating envelope.',
    ],
  },
  {
    kind: 'MAGNETIC_DISTURBANCE',
    name: 'Magnetic Field Disturbance',
    shortName: 'B-FIELD DISTURB',
    subsystem: 'MAGNET',
    description:
      'Field error coil misalignment injects a toroidal field error plus broadband MHD activity. Confinement and field quality degrade.',
    adjustable: true,
    affectedParameters: ['Toroidal field', 'Field quality', 'Confinement time', 'Stability index', 'beta_N'],
    diagnosis:
      'Toroidal field deviates from the value implied by the coil current. Field quality drops and the confinement H-factor multiplier is penalised.',
    recoverySteps: [
      'Clear the disturbance to restore the nominal field.',
      'Increase the coil current setpoint only within the 20-80 kA validated range.',
      'Observe field quality recovering before raising heating power again.',
    ],
  },
  {
    kind: 'COIL_OVERHEAT',
    name: 'TF Coil Cold-Mass Overheat',
    shortName: 'COIL OVERHEAT',
    subsystem: 'MAGNET',
    description:
      'Additional heat load on the toroidal field coil cold mass. Temperature rises towards the simulated quench threshold and the cryogenic plant load follows.',
    adjustable: true,
    affectedParameters: ['Coil temperature', 'Cryogenic load', 'Field quality', 'Stability index'],
    diagnosis:
      'Cold-mass temperature rises without a matching current increase. Cryogenic load tracks the excess heat, indicating a cooling-path restriction rather than an electrical fault.',
    recoverySteps: [
      'Inspect the cryogenic load trend and clear the injected heat source.',
      'Restore coolant flow in the SIMULATION LAB if it was reduced.',
      'Wait for the cold mass to return below 10 K before trusting field quality again.',
    ],
  },
  {
    kind: 'COOLANT_LOSS',
    name: 'Primary Coolant Flow Loss',
    shortName: 'COOLANT LOSS',
    subsystem: 'COOLING',
    description:
      'Pump trip or valve closure reduces primary flow. The loop temperature rise increases, cold-leg temperature climbs and the cryogenic capacity is reduced.',
    adjustable: true,
    affectedParameters: [
      'Coolant flow',
      'Coolant outlet temperature',
      'Heat exchanger load',
      'Coil temperature',
      'Thermal efficiency',
    ],
    diagnosis:
      'Flow drops while thermal duty is unchanged, so dT = Q/(m_dot cp) increases. Inlet temperature climbs if the exchanger becomes overloaded.',
    recoverySteps: [
      'Clear the fault to restore nominal flow.',
      'Raise the coolant flow setpoint and confirm the outlet temperature falls.',
      'Reduce auxiliary heating if the outlet temperature approaches the 300 degC limit.',
    ],
  },
  {
    kind: 'VACUUM_LEAK',
    name: 'Vacuum Vessel Leak',
    shortName: 'VACUUM LEAK',
    subsystem: 'VACUUM',
    description:
      'Air ingress raises vessel pressure. Pumping cannot keep up, and the stability index is penalised as vacuum quality degrades.',
    adjustable: true,
    affectedParameters: ['Vacuum pressure', 'Stability index', 'Plasma performance'],
    diagnosis:
      'Pressure rises monotonically with a time constant set by the pumping capacity, while no gas injection change has been commanded.',
    recoverySteps: [
      'Clear the leak fault.',
      'Allow the simulated pump-down to bring pressure back below 1e-4 Pa.',
      'Confirm the vacuum alarm has cleared before restarting a discharge.',
    ],
  },
  {
    kind: 'SENSOR_BIAS',
    name: 'Diagnostic Sensor Bias',
    shortName: 'SENSOR BIAS',
    subsystem: 'CONTROL',
    description:
      'Measurement offset on core diagnostics. The physics state is unaffected: only the reported values drift, which is exactly the trap an operator must recognise.',
    adjustable: true,
    affectedParameters: ['Measured temperature', 'Measured density', 'Measured fusion power'],
    diagnosis:
      'Reported values disagree with the plant model while no physical response follows. Cross-check with the derived (model) values in the DIAGNOSTICS page.',
    recoverySteps: [
      'Clear the sensor bias fault to restore nominal readings.',
      'Compare MEASURED and SIMULATED columns in the diagnostics table.',
      'Remember that alarms use the simulated state, not the biased measurement.',
    ],
  },
  {
    kind: 'SENSOR_DROPOUT',
    name: 'Sensor Signal Loss',
    shortName: 'SIGNAL LOST',
    subsystem: 'CONTROL',
    description:
      'Core diagnostic channels return no data. The UI shows SIGNAL LOST and the control loop falls back to model estimation.',
    adjustable: false,
    affectedParameters: ['Measured temperature', 'Measured density', 'Measured fusion power', 'Vacuum'],
    diagnosis: 'Measurement channels report null while the simulated plant continues to evolve normally.',
    recoverySteps: [
      'Clear the signal loss fault.',
      'Confirm all channels return to OK status in the diagnostics table.',
    ],
  },
  {
    kind: 'SENSOR_LATENCY',
    name: 'Diagnostic Latency',
    shortName: 'LATENCY',
    subsystem: 'CONTROL',
    description:
      'Diagnostic transport delay. Displayed values lag the true state, so an operator sees transients late.',
    adjustable: true,
    affectedParameters: ['All measured channels', 'Alarm timing perception'],
    diagnosis: 'Measured values track the model with a constant delay; the offset grows with the injected severity.',
    recoverySteps: ['Clear the latency fault.', 'Wait for the transport delay to drain before acting on fast transients.'],
  },
];

export const FAULT_MAP: Record<FaultKind, FaultDefinition> = Object.fromEntries(
  FAULT_DEFINITIONS.map((definition) => [definition.kind, definition]),
) as Record<FaultKind, FaultDefinition>;

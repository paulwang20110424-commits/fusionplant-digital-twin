import { describe, expect, it } from 'vitest';
import {
  alphaPowerMW,
  confinementTimeS,
  fusionPowerMW,
  fusionReactivity,
  greenwaldFraction,
  integratePlasmaTemperature,
  normalizedBeta,
  plasmaPressureKPa,
  radiatedPowerMW,
  safetyFactorProxy,
  storedEnergyMJ,
  temperatureFromEnergyMJ,
} from '@/simulation/PlasmaModel';
import {
  coilOhmicLossW,
  cryoLoadPct,
  fieldQuality,
  poloidalFieldT,
  stepCoilCurrent,
  stepCoilTemperature,
  toroidalFieldT,
} from '@/simulation/MagneticFieldModel';
import {
  computeHeatingDelivery,
  heatingElectricalLoadMW,
  heatingWasteHeatMW,
} from '@/simulation/HeatingModel';
import { computePowerBalance } from '@/simulation/PowerBalanceModel';
import {
  coolantDeltaTK,
  heatExchangerLoadPct,
  stepCoolantTemperatures,
  stepVacuumPressure,
} from '@/simulation/ThermalModel';
import { computeStability } from '@/simulation/StabilityModel';
import { DEFAULT_CONTROLS } from '@/simulation/controlSpecs';
import type { PowerBalanceInput } from '@/simulation/PowerBalanceModel';

const powerInput = (overrides: Partial<PowerBalanceInput> = {}): PowerBalanceInput => ({
  fusionPowerMW: 200,
  heatingDeliveredMW: 50,
  wasteHeatMW: 0,
  toroidalFieldT: 5.3,
  coilCurrentKA: 68,
  coolantFlowKgS: 12000,
  cryoLoadPct: 60,
  thermalEfficiency: 0.33,
  controls: DEFAULT_CONTROLS,
  heatingGridMW: 144,
  ...overrides,
});

describe('PlasmaModel', () => {
  it('produces a physically plausible D-T reactivity', () => {
    // <sigma v> at 10 keV should be ~1e-22 m^3/s and rise steeply up to ~20 keV.
    const at10 = fusionReactivity(10);
    expect(at10).toBeGreaterThan(4e-23);
    expect(at10).toBeLessThan(2e-22);
    expect(fusionReactivity(20)).toBeGreaterThan(at10);
    expect(fusionReactivity(2)).toBeLessThan(at10);
  });

  it('scales fusion power with density squared and volume', () => {
    const base = fusionPowerMW(1e20, 10, 830);
    expect(base).toBeGreaterThan(300);
    expect(base).toBeLessThan(600);
    // doubling density quadruples the reaction rate
    expect(fusionPowerMW(2e20, 10, 830) / base).toBeCloseTo(4, 3);
    // doubling volume doubles the power
    expect(fusionPowerMW(1e20, 10, 1660) / base).toBeCloseTo(2, 3);
  });

  it('guards against invalid inputs', () => {
    expect(fusionPowerMW(0, 10)).toBe(0);
    expect(fusionPowerMW(-1e20, 10)).toBe(0);
    expect(fusionPowerMW(Number.NaN, 10)).toBe(0);
    expect(fusionPowerMW(1e20, 0)).toBe(0);
    expect(plasmaPressureKPa(Number.NaN, Number.NaN)).toBe(0);
    expect(radiatedPowerMW(0, 0)).toBe(0);
    expect(alphaPowerMW(-5)).toBe(0);
  });

  it('keeps stored energy and temperature consistent', () => {
    const energy = storedEnergyMJ(1e20, 10, 830);
    expect(energy).toBeGreaterThan(350);
    expect(energy).toBeLessThan(450);
    expect(temperatureFromEnergyMJ(energy, 1e20, 830)).toBeCloseTo(10, 6);
  });

  it('follows IPB98(y,2) trends', () => {
    const base = { currentMA: 15, toroidalFieldT: 5.3, lossPowerMW: 100, electronDensity: 1e20, hFactor: 1 };
    const tau = confinementTimeS(base);
    expect(tau).toBeGreaterThan(1.5);
    expect(tau).toBeLessThan(6);
    // degraded by heating power, improved by current
    expect(confinementTimeS({ ...base, lossPowerMW: 200 })).toBeLessThan(tau);
    expect(confinementTimeS({ ...base, currentMA: 17 })).toBeGreaterThan(tau);
    // the H-factor multiplies the scaling linearly
    expect(confinementTimeS({ ...base, hFactor: 1.5 }) / tau).toBeCloseTo(1.5, 6);
  });

  it('computes beta and density limit proxies', () => {
    expect(normalizedBeta(1e20, 10, 5.3, 15)).toBeGreaterThan(0.5);
    expect(normalizedBeta(1e20, 10, 5.3, 15)).toBeLessThan(6);
    expect(greenwaldFraction(1e20, 15)).toBeGreaterThan(0.5);
    expect(greenwaldFraction(1e20, 15)).toBeLessThan(1.2);
    expect(safetyFactorProxy(5.3, 15)).toBeGreaterThan(1.5);
    expect(safetyFactorProxy(5.3, 0)).toBeGreaterThan(10);
  });

  it('integrates towards a steady state and never goes negative', () => {
    let temperature = 1;
    for (let index = 0; index < 4000; index += 1) {
      temperature = integratePlasmaTemperature({
        temperatureKeV: temperature,
        electronDensity: 1e20,
        volumeM3: 830,
        absorbedAuxMW: 50,
        alphaMW: alphaPowerMW(fusionPowerMW(1e20, temperature)),
        radiatedMW: radiatedPowerMW(1e20, temperature),
        confinementTimeS: 3,
        dt: 0.05,
      });
    }
    expect(temperature).toBeGreaterThan(1);
    expect(temperature).toBeLessThan(40);
    expect(Number.isFinite(temperature)).toBe(true);
  });
});

describe('MagneticFieldModel', () => {
  it('derives the toroidal field from coil current', () => {
    expect(toroidalFieldT(68)).toBeCloseTo(5.29, 1);
    expect(toroidalFieldT(0)).toBe(0);
    expect(toroidalFieldT(120)).toBeGreaterThan(toroidalFieldT(68));
  });

  it('derives the poloidal field from plasma current', () => {
    expect(poloidalFieldT(15)).toBeGreaterThan(1);
    expect(poloidalFieldT(0)).toBe(0);
  });

  it('slews the coil current towards the setpoint without overshoot', () => {
    let current = 0;
    const samples: number[] = [];
    for (let index = 0; index < 200; index += 1) {
      current = stepCoilCurrent(current, 68, 0.05);
      samples.push(current);
    }
    expect(current).toBeGreaterThan(67);
    expect(current).toBeLessThanOrEqual(68);
    expect(samples.every((value) => value <= 68.0001)).toBe(true);
  });

  it('heats the coil when cryogenic capacity is lost and cools it otherwise', () => {
    let hot = 5;
    for (let index = 0; index < 600; index += 1) {
      hot = stepCoilTemperature({
        temperatureK: hot,
        coilCurrentKA: 68,
        previousCurrentKA: 68,
        extraHeatW: 14000,
        cryoCapacity: 1,
        dt: 0.05,
      });
    }
    let cold = 8;
    for (let index = 0; index < 600; index += 1) {
      cold = stepCoilTemperature({
        temperatureK: cold,
        coilCurrentKA: 68,
        previousCurrentKA: 68,
        extraHeatW: 0,
        cryoCapacity: 1,
        dt: 0.05,
      });
    }
    expect(hot).toBeGreaterThan(20);
    expect(cold).toBeLessThan(8);
    expect(coilOhmicLossW(68)).toBeGreaterThan(0);
    expect(cryoLoadPct(hot, 68, 14000)).toBeGreaterThan(cryoLoadPct(cold, 68, 0));
  });

  it('degrades field quality with a field error and cold-mass heating', () => {
    const healthy = fieldQuality({
      actualFieldT: 5.3,
      requestedFieldT: 5.3,
      coilTemperatureK: 5.2,
      disturbance: 0,
    });
    const faulty = fieldQuality({
      actualFieldT: 4.6,
      requestedFieldT: 5.3,
      coilTemperatureK: 40,
      disturbance: 0.6,
    });
    expect(healthy).toBeGreaterThan(0.9);
    expect(faulty).toBeLessThan(0.6);
  });
});

describe('HeatingModel', () => {
  it('applies coupling and wall-plug efficiencies', () => {
    const delivery = computeHeatingDelivery(DEFAULT_CONTROLS);
    const commanded = DEFAULT_CONTROLS.nbiPowerMW + DEFAULT_CONTROLS.echPowerMW + DEFAULT_CONTROLS.ichPowerMW;
    expect(delivery.totalDeliveredMW).toBeLessThan(commanded);
    expect(delivery.wallPlugMW).toBeGreaterThan(delivery.totalDeliveredMW);
    expect(heatingElectricalLoadMW(DEFAULT_CONTROLS)).toBeCloseTo(delivery.wallPlugMW, 6);
  });

  it('reduces delivery when availability drops', () => {
    const nominal = computeHeatingDelivery(DEFAULT_CONTROLS);
    const degraded = computeHeatingDelivery(DEFAULT_CONTROLS, { nbi: 0.22, ech: 0.55, ich: 0.6 });
    expect(degraded.totalDeliveredMW).toBeLessThan(nominal.totalDeliveredMW * 0.7);
  });

  it('recovers waste heat only up to the configured fraction', () => {
    const delivery = computeHeatingDelivery(DEFAULT_CONTROLS);
    expect(heatingWasteHeatMW(delivery, 0)).toBe(0);
    expect(heatingWasteHeatMW(delivery, 1)).toBeCloseTo(delivery.wallPlugMW - delivery.totalDeliveredMW, 6);
  });
});

describe('PowerBalanceModel', () => {
  it('computes a net-negative balance for the reference operating point', () => {
    const balance = computePowerBalance(powerInput(), 350);
    expect(balance.thermalOutputMW).toBe(250);
    expect(balance.electricalOutputMW).toBeCloseTo(82.5, 6);
    expect(balance.netElectricMW).toBeLessThan(0);
    expect(balance.qPlasma).toBeCloseTo(4, 6);
    expect(balance.qEngineering).toBeLessThan(0);
  });

  it('returns N/A instead of Infinity when the auxiliary power is zero', () => {
    const balance = computePowerBalance(powerInput({ fusionPowerMW: 0, heatingDeliveredMW: 0 }), 0);
    expect(balance.qPlasma).toBeNull();
    expect(balance.qEngineering).not.toBeNull();
    expect(Number.isFinite(balance.qEngineering as number)).toBe(true);
  });

  it('keeps the engineering gain finite when the heating grid load is zero', () => {
    // Cryogenic, magnet and control loads are structural, so the denominator stays
    // positive and Q_engineering remains a finite number rather than Infinity.
    const balance = computePowerBalance(powerInput({ heatingGridMW: 0 }), 0);
    expect(balance.loads.cryogenics).toBeGreaterThan(0);
    expect(balance.qEngineering).not.toBeNull();
    expect(Number.isFinite(balance.qEngineering as number)).toBe(true);
  });

  it('never reports an infinite gain', () => {
    for (const heating of [0, 1, 10, 50, 200]) {
      for (const fusion of [0, 1, 100, 1000]) {
        const balance = computePowerBalance(
          powerInput({ fusionPowerMW: fusion, heatingDeliveredMW: heating }),
          0,
        );
        expect(balance.qPlasma === null || Number.isFinite(balance.qPlasma)).toBe(true);
        expect(balance.qEngineering === null || Number.isFinite(balance.qEngineering)).toBe(true);
      }
    }
  });
});

describe('ThermalModel', () => {
  it('computes the loop temperature rise from flow and duty', () => {
    expect(coolantDeltaTK(420, 12000)).toBeCloseTo(420e6 / (12000 * 4180), 6);
    expect(coolantDeltaTK(420, 4000)).toBeGreaterThan(coolantDeltaTK(420, 12000));
    expect(coolantDeltaTK(0, 12000)).toBe(0);
  });

  it('scales heat-exchanger capacity with flow', () => {
    expect(heatExchangerLoadPct(420, 12000)).toBeGreaterThan(heatExchangerLoadPct(420, 16000));
    expect(heatExchangerLoadPct(2000, 4000)).toBeGreaterThan(100);
  });

  it('relaxes the loop temperatures with inertia', () => {
    let state = { inletC: 240, outletC: 240 };
    for (let index = 0; index < 400; index += 1) {
      state = stepCoolantTemperatures({
        inletC: state.inletC,
        outletC: state.outletC,
        thermalPowerMW: 400,
        flowKgS: 6000,
        requestedInletC: 240,
        exchangerAvailability: 1,
        dt: 0.05,
      });
    }
    expect(state.outletC - state.inletC).toBeGreaterThan(10);
    expect(state.outletC).toBeLessThan(400);
  });

  it('integrates vacuum pressure towards the leak equilibrium', () => {
    let pressure = 4e-6;
    for (let index = 0; index < 400; index += 1) {
      pressure = stepVacuumPressure({
        pressurePa: pressure,
        leakRatePaPerS: 8e-3,
        pumpingAvailability: 1,
        dt: 0.05,
      });
    }
    expect(pressure).toBeGreaterThan(1e-3);
    expect(pressure).toBeLessThan(1);
  });
});

describe('StabilityModel', () => {
  it('scores a nominal state high and a stressed state low', () => {
    const nominal = computeStability({
      betaLimitFraction: 0.4,
      densityLimitFraction: 0.7,
      coilThermalMargin: 1,
      fieldQuality: 1,
      vacuumPressurePa: 4e-6,
      temperatureKeV: 8,
      disturbance: 0,
      thermalOverloadPct: 40,
    });
    const stressed = computeStability({
      betaLimitFraction: 2.5,
      densityLimitFraction: 1.3,
      coilThermalMargin: 0.1,
      fieldQuality: 0.3,
      vacuumPressurePa: 1e-2,
      temperatureKeV: 1,
      disturbance: 0.9,
      thermalOverloadPct: 160,
    });
    expect(nominal.metrics.stability).toBeGreaterThan(0.85);
    expect(stressed.metrics.stability).toBeLessThan(0.3);
    expect(nominal.metrics.riskDriver).toBe('Nominal');
    expect(stressed.terms.some((term) => term.value > 0.1)).toBe(true);
  });
});

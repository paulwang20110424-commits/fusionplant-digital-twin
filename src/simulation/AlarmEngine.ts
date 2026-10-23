import type { AlarmLevel, AlarmRecord, SimFrame } from '@/types/simulation';
import { LIMITS } from './constants';

interface Rule {
  id: string;
  level: AlarmLevel;
  source: string;
  /** Returns a message when the alarm condition holds, otherwise null. */
  test: (frame: SimFrame) => { message: string; value: string } | null;
  cooldownS: number;
}

const fmt = (value: number, digits = 2): string =>
  Number.isFinite(value) ? value.toFixed(digits) : 'N/A';

/**
 * AlarmEngine — rule-based supervision of the simulated plant.
 *
 * Every alarm is derived from the simulation state; nothing is decorative. Rules
 * have a cooldown so a slowly drifting parameter does not spam the event log.
 */
export class AlarmEngine {
  private active = new Map<string, AlarmRecord>();
  private lastRaise = new Map<string, number>();
  private sequence = 0;

  private rules: Rule[] = [
    {
      id: 'plasma-temp-high',
      level: 'WARNING',
      source: 'PLASMA',
      cooldownS: 25,
      test: (f) =>
        f.plasma.temperatureKeV > LIMITS.temperatureWarnKeV
          ? {
              message: `Plasma temperature above ${LIMITS.temperatureWarnKeV} keV`,
              value: `${fmt(f.plasma.temperatureKeV, 2)} keV`,
            }
          : null,
    },
    {
      id: 'plasma-temp-critical',
      level: 'CRITICAL',
      source: 'PLASMA',
      cooldownS: 25,
      test: (f) =>
        f.plasma.temperatureKeV > LIMITS.temperatureCritKeV
          ? {
              message: `Plasma temperature above ${LIMITS.temperatureCritKeV} keV — first-wall load model saturating`,
              value: `${fmt(f.plasma.temperatureKeV, 2)} keV`,
            }
          : null,
    },
    {
      id: 'plasma-temp-low',
      level: 'WARNING',
      source: 'PLASMA',
      cooldownS: 30,
      test: (f) =>
        f.status === 'RUNNING' && f.plasma.temperatureKeV < LIMITS.temperatureMinKeV && f.heating.totalDeliveredMW > 5
          ? {
              message: 'Plasma heating below burn threshold (possible radiative collapse)',
              value: `${fmt(f.plasma.temperatureKeV, 3)} keV`,
            }
          : null,
    },
    {
      id: 'beta-limit',
      level: 'WARNING',
      source: 'MAGNET',
      cooldownS: 25,
      test: (f) =>
        f.magnetic.betaN > LIMITS.betaNwarn
          ? {
              message: `Normalised beta above ${LIMITS.betaNwarn} (Troyon limit margin shrinking)`,
              value: `beta_N ${fmt(f.magnetic.betaN, 2)}`,
            }
          : null,
    },
    {
      id: 'beta-critical',
      level: 'CRITICAL',
      source: 'MAGNET',
      cooldownS: 25,
      test: (f) =>
        f.magnetic.betaN > LIMITS.betaNcrit
          ? {
              message: `Normalised beta above ${LIMITS.betaNcrit} — ideal MHD limit proxy exceeded`,
              value: `beta_N ${fmt(f.magnetic.betaN, 2)}`,
            }
          : null,
    },
    {
      id: 'density-limit',
      level: 'WARNING',
      source: 'PLASMA',
      cooldownS: 25,
      test: (f) =>
        f.magnetic.greenwaldFraction > LIMITS.greenwaldWarn
          ? {
              message: 'Density approaching the Greenwald limit',
              value: `n/n_GW ${fmt(f.magnetic.greenwaldFraction, 2)}`,
            }
          : null,
    },
    {
      id: 'density-limit-critical',
      level: 'CRITICAL',
      source: 'PLASMA',
      cooldownS: 25,
      test: (f) =>
        f.magnetic.greenwaldFraction > LIMITS.greenwaldCrit
          ? {
              message: 'Density above the Greenwald limit — disruption risk in a real device',
              value: `n/n_GW ${fmt(f.magnetic.greenwaldFraction, 2)}`,
            }
          : null,
    },
    {
      id: 'coil-temp',
      level: 'WARNING',
      source: 'MAGNET',
      cooldownS: 30,
      test: (f) =>
        f.magnetic.coilTemperatureK > 22
          ? {
              message: 'TF coil cold-mass temperature above warning threshold',
              value: `${fmt(f.magnetic.coilTemperatureK, 1)} K`,
            }
          : null,
    },
    {
      id: 'coil-temp-critical',
      level: 'CRITICAL',
      source: 'MAGNET',
      cooldownS: 30,
      test: (f) =>
        f.magnetic.coilTemperatureK > 45
          ? {
              message: 'TF coil approaching simulated quench threshold',
              value: `${fmt(f.magnetic.coilTemperatureK, 1)} K`,
            }
          : null,
    },
    {
      id: 'cryo-load',
      level: 'WARNING',
      source: 'CRYOGENICS',
      cooldownS: 30,
      test: (f) =>
        f.magnetic.cryoLoadPct > LIMITS.cryoWarnPct
          ? {
              message: 'Cryogenic system load above 85% of capacity',
              value: `${fmt(f.magnetic.cryoLoadPct, 0)} %`,
            }
          : null,
    },
    {
      id: 'field-deviation',
      level: 'WARNING',
      source: 'MAGNET',
      cooldownS: 25,
      test: (f) => {
        const requested = f.magnetic.coilCurrentSetpointKA;
        const deviation = Math.abs(f.magnetic.coilCurrentKA - requested) / Math.max(requested, 1);
        return deviation > 0.05
          ? {
              message: 'Toroidal field coil current deviating from setpoint',
              value: `${fmt(deviation * 100, 1)} %`,
            }
          : null;
      },
    },
    {
      id: 'stability-low',
      level: 'WARNING',
      source: 'CONTROL',
      cooldownS: 25,
      test: (f) =>
        f.stability.stability < LIMITS.stabilityWarn
          ? {
              message: 'Composite plasma stability index degraded',
              value: `${fmt(f.stability.stability * 100, 0)} %`,
            }
          : null,
    },
    {
      id: 'stability-critical',
      level: 'CRITICAL',
      source: 'CONTROL',
      cooldownS: 25,
      test: (f) =>
        f.stability.stability < LIMITS.stabilityCrit
          ? {
              message: `Stability index below ${LIMITS.stabilityCrit} — simulated discharge termination recommended`,
              value: `${fmt(f.stability.stability * 100, 0)} %`,
            }
          : null,
    },
    {
      id: 'vacuum',
      level: 'WARNING',
      source: 'VACUUM',
      cooldownS: 25,
      test: (f) =>
        f.thermal.vacuumPressurePa > LIMITS.vacuumWarnPa
          ? {
              message: 'Vacuum vessel pressure above operating limit',
              value: `${f.thermal.vacuumPressurePa.toExponential(2)} Pa`,
            }
          : null,
    },
    {
      id: 'vacuum-critical',
      level: 'CRITICAL',
      source: 'VACUUM',
      cooldownS: 25,
      test: (f) =>
        f.thermal.vacuumPressurePa > LIMITS.vacuumCritPa
          ? {
              message: 'Vacuum lost — simulation requires shutdown and pump-down',
              value: `${f.thermal.vacuumPressurePa.toExponential(2)} Pa`,
            }
          : null,
    },
    {
      id: 'heat-exchanger',
      level: 'WARNING',
      source: 'COOLING',
      cooldownS: 30,
      test: (f) =>
        f.thermal.heatExchangerLoadPct > LIMITS.heatExchangerWarnPct
          ? {
              message: 'Heat exchanger loading above 92% of effective duty',
              value: `${fmt(f.thermal.heatExchangerLoadPct, 0)} %`,
            }
          : null,
    },
    {
      id: 'coolant-hot',
      level: 'WARNING',
      source: 'COOLING',
      cooldownS: 25,
      test: (f) =>
        f.thermal.coolantOutletC > LIMITS.coolantOutWarnC
          ? {
              message: 'Coolant outlet temperature above 210 degC',
              value: `${fmt(f.thermal.coolantOutletC, 1)} degC`,
            }
          : null,
    },
    {
      id: 'coolant-hot-critical',
      level: 'CRITICAL',
      source: 'COOLING',
      cooldownS: 25,
      test: (f) =>
        f.thermal.coolantOutletC > LIMITS.coolantOutCritC
          ? {
              message: 'Coolant outlet temperature above 300 degC — thermal trip simulated',
              value: `${fmt(f.thermal.coolantOutletC, 1)} degC`,
            }
          : null,
    },
    {
      id: 'inlet-hot',
      level: 'WARNING',
      source: 'COOLING',
      cooldownS: 30,
      test: (f) =>
        f.thermal.coolantInletC > LIMITS.inletWarnC
          ? {
              message: 'Cold-leg temperature rising — heat rejection insufficient',
              value: `${fmt(f.thermal.coolantInletC, 1)} degC`,
            }
          : null,
    },
    {
      id: 'net-import',
      level: 'INFO',
      source: 'POWER',
      cooldownS: 90,
      test: (f) =>
        f.power.netElectricMW < 0 && f.power.thermalOutputMW > 50
          ? {
              message: 'Plant is a net electricity consumer at this operating point',
              value: `${fmt(f.power.netElectricMW, 1)} MWe`,
            }
          : null,
    },
    {
      id: 'heating-droop',
      level: 'WARNING',
      source: 'HEATING',
      cooldownS: 30,
      test: (f) => {
        const commanded = f.controls.nbiPowerMW + f.controls.echPowerMW + f.controls.ichPowerMW;
        if (commanded < 5) return null;
        const ratio = f.heating.totalDeliveredMW / commanded;
        return ratio < 0.75
          ? {
              message: 'Auxiliary heating delivery well below command',
              value: `${fmt(ratio * 100, 0)} % of command`,
            }
          : null;
      },
    },
    {
      id: 'emergency',
      level: 'CRITICAL',
      source: 'CONTROL',
      cooldownS: 15,
      test: (f) =>
        f.status === 'EMERGENCY_STOP'
          ? { message: 'Emergency stop latched — simulated discharge terminated', value: 'SCRAM' }
          : null,
    },
  ];

  /** Evaluate every rule against the frame, raising/clearing as required. */
  evaluate(frame: SimFrame): { raised: AlarmRecord[]; cleared: AlarmRecord[] } {
    const raised: AlarmRecord[] = [];
    const cleared: AlarmRecord[] = [];
    const now = frame.simTimeS;

    for (const rule of this.rules) {
      const result = rule.test(frame);
      const existing = this.active.get(rule.id);

      if (result && !existing) {
        const last = this.lastRaise.get(rule.id) ?? -Infinity;
        if (now - last < rule.cooldownS && now >= last) {
          // Within the cooldown window: keep it suppressed.
          continue;
        }
        const alarm: AlarmRecord = {
          id: `alarm-${++this.sequence}`,
          ruleId: rule.id,
          level: rule.level,
          source: rule.source,
          message: result.message,
          value: result.value,
          raisedAtS: now,
          clearedAtS: null,
          active: true,
        };
        this.active.set(rule.id, alarm);
        this.lastRaise.set(rule.id, now);
        raised.push(alarm);
      } else if (!result && existing) {
        existing.active = false;
        existing.clearedAtS = now;
        this.active.delete(rule.id);
        cleared.push(existing);
      }
    }

    return { raised, cleared };
  }

  activeAlarms(): AlarmRecord[] {
    return [...this.active.values()];
  }

  reset(): void {
    this.active.clear();
    this.lastRaise.clear();
    this.sequence = 0;
  }
}

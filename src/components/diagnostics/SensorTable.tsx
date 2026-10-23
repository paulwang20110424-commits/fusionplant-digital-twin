import { useSimulationStore } from '@/store/simulationStore';
import { StatusChip } from '@/components/ui/StatusChip';
import { deviationPct } from '@/utils/power';
import type { SensorStatus } from '@/types/simulation';
import { formatNumber, formatScientific } from '@/utils/units';

const SENSOR_TONE: Record<SensorStatus, string> = {
  OK: 'text-emerald-300',
  LOST: 'text-red-300',
  DEGRADED: 'text-amber-300',
  LAGGED: 'text-sky-300',
};

interface Row {
  key: string;
  label: string;
  unit: string;
  simulated: string;
  measured: string;
  measuredRaw: number | null;
  simulatedRaw: number;
  status: SensorStatus;
}

export function SensorTable() {
  const frame = useSimulationStore((state) => state.frame);
  const sensors = frame.sensors;

  const rows: Row[] = [
    {
      key: 'temperature',
      label: 'Plasma temperature',
      unit: 'keV',
      simulated: formatNumber(frame.plasma.temperatureKeV, 3),
      measured: sensors.temperatureKeV === null ? 'SIGNAL LOST' : formatNumber(sensors.temperatureKeV, 3),
      measuredRaw: sensors.temperatureKeV,
      simulatedRaw: frame.plasma.temperatureKeV,
      status: sensors.status.temperature ?? 'OK',
    },
    {
      key: 'density',
      label: 'Electron density',
      unit: '1e19 m⁻³',
      simulated: formatNumber(frame.plasma.electronDensity / 1e19, 3),
      measured: sensors.density === null ? 'SIGNAL LOST' : formatNumber(sensors.density / 1e19, 3),
      measuredRaw: sensors.density === null ? null : sensors.density / 1e19,
      simulatedRaw: frame.plasma.electronDensity / 1e19,
      status: sensors.status.density ?? 'OK',
    },
    {
      key: 'fusionPower',
      label: 'Fusion power',
      unit: 'MW',
      simulated: formatNumber(frame.power.fusionPowerMW, 2),
      measured: sensors.fusionPowerMW === null ? 'SIGNAL LOST' : formatNumber(sensors.fusionPowerMW, 2),
      measuredRaw: sensors.fusionPowerMW,
      simulatedRaw: frame.power.fusionPowerMW,
      status: sensors.status.fusionPower ?? 'OK',
    },
    {
      key: 'coilTemperature',
      label: 'Coil temperature',
      unit: 'K',
      simulated: formatNumber(frame.magnetic.coilTemperatureK, 3),
      measured:
        sensors.coilTemperatureK === null ? 'SIGNAL LOST' : formatNumber(sensors.coilTemperatureK, 3),
      measuredRaw: sensors.coilTemperatureK,
      simulatedRaw: frame.magnetic.coilTemperatureK,
      status: sensors.status.coilTemperature ?? 'OK',
    },
    {
      key: 'coolantFlow',
      label: 'Coolant flow',
      unit: 'kg/s',
      simulated: formatNumber(frame.thermal.coolantFlowKgS, 1),
      measured:
        sensors.coolantFlowKgS === null ? 'SIGNAL LOST' : formatNumber(sensors.coolantFlowKgS, 1),
      measuredRaw: sensors.coolantFlowKgS,
      simulatedRaw: frame.thermal.coolantFlowKgS,
      status: sensors.status.coolantFlow ?? 'OK',
    },
    {
      key: 'vacuumPressure',
      label: 'Vacuum pressure',
      unit: 'Pa',
      simulated: formatScientific(frame.thermal.vacuumPressurePa, 3),
      measured:
        sensors.vacuumPressurePa === null ? 'SIGNAL LOST' : formatScientific(sensors.vacuumPressurePa, 3),
      measuredRaw: sensors.vacuumPressurePa,
      simulatedRaw: frame.thermal.vacuumPressurePa,
      status: sensors.status.vacuumPressure ?? 'OK',
    },
    {
      key: 'toroidalField',
      label: 'Toroidal field',
      unit: 'T',
      simulated: formatNumber(frame.magnetic.toroidalFieldT, 4),
      measured:
        sensors.toroidalFieldT === null ? 'SIGNAL LOST' : formatNumber(sensors.toroidalFieldT, 4),
      measuredRaw: sensors.toroidalFieldT,
      simulatedRaw: frame.magnetic.toroidalFieldT,
      status: sensors.status.toroidalField ?? 'OK',
    },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Channel</th>
            <th className="text-right">Simulated</th>
            <th className="text-right">Measured</th>
            <th className="text-right">Deviation</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="!font-sans !text-[10px] text-muted">
                {row.label} <span className="text-faint">[{row.unit}]</span>
              </td>
              <td className="text-right text-ink">{row.simulated}</td>
              <td className={`text-right ${SENSOR_TONE[row.status]}`}>{row.measured}</td>
              <td className="text-right text-muted">
                {row.measuredRaw === null ? '—' : deviationPct(row.measuredRaw, row.simulatedRaw)}
              </td>
              <td>
                <StatusChip
                  status={
                    row.status === 'OK'
                      ? 'RUNNING'
                      : row.status === 'LOST'
                        ? 'FAULT'
                        : row.status === 'DEGRADED'
                          ? 'DEGRADED'
                          : 'STANDBY'
                  }
                  label={row.status}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

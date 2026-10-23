import { useSimulationStore } from '@/store/simulationStore';
import { formatNumber } from '@/utils/units';

interface Segment {
  label: string;
  value: number;
  color: string;
}

function StackedBar({ segments, unit, digits = 0 }: { segments: Segment[]; unit: string; digits?: number }) {
  const total = segments.reduce((acc, segment) => acc + Math.max(0, segment.value), 0);
  const safeTotal = Math.max(total, 1e-6);

  return (
    <div>
      <div className="flex h-[26px] w-full overflow-hidden rounded-sm border border-edge/60 bg-[#04101a]">
        {segments.map((segment) => {
          const width = (Math.max(0, segment.value) / safeTotal) * 100;
          if (width < 0.2) return null;
          return (
            <div
              key={segment.label}
              className="group relative h-full transition-[width] duration-300"
              style={{ width: `${width}%`, background: `${segment.color}`, opacity: 0.85 }}
              title={`${segment.label}: ${formatNumber(segment.value, digits)} ${unit}`}
            >
              <span className="absolute inset-0 flex items-center justify-center overflow-hidden text-[8px] font-mono text-black/70">
                {width > 14 ? `${formatNumber(segment.value, digits)}` : ''}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {segments.map((segment) => (
          <span key={segment.label} className="flex items-center gap-1 text-[8.5px] text-muted">
            <span className="h-1.5 w-1.5 rounded-sm" style={{ background: segment.color }} />
            {segment.label}
            <span className="num text-ink">{formatNumber(segment.value, digits)}</span>
          </span>
        ))}
        <span className="ml-auto num text-[8.5px] text-faint">
          Σ {formatNumber(total, digits)} {unit}
        </span>
      </div>
    </div>
  );
}

/** Proportional energy-flow bars for generation, recirculation and the net result. */
export function EnergyFlowBars() {
  const power = useSimulationStore((state) => state.frame.power);

  const generationSegments: Segment[] = [
    { label: 'Gross electric', value: power.electricalOutputMW, color: '#34d399' },
    { label: 'Rejected heat', value: Math.max(0, power.thermalOutputMW - power.electricalOutputMW), color: '#334155' },
  ];

  const loadSegments: Segment[] = [
    { label: 'Heating', value: power.loads.heating, color: '#ef4444' },
    { label: 'Magnets', value: power.loads.magnets, color: '#818cf8' },
    { label: 'Cryogenics', value: power.loads.cryogenics, color: '#22d3ee' },
    { label: 'Coolant pumps', value: power.loads.coolantPumps, color: '#f59e0b' },
    { label: 'Vacuum', value: power.loads.vacuumPumps, color: '#2dd4bf' },
    { label: 'Controls', value: power.loads.controls, color: '#94a3b8' },
  ];

  const netPositive = power.netElectricMW >= 0;
  const netMagnitude = Math.min(100, (Math.abs(power.netElectricMW) / Math.max(power.plantAuxiliaryMW, 1)) * 100);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="label">Thermal → electrical conversion</span>
          <span className="num text-[9px] text-faint">
            {formatNumber(power.thermalOutputMW, 0)} MWth in · η {power.thermalOutputMW > 1 ? ((power.electricalOutputMW / power.thermalOutputMW) * 100).toFixed(1) : '0.0'}%
          </span>
        </div>
        <StackedBar segments={generationSegments} unit="MW" />
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="label">On-site electrical recirculation</span>
          <span className="num text-[9px] text-faint">{formatNumber(power.plantAuxiliaryMW, 1)} MWe total</span>
        </div>
        <StackedBar segments={loadSegments} unit="MW" digits={1} />
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="label">Net grid exchange</span>
          <span className={`num text-[11px] ${netPositive ? 'text-emerald-300' : 'text-red-300'}`}>
            {power.netElectricMW > 0 ? '+' : ''}
            {formatNumber(power.netElectricMW, 1)} MWe
            <span className="ml-1 text-[8px] text-faint">{netPositive ? 'EXPORT' : 'IMPORT'}</span>
          </span>
        </div>
        <div className="relative flex h-[26px] w-full items-center overflow-hidden rounded-sm border border-edge/60 bg-[#04101a]">
          <div className="absolute inset-y-0 left-1/2 w-px bg-edge2" />
          <div
            className={`absolute inset-y-0 transition-[width] duration-300 ${
              netPositive ? 'bg-emerald-500/60' : 'bg-red-500/60'
            }`}
            style={{
              left: netPositive ? '50%' : `${50 - netMagnitude / 2}%`,
              width: `${netMagnitude / 2}%`,
            }}
          />
          <span className="absolute inset-x-0 text-center text-[8px] tracking-[0.2em] text-white/50">
            {power.qEngineering === null ? 'Q_ENGINEERING N/A' : `Q_ENGINEERING ${power.qEngineering.toFixed(2)}`}
          </span>
        </div>
      </div>
    </div>
  );
}

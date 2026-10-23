import { useSimulationStore } from '@/store/simulationStore';
import { formatNumber } from '@/utils/units';

interface Stage {
  title: string;
  value: string;
  sub: string;
  tone: string;
}

function StageBox({ stage, x }: { stage: Stage; x: number }) {
  return (
    <g>
      <rect x={x} y={14} width={88} height={50} rx="2" fill="#071522" stroke={stage.tone} strokeOpacity="0.55" />
      <rect x={x} y={14} width={88} height={12} rx="2" fill={stage.tone} fillOpacity="0.14" />
      <text x={x + 6} y={23} fontSize="6.5" fontFamily="monospace" fill={stage.tone} letterSpacing="0.8">
        {stage.title}
      </text>
      <text x={x + 6} y={43} fontSize="10" fontFamily="monospace" fill="#d9f1ff">
        {stage.value}
      </text>
      <text x={x + 6} y={56} fontSize="6.5" fontFamily="monospace" fill="#46617a">
        {stage.sub}
      </text>
    </g>
  );
}

/** Process flow of the thermal / electrical chain with live values. */
export function ThermalLoopDiagram() {
  const frame = useSimulationStore((state) => state.frame);
  const thermal = frame.thermal;
  const power = frame.power;

  const stages: Stage[] = [
    { title: 'FUSION + AUX', value: `${formatNumber(power.thermalOutputMW, 0)} MW`, sub: 'heat into loop', tone: '#d946ef' },
    { title: 'FIRST WALL', value: `ΔT ${formatNumber(thermal.coolantDeltaTK, 1)} K`, sub: 'convective transfer', tone: '#22d3ee' },
    { title: 'HEAT EXCH.', value: `${formatNumber(thermal.heatExchangerLoadPct, 0)} %`, sub: 'of effective duty', tone: thermal.heatExchangerLoadPct > 92 ? '#f59e0b' : '#34d399' },
    { title: 'STEAM TURBINE', value: thermal.turbineStatus, sub: 'Rankine cycle', tone: '#38bdf8' },
    { title: 'GENERATOR', value: `${formatNumber(power.electricalOutputMW, 0)} MWe`, sub: 'gross output', tone: '#a3e635' },
  ];

  const netPositive = power.netElectricMW >= 0;

  return (
    <svg viewBox="0 0 490 170" className="h-full w-full" role="img" aria-label="Thermal and electrical process flow">
      <defs>
        <marker id="arrowHead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#1d3d5c" />
        </marker>
      </defs>

      {stages.map((stage, index) => {
        const x = 6 + index * 97;
        return (
          <g key={stage.title}>
            <StageBox stage={stage} x={x} />
            {index < stages.length - 1 && (
              <line
                x1={x + 88}
                y1={39}
                x2={x + 95}
                y2={39}
                stroke="#1d3d5c"
                strokeWidth="1.2"
                markerEnd="url(#arrowHead)"
              />
            )}
          </g>
        );
      })}

      {/* coolant loop */}
      <path
        d="M50 64 V92 H340 V64"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="1.1"
        strokeOpacity="0.45"
        strokeDasharray="4 3"
        className="flow-dash"
      />
      <circle cx="50" cy="92" r="2" fill="#22d3ee" opacity="0.8" />
      <text x="14" y="106" fontSize="6.5" fontFamily="monospace" fill="#22d3ee">
        T_out {formatNumber(thermal.coolantOutletC, 0)} °C
      </text>
      <text x="300" y="106" fontSize="6.5" fontFamily="monospace" fill="#7dd3fc">
        T_in {formatNumber(thermal.coolantInletC, 0)} °C
      </text>
      <text x="186" y="106" fontSize="6.5" fontFamily="monospace" fill="#46617a">
        {formatNumber(thermal.coolantFlowKgS, 0)} kg/s
      </text>

      {/* pump */}
      <g>
        <circle cx="50" cy="118" r="8" fill="#071522" stroke="#1d3d5c" />
        <path d="M46 122 L50 112 L54 122 Z" fill="#22d3ee" opacity="0.7" />
        <text x="64" y="121" fontSize="6.5" fontFamily="monospace" fill="#46617a">
          PUMP {formatNumber(power.loads.coolantPumps, 1)} MW
        </text>
      </g>

      {/* net result bar */}
      <g>
        <text x="6" y="146" fontSize="6.5" fontFamily="monospace" fill="#46617a" letterSpacing="1">
          NET TO GRID
        </text>
        <rect x="86" y="139" width="330" height="9" rx="1" fill="#0a1a28" stroke="#13263a" />
        <rect
          x="86"
          y="139"
          width={Math.min(330, (Math.abs(power.netElectricMW) / 400) * 330)}
          height="9"
          rx="1"
          fill={netPositive ? '#34d399' : '#ef4444'}
          fillOpacity="0.65"
        />
        <text x="424" y="147" fontSize="10" fontFamily="monospace" fill={netPositive ? '#6ee7b7' : '#fca5a5'}>
          {power.netElectricMW > 0 ? '+' : ''}
          {formatNumber(power.netElectricMW, 0)} MW
        </text>
      </g>
    </svg>
  );
}

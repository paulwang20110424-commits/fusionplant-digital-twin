import { useMemo } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { MACHINE } from '@/simulation/constants';
import { PF_COIL_POSITIONS, plasmaOutline, tfCoilOutline } from '@/simulation/tokamakGeometry';
import { formatNumber } from '@/utils/units';

const WIDTH = 440;
const HEIGHT = 380;
const R_MIN = 0;
const R_MAX = 13;
const Z_MAX = 8.6;

const px = (r: number) => 16 + ((r - R_MIN) / (R_MAX - R_MIN)) * (WIDTH - 32);
const py = (z: number) => HEIGHT / 2 - (z / Z_MAX) * (HEIGHT / 2 - 14);

const toPath = (points: Array<{ r: number; z: number }>, close = true) =>
  points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${px(point.r).toFixed(1)},${py(point.z).toFixed(1)}`)
    .join(' ') + (close ? ' Z' : '');

const vesselOutline = Array.from({ length: 73 }, (_, index) => {
  const theta = (index / 72) * Math.PI * 2;
  return {
    r: MACHINE.majorRadiusM + 2.55 * Math.cos(theta),
    z: 2.55 * Math.sin(theta),
  };
});

/**
 * Engineering cross-section diagram of the poloidal plane.
 * Every label is driven by the same live simulation state as the 3D view.
 */
export function CoilCrossSection() {
  const frame = useSimulationStore((state) => state.frame);
  const temperature = frame.plasma.temperatureKeV;

  const tfPath = useMemo(() => toPath(tfCoilOutline(84)), []);
  const plasmaPath = useMemo(() => toPath(plasmaOutline(72)), []);
  const vesselPath = useMemo(() => toPath(vesselOutline), []);

  const heat = Math.min(1, temperature / 20);
  const plasmaFill = `rgba(${Math.round(120 + 135 * heat)}, ${Math.round(40 + 60 * heat)}, ${Math.round(190 - 40 * heat)}, 0.55)`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-full w-full"
      role="img"
      aria-label="Tokamak poloidal cross-section"
    >
      <defs>
        <linearGradient id="vesselFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#173a52" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0a1b29" stopOpacity="0.45" />
        </linearGradient>
        <radialGradient id="plasmaFill">
          <stop offset="0%" stopColor="#f5d0fe" stopOpacity={0.9} />
          <stop offset="60%" stopColor={plasmaFill} />
          <stop offset="100%" stopColor={plasmaFill} stopOpacity="0.15" />
        </radialGradient>
        <pattern id="diagramGrid" width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M22 0 H0 V22" fill="none" stroke="#12283d" strokeWidth="0.5" opacity="0.55" />
        </pattern>
      </defs>

      <rect width={WIDTH} height={HEIGHT} fill="url(#diagramGrid)" />

      {/* major axis */}
      <line
        x1={px(MACHINE.majorRadiusM)}
        y1={8}
        x2={px(MACHINE.majorRadiusM)}
        y2={HEIGHT - 8}
        stroke="#22d3ee"
        strokeDasharray="3 6"
        strokeWidth="0.7"
        opacity="0.35"
      />
      <text x={px(MACHINE.majorRadiusM) + 4} y={16} fill="#46617a" fontSize="7" fontFamily="monospace">
        R = {MACHINE.majorRadiusM} m (magnetic axis)
      </text>

      {/* cryostat envelope */}
      <rect
        x={px(0.8)}
        y={py(7.9)}
        width={px(12) - px(0.8)}
        height={py(-7.9) - py(7.9)}
        rx="6"
        fill="none"
        stroke="#1b4a63"
        strokeDasharray="2 5"
        strokeWidth="0.8"
        opacity="0.5"
      />

      {/* vacuum vessel */}
      <path d={vesselPath} fill="url(#vesselFill)" stroke="#2f6f8d" strokeWidth="1.3" />
      <path
        d={vesselPath}
        fill="none"
        stroke="#67e8f9"
        strokeWidth="0.4"
        opacity="0.5"
        transform="scale(0.965) translate(8.3,6.3)"
      />

      {/* TF coils (three shown for clarity) */}
      {[0, 1, 2].map((index) => (
        <path
          key={`tf-${index}`}
          d={tfPath}
          fill="none"
          stroke="#3f8aad"
          strokeWidth={index === 0 ? 2.2 : 1}
          opacity={index === 0 ? 0.9 : 0.3}
          transform={`translate(${index * 1.5}, ${index * -1.5})`}
        />
      ))}

      {/* PF coils */}
      {PF_COIL_POSITIONS.map((coil, index) => (
        <g key={`pf-${index}`}>
          <circle
            cx={px(coil.radius)}
            cy={py(coil.y)}
            r={Math.max(5, coil.tube * 18)}
            fill="#102838"
            stroke="#67e8f9"
            strokeWidth="1"
            opacity="0.9"
          />
          <text
            x={px(coil.radius) + 9}
            y={py(coil.y) + 3}
            fill="#46617a"
            fontSize="6.5"
            fontFamily="monospace"
          >
            PF{index + 1}
          </text>
        </g>
      ))}

      {/* central solenoid */}
      <rect
        x={px(0.65)}
        y={py(5.2)}
        width={px(2.0) - px(0.65)}
        height={py(-5.2) - py(5.2)}
        fill="#12293a"
        stroke="#3f8aad"
        strokeWidth="1"
        rx="2"
      />
      <text
        x={px(1.32)}
        y={py(5.2) - 5}
        fill="#7dd3fc"
        fontSize="7"
        fontFamily="monospace"
        textAnchor="middle"
      >
        CS
      </text>

      {/* plasma */}
      <path
        d={plasmaPath}
        fill="url(#plasmaFill)"
        stroke="#e879f9"
        strokeWidth={0.8 + heat * 1.4}
        opacity={0.5 + heat * 0.4}
      />
      <text
        x={px(MACHINE.majorRadiusM)}
        y={py(-0.25)}
        fill="#f5d0fe"
        fontSize="9"
        fontFamily="monospace"
        textAnchor="middle"
        opacity="0.95"
      >
        {formatNumber(temperature, 1)} keV
      </text>
      <text
        x={px(MACHINE.majorRadiusM)}
        y={py(-0.95)}
        fill="#e879f9"
        fontSize="7"
        fontFamily="monospace"
        textAnchor="middle"
        opacity="0.75"
      >
        {formatNumber(frame.plasma.electronDensity / 1e19, 1)}e19 m⁻³ ·{' '}
        {formatNumber(frame.plasma.currentMA, 1)} MA
      </text>

      {/* divertor */}
      <path
        d={`M${px(MACHINE.majorRadiusM - 1.9)},${py(-2.4)} Q${px(MACHINE.majorRadiusM)},${py(-3.5)} ${px(MACHINE.majorRadiusM + 1.9)},${py(-2.4)}`}
        fill="none"
        stroke="#a16207"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.8"
      />
      <text
        x={px(MACHINE.majorRadiusM)}
        y={py(-3.9)}
        fill="#a16207"
        fontSize="6.5"
        fontFamily="monospace"
        textAnchor="middle"
      >
        DIVERTOR
      </text>

      {/* annotations */}
      <g fontFamily="monospace" fontSize="7" fill="#7dd3fc">
        <text x={px(9.4)} y={py(3.6)}>
          B_tor {formatNumber(frame.magnetic.toroidalFieldT, 2)} T
        </text>
        <text x={px(9.4)} y={py(2.8)} fill="#818cf8">
          I_coil {formatNumber(frame.magnetic.coilCurrentKA, 1)} kA
        </text>
        <text x={px(9.4)} y={py(2.0)} fill="#a78bfa">
          B_pol {formatNumber(frame.magnetic.poloidalFieldT, 2)} T
        </text>
        <text x={px(0.9)} y={py(-6.6)} fill="#67e8f9">
          TF COIL {frame.magnetic.coilTemperatureK.toFixed(1)} K
        </text>
        <text x={px(0.9)} y={py(-7.3)} fill="#6d89a6">
          CRYO {formatNumber(frame.magnetic.cryoLoadPct, 0)} %
        </text>
        <text x={px(8.6)} y={py(-4.4)} fill="#6d89a6">
          q95 {formatNumber(frame.magnetic.q95, 2)}
        </text>
        <text x={px(0.9)} y={py(7.0)} fill="#6d89a6">
          R0 {MACHINE.majorRadiusM} m · a {MACHINE.minorRadiusM} m · κ {MACHINE.elongation}
        </text>
      </g>

      <text
        x={WIDTH - 12}
        y={HEIGHT - 8}
        fill="#46617a"
        fontSize="6.5"
        fontFamily="monospace"
        textAnchor="end"
      >
        POLOIDAL CROSS-SECTION · SCHEMATIC · SIMULATED
      </text>
    </svg>
  );
}

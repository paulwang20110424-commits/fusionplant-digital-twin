import { computeStability } from '@/simulation/StabilityModel';
import { useSimulationStore } from '@/store/simulationStore';
import { Panel } from '@/components/ui/Panel';

/** Visual breakdown of the composite stability score, straight from the model terms. */
export function StabilityBreakdownPanel({ className = '' }: { className?: string }) {
  const frame = useSimulationStore((state) => state.frame);

  const breakdown = computeStability({
    betaLimitFraction: frame.magnetic.betaN / 3.5,
    densityLimitFraction: frame.magnetic.greenwaldFraction,
    coilThermalMargin: frame.stability.coilThermalMargin,
    fieldQuality: frame.stability.fieldQuality,
    vacuumPressurePa: frame.thermal.vacuumPressurePa,
    temperatureKeV: frame.plasma.temperatureKeV,
    disturbance: frame.disturbances.slow,
    thermalOverloadPct: frame.thermal.heatExchangerLoadPct,
  });

  const maxTerm = Math.max(0.05, ...breakdown.terms.map((term) => term.value));

  return (
    <Panel
      title="Stability Breakdown"
      subtitle={`composite ${(breakdown.metrics.stability * 100).toFixed(0)}%`}
      className={className}
      bodyClassName="!p-2"
    >
      <div className="mb-2 flex items-baseline justify-between">
        <span className="metric-value text-[24px] text-lime-300">
          {(breakdown.metrics.stability * 100).toFixed(0)}
          <span className="ml-1 text-[10px] text-faint">%</span>
        </span>
        <span className="text-right text-[9px] leading-tight text-muted">
          risk {(breakdown.metrics.riskScore * 100).toFixed(0)}%
          <br />
          <span className="text-faint">driver: {breakdown.metrics.riskDriver}</span>
        </span>
      </div>
      <div className="flex flex-col gap-[5px]">
        {breakdown.terms.map((term) => (
          <div key={term.label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[9px] text-muted">{term.label}</span>
              <span className="num text-[8.5px] text-faint">−{(term.value * 100).toFixed(1)}%</span>
            </div>
            <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, (term.value / maxTerm) * 100)}%`,
                  background:
                    term.value > 0.15
                      ? 'linear-gradient(90deg,#f59e0b,#ef4444)'
                      : term.value > 0.05
                        ? 'linear-gradient(90deg,#22d3ee,#f59e0b)'
                        : 'linear-gradient(90deg,#0e7490,#22d3ee)',
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 border-t border-edge/40 pt-1.5 text-[8px] leading-snug text-faint">
        Score = 1 − Σ penalties. Weights: beta 0.35, density 0.28, coil 0.45, field 0.50, vacuum 0.30, thermal
        0.25, low-T 0.25, disturbance 0.15. Demonstrative index, not an MHD stability calculation.
      </p>
    </Panel>
  );
}

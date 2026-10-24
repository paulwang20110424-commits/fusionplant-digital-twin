import { useEffect, useRef, useState } from 'react';
import type { ControlInputs } from '@/types/simulation';
import { CONTROL_SPEC_MAP } from '@/simulation/controlSpecs';
import { useSimulationStore } from '@/store/simulationStore';

interface ControlSliderProps {
  controlKey: keyof ControlInputs;
  baselineValue?: number | null;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * Operator slider bound to a single engine setpoint.
 * Local state updates immediately (crisp drag); the store is updated at ~16 Hz so
 * dragging never floods the simulation engine with publishes.
 */
export function ControlSlider({
  controlKey,
  baselineValue,
  disabled = false,
  compact = false,
}: ControlSliderProps) {
  const spec = CONTROL_SPEC_MAP[controlKey];
  const storeValue = useSimulationStore((state) => state.frame.controls[controlKey]);
  const setControl = useSimulationStore((state) => state.setControl);

  const [localValue, setLocalValue] = useState(storeValue);
  const lastSentRef = useRef(storeValue);
  const pendingRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (Math.abs(storeValue - lastSentRef.current) > 1e-9) {
      lastSentRef.current = storeValue;
      setLocalValue(storeValue);
    }
  }, [storeValue]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const commit = (value: number, immediate = false) => {
    setLocalValue(value);
    lastSentRef.current = value;
    if (immediate) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current = null;
      setControl(controlKey, value);
      return;
    }
    pendingRef.current = value;
    if (timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (pendingRef.current !== null) {
        const queued = pendingRef.current;
        pendingRef.current = null;
        setControl(controlKey, queued);
      }
    }, 60);
  };

  const percent = ((localValue - spec.min) / (spec.max - spec.min)) * 100;
  const delta = baselineValue !== undefined && baselineValue !== null ? localValue - baselineValue : null;
  const changed = delta !== null && Math.abs(delta) > 1e-9;

  return (
    <div className={`group ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label
          className="flex items-center gap-1 truncate text-[10px] text-muted"
          htmlFor={`ctrl-${controlKey}`}
          title={spec.description}
        >
          <span className="truncate">{spec.label}</span>
          <span className="text-[8px] text-faint">ⓘ</span>
        </label>
        <span className="num shrink-0 text-[11px] text-ink">
          {localValue.toFixed(spec.precision)}
          <span className="ml-0.5 text-[8.5px] text-faint">{spec.unit}</span>
        </span>
      </div>

      <input
        id={`ctrl-${controlKey}`}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={localValue}
        disabled={disabled}
        onChange={(event) => commit(Number(event.target.value))}
        onPointerUp={(event) => commit(Number((event.target as HTMLInputElement).value), true)}
        onKeyUp={(event) => commit(Number((event.target as HTMLInputElement).value), true)}
        data-demo={`control-${controlKey}`}
        aria-label={spec.label}
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuenow={localValue}
        aria-valuetext={`${localValue.toFixed(spec.precision)} ${spec.unit}`}
        aria-describedby={`ctrl-desc-${controlKey}`}
      />
      <span id={`ctrl-desc-${controlKey}`} className="sr-only">
        {spec.description} Range {spec.min} to {spec.max} {spec.unit}.
      </span>

      <div className="flex items-center justify-between gap-2">
        <div className="relative h-3 flex-1">
          {baselineValue !== null && baselineValue !== undefined && (
            <span
              className="absolute top-0 h-2 w-px bg-violet-400/70"
              style={{
                left: `${Math.min(100, Math.max(0, ((baselineValue - spec.min) / (spec.max - spec.min)) * 100))}%`,
              }}
              title={`Baseline: ${baselineValue.toFixed(spec.precision)} ${spec.unit}`}
            />
          )}
          <span
            className="absolute top-0 h-1 rounded-full bg-sys/50"
            style={{ left: 0, width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
        {!compact && (
          <span className="num text-[8px] text-faint">
            {spec.min}–{spec.max} {spec.unit}
          </span>
        )}
      </div>

      {changed && !compact && (
        <div className="mt-0.5 flex items-center gap-1 text-[8.5px] text-violet-300/80">
          <span className="num">BASE {baselineValue?.toFixed(spec.precision)}</span>
          <span>→</span>
          <span className="num text-sys">{localValue.toFixed(spec.precision)}</span>
          <span className="num text-faint">
            (Δ {delta > 0 ? '+' : ''}
            {delta.toFixed(spec.precision)})
          </span>
        </div>
      )}
    </div>
  );
}

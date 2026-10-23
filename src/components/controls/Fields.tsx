import type { ReactNode } from 'react';

export function NumberField({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
  hint,
  error,
}: {
  label: string;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  hint?: string;
  error?: string | null;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="label truncate" title={hint}>
          {label}
        </span>
        {unit && <span className="num text-[8.5px] text-faint">{unit}</span>}
      </div>
      <input
        type="number"
        className={`field ${error ? 'border-red-500/70' : ''}`}
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const parsed = event.target.valueAsNumber;
          onChange(Number.isFinite(parsed) ? parsed : Number.NaN);
        }}
      />
      {error && <p className="mt-0.5 text-[9px] text-red-300">{error}</p>}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label" title={hint}>
          {label}
        </span>
      </div>
      <select className="field" value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#081220]">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SlopeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="text-[10px] text-muted" title={hint}>
          {label}
        </span>
        <span className="num text-[11px] text-ink">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      title={hint}
      className={`flex items-center justify-between gap-2 rounded-sm border px-2 py-1 text-left transition-colors ${
        checked
          ? 'border-sys/40 bg-sys/[0.08] text-sys'
          : 'border-edge/70 bg-white/[0.01] text-muted hover:border-edge2'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <span className="text-[10px]">{label}</span>
      <span
        className={`relative h-3 w-6 rounded-full transition-colors ${checked ? 'bg-sys/60' : 'bg-edge2'}`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 h-2 w-2 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-sm border border-edge/50 bg-white/[0.012] p-2">
      <div className="label mb-1.5">{title}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

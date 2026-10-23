import { useSimulationStore } from '@/store/simulationStore';

const LEVEL_STYLE: Record<string, string> = {
  info: 'border-sky-500/40 bg-[#071726]/95 text-sky-200',
  success: 'border-emerald-500/40 bg-[#061a17]/95 text-emerald-200',
  warning: 'border-amber-500/50 bg-[#1d1405]/95 text-amber-200',
  critical: 'border-red-500/60 bg-[#1f0808]/95 text-red-200',
};

/** Non-blocking operator notifications. Auto-dismissed by the store. */
export function ToastStack() {
  const toasts = useSimulationStore((state) => state.toasts);
  const dismiss = useSimulationStore((state) => state.dismissToast);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[340px] flex-col gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismiss(toast.id)}
          className={`pointer-events-auto rounded-sm border px-3 py-2 text-left text-[11px] leading-snug shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-sm transition hover:brightness-125 ${
            LEVEL_STYLE[toast.level] ?? LEVEL_STYLE.info
          }`}
        >
          <span className="mr-2 font-mono text-[9px] uppercase tracking-widest opacity-70">
            {toast.level}
          </span>
          {toast.message}
        </button>
      ))}
    </div>
  );
}

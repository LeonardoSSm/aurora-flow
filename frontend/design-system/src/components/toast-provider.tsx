import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

type Toast = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ShowToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastContextType = {
  showToast: (input: ShowToastInput) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

const variantStyles: Record<ToastVariant, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
};

function createToastId() {
  return `toast_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    ({ title, description, variant = 'info', durationMs = 3500 }: ShowToastInput) => {
      const id = createToastId();
      setToasts((current) => [...current, { id, title, description, variant }]);

      const timer = window.setTimeout(() => {
        dismissToast(id);
      }, durationMs);
      timersRef.current.set(id, timer);
    },
    [dismissToast],
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      showToast,
    }),
    [showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-[999] grid w-full max-w-sm gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={[
              'pointer-events-auto rounded-xl border px-4 py-3 shadow-soft',
              variantStyles[toast.variant],
            ].join(' ')}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="grid gap-1">
                <strong className="text-sm font-bold">{toast.title}</strong>
                {toast.description ? <p className="text-xs">{toast.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-md px-1 text-xs font-bold opacity-70 hover:opacity-100"
              >
                x
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser usado dentro de ToastProvider');
  }
  return context;
}

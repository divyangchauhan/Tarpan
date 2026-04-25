import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
}

export interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_AFTER_MS = 4000;

const variantConfig: Record<ToastVariant, { icon: string; borderColor: string; bg: string }> = {
  success: {
    icon: '✓',
    borderColor: 'var(--success-border)',
    bg: 'oklch(99.5% 0.003 75)',
  },
  error: {
    icon: '✕',
    borderColor: 'var(--error-border)',
    bg: 'oklch(99% 0.01 25)',
  },
  info: {
    icon: 'ℹ',
    borderColor: 'var(--gold-mid)',
    bg: 'oklch(99.5% 0.003 75)',
  },
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps): JSX.Element {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect((): (() => void) => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), DISMISS_AFTER_MS);
    return (): void => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, onDismiss]);

  const { icon, borderColor, bg } = variantConfig[toast.variant];

  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 12, padding: '14px 18px',
        boxShadow: 'var(--shadow-lg)',
        minWidth: 280, maxWidth: 380,
        animation: 'toastIn 0.32s cubic-bezier(0.4,0,0.2,1) both',
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.4, flex: 1 }}>
        {toast.message}
      </span>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-faint)', fontSize: 16, padding: 2,
          lineHeight: 1, transition: 'color var(--transition)',
        }}
        onMouseEnter={(e) => ((e.target as HTMLElement).style.color = 'var(--text)')}
        onMouseLeave={(e) => ((e.target as HTMLElement).style.color = 'var(--text-faint)')}
      >
        ✕
      </button>
    </div>
  );
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, variant, message }]);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 10,
        pointerEvents: 'none',
      }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: 'all' }}>
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

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

const variantStyles: Record<ToastVariant, { bg: string; icon: ReactNode }> = {
  success: {
    bg: 'bg-green-50 border-green-200 text-green-800',
    icon: <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />,
  },
  error: {
    bg: 'bg-red-50 border-red-200 text-red-800',
    icon: <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />,
  },
  info: {
    bg: 'bg-brand-50 border-brand-200 text-brand-800',
    icon: <Info className="h-5 w-5 text-brand-500 flex-shrink-0" />,
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

  const { bg, icon } = variantStyles[toast.variant];

  return (
    <div
      className={[
        'flex items-start gap-3 rounded-lg border p-4 shadow-md max-w-sm w-full',
        bg,
      ].join(' ')}
      role="alert"
    >
      {icon}
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="ml-auto -mt-0.5 text-current opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
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
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

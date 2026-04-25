import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  default: { background: 'var(--border)', color: 'var(--text-muted)' },
  success: { background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' },
  warning: { background: 'var(--warning-bg)', color: 'var(--warning)' },
  error: { background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid var(--error-border)' },
  info: { background: 'var(--gold-light)', color: 'var(--gold)' },
};

export function Badge({ variant = 'default', children }: BadgeProps): JSX.Element {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        borderRadius: 20,
        padding: '4px 12px',
        fontSize: 12.5,
        fontWeight: 500,
        ...variantStyles[variant],
      }}
    >
      {children}
    </span>
  );
}

import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  style = {},
  ...props
}: ButtonProps): JSX.Element {
  const [hov, setHov] = useState(false);
  const isDisabled = disabled || loading;

  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontFamily: 'var(--sans)',
    fontWeight: 450,
    borderRadius: 8,
    border: 'none',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    transition: 'all var(--transition)',
    outline: 'none',
    opacity: isDisabled ? 0.45 : 1,
    fontSize: size === 'sm' ? 13 : size === 'lg' ? 15.5 : 14,
    padding: size === 'sm' ? '7px 14px' : size === 'lg' ? '13px 28px' : '10px 20px',
  };

  const variants: Record<Variant, React.CSSProperties> = {
    primary: {
      background: hov && !isDisabled ? 'oklch(55% 0.14 68)' : 'var(--gold)',
      color: 'white',
      boxShadow: hov && !isDisabled
        ? '0 4px 16px oklch(62% 0.13 68 / 0.35)'
        : '0 2px 8px oklch(62% 0.13 68 / 0.2)',
      transform: hov && !isDisabled ? 'translateY(-1px)' : 'none',
    },
    secondary: {
      background: hov && !isDisabled ? 'var(--border)' : 'transparent',
      color: 'var(--text)',
      border: '1px solid var(--border-strong)',
    },
    ghost: {
      background: hov && !isDisabled ? 'var(--gold-light)' : 'transparent',
      color: 'var(--gold)',
    },
    danger: {
      background: hov && !isDisabled ? 'oklch(50% 0.18 25)' : 'var(--error)',
      color: 'white',
    },
    link: {
      background: 'none',
      color: 'var(--gold)',
      padding: 0,
      fontWeight: 400,
      textDecoration: hov ? 'underline' : 'none',
    },
  };

  return (
    <button
      disabled={isDisabled}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      {...props}
    >
      {loading && (
        <span style={{
          width: 14, height: 14,
          border: '2px solid currentColor',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'spin 0.8s linear infinite',
          flexShrink: 0,
        }} />
      )}
      {children}
    </button>
  );
}

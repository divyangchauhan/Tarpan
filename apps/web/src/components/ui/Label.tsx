import { type LabelHTMLAttributes, type ReactNode } from 'react';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  children: ReactNode;
}

export function Label({ required, children, ...props }: LabelProps): JSX.Element {
  return (
    <label
      style={{
        display: 'block',
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--text-muted)',
        letterSpacing: '0.02em',
        marginBottom: 6,
      }}
      {...props}
    >
      {children}
      {required && <span style={{ marginLeft: 2, color: 'var(--error)' }}>*</span>}
    </label>
  );
}

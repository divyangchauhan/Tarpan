import { forwardRef, useState, type InputHTMLAttributes } from 'react';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> & {
  error?: string | undefined;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, style = {}, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ width: '100%' }}>
      <input
        ref={ref}
        style={{
          width: '100%',
          padding: '10px 14px',
          fontSize: 14,
          border: `1px solid ${error ? 'var(--error)' : focused ? 'var(--gold-mid)' : 'var(--border-strong)'}`,
          borderRadius: 8,
          background: 'var(--surface)',
          color: 'var(--text)',
          outline: 'none',
          boxShadow: focused ? '0 0 0 3px oklch(62% 0.13 68 / 0.1)' : 'none',
          transition: 'all var(--transition)',
          fontFamily: 'var(--sans)',
          ...style,
        }}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        {...props}
      />
      {error && (
        <p style={{ marginTop: 4, fontSize: 12, color: 'var(--error)' }}>{error}</p>
      )}
    </div>
  );
});

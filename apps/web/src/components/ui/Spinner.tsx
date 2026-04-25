interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

const sizePx = { sm: 16, md: 24, lg: 40 };

export function Spinner({ size = 'md', color = 'var(--gold)' }: SpinnerProps): JSX.Element {
  const px = sizePx[size];
  return (
    <span
      role="status"
      aria-label="Loading"
      className="animate-spin"
      style={{
        display: 'inline-block',
        width: px,
        height: px,
        border: `2px solid ${color}30`,
        borderTopColor: color,
        borderRadius: '50%',
        flexShrink: 0,
      }}
    />
  );
}

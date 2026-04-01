interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
};

export function Spinner({ size = 'md', className = '' }: SpinnerProps): JSX.Element {
  return (
    <span
      role="status"
      className={[
        'inline-block animate-spin rounded-full border-2 border-brand-200 border-t-brand-600',
        sizeClasses[size],
        className,
      ].join(' ')}
      aria-label="Loading"
    />
  );
}

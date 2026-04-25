interface FlameIconProps {
  size?: number;
  color?: string;
}

export function FlameIcon({ size = 20, color = 'var(--sidebar-accent)' }: FlameIconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path
        d="M10 18C6.5 18 4 15.5 4 12.5C4 10 5.5 8.5 6.5 7.5C7 7 7 6 6.5 4.5C8 5.5 8.5 7 8.5 7C9 5.5 9.5 3 10 2C11 4 11.5 5 11 7C12 6 12.5 5 13 4C13.5 6 14 8 13 10C14 9.5 15 9 15.5 8.5C16 10 16 11 15.5 12.5C15 14.5 12.5 18 10 18Z"
        fill={color}
        opacity="0.9"
      />
      <path
        d="M10 15.5C9 15.5 8 14.5 8 13.5C8 12.5 8.5 11.5 9 11C9 12 9.5 12.5 10 12.5C10.5 12.5 11 12 11 11C11.5 11.5 12 12.5 12 13.5C12 14.5 11 15.5 10 15.5Z"
        fill={color}
        opacity="0.5"
      />
    </svg>
  );
}

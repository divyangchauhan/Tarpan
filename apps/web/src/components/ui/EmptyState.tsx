import type { ReactNode } from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps): JSX.Element {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '80px 40px', textAlign: 'center',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
    }}>
      {icon && (
        <div style={{ color: 'var(--border-strong)', marginBottom: 20 }}>{icon}</div>
      )}
      <h3 style={{
        fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 300, marginBottom: 10,
        color: 'var(--text)',
      }}>
        {title}
      </h3>
      {description && (
        <p style={{ color: 'var(--text-muted)', fontSize: 14.5, marginBottom: 28, lineHeight: 1.6 }}>
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  );
}

const STEPS = ['Info', 'Upload', 'Review', 'Institutions', 'Downloads'];

type Stage = 'info' | 'upload' | 'processing' | 'review' | 'institutions' | 'downloads';

const stageIndex: Record<Stage, number> = {
  info: 0,
  upload: 1,
  processing: 1,
  review: 2,
  institutions: 3,
  downloads: 4,
};

interface ProgressBarProps {
  stage: Stage;
}

export function ProgressBar({ stage }: ProgressBarProps): JSX.Element {
  const current = stageIndex[stage] ?? 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 40 }}>
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 500,
                background: done ? 'var(--gold)' : active ? 'var(--surface)' : 'transparent',
                border: done ? 'none' : active ? '2px solid var(--gold)' : '2px solid var(--border-strong)',
                color: done ? 'white' : active ? 'var(--gold)' : 'var(--text-faint)',
                transition: 'all var(--transition-slow)',
                flexShrink: 0,
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: 11.5,
                fontWeight: active ? 500 : 400,
                color: active ? 'var(--text)' : done ? 'var(--gold)' : 'var(--text-faint)',
                whiteSpace: 'nowrap',
                transition: 'color var(--transition)',
              }}>
                {step}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1,
                height: 2,
                margin: '0 6px',
                marginBottom: 24,
                background: i < current ? 'var(--gold)' : 'var(--border)',
                transition: 'background var(--transition-slow)',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

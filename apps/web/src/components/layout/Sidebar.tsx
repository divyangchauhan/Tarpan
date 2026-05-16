import { useState } from 'react';
import { useNavigate, useMatch, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { useActiveCase } from '@/context/ActiveCaseContext';
import { FlameIcon } from '@/components/ui/FlameIcon';

const CASE_STEPS = [
  { path: 'executor', label: 'Executor' },
  { path: 'upload', label: 'Upload' },
  { path: 'review', label: 'Review' },
  { path: 'institutions', label: 'Institutions' },
  { path: 'downloads', label: 'Downloads' },
];

function getCurrentStepIndex(pathname: string): number {
  if (pathname.includes('/executor')) return 0;
  if (pathname.includes('/upload') || pathname.includes('/processing')) return 1;
  if (pathname.includes('/review')) return 2;
  if (pathname.includes('/institutions')) return 3;
  if (pathname.includes('/downloads')) return 4;
  return -1;
}

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps): JSX.Element {
  const { logout, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeCaseName, docUploaded, docProcessed, hasReadyDocs } = useActiveCase();

  const caseMatch = useMatch('/cases/:caseId/*');
  const caseId = caseMatch?.params.caseId;
  const currentStepIndex = getCurrentStepIndex(location.pathname);
  const isProfilesPage = location.pathname === '/cases';

  async function handleLogout(): Promise<void> {
    try {
      await logout();
    } catch {
      toast('Failed to log out', 'error');
    }
  }

  function nav(path: string): void {
    onClose?.();
    void navigate(path);
  }

  return (
    <div style={{
      width: 220, flexShrink: 0,
      background: 'var(--sidebar)',
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--sidebar-border)',
      height: '100%',
    }}>
      {/* Logo */}
      <div style={{ padding: '28px 20px 24px', borderBottom: '1px solid var(--sidebar-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FlameIcon size={22} />
          <span style={{
            fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 500,
            color: 'white', letterSpacing: '0.01em',
          }}>
            Tarpan
          </span>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--sidebar-muted)', marginTop: 6, lineHeight: 1.5 }}>
          Guided estate administration
        </p>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
        <NavItem
          label="All Profiles"
          active={isProfilesPage}
          onClick={() => nav('/cases')}
        />

        {caseId && (
          <div style={{ marginTop: 24 }}>
            <div style={{
              fontSize: 11, fontWeight: 500,
              color: 'var(--sidebar-muted)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '0 4px', marginBottom: 10,
            }}>
              Current Profile
            </div>
            {activeCaseName && (
              <div style={{
                fontSize: 13, color: 'var(--sidebar-text)',
                padding: '0 4px', marginBottom: 12,
                fontStyle: 'italic', fontFamily: 'var(--serif)',
              }}>
                {activeCaseName}
              </div>
            )}
            {CASE_STEPS.map((step, i) => {
              const done = i < currentStepIndex;
              const active = i === currentStepIndex;
              // Tier-based access: each flag unlocks all tiers up to its level.
              // Executor (0): always. Upload (1): doc uploaded+. Review/Institutions (2-3): doc processed+. Downloads (4): pdfs generated.
              const clickable =
                i === 0 ||
                (i === 1 && (docUploaded || docProcessed || hasReadyDocs)) ||
                (i <= 3 && (docProcessed || hasReadyDocs)) ||
                (i === 4 && hasReadyDocs);
              return (
                <button
                  key={step.path}
                  onClick={() => clickable ? nav(`/cases/${caseId}/${step.path}`) : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '7px 4px',
                    border: 'none', background: 'transparent',
                    color: active ? 'white' : done ? 'var(--sidebar-accent)' : 'oklch(38% 0.008 265)',
                    fontSize: 13, fontFamily: 'var(--sans)',
                    cursor: clickable ? 'pointer' : 'default',
                    transition: 'color var(--transition)',
                    textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 500,
                    background: done
                      ? 'var(--sidebar-accent)'
                      : active
                        ? 'oklch(25% 0.015 265)'
                        : 'oklch(20% 0.01 265)',
                    border: active ? '1.5px solid oklch(45% 0.015 265)' : 'none',
                    color: done ? 'var(--sidebar)' : active ? 'white' : 'oklch(38% 0.008 265)',
                  }}>
                    {done ? '✓' : i + 1}
                  </span>
                  {step.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* User */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--sidebar-border)' }}>
        {user && (
          <>
            <div style={{ fontSize: 13.5, color: 'var(--sidebar-text)', fontWeight: 450 }}>
              {user.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : user.email}
            </div>
            <div style={{ fontSize: 12, color: 'var(--sidebar-muted)', marginBottom: 12 }}>
              {user.email}
            </div>
          </>
        )}
        <button
          onClick={() => void handleLogout()}
          style={{
            fontSize: 12.5, color: 'var(--sidebar-muted)',
            background: 'none', border: 'none',
            cursor: 'pointer', padding: 0,
            fontFamily: 'var(--sans)',
            transition: 'color var(--transition)',
          }}
          onMouseEnter={(e) => ((e.target as HTMLElement).style.color = 'var(--sidebar-text)')}
          onMouseLeave={(e) => ((e.target as HTMLElement).style.color = 'var(--sidebar-muted)')}
        >
          Sign out →
        </button>
      </div>
    </div>
  );
}

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '9px 16px',
        border: 'none', borderRadius: 8,
        background: active ? 'oklch(22% 0.015 265)' : hov ? 'var(--sidebar-hover)' : 'transparent',
        color: active ? 'white' : hov ? 'var(--sidebar-text)' : 'var(--sidebar-muted)',
        fontSize: 13.5, fontFamily: 'var(--sans)',
        fontWeight: active ? 500 : 400,
        cursor: 'pointer', transition: 'all var(--transition)',
        textAlign: 'left',
      }}
    >
      {label}
    </button>
  );
}

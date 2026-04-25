import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Case } from '@afterlight/shared';
import { CaseStatus, GeneratedDocumentStatus } from '@afterlight/shared';
import { getCases, updateCase } from '@/api/cases';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { FlameIcon } from '@/components/ui/FlameIcon';
import { useActiveCase } from '@/context/ActiveCaseContext';

const RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Grandchild', 'Trustee', 'Other'];

interface StageMeta {
  label: string;
  color: string;
  path: string;
}

function getStageMeta(c: Case): StageMeta {
  if (c.status === CaseStatus.COMPLETED) {
    return { label: 'Documents ready', color: 'var(--success)', path: 'downloads' };
  }
  if (c.status === CaseStatus.ARCHIVED) {
    return { label: 'Archived', color: 'var(--text-faint)', path: 'review' };
  }
  // ACTIVE
  if (!c.deceasedInfo) {
    return { label: 'Awaiting upload', color: 'var(--text-muted)', path: 'upload' };
  }
  const hasReady = c.generatedDocuments?.some(
    (gd) => gd.status === GeneratedDocumentStatus.READY,
  );
  if (hasReady) {
    return { label: 'Documents ready', color: 'var(--success)', path: 'downloads' };
  }
  return { label: 'Needs review', color: 'var(--warning)', path: 'review' };
}

function fmt(d: Date | string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(
    new Date(d),
  );
}

interface ExecForm {
  name: string;
  relationship: string;
  phone: string;
  email: string;
}

export function CasesPage(): JSX.Element {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [execForm, setExecForm] = useState<ExecForm>({ name: '', relationship: '', phone: '', email: '' });
  const [savingExec, setSavingExec] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { setActiveCaseName } = useActiveCase();

  useEffect(() => {
    setActiveCaseName(null);
    getCases()
      .then(setCases)
      .catch(() => toast('Failed to load cases', 'error'))
      .finally(() => setLoading(false));
  }, [toast, setActiveCaseName]);

  function handleNewCase(): void {
    void navigate('/cases/new');
  }

  function openEditExecutor(e: React.MouseEvent, c: Case): void {
    e.stopPropagation();
    setEditingCaseId(c.id);
    setExecForm({
      name: c.executorInfo?.name ?? '',
      relationship: c.executorInfo?.relationship ?? '',
      phone: c.executorInfo?.phone ?? '',
      email: c.executorInfo?.email ?? '',
    });
  }

  function cancelEdit(e: React.MouseEvent): void {
    e.stopPropagation();
    setEditingCaseId(null);
  }

  async function saveExecutor(e: React.MouseEvent, c: Case): Promise<void> {
    e.stopPropagation();
    if (!execForm.name || !execForm.relationship) {
      toast('Name and relationship are required', 'error');
      return;
    }
    setSavingExec(true);
    try {
      const updated = await updateCase(c.id, {
        executorInfo: {
          name: execForm.name,
          address: c.executorInfo?.address ?? '',
          relationship: execForm.relationship,
          ...(execForm.phone ? { phone: execForm.phone } : {}),
          ...(execForm.email ? { email: execForm.email } : {}),
        },
      });
      setCases((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
      setEditingCaseId(null);
      toast('Executor information updated', 'success');
    } catch {
      toast('Failed to save executor information', 'error');
    } finally {
      setSavingExec(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div style={{ padding: '56px 64px', maxWidth: 860, animation: 'fadeInUp 0.35s both' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', marginBottom: 48,
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--serif)', fontSize: 42, fontWeight: 300,
            lineHeight: 1.1, marginBottom: 10, color: 'var(--text)',
          }}>
            Profiles
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Each profile guides you through the paperwork for one person.
          </p>
        </div>
        <Button size="lg" onClick={handleNewCase}>+ New profile</Button>
      </div>

      {cases.length === 0 ? (
        <EmptyState
          icon={<FlameIcon size={36} color="var(--border-strong)" />}
          title="No profiles yet"
          description={"When you're ready, start a new profile for your loved one.\nWe'll walk you through every step."}
          action={{ label: 'Begin a new profile', onClick: handleNewCase }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {cases.map((c, i) => {
            const meta = getStageMeta(c);
            const isEditing = editingCaseId === c.id;
            const name = c.deceasedInfo
              ? [c.deceasedInfo.firstName, c.deceasedInfo.middleName, c.deceasedInfo.lastName]
                  .filter(Boolean)
                  .join(' ')
              : 'Certificate pending';

            return (
              <div
                key={c.id}
                className={`stagger-${Math.min(i + 1, 4)}`}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-sm)',
                  overflow: 'hidden',
                  animation: 'fadeInUp 0.35s both',
                  cursor: isEditing ? 'default' : 'pointer',
                  transition: 'box-shadow var(--transition)',
                }}
                onClick={isEditing ? undefined : (): void => { void navigate(`/cases/${c.id}/${meta.path}`); }}
                role={isEditing ? undefined : 'button'}
                tabIndex={isEditing ? undefined : 0}
                onKeyDown={(e) => !isEditing && e.key === 'Enter' && void navigate(`/cases/${c.id}/${meta.path}`)}
                onMouseEnter={(e) => {
                  if (!isEditing) (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
                }}
              >
                {/* Main row */}
                <div style={{ padding: '22px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 400,
                      marginBottom: 4, color: 'var(--text)',
                    }}>
                      {name}
                    </div>
                    <div style={{
                      fontSize: 13, color: 'var(--text-faint)',
                      display: 'flex', alignItems: 'center', gap: 8,
                      overflow: 'hidden', whiteSpace: 'nowrap',
                    }}>
                      <span style={{ flexShrink: 0 }}>Created {fmt(c.createdAt)}</span>
                      {c.deceasedInfo?.dateOfDeath && (
                        <>
                          <span style={{ flexShrink: 0, color: 'var(--border-strong)' }}>·</span>
                          <span style={{ flexShrink: 0 }}>Died {fmt(c.deceasedInfo.dateOfDeath)}</span>
                        </>
                      )}
                      {c.executorInfo && (
                        <>
                          <span style={{ flexShrink: 0, color: 'var(--border-strong)' }}>·</span>
                          <span style={{
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: 160,
                          }}>
                            Executor: {c.executorInfo.name}
                          </span>
                        </>
                      )}
                    </div>
                    {c.executorInfo && (
                      <button
                        onClick={(e) => openEditExecutor(e, c)}
                        style={{
                          marginTop: 4, background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--gold)', fontSize: 12.5, fontFamily: 'var(--sans)',
                          padding: '1px 6px 1px 0', borderRadius: 4,
                          transition: 'background var(--transition)',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--gold-light)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                      >
                        Edit executor
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 12.5, fontWeight: 500,
                      color: meta.color,
                      background: `${meta.color}18`,
                      padding: '4px 12px', borderRadius: 20,
                    }}>
                      {meta.label}
                    </span>
                    {!isEditing && (
                      <span style={{ color: 'var(--border-strong)', fontSize: 18 }}>›</span>
                    )}
                  </div>
                </div>

                {/* Inline executor edit panel */}
                {isEditing && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      borderTop: '1px solid var(--border)',
                      padding: '20px 28px',
                      background: 'var(--cream)',
                      animation: 'fadeInUp 0.25s both',
                    }}
                  >
                    <div style={{
                      fontSize: 12, fontWeight: 500, letterSpacing: '0.06em',
                      textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16,
                    }}>
                      Edit Executor Information
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                      <div>
                        <Label htmlFor={`exec-name-${c.id}`}>Full name</Label>
                        <Input
                          id={`exec-name-${c.id}`}
                          type="text"
                          placeholder="Jane Smith"
                          value={execForm.name}
                          onChange={(e) => setExecForm((f) => ({ ...f, name: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`exec-rel-${c.id}`}>Relationship</Label>
                        <select
                          id={`exec-rel-${c.id}`}
                          value={execForm.relationship}
                          onChange={(e) => setExecForm((f) => ({ ...f, relationship: e.target.value }))}
                          style={{
                            width: '100%', padding: '10px 14px', fontSize: 14,
                            border: '1px solid var(--border-strong)', borderRadius: 8,
                            background: 'var(--surface)', color: execForm.relationship ? 'var(--text)' : 'var(--text-faint)',
                            outline: 'none', fontFamily: 'var(--sans)',
                          }}
                        >
                          <option value="">Select…</option>
                          {RELATIONSHIPS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor={`exec-phone-${c.id}`}>Phone (optional)</Label>
                        <Input
                          id={`exec-phone-${c.id}`}
                          type="tel"
                          placeholder="(555) 000-0000"
                          value={execForm.phone}
                          onChange={(e) => setExecForm((f) => ({ ...f, phone: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`exec-email-${c.id}`}>Email (optional)</Label>
                        <Input
                          id={`exec-email-${c.id}`}
                          type="email"
                          placeholder="you@example.com"
                          value={execForm.email}
                          onChange={(e) => setExecForm((f) => ({ ...f, email: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <Button variant="secondary" size="sm" onClick={cancelEdit}>
                        Cancel
                      </Button>
                      <Button size="sm" loading={savingExec} onClick={(e) => void saveExecutor(e, c)}>
                        Save changes
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

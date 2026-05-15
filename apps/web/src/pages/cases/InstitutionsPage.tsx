import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DocumentStatus, InstitutionType } from '@tarpan/shared';
import { getDocuments } from '@/api/documents';
import { createGeneratedDocument } from '@/api/generated-documents';
import { useToast } from '@/hooks/useToast';
import { useActiveCase } from '@/context/ActiveCaseContext';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ProgressBar } from '@/components/ui/ProgressBar';

interface InstitutionMeta {
  type: InstitutionType;
  label: string;
  doc: string;
}

interface InstitutionGroup {
  category: string;
  institutions: InstitutionMeta[];
}

const INSTITUTION_GROUPS: InstitutionGroup[] = [
  {
    category: 'Government',
    institutions: [
      { type: InstitutionType.SOCIAL_SECURITY_ADMINISTRATION, label: 'Social Security Administration', doc: 'Cessation of Benefits Letter' },
      { type: InstitutionType.IRS, label: 'Internal Revenue Service (IRS)', doc: 'Final Tax Filing Notice' },
      { type: InstitutionType.MEDICARE, label: 'Medicare', doc: 'Coverage Termination Notice' },
      { type: InstitutionType.VETERANS_AFFAIRS, label: 'Veterans Affairs (VA)', doc: 'VA Benefits Notification' },
      { type: InstitutionType.PASSPORT, label: 'U.S. Passport Services', doc: 'Passport Cancellation Request' },
      { type: InstitutionType.STATE_DMV, label: 'State DMV', doc: 'Driver\'s License Cancellation' },
      { type: InstitutionType.VOTER_REGISTRATION, label: 'Voter Registration', doc: 'Voter Record Removal' },
    ],
  },
  {
    category: 'Financial',
    institutions: [
      { type: InstitutionType.BANK, label: 'Bank / Credit Union', doc: 'Account Closure Request' },
      { type: InstitutionType.CREDIT_CARD, label: 'Credit Card Issuer', doc: 'Account Closure Notification' },
      { type: InstitutionType.PENSION_401K, label: 'Pension / 401(k) Provider', doc: 'Account Transfer Authorization' },
      { type: InstitutionType.LIFE_INSURANCE, label: 'Life Insurance Company', doc: 'Life Insurance Claim Form' },
    ],
  },
  {
    category: 'Utilities & Services',
    institutions: [
      { type: InstitutionType.USPS, label: 'U.S. Postal Service (USPS)', doc: 'Mail Forwarding Request' },
      { type: InstitutionType.SUBSCRIPTION_STREAMING, label: 'Streaming Subscriptions', doc: 'Subscription Cancellation' },
      { type: InstitutionType.SUBSCRIPTION_UTILITY, label: 'Utility Providers', doc: 'Utility Transfer / Cancellation' },
    ],
  },
  {
    category: 'Professional',
    institutions: [
      { type: InstitutionType.EMPLOYER_HR, label: 'Employer / HR Department', doc: 'Employment Termination Notice' },
      { type: InstitutionType.PROFESSIONAL_LICENSE_BOARD, label: 'Professional License Board', doc: 'License Cancellation Request' },
    ],
  },
];

type GenStatus = 'idle' | 'loading' | 'done';

export function InstitutionsPage(): JSX.Element {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setDocProcessed } = useActiveCase();

  const [selected, setSelected] = useState<Set<InstitutionType>>(new Set());
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState<Record<string, GenStatus>>({});

  useEffect(() => {
    if (!caseId) return;
    getDocuments(caseId)
      .then((docs) => {
        const processed = docs.find((d) => d.status === DocumentStatus.PROCESSED);
        if (processed) {
          setDocumentId(processed.id);
          setDocProcessed(true);
        } else {
          toast('No processed death certificate found for this case. Please upload one first.', 'error');
        }
      })
      .catch(() => toast('Failed to load case documents', 'error'));
  }, [caseId, toast]);

  function toggle(type: InstitutionType): void {
    if (generating) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const allTypes = INSTITUTION_GROUPS.flatMap((g) => g.institutions.map((i) => i.type));
  const allInsts = INSTITUTION_GROUPS.flatMap((g) => g.institutions);
  const allSelected = allTypes.every((t) => selected.has(t));

  function selectAll(): void {
    setSelected(new Set(allTypes));
  }

  function clearAll(): void {
    setSelected(new Set());
  }

  async function handleGenerate(): Promise<void> {
    if (!caseId || selected.size === 0) return;
    if (!documentId) {
      toast('No processed death certificate found. Please upload one first.', 'error');
      void navigate(`/cases/${caseId}/upload`);
      return;
    }

    setGenerating(true);
    const types = Array.from(selected);

    types.forEach((t, i) => {
      setTimeout(() => setGenStatus((s) => ({ ...s, [t]: 'loading' })), i * 200);
    });

    const results = await Promise.allSettled(
      types.map((institutionType) =>
        createGeneratedDocument(caseId, { documentId, institutionType }),
      ),
    );

    const failedLabels = results
      .map((result, i) =>
        result.status === 'rejected'
          ? (allInsts.find((inst) => inst.type === types[i])?.label ?? types[i])
          : null,
      )
      .filter((label): label is string => label !== null);

    types.forEach((t) => setGenStatus((s) => ({ ...s, [t]: 'done' })));

    if (failedLabels.length > 0) {
      toast(`Failed to queue: ${failedLabels.join(', ')}`, 'error');
    } else {
      toast('All documents queued for generation!', 'success');
    }
    setGenerating(false);
    void navigate(`/cases/${caseId}/downloads`);
  }

  return (
    <div style={{ padding: '56px 64px', maxWidth: 860 }}>
      <ProgressBar stage="institutions" />

      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', marginBottom: 8,
        animation: 'fadeInUp 0.35s both',
      }}>
        <h1 style={{
          fontFamily: 'var(--serif)', fontSize: 40, fontWeight: 300,
          color: 'var(--text)',
        }}>
          Select institutions to notify
        </h1>
        <div style={{ display: 'flex', gap: 8, paddingTop: 12 }}>
          <Button variant="ghost" size="sm" onClick={allSelected ? clearAll : selectAll}>
            {allSelected ? 'Clear all' : 'Select all'}
          </Button>
        </div>
      </div>

      <p style={{
        fontSize: 15, color: 'var(--text-muted)', marginBottom: 40,
        lineHeight: 1.6, animation: 'fadeInUp 0.35s 60ms both',
      }}>
        Choose every organization that needs to be contacted. We&apos;ll generate the correct
        document for each one.
      </p>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 32,
        animation: 'fadeInUp 0.35s 100ms both',
      }}>
        {INSTITUTION_GROUPS.map((group) => (
          <div key={group.category}>
            <h3 style={{
              fontSize: 12, fontWeight: 500,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--text-muted)', marginBottom: 12,
            }}>
              {group.category}
            </h3>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
              overflow: 'hidden',
            }}>
              {group.institutions.map((inst, i) => {
                const isSelected = selected.has(inst.type);
                const status = genStatus[inst.type] ?? 'idle';
                return (
                  <button
                    key={inst.type}
                    onClick={() => toggle(inst.type)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      width: '100%', padding: '16px 20px',
                      borderBottom: i < group.institutions.length - 1
                        ? '1px solid var(--border)' : 'none',
                      borderLeft: 'none', borderRight: 'none', borderTop: 'none',
                      background: isSelected ? 'var(--gold-light)' : 'transparent',
                      cursor: generating ? 'default' : 'pointer',
                      transition: 'background var(--transition)',
                      fontFamily: 'var(--sans)',
                      textAlign: 'left',
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: `2px solid ${isSelected ? 'var(--gold)' : 'var(--border-strong)'}`,
                      background: isSelected ? 'var(--gold)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, color: 'white',
                      transition: 'all var(--transition)',
                      pointerEvents: 'none',
                    }}>
                      {isSelected ? '✓' : ''}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 14.5, fontWeight: isSelected ? 450 : 400,
                        color: 'var(--text)', marginBottom: 2,
                      }}>
                        {inst.label}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
                        Generates: {inst.doc}
                      </div>
                    </div>

                    {status === 'loading' && <Spinner size="sm" />}
                    {status === 'done' && (
                      <span style={{
                        fontSize: 13, color: 'var(--success)', fontWeight: 500,
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{
                          background: 'var(--success-bg)',
                          border: '1px solid var(--success-border)',
                          borderRadius: '50%', width: 22, height: 22,
                          display: 'inline-flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 11,
                        }}>
                          ✓
                        </span>
                        Ready
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 40, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', animation: 'fadeInUp 0.35s 200ms both',
      }}>
        <span style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
          {selected.size} institution{selected.size !== 1 ? 's' : ''} selected
        </span>
        <Button
          size="lg"
          disabled={selected.size === 0 || generating}
          onClick={() => void handleGenerate()}
        >
          {generating ? (
            <><Spinner size="sm" color="white" /> Generating…</>
          ) : (
            'Generate selected'
          )}
        </Button>
      </div>
    </div>
  );
}

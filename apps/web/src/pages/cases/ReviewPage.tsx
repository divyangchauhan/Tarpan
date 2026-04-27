import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Case, Document } from '@afterlight/shared';
import { DocumentStatus } from '@afterlight/shared';
import { getCase, updateCase } from '@/api/cases';
import { getDocuments } from '@/api/documents';
import { useToast } from '@/hooks/useToast';
import { useActiveCase } from '@/context/ActiveCaseContext';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ProgressBar } from '@/components/ui/ProgressBar';

function fmtDate(s: string | undefined): string {
  if (!s) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(
      new Date(s + 'T12:00:00'),
    );
  } catch {
    return s;
  }
}

export function ReviewPage(): JSX.Element {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setActiveCaseName, setDocProcessed } = useActiveCase();

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [processedDoc, setProcessedDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ssnVisible, setSsnVisible] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!caseId) return;
    Promise.all([getCase(caseId), getDocuments(caseId)])
      .then(([c, docs]) => {
        setCaseData(c);
        const processed = docs.find((d) => d.status === DocumentStatus.PROCESSED) ?? null;
        setProcessedDoc(processed);
        if (processed) setDocProcessed(true);
        const deceased = c.deceasedInfo;
        if (deceased) {
          const name = [deceased.firstName, deceased.middleName, deceased.lastName]
            .filter(Boolean)
            .join(' ');
          setActiveCaseName(name);
        }
      })
      .catch(() => toast('Failed to load case', 'error'))
      .finally(() => setLoading(false));
  }, [caseId, toast, setActiveCaseName]);

  async function handleContinue(): Promise<void> {
    if (!caseId) return;
    if (Object.keys(editedValues).length > 0 && caseData) {
      setSaving(true);
      try {
        await updateCase(caseId, {
          deceasedInfo: { ...(caseData.deceasedInfo ?? {}), ...editedValues },
        });
      } catch {
        toast('Failed to save field edits', 'error');
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    void navigate(`/cases/${caseId}/institutions`);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Case not found.</p>
      </div>
    );
  }

  const extracted = processedDoc?.extractedData;
  const raw = extracted as Record<string, unknown> | undefined;
  function exField(camel: string, snake: string): string | undefined {
    if (!raw) return undefined;
    const v = raw[camel] ?? raw[snake];
    return typeof v === 'string' ? v : undefined;
  }

  const deceased = caseData.deceasedInfo;

  function resolveField(key: string, camel: string, snake: string, fallback: string | undefined): string | undefined {
    if (editedValues[key] !== undefined) return editedValues[key];
    return exField(camel, snake) ?? fallback;
  }

  const firstName = resolveField('firstName', 'firstName', 'first_name', deceased?.firstName);
  const middleName = resolveField('middleName', 'middleName', 'middle_name', deceased?.middleName);
  const lastName = resolveField('lastName', 'lastName', 'last_name', deceased?.lastName);
  const dateOfBirth = resolveField('dateOfBirth', 'dateOfBirth', 'date_of_birth', deceased?.dateOfBirth);
  const dateOfDeath = resolveField('dateOfDeath', 'dateOfDeath', 'date_of_death', deceased?.dateOfDeath);
  const placeOfDeath = resolveField('placeOfDeath', 'placeOfDeath', 'place_of_death', deceased?.placeOfDeath);
  const ssnValue = resolveField('socialSecurityNumber', 'socialSecurityNumber', 'social_security_number', deceased?.socialSecurityNumber);
  const hasDeceasedData = !!(firstName ?? lastName ?? dateOfDeath);

  type FieldDef = { key: string; label: string; value: string | undefined; isDate?: boolean; sensitive?: boolean };

  const deceasedFields: FieldDef[] = [
    { key: 'firstName', label: 'First name', value: firstName },
    { key: 'middleName', label: 'Middle name', value: middleName },
    { key: 'lastName', label: 'Last name', value: lastName },
    { key: 'dateOfBirth', label: 'Date of birth', value: dateOfBirth, isDate: true },
    { key: 'dateOfDeath', label: 'Date of death', value: dateOfDeath, isDate: true },
    { key: 'placeOfDeath', label: 'Place of death', value: placeOfDeath },
    ...(ssnValue ? [{ key: 'socialSecurityNumber', label: 'Social Security Number', value: ssnValue, sensitive: true }] : []),
  ].filter((f) => f.value !== undefined && f.value !== '');

  const docFilename = processedDoc?.s3Key?.split('/').pop() ?? 'death_certificate.pdf';

  return (
    <div style={{ padding: '56px 64px', maxWidth: 860 }}>
      <ProgressBar stage="review" />

      <h1 style={{
        fontFamily: 'var(--serif)', fontSize: 40, fontWeight: 300,
        marginBottom: 8, color: 'var(--text)',
        animation: 'fadeInUp 0.35s both',
      }}>
        Review extracted information
      </h1>
      <p style={{
        fontSize: 15, color: 'var(--text-muted)', marginBottom: 40,
        lineHeight: 1.6, animation: 'fadeInUp 0.35s 60ms both',
      }}>
        Please verify what our AI extracted. Click any field to edit if something looks wrong.
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24,
        animation: 'fadeInUp 0.35s 100ms both',
      }}>
        {/* Extracted fields */}
        <div>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <span style={{
                fontSize: 12, fontWeight: 500, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--text-muted)',
              }}>
                Deceased&apos;s information
                {extracted && (
                  <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11.5, color: 'var(--text-faint)' }}>
                    (extracted from death certificate)
                  </span>
                )}
              </span>
            </div>

            {hasDeceasedData ? (
              deceasedFields.map((f, i) => {
                const isEditing = editingField === f.key;
                const displayValue = f.sensitive
                  ? (ssnVisible ? f.value : '•••–••–' + (f.value?.slice(-4) ?? '••••'))
                  : f.isDate ? fmtDate(f.value) : (f.value ?? '—');

                return (
                  <div
                    key={f.key}
                    style={{
                      padding: '14px 24px',
                      borderBottom: i < deceasedFields.length - 1 ? '1px solid var(--border)' : 'none',
                      background: isEditing ? 'var(--gold-light)' : 'transparent',
                      transition: 'background 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{
                        fontSize: 11.5, fontWeight: 500,
                        letterSpacing: '0.04em', color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                      }}>
                        {f.label}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {f.sensitive && (
                          <button
                            onClick={() => setSsnVisible((v) => !v)}
                            style={{
                              fontSize: 11.5, color: 'var(--gold)', background: 'none',
                              border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)', padding: 0,
                            }}
                          >
                            {ssnVisible ? 'Hide' : 'Reveal'}
                          </button>
                        )}
                        <button
                          onClick={() => setEditingField(isEditing ? null : f.key)}
                          style={{
                            fontSize: 11.5, color: 'var(--gold)', background: 'none',
                            border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)', padding: 0,
                          }}
                        >
                          {isEditing ? 'Done' : 'Edit'}
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <input
                        type={f.isDate ? 'date' : 'text'}
                        value={editedValues[f.key] ?? f.value ?? ''}
                        onChange={(e) => setEditedValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        style={{
                          width: '100%', padding: '8px 0', background: 'transparent',
                          border: 'none', borderBottom: '1.5px solid var(--gold)',
                          outline: 'none', fontSize: 15, fontFamily: 'var(--sans)',
                          color: 'var(--text)',
                        }}
                      />
                    ) : (
                      <div style={{ fontSize: 15, color: 'var(--text)', fontWeight: 300 }}>
                        {displayValue ?? <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>Not extracted</span>}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{
                padding: '40px 24px', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              }}>
                <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                  No death certificate uploaded yet
                </p>
                <Button
                  variant="secondary"
                  onClick={() => void navigate(`/cases/${caseId}/upload`)}
                >
                  Upload death certificate
                </Button>
              </div>
            )}
          </div>
          {hasDeceasedData && (
            <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 12, padding: '0 4px', lineHeight: 1.6 }}>
              ↑ All fields were extracted automatically.{' '}
              <button
                onClick={() => void navigate(`/cases/${caseId}/upload`)}
                style={{
                  background: 'none', border: 'none', color: 'var(--gold)',
                  cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--sans)', padding: 0,
                }}
              >
                Re-upload certificate
              </button>
            </div>
          )}
        </div>

        {/* Uploaded document preview */}
        <div>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{
                fontSize: 12, fontWeight: 500, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--text-muted)',
              }}>
                Uploaded Document
              </span>
              {processedDoc && (
                <button
                  onClick={() => void navigate(`/cases/${caseId}/upload`)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 12.5, color: 'var(--text-muted)', background: 'none',
                    border: '1px solid var(--border-strong)', borderRadius: 6,
                    cursor: 'pointer', fontFamily: 'var(--sans)', padding: '5px 10px',
                  }}
                >
                  ↺ Re-upload
                </button>
              )}
            </div>

            {processedDoc ? (
              <div style={{
                height: 380, background: 'oklch(94% 0.005 75)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: 24, gap: 0, position: 'relative', overflow: 'hidden',
              }}>
                {/* Ruled-paper background */}
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px)',
                  backgroundSize: '100% 28px', opacity: 0.4,
                }} />
                {/* Stylised PDF card */}
                <div style={{
                  width: '100%', maxWidth: 220, background: 'white', borderRadius: 4,
                  boxShadow: '0 4px 24px oklch(0% 0 0 / 0.12)', padding: '24px 20px',
                  position: 'relative', zIndex: 1,
                }}>
                  <div style={{ textAlign: 'center', marginBottom: 14 }}>
                    <div style={{ height: 7, background: 'oklch(30% 0.01 265)', borderRadius: 3, width: '70%', margin: '0 auto 6px' }} />
                    <div style={{ height: 5, background: 'var(--border-strong)', borderRadius: 2, width: '55%', margin: '0 auto' }} />
                  </div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }} />
                  {[['90%', '55%'], ['80%', '50%'], ['65%', '45%'], ['75%', '52%']].map(([w1, w2], idx) => (
                    <div key={idx} style={{ marginBottom: 8 }}>
                      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, width: w2, marginBottom: 3 }} />
                      <div style={{ height: 6, background: 'oklch(25% 0.01 265)', borderRadius: 2, width: w1, opacity: 0.15 }} />
                    </div>
                  ))}
                  <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div style={{ height: 18, width: 60, borderBottom: '1.5px solid oklch(30% 0.01 265)', opacity: 0.2 }} />
                    <div style={{ height: 5, background: 'var(--gold-mid)', borderRadius: 2, width: '30%' }} />
                  </div>
                </div>
                {/* Filename */}
                <div style={{
                  fontSize: 11.5, color: 'var(--text-faint)', marginTop: 14,
                  position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
                    <path d="M1 1h7l3 3v9a1 1 0 01-1 1H1a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M7 1v3h3" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  {docFilename}
                </div>
              </div>
            ) : (
              <div style={{
                padding: '40px 24px', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              }}>
                <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                  No document uploaded yet
                </p>
                <Button
                  variant="secondary"
                  onClick={() => void navigate(`/cases/${caseId}/upload`)}
                >
                  Upload death certificate
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 32, display: 'flex', justifyContent: 'flex-end',
        animation: 'fadeInUp 0.35s 200ms both',
      }}>
        <Button
          size="lg"
          loading={saving}
          disabled={!hasDeceasedData}
          onClick={() => void handleContinue()}
          title={!hasDeceasedData ? 'Upload a death certificate first' : undefined}
        >
          Confirm & Continue →
        </Button>
      </div>
    </div>
  );
}

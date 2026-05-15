import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, FileText } from 'lucide-react';
import type { GeneratedDocument } from '@tarpan/shared';
import { GeneratedDocumentStatus, InstitutionType } from '@tarpan/shared';
import { getGeneratedDocuments } from '@/api/generated-documents';
import { useToast } from '@/hooks/useToast';
import { useActiveCase } from '@/context/ActiveCaseContext';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressBar } from '@/components/ui/ProgressBar';

const POLL_INTERVAL_MS = 5000;

const INSTITUTION_LABELS: Record<InstitutionType, string> = {
  [InstitutionType.SOCIAL_SECURITY_ADMINISTRATION]: 'Social Security Administration',
  [InstitutionType.MEDICARE]: 'Medicare',
  [InstitutionType.IRS]: 'IRS',
  [InstitutionType.VETERANS_AFFAIRS]: 'Veterans Affairs',
  [InstitutionType.STATE_DMV]: 'State DMV',
  [InstitutionType.VOTER_REGISTRATION]: 'Voter Registration',
  [InstitutionType.PASSPORT]: 'U.S. Passport Services',
  [InstitutionType.BANK]: 'Bank / Credit Union',
  [InstitutionType.CREDIT_CARD]: 'Credit Card Issuer',
  [InstitutionType.PENSION_401K]: 'Pension / 401(k)',
  [InstitutionType.LIFE_INSURANCE]: 'Life Insurance',
  [InstitutionType.USPS]: 'USPS',
  [InstitutionType.SUBSCRIPTION_STREAMING]: 'Streaming Subscriptions',
  [InstitutionType.SUBSCRIPTION_UTILITY]: 'Utility Providers',
  [InstitutionType.EMPLOYER_HR]: 'Employer / HR',
  [InstitutionType.PROFESSIONAL_LICENSE_BOARD]: 'Professional License Board',
};

function statusStyle(status: GeneratedDocumentStatus): React.CSSProperties {
  switch (status) {
    case GeneratedDocumentStatus.READY:
      return { color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success-border)' };
    case GeneratedDocumentStatus.FAILED:
      return { color: 'var(--error)', background: 'var(--error-bg)', border: '1px solid var(--error-border)' };
    default:
      return { color: 'var(--gold)', background: 'var(--gold-light)' };
  }
}

export function DownloadsPage(): JSX.Element {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setHasReadyDocs } = useActiveCase();

  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const errorToastShownRef = useRef(false);

  function fetchDocuments(): void {
    if (!caseId) return;
    getGeneratedDocuments(caseId)
      .then((docs) => {
        setDocuments(docs);
        setLoading(false);
        if (docs.some((d) => d.status === GeneratedDocumentStatus.READY)) {
          setHasReadyDocs(true);
        }
        const allDone = docs.every(
          (d) =>
            d.status === GeneratedDocumentStatus.READY ||
            d.status === GeneratedDocumentStatus.FAILED,
        );
        if (allDone && pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      })
      .catch(() => {
        if (!errorToastShownRef.current) {
          toast('Failed to load documents', 'error');
          errorToastShownRef.current = true;
        }
        setLoading(false);
      });
  }

  useEffect((): (() => void) => {
    fetchDocuments();
    pollingRef.current = setInterval(fetchDocuments, POLL_INTERVAL_MS);
    return (): void => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [caseId]);

  const readyCount = documents.filter((d) => d.status === GeneratedDocumentStatus.READY).length;
  const generatingCount = documents.filter(
    (d) =>
      d.status === GeneratedDocumentStatus.GENERATING ||
      d.status === GeneratedDocumentStatus.PENDING,
  ).length;

  return (
    <div style={{ padding: '56px 64px', maxWidth: 840 }}>
      <ProgressBar stage="downloads" />

      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', marginBottom: 40,
        animation: 'fadeInUp 0.35s both',
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--serif)', fontSize: 40, fontWeight: 300,
            marginBottom: 8, color: 'var(--text)',
          }}>
            Your documents are ready
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {generatingCount > 0
              ? `${generatingCount} document${generatingCount !== 1 ? 's' : ''} still generating…`
              : `${readyCount} document${readyCount !== 1 ? 's' : ''} ready to download.`}
            <br />
            Download each letter and send it to the corresponding institution.
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', height: 200, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size="lg" />
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={<FileText size={36} />}
          title="No documents yet"
          description="Go back and select institutions to generate documents."
          action={{
            label: 'Select institutions',
            onClick: () => void navigate(`/cases/${caseId}/institutions`),
          }}
        />
      ) : (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden', animation: 'fadeInUp 0.35s 80ms both',
        }}>
          {/* Table header */}
          <div style={{
            padding: '16px 24px', borderBottom: '1px solid var(--border)',
            display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 16,
          }}>
            <span style={{
              fontSize: 11.5, fontWeight: 500,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}>
              Institution
            </span>
            <span style={{
              fontSize: 11.5, fontWeight: 500,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}>
              Status
            </span>
            <span />
          </div>

          {((): JSX.Element[] => {
            // Determine newest entry per institution key
            const latestIdByKey = new Map<string, string>();
            for (const doc of documents) {
              const key = `${doc.institutionType}::${doc.institutionName ?? ''}`;
              const current = latestIdByKey.get(key);
              if (!current) {
                latestIdByKey.set(key, doc.id);
              } else {
                const prev = documents.find((d) => d.id === current);
                if (prev && new Date(doc.createdAt) > new Date(prev.createdAt)) {
                  latestIdByKey.set(key, doc.id);
                }
              }
            }
            const duplicatedKeys = new Set(
              [...latestIdByKey.entries()]
                .filter(([key]) =>
                  documents.filter(
                    (d) => `${d.institutionType}::${d.institutionName ?? ''}` === key,
                  ).length > 1,
                )
                .map(([key]) => key),
            );

            return documents.map((doc, i) => {
              const key = `${doc.institutionType}::${doc.institutionName ?? ''}`;
              const isDuplicated = duplicatedKeys.has(key);
              const isLatest = latestIdByKey.get(key) === doc.id;
              const isGenerating =
                doc.status === GeneratedDocumentStatus.GENERATING ||
                doc.status === GeneratedDocumentStatus.PENDING;

              return (
                <div
                  key={doc.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr auto',
                    gap: 16, alignItems: 'center',
                    padding: '18px 24px',
                    borderBottom: i < documents.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background var(--transition)',
                  }}
                >
                  <div>
                    <div style={{
                      fontSize: 14.5, fontWeight: 450, color: 'var(--text)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      {doc.institutionName ?? INSTITUTION_LABELS[doc.institutionType]}
                      {isDuplicated && isLatest && (
                        <span style={{
                          background: 'var(--gold-light)', color: 'var(--gold)',
                          padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                        }}>
                          Latest
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', borderRadius: 20,
                      fontSize: 12.5, fontWeight: 500,
                      ...statusStyle(doc.status),
                    }}>
                      {isGenerating && <Spinner size="sm" color="var(--gold)" />}
                      {doc.status}
                    </span>
                  </div>

                  <div>
                    {doc.status === GeneratedDocumentStatus.READY && doc.downloadUrl ? (
                      <Button
                        size="sm"
                        onClick={() => window.open(doc.downloadUrl, '_blank')}
                      >
                        <Download size={14} />
                        Download
                      </Button>
                    ) : isGenerating ? (
                      <Spinner size="sm" />
                    ) : null}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      <div style={{
        marginTop: 32, display: 'flex', justifyContent: 'center',
        animation: 'fadeInUp 0.35s 160ms both',
      }}>
        <Button variant="secondary" onClick={() => void navigate('/cases')}>
          ← Back to all profiles
        </Button>
      </div>
    </div>
  );
}

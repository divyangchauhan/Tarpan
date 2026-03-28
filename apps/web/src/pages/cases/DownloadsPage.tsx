import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, XCircle, FileText } from 'lucide-react';
import type { GeneratedDocument } from '@afterlight/shared';
import { GeneratedDocumentStatus, InstitutionType } from '@afterlight/shared';
import { getGeneratedDocuments } from '@/api/generated-documents';
import { useToast } from '@/hooks/useToast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

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

function statusBadgeVariant(
  status: GeneratedDocumentStatus,
): 'info' | 'success' | 'warning' | 'error' | 'default' {
  switch (status) {
    case GeneratedDocumentStatus.READY:
      return 'success';
    case GeneratedDocumentStatus.GENERATING:
      return 'info';
    case GeneratedDocumentStatus.FAILED:
      return 'error';
    default:
      return 'warning';
  }
}

export function DownloadsPage(): JSX.Element {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function fetchDocuments(): void {
    if (!caseId) return;
    getGeneratedDocuments(caseId)
      .then((docs) => {
        setDocuments(docs);
        setLoading(false);

        const allDone = docs.every(
          (d) => d.status === GeneratedDocumentStatus.READY || d.status === GeneratedDocumentStatus.FAILED,
        );
        if (allDone && pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      })
      .catch(() => {
        toast('Failed to load documents', 'error');
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
    (d) => d.status === GeneratedDocumentStatus.GENERATING || d.status === GeneratedDocumentStatus.PENDING,
  ).length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <button
        onClick={() => void navigate(`/cases/${caseId}/institutions`)}
        className="mb-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to institutions
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Downloads</h1>
        <p className="mt-1 text-sm text-gray-500">
          {generatingCount > 0
            ? `${generatingCount} document${generatingCount !== 1 ? 's' : ''} still generating...`
            : `${readyCount} document${readyCount !== 1 ? 's' : ''} ready to download`}
        </p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="No documents yet"
          description="Go back and select institutions to generate documents."
          action={{
            label: 'Select institutions',
            onClick: () => void navigate(`/cases/${caseId}/institutions`),
          }}
        />
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {doc.institutionName ?? INSTITUTION_LABELS[doc.institutionType]}
                  </p>
                  <Badge variant={statusBadgeVariant(doc.status)} className="mt-1">
                    {doc.status === GeneratedDocumentStatus.GENERATING && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {doc.status === GeneratedDocumentStatus.FAILED && (
                      <XCircle className="h-3 w-3" />
                    )}
                    {doc.status}
                  </Badge>
                </div>
              </div>

              {doc.status === GeneratedDocumentStatus.READY && doc.downloadUrl && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.open(doc.downloadUrl, '_blank')}
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              )}

              {(doc.status === GeneratedDocumentStatus.GENERATING ||
                doc.status === GeneratedDocumentStatus.PENDING) && (
                <Spinner size="sm" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

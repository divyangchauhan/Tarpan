import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckSquare, Square } from 'lucide-react';
import { DocumentStatus, InstitutionType } from '@afterlight/shared';
import { getDocuments } from '@/api/documents';
import { createGeneratedDocument } from '@/api/generated-documents';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/Button';

interface InstitutionMeta {
  type: InstitutionType;
  label: string;
}

interface InstitutionGroup {
  category: string;
  institutions: InstitutionMeta[];
}

const INSTITUTION_GROUPS: InstitutionGroup[] = [
  {
    category: 'Government',
    institutions: [
      { type: InstitutionType.SOCIAL_SECURITY_ADMINISTRATION, label: 'Social Security Administration' },
      { type: InstitutionType.MEDICARE, label: 'Medicare' },
      { type: InstitutionType.IRS, label: 'Internal Revenue Service (IRS)' },
      { type: InstitutionType.VETERANS_AFFAIRS, label: "Veterans Affairs (VA)" },
      { type: InstitutionType.STATE_DMV, label: 'State DMV' },
      { type: InstitutionType.VOTER_REGISTRATION, label: 'Voter Registration' },
      { type: InstitutionType.PASSPORT, label: 'U.S. Passport Services' },
    ],
  },
  {
    category: 'Financial',
    institutions: [
      { type: InstitutionType.BANK, label: 'Bank / Credit Union' },
      { type: InstitutionType.CREDIT_CARD, label: 'Credit Card Issuer' },
      { type: InstitutionType.PENSION_401K, label: 'Pension / 401(k) Provider' },
      { type: InstitutionType.LIFE_INSURANCE, label: 'Life Insurance Company' },
    ],
  },
  {
    category: 'Utilities & Services',
    institutions: [
      { type: InstitutionType.USPS, label: 'U.S. Postal Service (USPS)' },
      { type: InstitutionType.SUBSCRIPTION_STREAMING, label: 'Streaming Subscriptions' },
      { type: InstitutionType.SUBSCRIPTION_UTILITY, label: 'Utility Providers' },
    ],
  },
  {
    category: 'Professional',
    institutions: [
      { type: InstitutionType.EMPLOYER_HR, label: 'Employer / HR Department' },
      { type: InstitutionType.PROFESSIONAL_LICENSE_BOARD, label: 'Professional License Board' },
    ],
  },
];

export function InstitutionsPage(): JSX.Element {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selected, setSelected] = useState<Set<InstitutionType>>(new Set());
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!caseId) return;
    getDocuments(caseId)
      .then((docs) => {
        const processed = docs.find((d) => d.status === DocumentStatus.PROCESSED);
        if (processed) {
          setDocumentId(processed.id);
        } else {
          toast('No processed death certificate found for this case. Please upload one first.', 'error');
        }
      })
      .catch(() => toast('Failed to load case documents', 'error'));
  }, [caseId, toast]);

  function toggle(type: InstitutionType): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  function selectAll(): void {
    const all = INSTITUTION_GROUPS.flatMap((g) => g.institutions.map((i) => i.type));
    setSelected(new Set(all));
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

    const results = await Promise.allSettled(
      types.map((institutionType) =>
        createGeneratedDocument(caseId, { documentId, institutionType }),
      ),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      toast(`${failed} document(s) failed to queue. Others are generating.`, 'error');
    } else {
      toast('All documents queued for generation!', 'success');
    }
    setGenerating(false);
    void navigate(`/cases/${caseId}/downloads`);
  }

  const allTypes = INSTITUTION_GROUPS.flatMap((g) => g.institutions.map((i) => i.type));
  const allSelected = allTypes.every((t) => selected.has(t));

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <button
        onClick={() => void navigate(`/cases/${caseId}/review`)}
        className="mb-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to review
      </button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Select institutions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Choose the institutions to notify. We&apos;ll generate a letter for each.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={allSelected ? clearAll : selectAll}>
            {allSelected ? 'Clear all' : 'Select all'}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {INSTITUTION_GROUPS.map((group) => (
          <div key={group.category} className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {group.category}
            </h2>
            <div className="space-y-2">
              {group.institutions.map((inst) => {
                const isSelected = selected.has(inst.type);
                return (
                  <button
                    key={inst.type}
                    onClick={() => toggle(inst.type)}
                    className={[
                      'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm transition-colors',
                      isSelected
                        ? 'bg-brand-50 text-brand-900'
                        : 'hover:bg-gray-50 text-gray-700',
                    ].join(' ')}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-5 w-5 text-brand-600 flex-shrink-0" />
                    ) : (
                      <Square className="h-5 w-5 text-gray-400 flex-shrink-0" />
                    )}
                    {inst.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {selected.size} institution{selected.size !== 1 ? 's' : ''} selected
        </p>
        <Button
          onClick={() => void handleGenerate()}
          disabled={selected.size === 0}
          loading={generating}
          size="lg"
        >
          Generate selected
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

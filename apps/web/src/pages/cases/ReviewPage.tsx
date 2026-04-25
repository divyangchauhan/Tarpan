import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowRight, Download, UploadCloud } from 'lucide-react';
import type { Case, Document } from '@afterlight/shared';
import { DocumentStatus } from '@afterlight/shared';
import { getCase, updateCase } from '@/api/cases';
import { getDocuments } from '@/api/documents';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Spinner } from '@/components/ui/Spinner';

const executorSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: z.string().min(1, 'Address is required'),
  relationship: z.string().min(1, 'Relationship is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
});

type ExecutorFormData = z.infer<typeof executorSchema>;

interface FieldRowProps {
  label: string;
  value?: string | number | null | undefined;
}

function FieldRow({ label, value }: FieldRowProps): JSX.Element {
  return (
    <div className="flex flex-col py-3 border-b border-gray-100 last:border-0 sm:flex-row">
      <dt className="mb-0.5 w-full flex-shrink-0 text-sm font-medium text-gray-500 sm:mb-0 sm:w-40">
        {label}
      </dt>
      <dd className="text-sm text-gray-900">
        {value ?? <span className="text-gray-400 italic">Not extracted</span>}
      </dd>
    </div>
  );
}

function hasRequiredExecutorFields(executorInfo: Case['executorInfo']): boolean {
  return !!(executorInfo?.name && executorInfo.address && executorInfo.relationship);
}

export function ReviewPage(): JSX.Element {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [processedDoc, setProcessedDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingExecutor, setSavingExecutor] = useState(false);
  const [savedExecutorInfo, setSavedExecutorInfo] = useState<Case['executorInfo']>(undefined);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExecutorFormData>({ resolver: zodResolver(executorSchema) });

  useEffect(() => {
    if (!caseId) return;
    Promise.all([getCase(caseId), getDocuments(caseId)])
      .then(([c, docs]) => {
        setCaseData(c);
        setSavedExecutorInfo(c.executorInfo);
        const processed = docs.find((d) => d.status === DocumentStatus.PROCESSED) ?? null;
        setProcessedDoc(processed);
        if (c.executorInfo) {
          reset({
            name: c.executorInfo.name,
            address: c.executorInfo.address,
            relationship: c.executorInfo.relationship,
            phone: c.executorInfo.phone ?? '',
            email: c.executorInfo.email ?? '',
          });
        }
      })
      .catch(() => toast('Failed to load case', 'error'))
      .finally(() => setLoading(false));
  }, [caseId, toast, reset]);

  async function onExecutorSubmit(data: ExecutorFormData): Promise<void> {
    if (!caseId) return;
    setSavingExecutor(true);
    try {
      const executorInfo = {
        name: data.name,
        address: data.address,
        relationship: data.relationship,
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.email ? { email: data.email } : {}),
      };
      const updated = await updateCase(caseId, { executorInfo });
      setSavedExecutorInfo(updated.executorInfo);
      toast('Executor information saved', 'success');
    } catch {
      toast('Failed to save executor information', 'error');
    } finally {
      setSavingExecutor(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-500">Case not found.</p>
      </div>
    );
  }

  const extracted = processedDoc?.extractedData;
  // extractedData may have camelCase keys (new processor output) or snake_case
  // keys (records processed before the camelCase fix). Cast to unknown so we
  // can read both without defeating TypeScript everywhere else.
  const raw = extracted as Record<string, unknown> | undefined;
  function exField(camel: string, snake: string): string | undefined {
    if (!raw) return undefined;
    const v = raw[camel] ?? raw[snake];
    return typeof v === 'string' ? v : undefined;
  }

  // Merge extracted fields with case.deceasedInfo — extraction takes priority,
  // case.deceasedInfo fills gaps (e.g. partial extraction or old-flow cases).
  const deceased = caseData.deceasedInfo;
  const firstName = exField('firstName', 'first_name') ?? deceased?.firstName;
  const middleName = exField('middleName', 'middle_name') ?? deceased?.middleName;
  const lastName = exField('lastName', 'last_name') ?? deceased?.lastName;
  const dateOfBirth = exField('dateOfBirth', 'date_of_birth') ?? deceased?.dateOfBirth;
  const dateOfDeath = exField('dateOfDeath', 'date_of_death') ?? deceased?.dateOfDeath;
  const placeOfDeath = exField('placeOfDeath', 'place_of_death') ?? deceased?.placeOfDeath;
  const hasSsn = !!(
    exField('socialSecurityNumber', 'social_security_number') ?? deceased?.socialSecurityNumber
  );
  const hasDeceasedData = !!(firstName ?? lastName ?? dateOfDeath);
  const executorComplete = hasRequiredExecutorFields(savedExecutorInfo);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-brand-600">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">
            3
          </span>
          Step 3 of 3 — Review
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Review extracted information</h1>
        <p className="mt-1 text-sm text-gray-500">
          Verify the information extracted from the death certificate and confirm your details.
        </p>
      </div>

      {/* Deceased info — from extracted certificate data or case record */}
      <section className="mb-6 rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Deceased&apos;s information
            {extracted && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                (extracted from death certificate)
              </span>
            )}
          </h2>
          {hasDeceasedData && (
            <button
              type="button"
              onClick={() => void navigate(`/cases/${caseId}/upload`)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 transition-colors"
            >
              <UploadCloud className="h-3 w-3" />
              Re-upload certificate
            </button>
          )}
        </div>
        {hasDeceasedData ? (
          <dl>
            <FieldRow label="First name" value={firstName} />
            <FieldRow label="Middle name" value={middleName} />
            <FieldRow label="Last name" value={lastName} />
            <FieldRow
              label="Date of birth"
              value={
                dateOfBirth
                  ? new Date(dateOfBirth).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : undefined
              }
            />
            <FieldRow
              label="Date of death"
              value={
                dateOfDeath
                  ? new Date(dateOfDeath).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : undefined
              }
            />
            <FieldRow label="Place of death" value={placeOfDeath} />
            <FieldRow label="SSN" value={hasSsn ? '•••–••–••••' : undefined} />
          </dl>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <UploadCloud className="h-10 w-10 text-gray-300" />
            <div>
              <p className="text-sm font-medium text-gray-700">No death certificate uploaded yet</p>
              <p className="mt-0.5 text-xs text-gray-400">
                Upload a certificate so our AI can extract the deceased&apos;s information.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void navigate(`/cases/${caseId}/upload`)}
            >
              <UploadCloud className="h-4 w-4" />
              Upload death certificate
            </Button>
          </div>
        )}
      </section>

      {/* Executor info — editable, pre-filled from step 1 */}
      <section className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-gray-900">
          Executor / Estate representative
        </h2>
        <p className="mb-5 text-sm text-gray-500">
          This information will appear on all generated letters. Update if anything has changed.
        </p>

        <form
          onSubmit={(e) => void handleSubmit(onExecutorSubmit)(e)}
          className="space-y-5"
          noValidate
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ex-name" required>
                Full name
              </Label>
              <Input
                id="ex-name"
                type="text"
                autoComplete="name"
                error={errors.name?.message}
                {...register('name')}
              />
            </div>
            <div>
              <Label htmlFor="ex-relationship" required>
                Relationship to deceased
              </Label>
              <Input
                id="ex-relationship"
                type="text"
                placeholder="e.g. Spouse, Child, Executor"
                autoComplete="off"
                error={errors.relationship?.message}
                {...register('relationship')}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ex-address" required>
              Mailing address
            </Label>
            <Input
              id="ex-address"
              type="text"
              placeholder="123 Main St, City, State 12345"
              autoComplete="street-address"
              error={errors.address?.message}
              {...register('address')}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ex-phone">Phone number</Label>
              <Input
                id="ex-phone"
                type="tel"
                placeholder="555-123-4567"
                autoComplete="tel"
                error={errors.phone?.message}
                {...register('phone')}
              />
            </div>
            <div>
              <Label htmlFor="ex-email">Email address</Label>
              <Input
                id="ex-email"
                type="email"
                placeholder="executor@example.com"
                autoComplete="email"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>
          </div>

          {!executorComplete && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                Save your executor information (name, address, and relationship are required) before
                continuing to institutions.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <Button type="submit" variant="secondary" loading={savingExecutor}>
                Save executor info
              </Button>
              {processedDoc && (
                <button
                  type="button"
                  onClick={() => void navigate(`/cases/${caseId}/downloads`)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  View downloads
                </button>
              )}
            </div>

            <Button
              type="button"
              disabled={!executorComplete}
              onClick={() => void navigate(`/cases/${caseId}/institutions`)}
              title={
                !executorComplete
                  ? 'Save executor information (name, address, relationship) first'
                  : undefined
              }
            >
              Continue to institutions
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

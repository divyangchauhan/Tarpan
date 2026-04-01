import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Download, UploadCloud } from 'lucide-react';
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
    <div className="flex py-3 border-b border-gray-100 last:border-0">
      <dt className="w-48 flex-shrink-0 text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{value ?? <span className="text-gray-400 italic">Not extracted</span>}</dd>
    </div>
  );
}

export function ReviewPage(): JSX.Element {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [processedDoc, setProcessedDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingExecutor, setSavingExecutor] = useState(false);

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
      await updateCase(caseId, { executorInfo });
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

  const { deceasedInfo } = caseData;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Review extracted information</h1>
        <p className="mt-1 text-sm text-gray-500">
          Verify the information extracted from the death certificate, then add executor details.
        </p>
      </div>

      {/* Deceased info — read-only */}
      <section className="mb-6 rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Deceased&apos;s information</h2>
        <dl>
          <FieldRow label="First name" value={deceasedInfo.firstName} />
          <FieldRow label="Middle name" value={deceasedInfo.middleName} />
          <FieldRow label="Last name" value={deceasedInfo.lastName} />
          <FieldRow
            label="Date of birth"
            value={new Date(deceasedInfo.dateOfBirth).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          />
          <FieldRow
            label="Date of death"
            value={new Date(deceasedInfo.dateOfDeath).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          />
          <FieldRow label="Place of death" value={deceasedInfo.placeOfDeath} />
          <FieldRow
            label="SSN"
            value={deceasedInfo.socialSecurityNumber ? '•••–••–••••' : undefined}
          />
        </dl>
      </section>

      {/* Executor info — editable */}
      <section className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Executor / Estate representative</h2>
        <p className="mb-5 text-sm text-gray-500">
          This person&apos;s information will appear on all generated letters.
        </p>

        <form onSubmit={(e) => void handleSubmit(onExecutorSubmit)(e)} className="space-y-5" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <Label htmlFor="ex-name" required>Full name</Label>
              <Input
                id="ex-name"
                type="text"
                autoComplete="name"
                error={errors.name?.message}
                {...register('name')}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label htmlFor="ex-relationship" required>Relationship to deceased</Label>
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
            <Label htmlFor="ex-address" required>Mailing address</Label>
            <Input
              id="ex-address"
              type="text"
              placeholder="123 Main St, City, State 12345"
              autoComplete="street-address"
              error={errors.address?.message}
              {...register('address')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
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

          <div className="flex items-center justify-between pt-2">
            <Button type="submit" variant="secondary" loading={savingExecutor}>
              Save executor info
            </Button>
            {processedDoc ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void navigate(`/cases/${caseId}/downloads`)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  View downloads
                </button>
                <Button
                  type="button"
                  onClick={() => void navigate(`/cases/${caseId}/institutions`)}
                >
                  Continue to institutions
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void navigate(`/cases/${caseId}/upload`)}
              >
                <UploadCloud className="h-4 w-4" />
                Upload death certificate
              </Button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

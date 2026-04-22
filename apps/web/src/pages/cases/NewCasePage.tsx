import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { createCase } from '@/api/cases';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  dateOfDeath: z.string().min(1, 'Date of death is required'),
  placeOfDeath: z.string().min(1, 'Place of death is required'),
  socialSecurityNumber: z
    .string()
    .regex(/^\d{3}-\d{2}-\d{4}$/, 'Format: 123-45-6789')
    .optional()
    .or(z.literal('')),
});

type FormData = z.infer<typeof schema>;

export function NewCasePage(): JSX.Element {
  const navigate = useNavigate();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData): Promise<void> {
    try {
      const deceasedInfo = {
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        dateOfDeath: data.dateOfDeath,
        placeOfDeath: data.placeOfDeath,
        ...(data.middleName ? { middleName: data.middleName } : {}),
        ...(data.socialSecurityNumber ? { socialSecurityNumber: data.socialSecurityNumber } : {}),
      };
      const newCase = await createCase({ deceasedInfo });
      toast('Case created successfully', 'success');
      void navigate(`/cases/${newCase.id}/upload`);
    } catch {
      toast('Failed to create case. Please try again.', 'error');
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <button
        onClick={() => void navigate('/cases')}
        className="mb-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to cases
      </button>

      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-brand-600">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">
            1
          </span>
          Step 1 of 3 — Deceased&apos;s information
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Enter deceased&apos;s information</h1>
        <p className="mt-1 text-sm text-gray-500">
          This information will be used to generate official correspondence.
        </p>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200 sm:p-8">
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-5" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName" required>
                First name
              </Label>
              <Input
                id="firstName"
                type="text"
                error={errors.firstName?.message}
                {...register('firstName')}
              />
            </div>
            <div>
              <Label htmlFor="middleName">Middle name</Label>
              <Input
                id="middleName"
                type="text"
                error={errors.middleName?.message}
                {...register('middleName')}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="lastName" required>
              Last name
            </Label>
            <Input
              id="lastName"
              type="text"
              error={errors.lastName?.message}
              {...register('lastName')}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="dateOfBirth" required>
                Date of birth
              </Label>
              <Input
                id="dateOfBirth"
                type="date"
                error={errors.dateOfBirth?.message}
                {...register('dateOfBirth')}
              />
            </div>
            <div>
              <Label htmlFor="dateOfDeath" required>
                Date of death
              </Label>
              <Input
                id="dateOfDeath"
                type="date"
                error={errors.dateOfDeath?.message}
                {...register('dateOfDeath')}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="placeOfDeath" required>
              Place of death
            </Label>
            <Input
              id="placeOfDeath"
              type="text"
              placeholder="City, State"
              error={errors.placeOfDeath?.message}
              {...register('placeOfDeath')}
            />
          </div>

          <div>
            <Label htmlFor="socialSecurityNumber">Social Security Number (optional)</Label>
            <Input
              id="socialSecurityNumber"
              type="text"
              placeholder="123-45-6789"
              error={errors.socialSecurityNumber?.message}
              {...register('socialSecurityNumber')}
            />
            <p className="mt-1 text-xs text-gray-500">
              Stored encrypted. Used only for official documents.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={isSubmitting} size="lg">
              Continue to upload
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

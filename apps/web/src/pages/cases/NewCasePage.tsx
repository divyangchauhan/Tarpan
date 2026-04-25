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
  name: z.string().min(1, 'Full name is required'),
  address: z.string().min(1, 'Mailing address is required'),
  relationship: z.string().min(1, 'Relationship is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
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
      const executorInfo = {
        name: data.name,
        address: data.address,
        relationship: data.relationship,
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.email ? { email: data.email } : {}),
      };
      const newCase = await createCase({ executorInfo });
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
          Step 1 of 3 — Your information
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Enter your information</h1>
        <p className="mt-1 text-sm text-gray-500">
          As the executor or estate representative, your details will appear on all generated
          correspondence.
        </p>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200 sm:p-8">
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-5" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name" required>
                Full name
              </Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                error={errors.name?.message}
                {...register('name')}
              />
            </div>
            <div>
              <Label htmlFor="relationship" required>
                Relationship to deceased
              </Label>
              <Input
                id="relationship"
                type="text"
                placeholder="e.g. Spouse, Child, Executor"
                autoComplete="off"
                error={errors.relationship?.message}
                {...register('relationship')}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="address" required>
              Mailing address
            </Label>
            <Input
              id="address"
              type="text"
              placeholder="123 Main St, City, State 12345"
              autoComplete="street-address"
              error={errors.address?.message}
              {...register('address')}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="555-123-4567"
                autoComplete="tel"
                error={errors.phone?.message}
                {...register('phone')}
              />
            </div>
            <div>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>
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

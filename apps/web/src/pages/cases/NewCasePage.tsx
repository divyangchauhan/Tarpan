import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { createCase } from '@/api/cases';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ProgressBar } from '@/components/ui/ProgressBar';

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
    <div style={{ padding: '56px 64px', maxWidth: 720 }}>
      <ProgressBar stage="info" />

      <h1 style={{
        fontFamily: 'var(--serif)', fontSize: 40, fontWeight: 300,
        marginBottom: 8, color: 'var(--text)',
        animation: 'fadeInUp 0.35s both',
      }}>
        Your information
      </h1>
      <p style={{
        fontSize: 15, color: 'var(--text-muted)', marginBottom: 40,
        lineHeight: 1.6, animation: 'fadeInUp 0.35s 60ms both',
      }}>
        As the executor, we need a few details about you.<br />
        This information will appear on every letter we generate.
      </p>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
        padding: '36px 40px', animation: 'fadeInUp 0.35s 100ms both',
      }}>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <Label htmlFor="name">Your full legal name</Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                placeholder="Jane Smith"
                error={errors.name?.message}
                {...register('name')}
              />
            </div>

            <div>
              <Label htmlFor="address">Your mailing address</Label>
              <Input
                id="address"
                type="text"
                placeholder="123 Main St, City, State, ZIP"
                autoComplete="street-address"
                error={errors.address?.message}
                {...register('address')}
              />
              <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-faint)' }}>
                This will appear on all generated correspondence.
              </p>
            </div>

            <div>
              <Label htmlFor="relationship">Relationship to the deceased</Label>
              <select
                id="relationship"
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 14,
                  border: `1px solid ${errors.relationship ? 'var(--error)' : 'var(--border-strong)'}`,
                  borderRadius: 8, background: 'var(--surface)',
                  color: 'var(--text)', outline: 'none', fontFamily: 'var(--sans)',
                  transition: 'all var(--transition)',
                }}
                {...register('relationship')}
              >
                <option value="">Select relationship…</option>
                {['Spouse', 'Child', 'Parent', 'Sibling', 'Grandchild', 'Trustee', 'Other'].map(
                  (r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ),
                )}
              </select>
              {errors.relationship && (
                <p style={{ marginTop: 4, fontSize: 12, color: 'var(--error)' }}>
                  {errors.relationship.message}
                </p>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(555) 000-0000"
                  autoComplete="tel"
                  error={errors.phone?.message}
                  {...register('phone')}
                />
              </div>
              <div>
                <Label htmlFor="email">Email (optional)</Label>
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
          </div>

          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => void navigate('/cases')}
              style={{
                fontSize: 13.5, color: 'var(--text-muted)',
                background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: 'var(--sans)',
                transition: 'color var(--transition)',
              }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.color = 'var(--text)')}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.color = 'var(--text-muted)')}
            >
              ← Back to cases
            </button>
            <Button type="submit" size="lg" loading={isSubmitting}>
              Continue to Upload →
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

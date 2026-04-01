import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { Moon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Please enter a valid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

type FormData = z.infer<typeof schema>;

export function RegisterPage(): JSX.Element {
  const { register: registerUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData): Promise<void> {
    try {
      await registerUser(data);
      void navigate('/cases');
    } catch {
      toast('Registration failed. This email may already be in use.', 'error');
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-950">
            <Moon className="h-7 w-7 text-brand-300" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">
            AfterLight helps you manage estate notifications.
          </p>
        </div>

        <div className="rounded-xl bg-white p-8 shadow-sm border border-gray-200">
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-5" noValidate>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName" required>
                  First name
                </Label>
                <Input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  error={errors.firstName?.message}
                  {...register('firstName')}
                />
              </div>
              <div>
                <Label htmlFor="lastName" required>
                  Last name
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  error={errors.lastName?.message}
                  {...register('lastName')}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="email" required>
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>

            <div>
              <Label htmlFor="password" required>
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                error={errors.password?.message}
                {...register('password')}
              />
            </div>

            <Button type="submit" className="w-full" loading={isSubmitting}>
              Create account
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

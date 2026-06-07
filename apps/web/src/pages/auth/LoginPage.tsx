import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { FlameIcon } from '@/components/ui/FlameIcon';

const schema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

const FEATURES = [
  'Reads death certificates with AI',
  'Generates institution-specific letters',
  'Secure and confidential',
];

export function LoginPage(): JSX.Element {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const message = sessionStorage.getItem('authMessage');
    if (message) {
      sessionStorage.removeItem('authMessage');
      toast(message, 'info');
    }
  }, [toast]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData): Promise<void> {
    try {
      await login(data);
      void navigate('/cases');
    } catch {
      toast('Invalid email or password. Please try again.', 'error');
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--cream)', padding: 24,
    }}>
      {/* Left decorative panel */}
      <div style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: '42%',
        background: 'var(--sidebar)',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '60px 56px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <FlameIcon size={28} />
          <span style={{
            fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 500, color: 'white',
          }}>
            Tarpan
          </span>
        </div>
        <h2 style={{
          fontFamily: 'var(--serif)', fontSize: 36, fontWeight: 300,
          color: 'white', lineHeight: 1.3, marginBottom: 20, fontStyle: 'italic',
        }}>
          Handling the paperwork,<br />so you can grieve.
        </h2>
        <p style={{ fontSize: 14.5, color: 'var(--sidebar-muted)', lineHeight: 1.7, maxWidth: 340 }}>
          Tarpan reads the death certificate and generates the correct legal letters for every
          institution that needs to be notified — guided, step by step.
        </p>
        <div style={{ marginTop: 48, paddingTop: 48, borderTop: '1px solid var(--sidebar-border)' }}>
          {FEATURES.map((f) => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--sidebar-accent)', flexShrink: 0,
              }} />
              <span style={{ fontSize: 13.5, color: 'var(--sidebar-text)' }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <div style={{ marginLeft: '42%', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div style={{
          width: '100%', maxWidth: 420, padding: '48px 40px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)',
          animation: 'fadeInUp 0.4s both',
        }}>
          <h1 style={{
            fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, marginBottom: 6,
            color: 'var(--text)',
          }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 32, lineHeight: 1.5 }}>
            Sign in to continue your work.
          </p>

          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <Label htmlFor="email">Email address</Label>
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
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  error={errors.password?.message}
                  {...register('password')}
                />
              </div>
              <Button
                type="submit"
                size="lg"
                loading={isSubmitting}
                style={{ width: '100%', marginTop: 4 }}
              >
                Sign in
              </Button>
            </div>
          </form>

          <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--text-muted)', marginTop: 24 }}>
            Don&apos;t have an account?{' '}
            <Link
              to="/register"
              style={{ color: 'var(--gold)', fontWeight: 500 }}
            >
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

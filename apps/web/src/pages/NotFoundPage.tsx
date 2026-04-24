import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export function NotFoundPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-6xl font-bold text-brand-200">404</h1>
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Page not found</h2>
        <p className="mt-2 text-gray-500">The page you&apos;re looking for doesn&apos;t exist.</p>
      </div>
      <Button onClick={() => void navigate('/cases')}>Go to dashboard</Button>
    </div>
  );
}

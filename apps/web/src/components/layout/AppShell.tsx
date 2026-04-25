import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ActiveCaseProvider } from '@/context/ActiveCaseContext';
import { Sidebar } from './Sidebar';
import { Spinner } from '@/components/ui/Spinner';

export function AppShell(): JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex', height: '100vh',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--cream)',
      }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ActiveCaseProvider>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar />
        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--cream)' }}>
          <Outlet />
        </main>
      </div>
    </ActiveCaseProvider>
  );
}

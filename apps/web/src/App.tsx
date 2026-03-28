import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { CasesPage } from '@/pages/cases/CasesPage';
import { NewCasePage } from '@/pages/cases/NewCasePage';
import { UploadPage } from '@/pages/cases/UploadPage';
import { ProcessingPage } from '@/pages/cases/ProcessingPage';
import { ReviewPage } from '@/pages/cases/ReviewPage';
import { InstitutionsPage } from '@/pages/cases/InstitutionsPage';
import { DownloadsPage } from '@/pages/cases/DownloadsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected routes */}
            <Route element={<AppShell />}>
              <Route path="/cases" element={<CasesPage />} />
              <Route path="/cases/new" element={<NewCasePage />} />
              <Route path="/cases/:caseId/upload" element={<UploadPage />} />
              <Route path="/cases/:caseId/processing" element={<ProcessingPage />} />
              <Route path="/cases/:caseId/review" element={<ReviewPage />} />
              <Route path="/cases/:caseId/institutions" element={<InstitutionsPage />} />
              <Route path="/cases/:caseId/downloads" element={<DownloadsPage />} />
            </Route>

            {/* Root redirect */}
            <Route path="/" element={<Navigate to="/cases" replace />} />

            {/* 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

import { Routes, Route } from 'react-router-dom';

// Placeholder pages — full implementations in PR #6
function HomePage(): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-950 text-white">
      <h1 className="text-4xl font-bold tracking-tight">AfterLight</h1>
      <p className="mt-4 text-brand-300">
        Automating the administrative burden families face after losing a loved one.
      </p>
    </div>
  );
}

function NotFoundPage(): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-2xl font-semibold">404 — Page not found</h1>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

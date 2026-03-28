import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen } from 'lucide-react';
import type { Case } from '@afterlight/shared';
import { CaseStatus } from '@afterlight/shared';
import { getCases } from '@/api/cases';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';

const statusVariant: Record<CaseStatus, 'info' | 'success' | 'default'> = {
  [CaseStatus.ACTIVE]: 'info',
  [CaseStatus.COMPLETED]: 'success',
  [CaseStatus.ARCHIVED]: 'default',
};

export function CasesPage(): JSX.Element {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    getCases()
      .then(setCases)
      .catch(() => toast('Failed to load cases', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  function handleNewCase(): void {
    void navigate('/cases/new');
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cases</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage estate notification cases
          </p>
        </div>
        <Button onClick={handleNewCase}>
          <Plus className="h-4 w-4" />
          New Case
        </Button>
      </div>

      {cases.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-12 w-12" />}
          title="No cases yet"
          description="Create your first case to start managing estate notifications."
          action={{ label: 'New Case', onClick: handleNewCase }}
        />
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => void navigate(`/cases/${c.id}/review`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && void navigate(`/cases/${c.id}/review`)}
            >
              <div>
                <p className="font-semibold text-gray-900">
                  {c.deceasedInfo.firstName} {c.deceasedInfo.lastName}
                </p>
                <p className="text-sm text-gray-500">
                  Date of death:{' '}
                  {new Date(c.deceasedInfo.dateOfDeath).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant={statusVariant[c.status]}>{c.status}</Badge>
                <p className="text-xs text-gray-400">
                  {new Date(c.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

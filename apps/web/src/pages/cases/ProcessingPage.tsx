import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { DocumentStatus, WsEvent } from '@afterlight/shared';
import type { WsDocumentEvent } from '@afterlight/shared';
import { getDocument } from '@/api/documents';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/Button';

const POLL_INTERVAL_MS = 3000;

export function ProcessingPage(): JSX.Element {
  const { caseId } = useParams<{ caseId: string }>();
  const [searchParams] = useSearchParams();
  const documentId = searchParams.get('documentId') ?? '';
  const navigate = useNavigate();
  const { toast } = useToast();

  const [status, setStatus] = useState<DocumentStatus>(DocumentStatus.PENDING);
  const [statusMessage, setStatusMessage] = useState('Uploading to secure storage...');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigatedRef = useRef(false);
  const pollFailuresRef = useRef(0);
  const MAX_POLL_FAILURES = 5;

  function stopPolling(): void {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  function handleTerminalStatus(docStatus: DocumentStatus): void {
    if (navigatedRef.current) return;
    stopPolling();
    if (docStatus === DocumentStatus.PROCESSED) {
      navigatedRef.current = true;
      toast('Death certificate processed successfully!', 'success');
      void navigate(`/cases/${caseId}/review`);
    } else if (docStatus === DocumentStatus.FAILED) {
      setStatus(DocumentStatus.FAILED);
      setStatusMessage('Processing failed. Please try uploading again.');
    }
  }

  useEffect((): (() => void) | void => {
    if (!documentId) return;

    async function poll(): Promise<void> {
      try {
        const doc = await getDocument(caseId ?? '', documentId);
        setStatus(doc.status);

        if (doc.status === DocumentStatus.PROCESSING) {
          setStatusMessage('Extracting information with AI...');
        }

        if (
          doc.status === DocumentStatus.PROCESSED ||
          doc.status === DocumentStatus.FAILED
        ) {
          handleTerminalStatus(doc.status);
        }
        pollFailuresRef.current = 0;
      } catch {
        pollFailuresRef.current += 1;
        if (pollFailuresRef.current >= MAX_POLL_FAILURES) {
          stopPolling();
          toast('Unable to check processing status. Please refresh the page.', 'error');
        }
      }
    }

    void poll();
    pollingRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return (): void => stopPolling();
  }, [documentId]);

  useWebSocket({
    caseId: caseId ?? '',
    enabled: Boolean(caseId && documentId),
    events: {
      [WsEvent.DOCUMENT_PROCESSING_STARTED]: () => {
        setStatus(DocumentStatus.PROCESSING);
        setStatusMessage('Extracting information with AI...');
      },
      [WsEvent.DOCUMENT_PROCESSING_COMPLETE]: (data: unknown) => {
        const event = data as WsDocumentEvent;
        if (event.documentId === documentId) {
          handleTerminalStatus(DocumentStatus.PROCESSED);
        }
      },
      [WsEvent.DOCUMENT_PROCESSING_FAILED]: (data: unknown) => {
        const event = data as WsDocumentEvent;
        if (event.documentId === documentId) {
          handleTerminalStatus(DocumentStatus.FAILED);
        }
      },
    },
  });

  const isFailed = status === DocumentStatus.FAILED;

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {isFailed ? (
          <XCircle className="mx-auto mb-6 h-16 w-16 text-red-400" />
        ) : status === DocumentStatus.PROCESSED ? (
          <CheckCircle className="mx-auto mb-6 h-16 w-16 text-green-400" />
        ) : (
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-brand-600" />
          </div>
        )}

        <h1 className="text-2xl font-bold text-gray-900">
          {isFailed ? 'Processing failed' : 'Processing your document'}
        </h1>
        <p className="mt-3 text-gray-500">{statusMessage}</p>

        {!isFailed && (
          <div className="mt-8 space-y-3">
            {[
              { label: 'Secure upload', done: true },
              {
                label: 'AI extraction',
                done: status === DocumentStatus.PROCESSED,
                active: status === DocumentStatus.PROCESSING,
              },
              {
                label: 'Review ready',
                done: status === DocumentStatus.PROCESSED,
              },
            ].map((step) => (
              <div key={step.label} className="flex items-center gap-3 text-sm">
                <span
                  className={[
                    'h-2 w-2 rounded-full',
                    step.done
                      ? 'bg-green-500'
                      : step.active
                        ? 'bg-brand-500 animate-pulse'
                        : 'bg-gray-200',
                  ].join(' ')}
                />
                <span
                  className={step.done ? 'text-green-700' : step.active ? 'text-brand-700' : 'text-gray-400'}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {isFailed && (
          <div className="mt-8">
            <Button onClick={() => void navigate(`/cases/${caseId}/upload`)}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

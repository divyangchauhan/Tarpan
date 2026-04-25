import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DocumentStatus, WsEvent } from '@afterlight/shared';
import type { WsDocumentEvent } from '@afterlight/shared';
import { getDocument } from '@/api/documents';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Spinner } from '@/components/ui/Spinner';
import { FlameIcon } from '@/components/ui/FlameIcon';

const POLL_INTERVAL_MS = 3000;

const STATUS_STEPS = [
  'Uploading certificate…',
  'Scanning document…',
  'Reading certificate…',
  'Extracting personal details…',
  'Verifying information…',
  'Finalizing extraction…',
];

export function ProcessingPage(): JSX.Element {
  const { caseId } = useParams<{ caseId: string }>();
  const [searchParams] = useSearchParams();
  const documentId = searchParams.get('documentId') ?? '';
  const navigate = useNavigate();
  const { toast } = useToast();

  const [status, setStatus] = useState<DocumentStatus>(DocumentStatus.PENDING);
  const [stepIdx, setStepIdx] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigatedRef = useRef(false);
  const pollFailuresRef = useRef(0);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_POLL_FAILURES = 5;

  // Animate through status steps while processing
  useEffect(() => {
    stepTimerRef.current = setInterval((): void => {
      setStepIdx((i) => Math.min(i + 1, STATUS_STEPS.length - 1));
    }, 1200);
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    };
  }, []);

  function stopPolling(): void {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  function handleTerminalStatus(docStatus: DocumentStatus): void {
    if (navigatedRef.current) return;
    stopPolling();
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    if (docStatus === DocumentStatus.PROCESSED) {
      navigatedRef.current = true;
      setStepIdx(STATUS_STEPS.length - 1);
      toast('Death certificate processed successfully!', 'success');
      setTimeout(() => void navigate(`/cases/${caseId}/review`), 800);
    } else if (docStatus === DocumentStatus.FAILED) {
      setStatus(DocumentStatus.FAILED);
    }
  }

  useEffect((): (() => void) | void => {
    if (!documentId) return;

    async function poll(): Promise<void> {
      try {
        const doc = await getDocument(caseId ?? '', documentId);
        setStatus(doc.status);
        if (doc.status === DocumentStatus.PROCESSED || doc.status === DocumentStatus.FAILED) {
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
  const isDone = status === DocumentStatus.PROCESSED;
  const progress = isDone ? 100 : Math.round((stepIdx / (STATUS_STEPS.length - 1)) * 100);

  return (
    <div style={{ padding: '56px 64px', maxWidth: 720 }}>
      <ProgressBar stage="processing" />

      <h1 style={{
        fontFamily: 'var(--serif)', fontSize: 40, fontWeight: 300,
        marginBottom: 8, color: 'var(--text)',
        animation: 'fadeInUp 0.35s both',
      }}>
        {isFailed ? 'Processing failed' : 'Reading the certificate'}
      </h1>
      <p style={{
        fontSize: 15, color: 'var(--text-muted)', marginBottom: 40,
        lineHeight: 1.6, animation: 'fadeInUp 0.35s 60ms both',
      }}>
        {isFailed
          ? 'Something went wrong. Please try uploading again.'
          : 'This takes about 30 seconds. You can leave and come back — we\'ll save your progress.'}
      </p>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
        padding: '48px 40px', animation: 'fadeInUp 0.35s 100ms both',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          {isFailed ? (
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--error-bg)', border: '2px solid var(--error)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, marginBottom: 24, animation: 'fadeIn 0.4s both',
            }}>
              ✕
            </div>
          ) : isDone ? (
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--success-bg)', border: '2px solid var(--success)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, marginBottom: 24, animation: 'fadeIn 0.4s both',
            }}>
              ✓
            </div>
          ) : (
            <div style={{ position: 'relative', width: 64, height: 64, marginBottom: 24 }}>
              <Spinner size="lg" />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FlameIcon size={22} color="var(--gold)" />
              </div>
            </div>
          )}

          <div style={{ minHeight: 64, marginBottom: 8 }}>
            {STATUS_STEPS.slice(0, stepIdx + 1).map((s, i) => (
              <div
                key={i}
                style={{
                  fontSize: i === stepIdx ? 16 : 13.5,
                  color: i === stepIdx ? 'var(--text)' : 'var(--text-faint)',
                  fontWeight: i === stepIdx ? 450 : 300,
                  marginBottom: 6,
                  animation: 'fadeInUp 0.3s both',
                }}
              >
                {i === stepIdx && !isDone ? (
                  <span style={{ animation: 'pulse-soft 1.5s infinite' }}>{s}</span>
                ) : i === stepIdx && isDone ? (
                  'Complete!'
                ) : (
                  s
                )}
              </div>
            ))}
          </div>

          <div style={{
            width: '100%', height: 4, background: 'var(--border)',
            borderRadius: 4, marginTop: 32, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 4, background: 'var(--gold)',
              width: `${progress}%`,
              transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            }} />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 8 }}>
            {progress}% complete
          </div>

          {isFailed && (
            <div style={{ marginTop: 32 }}>
              <Button onClick={() => void navigate(`/cases/${caseId}/upload`)}>
                Try again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createDocument, uploadToS3, enqueueProcessing } from '@/api/documents';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];
const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.tiff,.tif';
const MAX_SIZE_MB = 20;

export function UploadPage(): JSX.Element {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  function validateFile(f: File): string | null {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      return 'Only PDF, JPEG, PNG, and TIFF files are accepted.';
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File must be smaller than ${MAX_SIZE_MB} MB.`;
    }
    return null;
  }

  function handleFileSelect(selectedFile: File): void {
    const error = validateFile(selectedFile);
    if (error) {
      toast(error, 'error');
      return;
    }
    setFile(selectedFile);
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const selected = e.target.files?.[0];
    if (selected) handleFileSelect(selected);
  }

  async function handleUpload(): Promise<void> {
    if (!file || !caseId) return;
    setUploading(true);
    try {
      const { uploadUrl, document } = await createDocument(caseId, {
        fileName: file.name,
        contentType: file.type,
      });
      await uploadToS3(uploadUrl, file);
      await enqueueProcessing(caseId, document.id);
      toast('Death certificate uploaded. Processing will begin shortly.', 'success');
      void navigate(`/cases/${caseId}/processing?documentId=${document.id}`);
    } catch {
      toast('Upload failed. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ padding: '56px 64px', maxWidth: 720 }}>
      <ProgressBar stage="upload" />

      <h1 style={{
        fontFamily: 'var(--serif)', fontSize: 40, fontWeight: 300,
        marginBottom: 8, color: 'var(--text)',
        animation: 'fadeInUp 0.35s both',
      }}>
        Upload the death certificate
      </h1>
      <p style={{
        fontSize: 15, color: 'var(--text-muted)', marginBottom: 40,
        lineHeight: 1.6, animation: 'fadeInUp 0.35s 60ms both',
      }}>
        Our AI will read the document and extract the necessary information.<br />
        Your file is encrypted and never shared.
      </p>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
        padding: 8, animation: 'fadeInUp 0.35s 100ms both',
      }}>
        {!file ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input')?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && document.getElementById('file-input')?.click()}
            style={{
              border: `2px dashed ${isDragOver ? 'var(--gold)' : 'var(--border-strong)'}`,
              borderRadius: 12, padding: '64px 40px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', textAlign: 'center',
              background: isDragOver ? 'var(--gold-light)' : 'var(--cream)',
              transition: 'all var(--transition)',
            }}
          >
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--gold-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20, fontSize: 24,
            }}>
              📄
            </div>
            <h3 style={{
              fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 400,
              marginBottom: 8, color: 'var(--text)',
            }}>
              {isDragOver ? 'Drop it here' : 'Drag & drop your certificate'}
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
              or click to browse your files
            </p>
            <span style={{
              fontSize: 12.5, color: 'var(--text-faint)',
              background: 'var(--border)', padding: '4px 12px', borderRadius: 20,
            }}>
              PDF, JPG, or PNG accepted
            </span>
            <input
              id="file-input"
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleInputChange}
              style={{ display: 'none' }}
            />
          </div>
        ) : (
          <div style={{ padding: '24px 28px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '16px 20px', background: 'var(--gold-light)',
              borderRadius: 10, marginBottom: 24,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                background: 'white', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 20,
              }}>
                📄
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>
                  {file.name}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>
              <button
                onClick={() => setFile(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 18, color: 'var(--text-faint)', padding: 4,
                  borderRadius: 4, transition: 'color var(--transition)',
                }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
              Ready to upload. Our AI will extract the deceased&apos;s name, dates, and other
              information from this certificate.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <Button variant="secondary" onClick={() => setFile(null)}>
                Remove file
              </Button>
              <Button onClick={() => void handleUpload()} loading={uploading}>
                Upload & Continue →
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

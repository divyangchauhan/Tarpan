import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, UploadCloud, FileText, X } from 'lucide-react';
import { createDocument, uploadToS3, confirmUpload } from '@/api/documents';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/Button';

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

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFileSelect(dropped);
    },
    [],
  );

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
      await confirmUpload(document.id);

      toast('Death certificate uploaded. Processing will begin shortly.', 'success');
      void navigate(`/cases/${caseId}/processing?documentId=${document.id}`);
    } catch {
      toast('Upload failed. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <button
        onClick={() => void navigate('/cases')}
        className="mb-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to cases
      </button>

      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-brand-600">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">
            2
          </span>
          Step 2 of 3 — Upload death certificate
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Upload death certificate</h1>
        <p className="mt-1 text-sm text-gray-500">
          Our AI will extract information from the certificate automatically.
        </p>
      </div>

      <div className="rounded-xl bg-white p-8 shadow-sm border border-gray-200 space-y-6">
        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={[
            'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors cursor-pointer',
            isDragOver
              ? 'border-brand-400 bg-brand-50'
              : 'border-gray-300 hover:border-brand-300 hover:bg-gray-50',
          ].join(' ')}
          onClick={() => document.getElementById('file-input')?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && document.getElementById('file-input')?.click()}
        >
          <UploadCloud
            className={['h-12 w-12 mb-3', isDragOver ? 'text-brand-500' : 'text-gray-400'].join(
              ' ',
            )}
          />
          <p className="text-sm font-medium text-gray-700">
            Drag and drop your death certificate here
          </p>
          <p className="mt-1 text-xs text-gray-500">
            PDF, JPEG, PNG, or TIFF — max {MAX_SIZE_MB} MB
          </p>
          <input
            id="file-input"
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleInputChange}
            className="hidden"
          />
        </div>

        {/* Selected file */}
        {file && (
          <div className="flex items-center gap-3 rounded-lg bg-brand-50 border border-brand-200 px-4 py-3">
            <FileText className="h-5 w-5 text-brand-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-brand-900 truncate">{file.name}</p>
              <p className="text-xs text-brand-600">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <button
              onClick={() => setFile(null)}
              className="text-brand-500 hover:text-brand-700"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={() => void handleUpload()}
            disabled={!file}
            loading={uploading}
            size="lg"
          >
            Upload and process
          </Button>
        </div>
      </div>
    </div>
  );
}

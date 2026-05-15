import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { GeneratedDocumentStatus, InstitutionType } from '@tarpan/shared';
import type { GeneratedDocument } from '@tarpan/shared';
import { getGeneratedDocuments } from '@/api/generated-documents';
import { DownloadsPage } from './DownloadsPage';
import { ToastContext } from '@/context/ToastContext';

vi.mock('@/api/generated-documents', () => ({
  getGeneratedDocuments: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: (): typeof mockNavigate => mockNavigate };
});

const mockGetGeneratedDocuments = vi.mocked(getGeneratedDocuments);

const mockToast = vi.fn();

function makeDoc(
  overrides: Partial<GeneratedDocument> & { institutionType: InstitutionType },
): GeneratedDocument {
  return {
    id: 'gen-id',
    caseId: 'case-id',
    documentId: 'doc-id',
    status: GeneratedDocumentStatus.READY,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function renderDownloadsPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter
      initialEntries={['/cases/case-id/downloads']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ToastContext.Provider value={{ toast: mockToast }}>
        <Routes>
          <Route path="/cases/:caseId/downloads" element={<DownloadsPage />} />
        </Routes>
      </ToastContext.Provider>
    </MemoryRouter>,
  );
}

describe('DownloadsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub setInterval so polling doesn't keep running between tests
    vi.spyOn(globalThis, 'setInterval').mockReturnValue(
      0 as unknown as ReturnType<typeof setInterval>,
    );
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a spinner while loading', () => {
    mockGetGeneratedDocuments.mockReturnValue(new Promise(() => {})); // never resolves

    renderDownloadsPage();

    // The loading spinner should be present
    expect(document.querySelector('[class*="animate-spin"]')).not.toBeNull();
  });

  it('shows an empty state when no documents exist', async () => {
    mockGetGeneratedDocuments.mockResolvedValue([]);

    renderDownloadsPage();

    await waitFor(() => {
      expect(screen.getByText(/no documents yet/i)).toBeInTheDocument();
    });
  });

  it('renders READY documents with a Download button', async () => {
    const doc = makeDoc({
      institutionType: InstitutionType.SOCIAL_SECURITY_ADMINISTRATION,
      status: GeneratedDocumentStatus.READY,
      downloadUrl: 'https://s3.example.com/signed-url',
    });
    mockGetGeneratedDocuments.mockResolvedValue([doc]);

    renderDownloadsPage();

    await waitFor(() => {
      expect(screen.getByText('Social Security Administration')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    });
  });

  it('renders GENERATING documents with a spinner and no download button', async () => {
    const doc = makeDoc({
      institutionType: InstitutionType.MEDICARE,
      status: GeneratedDocumentStatus.GENERATING,
    });
    mockGetGeneratedDocuments.mockResolvedValue([doc]);

    renderDownloadsPage();

    await waitFor(() => {
      expect(screen.getByText('Medicare')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
    });
  });

  it('renders FAILED documents with FAILED badge', async () => {
    const doc = makeDoc({
      institutionType: InstitutionType.IRS,
      status: GeneratedDocumentStatus.FAILED,
    });
    mockGetGeneratedDocuments.mockResolvedValue([doc]);

    renderDownloadsPage();

    await waitFor(() => {
      expect(screen.getByText('IRS')).toBeInTheDocument();
      expect(screen.getByText(GeneratedDocumentStatus.FAILED)).toBeInTheDocument();
    });
  });

  it('shows error toast when fetching documents fails', async () => {
    mockGetGeneratedDocuments.mockRejectedValue(new Error('Network error'));

    renderDownloadsPage();

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('Failed to load documents', 'error');
    });
  });

  it('shows a download count summary when all documents are ready', async () => {
    const docs = [
      makeDoc({
        id: '1',
        institutionType: InstitutionType.MEDICARE,
        status: GeneratedDocumentStatus.READY,
      }),
      makeDoc({
        id: '2',
        institutionType: InstitutionType.IRS,
        status: GeneratedDocumentStatus.READY,
      }),
    ];
    mockGetGeneratedDocuments.mockResolvedValue(docs);

    renderDownloadsPage();

    await waitFor(() => {
      expect(screen.getByText(/2 documents ready/i)).toBeInTheDocument();
    });
  });

  it('uses institution name override when provided', async () => {
    const doc = makeDoc({
      institutionType: InstitutionType.BANK,
      institutionName: 'Chase Bank',
      status: GeneratedDocumentStatus.READY,
      downloadUrl: 'https://s3.example.com/chase.pdf',
    });
    mockGetGeneratedDocuments.mockResolvedValue([doc]);

    renderDownloadsPage();

    await waitFor(() => {
      expect(screen.getByText('Chase Bank')).toBeInTheDocument();
    });
  });

  it('opens download URL in a new tab when Download is clicked', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const doc = makeDoc({
      institutionType: InstitutionType.SOCIAL_SECURITY_ADMINISTRATION,
      status: GeneratedDocumentStatus.READY,
      downloadUrl: 'https://s3.example.com/ssa.pdf',
    });
    mockGetGeneratedDocuments.mockResolvedValue([doc]);

    renderDownloadsPage();

    await waitFor(() => screen.getByRole('button', { name: /download/i }));
    await user.click(screen.getByRole('button', { name: /download/i }));

    expect(openSpy).toHaveBeenCalledWith('https://s3.example.com/ssa.pdf', '_blank');
    openSpy.mockRestore();
  });
});

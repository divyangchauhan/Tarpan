/**
 * InstitutionsPage integration test — uses real ToastProvider,
 * mocks only the documents and generated-documents API.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { DocumentStatus, DocumentType, GeneratedDocumentStatus, InstitutionType } from '@afterlight/shared';
import type { Document, GeneratedDocument } from '@afterlight/shared';
import { InstitutionsPage } from './InstitutionsPage';
import { ToastProvider } from '@/context/ToastContext';

// ── Mock API layer only ───────────────────────────────────────────────────────

const mockGetDocuments = vi.fn();
const mockCreateGeneratedDocument = vi.fn();

vi.mock('@/api/documents', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  getDocuments: (...args: unknown[]) => mockGetDocuments(...args),
}));

vi.mock('@/api/generated-documents', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  createGeneratedDocument: (...args: unknown[]) => mockCreateGeneratedDocument(...args),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CASE_ID = 'case-123';
const DOCUMENT_ID = 'doc-1';

const PROCESSED_DOC: Document = {
  id: DOCUMENT_ID,
  caseId: CASE_ID,
  type: DocumentType.DEATH_CERTIFICATE,
  status: DocumentStatus.PROCESSED,
  s3Key: `cases/${CASE_ID}/death-cert.pdf`,
  createdAt: new Date().toISOString() as unknown as Date,
  updatedAt: new Date().toISOString() as unknown as Date,
};

function makeGeneratedDoc(institutionType: InstitutionType): GeneratedDocument {
  return {
    id: `gen-${institutionType}`,
    caseId: CASE_ID,
    documentId: DOCUMENT_ID,
    institutionType,
    status: GeneratedDocumentStatus.GENERATING,
    createdAt: new Date().toISOString() as unknown as Date,
    updatedAt: new Date().toISOString() as unknown as Date,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage() {
  render(
    <MemoryRouter initialEntries={[`/cases/${CASE_ID}/institutions`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <Routes>
          <Route path="/cases/:caseId/institutions" element={<InstitutionsPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('InstitutionsPage (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);
  });

  // ── Rendering ─────────────────────────────────────────────────────────────────

  it('renders institution groups and a count summary', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /select institutions/i })).toBeInTheDocument();
    });

    expect(screen.getByText('Government')).toBeInTheDocument();
    expect(screen.getByText('Financial')).toBeInTheDocument();
    expect(screen.getByText('Utilities & Services')).toBeInTheDocument();
    expect(screen.getByText('Professional')).toBeInTheDocument();

    // Initially 0 selected
    expect(screen.getByText(/0 institution/i)).toBeInTheDocument();
  });

  it('shows an error toast when no processed document is found', async () => {
    mockGetDocuments.mockResolvedValue([]); // no processed doc

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/no processed death certificate/i);
    });
  });

  // ── Institution selection ─────────────────────────────────────────────────────

  it('selects and deselects an institution on click', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Social Security Administration')).toBeInTheDocument();
    });

    const ssaButton = screen.getByRole('button', { name: /social security administration/i });

    await user.click(ssaButton);
    expect(screen.getByText(/1 institution/i)).toBeInTheDocument();

    await user.click(ssaButton);
    expect(screen.getByText(/0 institution/i)).toBeInTheDocument();
  });

  it('selects all institutions with the "Select all" button', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select all/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /select all/i }));

    // 16 total institutions across all groups
    expect(screen.getByText(/16 institution/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();
  });

  it('clears all selections with the "Clear all" button', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select all/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /select all/i }));
    await user.click(screen.getByRole('button', { name: /clear all/i }));

    expect(screen.getByText(/0 institution/i)).toBeInTheDocument();
  });

  // ── Generation ────────────────────────────────────────────────────────────────

  it('"Generate selected" button is disabled when nothing is selected', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate selected/i })).toBeDisabled();
    });
  });

  it('queues selected institutions and navigates to downloads on success', async () => {
    const user = userEvent.setup();
    mockCreateGeneratedDocument.mockImplementation(
      (_caseId: unknown, req: { institutionType: InstitutionType }) =>
        Promise.resolve(makeGeneratedDoc(req.institutionType)),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Social Security Administration')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /social security administration/i }));
    await user.click(screen.getByRole('button', { name: /medicare/i }));

    await user.click(screen.getByRole('button', { name: /generate selected/i }));

    await waitFor(() => {
      expect(mockCreateGeneratedDocument).toHaveBeenCalledTimes(2);
    });

    expect(mockCreateGeneratedDocument).toHaveBeenCalledWith(
      CASE_ID,
      expect.objectContaining({ documentId: DOCUMENT_ID, institutionType: InstitutionType.SOCIAL_SECURITY_ADMINISTRATION }),
    );
    expect(mockCreateGeneratedDocument).toHaveBeenCalledWith(
      CASE_ID,
      expect.objectContaining({ institutionType: InstitutionType.MEDICARE }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/all documents queued/i);
    });

    expect(mockNavigate).toHaveBeenCalledWith(`/cases/${CASE_ID}/downloads`);
  });

  it('shows an error toast listing failed counts when some documents fail to queue', async () => {
    const user = userEvent.setup();
    // First call succeeds, second fails
    mockCreateGeneratedDocument
      .mockResolvedValueOnce(makeGeneratedDoc(InstitutionType.SOCIAL_SECURITY_ADMINISTRATION))
      .mockRejectedValueOnce(new Error('500'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Social Security Administration')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /social security administration/i }));
    await user.click(screen.getByRole('button', { name: /medicare/i }));

    await user.click(screen.getByRole('button', { name: /generate selected/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/1 document\(s\) failed/i);
    });

    // Still navigates to downloads so the user can see what succeeded
    expect(mockNavigate).toHaveBeenCalledWith(`/cases/${CASE_ID}/downloads`);
  });

  it('shows an error toast and navigates to upload when no documentId is available', async () => {
    const user = userEvent.setup();
    // Simulate no processed document found
    mockGetDocuments.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Social Security Administration')).toBeInTheDocument();
    });

    // Manually select an institution even though no document is loaded
    await user.click(screen.getByRole('button', { name: /social security administration/i }));
    await user.click(screen.getByRole('button', { name: /generate selected/i }));

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.some((a) => /no processed death certificate/i.test(a.textContent ?? ''))).toBe(true);
    });

    expect(mockNavigate).toHaveBeenCalledWith(`/cases/${CASE_ID}/upload`);
    expect(mockCreateGeneratedDocument).not.toHaveBeenCalled();
  });
});

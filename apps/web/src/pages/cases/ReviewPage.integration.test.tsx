/**
 * ReviewPage integration test — uses real ToastProvider,
 * mocks only the cases and documents API.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { CaseStatus, DocumentStatus, DocumentType } from '@afterlight/shared';
import type { Case, Document } from '@afterlight/shared';
import { ReviewPage } from './ReviewPage';
import { ToastProvider } from '@/context/ToastContext';

// ── Mock API layer only ───────────────────────────────────────────────────────

const mockGetCase = vi.fn();
const mockUpdateCase = vi.fn();
const mockGetDocuments = vi.fn();

vi.mock('@/api/cases', () => ({
  getCase: (...args: unknown[]): unknown => mockGetCase(...args),
  updateCase: (...args: unknown[]): unknown => mockUpdateCase(...args),
}));

vi.mock('@/api/documents', () => ({
  getDocuments: (...args: unknown[]): unknown => mockGetDocuments(...args),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: (): typeof mockNavigate => mockNavigate };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CASE_ID = 'case-123';

const MOCK_CASE: Case = {
  id: CASE_ID,
  userId: 'user-1',
  status: CaseStatus.ACTIVE,
  deceasedInfo: {
    firstName: 'Robert',
    middleName: 'James',
    lastName: 'Mitchell',
    dateOfBirth: '1942-07-14',
    dateOfDeath: '2024-11-03',
    placeOfDeath: 'Springfield, IL',
    socialSecurityNumber: '123-45-6789',
  },
  createdAt: new Date().toISOString() as unknown as Date,
  updatedAt: new Date().toISOString() as unknown as Date,
};

const PROCESSED_DOC: Document = {
  id: 'doc-1',
  caseId: CASE_ID,
  type: DocumentType.DEATH_CERTIFICATE,
  status: DocumentStatus.PROCESSED,
  s3Key: 'cases/case-123/death-cert.pdf',
  createdAt: new Date().toISOString() as unknown as Date,
  updatedAt: new Date().toISOString() as unknown as Date,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage(): void {
  render(
    <MemoryRouter
      initialEntries={[`/cases/${CASE_ID}/review`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ToastProvider>
        <Routes>
          <Route path="/cases/:caseId/review" element={<ReviewPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('ReviewPage (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Loading ─────────────────────────────────────────────────────────────────

  it('shows a spinner while loading', () => {
    mockGetCase.mockReturnValue(new Promise(() => {}));
    mockGetDocuments.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  // ── Deceased fields ───────────────────────────────────────────────────────────

  it('renders deceased information after loading', async () => {
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Robert')).toBeInTheDocument();
    });

    expect(screen.getByText('James')).toBeInTheDocument();
    expect(screen.getByText('Mitchell')).toBeInTheDocument();
    expect(screen.getByText('Springfield, IL')).toBeInTheDocument();
  });

  it('shows the uploaded document preview when a processed doc exists', async () => {
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/uploaded document/i)).toBeInTheDocument();
    });

    expect(screen.getByText('death-cert.pdf')).toBeInTheDocument();
  });

  // ── SSN reveal ────────────────────────────────────────────────────────────────

  it('masks SSN by default and reveals it on button click', async () => {
    const user = userEvent.setup();
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/•••–••–6789/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /reveal/i }));

    expect(screen.getByText('123-45-6789')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide/i })).toBeInTheDocument();
  });

  // ── Inline field editing ──────────────────────────────────────────────────────

  it('allows inline editing of a field', async () => {
    const user = userEvent.setup();
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Springfield, IL')).toBeInTheDocument();
    });

    // Each field has an Edit button; click the one next to Place of death
    const editButtons = screen.getAllByRole('button', { name: /^edit$/i });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await user.click(editButtons[5]!);

    // Use fireEvent.change to avoid userEvent pointer events landing on the Done
    // button at JSDOM's universal (0,0) coordinates.
    const input = await screen.findByDisplayValue('Springfield, IL');
    fireEvent.change(input, { target: { value: 'Chicago, IL' } });

    await user.click(screen.getByRole('button', { name: /done/i }));

    expect(screen.getByText('Chicago, IL')).toBeInTheDocument();
  });

  // ── Navigation / continue ─────────────────────────────────────────────────────

  it('shows "Confirm & Continue" button when deceased data exists', async () => {
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm & continue/i })).toBeInTheDocument();
    });
  });

  it('navigates directly to institutions when there are no edits', async () => {
    const user = userEvent.setup();
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm & continue/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /confirm & continue/i }));

    expect(mockNavigate).toHaveBeenCalledWith(`/cases/${CASE_ID}/institutions`);
    expect(mockUpdateCase).not.toHaveBeenCalled();
  });

  it('saves field edits via updateCase before navigating', async () => {
    const user = userEvent.setup();
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);
    mockUpdateCase.mockResolvedValue(MOCK_CASE);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Springfield, IL')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: /^edit$/i });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await user.click(editButtons[5]!);

    const input = await screen.findByDisplayValue('Springfield, IL');
    fireEvent.change(input, { target: { value: 'Chicago, IL' } });

    await user.click(screen.getByRole('button', { name: /confirm & continue/i }));

    await waitFor(() => {
      expect(mockUpdateCase).toHaveBeenCalledWith(
        CASE_ID,
        expect.objectContaining({
          deceasedInfo: expect.objectContaining({ placeOfDeath: 'Chicago, IL' }),
        }),
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith(`/cases/${CASE_ID}/institutions`);
  });

  it('shows an error toast and stays on page when saving edits fails', async () => {
    const user = userEvent.setup();
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);
    mockUpdateCase.mockRejectedValue(new Error('500'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Springfield, IL')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: /^edit$/i });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await user.click(editButtons[5]!);
    const input = await screen.findByDisplayValue('Springfield, IL');
    fireEvent.change(input, { target: { value: 'Chicago, IL' } });

    await user.click(screen.getByRole('button', { name: /confirm & continue/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to save field edits/i);
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ── Empty state ───────────────────────────────────────────────────────────────

  it('shows "Upload death certificate" button when no deceased data exists', async () => {
    const caseWithoutDeceased: Case = { ...MOCK_CASE, deceasedInfo: null };
    mockGetCase.mockResolvedValue(caseWithoutDeceased);
    mockGetDocuments.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /upload death certificate/i })).toHaveLength(2);
    });
  });

  it('shows an error toast when case load fails', async () => {
    mockGetCase.mockRejectedValue(new Error('404'));
    mockGetDocuments.mockRejectedValue(new Error('404'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load case/i);
    });
  });
});

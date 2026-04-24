/**
 * ReviewPage integration test — uses real ToastProvider,
 * mocks only the cases and documents API.
 */
import { render, screen, waitFor } from '@testing-library/react';
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
    // Keep promise pending to observe the loading state
    mockGetCase.mockReturnValue(new Promise(() => {}));
    mockGetDocuments.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders deceased information and executor form after loading', async () => {
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Robert')).toBeInTheDocument();
    });

    expect(screen.getByText('James')).toBeInTheDocument();
    expect(screen.getByText('Mitchell')).toBeInTheDocument();
    expect(screen.getByText('Springfield, IL')).toBeInTheDocument();

    // Executor form
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/relationship to deceased/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mailing address/i)).toBeInTheDocument();
  });

  // ── Executor form pre-population ─────────────────────────────────────────────

  it('pre-populates the executor form when executorInfo is already set', async () => {
    const caseWithExecutor: Case = {
      ...MOCK_CASE,
      executorInfo: {
        name: 'Sarah Mitchell',
        address: '412 Maple Ave, Springfield, IL',
        relationship: 'Daughter',
        phone: '217-555-0198',
        email: 'sarah@example.com',
      },
    };
    mockGetCase.mockResolvedValue(caseWithExecutor);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Sarah Mitchell')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('412 Maple Ave, Springfield, IL')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Daughter')).toBeInTheDocument();
  });

  // ── Executor form save ────────────────────────────────────────────────────────

  it('saves executor info and shows a success toast', async () => {
    const user = userEvent.setup();
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);
    mockUpdateCase.mockResolvedValue(MOCK_CASE);

    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/full name/i), 'Sarah Mitchell');
    await user.type(screen.getByLabelText(/relationship to deceased/i), 'Daughter');
    await user.type(screen.getByLabelText(/mailing address/i), '412 Maple Ave');

    await user.click(screen.getByRole('button', { name: /save executor/i }));

    await waitFor(() => {
      expect(mockUpdateCase).toHaveBeenCalledWith(
        CASE_ID,
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          executorInfo: expect.objectContaining({
            name: 'Sarah Mitchell',
            relationship: 'Daughter',
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/executor information saved/i);
    });
  });

  it('shows a validation error when required executor fields are empty', async () => {
    const user = userEvent.setup();
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save executor/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /save executor/i }));

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });

    expect(mockUpdateCase).not.toHaveBeenCalled();
  });

  it('shows an error toast when saving executor info fails', async () => {
    const user = userEvent.setup();
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);
    mockUpdateCase.mockRejectedValue(new Error('500'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/full name/i), 'Sarah');
    await user.type(screen.getByLabelText(/relationship to deceased/i), 'Daughter');
    await user.type(screen.getByLabelText(/mailing address/i), '123 Main St');
    await user.click(screen.getByRole('button', { name: /save executor/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to save executor/i);
    });
  });

  // ── Navigation ────────────────────────────────────────────────────────────────

  it('shows "Continue to institutions" button when a processed doc exists', async () => {
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /continue to institutions/i })).toBeInTheDocument();
    });
  });

  it('navigates to institutions page when "Continue to institutions" is clicked', async () => {
    const user = userEvent.setup();
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([PROCESSED_DOC]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /continue to institutions/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /continue to institutions/i }));

    expect(mockNavigate).toHaveBeenCalledWith(`/cases/${CASE_ID}/institutions`);
  });

  it('shows "Upload death certificate" button when no processed doc exists', async () => {
    mockGetCase.mockResolvedValue(MOCK_CASE);
    mockGetDocuments.mockResolvedValue([]); // no documents

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upload death certificate/i })).toBeInTheDocument();
    });
  });

  it('shows an error toast and "not found" message when case load fails', async () => {
    mockGetCase.mockRejectedValue(new Error('404'));
    mockGetDocuments.mockRejectedValue(new Error('404'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load case/i);
    });
  });
});

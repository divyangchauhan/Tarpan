/**
 * NewCasePage integration test — uses real ToastProvider,
 * mocks only the cases API.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { CaseStatus } from '@afterlight/shared';
import type { Case } from '@afterlight/shared';
import { NewCasePage } from './NewCasePage';
import { ToastProvider } from '@/context/ToastContext';

// ── Mock API layer only ───────────────────────────────────────────────────────

const mockCreateCase = vi.fn();

vi.mock('@/api/cases', () => ({
  createCase: (...args: unknown[]): unknown => mockCreateCase(...args),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: (): typeof mockNavigate => mockNavigate };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage(): void {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <NewCasePage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const MOCK_CASE: Case = {
  id: 'case-123',
  userId: 'user-1',
  status: CaseStatus.ACTIVE,
  deceasedInfo: null,
  createdAt: new Date().toISOString() as unknown as Date,
  updatedAt: new Date().toISOString() as unknown as Date,
};

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(/legal name/i), 'Sarah Mitchell');
  await user.type(screen.getByLabelText(/mailing address/i), '412 Maple Ave, Springfield, IL');
  await user.selectOptions(screen.getByLabelText(/relationship to the deceased/i), 'Child');
}

describe('NewCasePage (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the form with all required fields', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /your information/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/legal name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mailing address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/relationship to the deceased/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue to upload/i })).toBeInTheDocument();
  });

  it('creates case and navigates to upload page on success', async () => {
    const user = userEvent.setup();
    mockCreateCase.mockResolvedValue(MOCK_CASE);

    renderPage();
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /continue to upload/i }));

    await waitFor(() => {
      expect(mockCreateCase).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          executorInfo: expect.objectContaining({
            name: 'Sarah Mitchell',
            relationship: 'Child',
            address: '412 Maple Ave, Springfield, IL',
          }),
        }),
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('/cases/case-123/upload');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/case created successfully/i);
    });
  });

  it('shows an error toast when case creation fails', async () => {
    const user = userEvent.setup();
    mockCreateCase.mockRejectedValue(new Error('500'));

    renderPage();
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /continue to upload/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to create case/i);
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows validation errors when required fields are empty', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /continue to upload/i }));

    await waitFor(() => {
      expect(screen.getByText(/full name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/relationship is required/i)).toBeInTheDocument();
      expect(screen.getByText(/mailing address is required/i)).toBeInTheDocument();
    });

    expect(mockCreateCase).not.toHaveBeenCalled();
  });

  it('shows an email validation error for an invalid email address', async () => {
    const user = userEvent.setup();
    renderPage();

    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /continue to upload/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid email address/i)).toBeInTheDocument();
    });

    expect(mockCreateCase).not.toHaveBeenCalled();
  });

  it('includes optional phone and email in the request when provided', async () => {
    const user = userEvent.setup();
    mockCreateCase.mockResolvedValue(MOCK_CASE);

    renderPage();
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(/phone/i), '217-555-0198');
    await user.type(screen.getByLabelText(/email/i), 'sarah@example.com');
    await user.click(screen.getByRole('button', { name: /continue to upload/i }));

    await waitFor(() => {
      expect(mockCreateCase).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          executorInfo: expect.objectContaining({
            phone: '217-555-0198',
            email: 'sarah@example.com',
          }),
        }),
      );
    });
  });

  it('navigates back to cases list when the back button is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /back to cases/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/cases');
  });
});

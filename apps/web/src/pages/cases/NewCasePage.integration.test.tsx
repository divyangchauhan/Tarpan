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
  deceasedInfo: {
    firstName: 'Robert',
    lastName: 'Mitchell',
    dateOfBirth: '1942-07-14',
    dateOfDeath: '2024-11-03',
    placeOfDeath: 'Springfield, IL',
  },
  createdAt: new Date().toISOString() as unknown as Date,
  updatedAt: new Date().toISOString() as unknown as Date,
};

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(/first name/i), 'Robert');
  await user.type(screen.getByLabelText(/last name/i), 'Mitchell');
  await user.type(screen.getByLabelText(/date of birth/i), '1942-07-14');
  await user.type(screen.getByLabelText(/date of death/i), '2024-11-03');
  await user.type(screen.getByLabelText(/place of death/i), 'Springfield, IL');
}

describe('NewCasePage (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the form with all required fields', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /enter deceased/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date of birth/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date of death/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/place of death/i)).toBeInTheDocument();
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
          deceasedInfo: expect.objectContaining({
            firstName: 'Robert',
            lastName: 'Mitchell',
            placeOfDeath: 'Springfield, IL',
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
      expect(screen.getByText(/first name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/last name is required/i)).toBeInTheDocument();
    });

    expect(mockCreateCase).not.toHaveBeenCalled();
  });

  it('shows a format error for an invalid SSN', async () => {
    const user = userEvent.setup();
    renderPage();

    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(/social security/i), '123456789'); // no dashes

    await user.click(screen.getByRole('button', { name: /continue to upload/i }));

    await waitFor(() => {
      expect(screen.getByText(/format: 123-45-6789/i)).toBeInTheDocument();
    });

    expect(mockCreateCase).not.toHaveBeenCalled();
  });

  it('includes SSN in the request when a valid value is provided', async () => {
    const user = userEvent.setup();
    mockCreateCase.mockResolvedValue(MOCK_CASE);

    renderPage();
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(/social security/i), '123-45-6789');
    await user.click(screen.getByRole('button', { name: /continue to upload/i }));

    await waitFor(() => {
      expect(mockCreateCase).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          deceasedInfo: expect.objectContaining({ socialSecurityNumber: '123-45-6789' }),
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

/**
 * LoginPage integration test — uses real AuthProvider + ToastProvider,
 * mocks only the API layer (login/logout/register functions).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';

// ── Mock API layer only ───────────────────────────────────────────────────────

const mockApiLogin = vi.fn();
const mockApiLogout = vi.fn();
const mockApiRegister = vi.fn();

vi.mock('@/api/auth', () => ({
  login: (...args: unknown[]): unknown => mockApiLogin(...args),
  logout: (...args: unknown[]): unknown => mockApiLogout(...args),
  register: (...args: unknown[]): unknown => mockApiRegister(...args),
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
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const AUTH_RESPONSE = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  user: { id: 'user-1', email: 'user@example.com', firstName: 'Jane', lastName: 'Doe' },
};

describe('LoginPage (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the login form', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('stores tokens in localStorage and navigates to /cases on success', async () => {
    const user = userEvent.setup();
    mockApiLogin.mockResolvedValue(AUTH_RESPONSE);

    renderPage();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockApiLogin).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
      });
    });

    expect(localStorage.getItem('accessToken')).toBe('access-token');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-token');
    expect(JSON.parse(localStorage.getItem('user') ?? '{}')).toMatchObject({ id: 'user-1' });
    expect(mockNavigate).toHaveBeenCalledWith('/cases');
  });

  it('shows an error toast when credentials are invalid', async () => {
    const user = userEvent.setup();
    mockApiLogin.mockRejectedValue(new Error('401'));

    renderPage();

    await user.type(screen.getByLabelText(/email/i), 'bad@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i);
    });

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows a validation error for an invalid email format', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'somepassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });

    expect(mockApiLogin).not.toHaveBeenCalled();
  });

  it('does not clear localStorage when login fails', async () => {
    const user = userEvent.setup();
    localStorage.setItem('accessToken', 'existing-token');
    mockApiLogin.mockRejectedValue(new Error('401'));

    renderPage();

    await user.type(screen.getByLabelText(/email/i), 'bad@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // Existing token from a previous session must not be wiped by a failed login attempt
    expect(localStorage.getItem('accessToken')).toBe('existing-token');
  });
});

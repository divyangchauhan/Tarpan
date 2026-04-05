import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { AuthContext, type AuthContextValue } from '@/context/AuthContext';
import { ToastContext } from '@/context/ToastContext';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderLoginPage(overrides?: Partial<AuthContextValue>) {
  const mockLogin = vi.fn();
  const mockToast = vi.fn();

  const authValue: AuthContextValue = {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login: mockLogin,
    register: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };

  render(
    <MemoryRouter>
      <ToastContext.Provider value={{ toast: mockToast }}>
        <AuthContext.Provider value={authValue}>
          <LoginPage />
        </AuthContext.Provider>
      </ToastContext.Provider>
    </MemoryRouter>,
  );

  return { mockLogin, mockToast };
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('renders the login form', () => {
    renderLoginPage();

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('navigates to /cases on successful login', async () => {
    const user = userEvent.setup();
    const { mockLogin } = renderLoginPage();
    mockLogin.mockResolvedValue(undefined);

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
      });
      expect(mockNavigate).toHaveBeenCalledWith('/cases');
    });
  });

  it('shows an error toast when login fails', async () => {
    const user = userEvent.setup();
    const { mockLogin, mockToast } = renderLoginPage();
    mockLogin.mockRejectedValue(new Error('401 Unauthorized'));

    await user.type(screen.getByLabelText(/email/i), 'bad@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.stringContaining('Invalid email or password'),
        'error',
      );
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });
  });

  it('has a link to the register page', () => {
    renderLoginPage();
    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute('href', '/register');
  });
});

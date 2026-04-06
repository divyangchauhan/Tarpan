import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderOpen, LogOut, Moon, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';

interface NavItem {
  to: string;
  icon: JSX.Element;
  label: string;
}

const navItems: NavItem[] = [
  { to: '/cases', icon: <LayoutDashboard className="h-5 w-5" />, label: 'Cases' },
  { to: '/cases/new', icon: <FolderOpen className="h-5 w-5" />, label: 'New Case' },
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps): JSX.Element {
  const { logout, user } = useAuth();
  const { toast } = useToast();

  async function handleLogout(): Promise<void> {
    try {
      await logout();
    } catch {
      toast('Failed to log out', 'error');
    }
  }

  return (
    <aside className="flex h-full w-64 flex-col bg-brand-950 text-white">
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-brand-800">
        <div className="flex items-center gap-2">
          <Moon className="h-6 w-6 text-brand-300" />
          <span className="text-lg font-bold tracking-tight">AfterLight</span>
        </div>
        {/* Close button — mobile only */}
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-brand-400 hover:text-white sm:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/cases'}
            onClick={onClose ?? undefined}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-800 text-white'
                  : 'text-brand-300 hover:bg-brand-900 hover:text-white',
              ].join(' ')
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-brand-800 px-3 py-4">
        {user && (
          <div className="mb-3 px-3">
            <p className="text-xs text-brand-400">Signed in as</p>
            <p className="text-sm font-medium text-brand-200 truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={() => void handleLogout()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-300 hover:bg-brand-900 hover:text-white transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

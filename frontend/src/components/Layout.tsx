import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { LayoutDashboard, Receipt, HandCoins, PiggyBank, Landmark, CreditCard, BarChart3, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/expenses', label: 'Budgets & Expenses', icon: Receipt },
  { to: '/rent-outs', label: 'Rent Outs', icon: HandCoins },
  { to: '/savings', label: 'Savings', icon: PiggyBank },
  { to: '/loans', label: 'Loans & EMI', icon: CreditCard },
  { to: '/assets', label: 'Net Assets', icon: Landmark },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/config', label: 'Config', icon: Settings },
];

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const current = nav.find(({ to }) =>
      to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
    );
    document.title = `E&A Tracker - ${current?.label ?? 'Dashboard'}`;
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <aside className="w-60 bg-sidebar border-r border-line flex flex-col shrink-0 overflow-y-auto print:hidden">
        <div className="px-5 py-6 border-b border-line">
          <h1 className="text-lg font-semibold text-ink leading-tight tracking-tight">Expense &amp;<br />Asset Tracker</h1>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent text-white'
                    : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-line space-y-3">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors w-full"
          >
            <LogOut size={18} /> Log out
          </button>
          <p className="text-xs text-ink-faint">Crafted in dark mode</p>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-canvas text-ink">
        <Outlet />
      </main>
    </div>
  );
}

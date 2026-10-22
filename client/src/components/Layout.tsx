import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bell,
  BarChart3,
  Building2,
  CreditCard,
  FileText,
  Home,
  KeyRound,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';

const nav = [
  { to: '/', label: 'Dashboard', icon: Home, end: true },
  { to: '/properties', label: 'Properties', icon: Building2 },
  { to: '/tenants', label: 'Tenants', icon: Users },
  { to: '/leases', label: 'Leases', icon: FileText },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export const Layout = () => {
  const { owner, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
      isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-navy-800'
    }`;

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-navy-900 transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-navy-800 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600">
            <Home className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="text-lg font-bold text-white">HRMS</div>
            <div className="text-[11px] text-slate-400">House Rental Management</div>
          </div>
        </div>
        <nav className="space-y-1 px-3 py-4">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass} onClick={() => setOpen(false)}>
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-navy-800"
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </nav>
        <div className="absolute bottom-0 px-5 py-4 text-[11px] text-slate-500">
          HRMS v1.0.0
          <br />© {new Date().getFullYear()} House Rental Management
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen((v) => !v)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-slate-400 sm:inline">{today}</span>
            <button
              onClick={() => navigate('/notifications')}
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            >
              <Bell className="h-5 w-5" />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenu((v) => !v)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                  <Users className="h-4 w-4" />
                </div>
                <div className="hidden text-left sm:block">
                  <div className="text-sm font-semibold text-slate-700">{owner?.fullName}</div>
                  <div className="text-[11px] text-slate-400">Property Owner</div>
                </div>
              </button>
              {menu && (
                <div className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    onClick={() => {
                      setMenu(false);
                      navigate('/settings');
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    <KeyRound className="h-4 w-4" /> Account settings
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

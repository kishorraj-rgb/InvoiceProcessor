import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  Users,
  FileText,
  Package,
  Tag,
  ChevronRight,
  ChevronLeft,
  Settings,
  UserCog,
  FileSpreadsheet,
  LayoutGrid,
  RefreshCw,
} from 'lucide-react';

const navItems = [
  { to: '/',           label: 'Dashboard',       icon: LayoutDashboard, end: true },
  { to: '/upload',     label: 'Process Invoice',  icon: Upload },
  { to: '/vendors',    label: 'Vendor Registry',  icon: Users },
  { to: '/tracker',       label: 'Invoice Tracker',  icon: FileText },
  { to: '/subscriptions', label: 'Subscriptions',    icon: RefreshCw },
  { to: '/assets',        label: 'Assets',           icon: Package },
  { to: '/categories', label: 'Categories',       icon: Tag },
  { to: '/team',       label: 'Team',             icon: UserCog },
  { to: '/reports',      label: 'Reports',       icon: FileSpreadsheet },
  { to: '/spend-matrix', label: 'Spend Matrix',  icon: LayoutGrid },
];

const PROFILE_KEY = 'ip-profile';

function getProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw) as { name?: string; organisation?: string };
  } catch {}
  return { name: '', organisation: '' };
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [profile, setProfile] = useState(getProfile);

  useEffect(() => {
    function onProfileUpdate() { setProfile(getProfile()); }
    window.addEventListener('ip-profile-updated', onProfileUpdate);
    return () => window.removeEventListener('ip-profile-updated', onProfileUpdate);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar-collapsed', String(next));
      } catch {}
      return next;
    });
  }

  const initials = profile.name
    ? profile.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg text-sm font-medium transition-colors group ${
      collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5'
    } ${
      isActive
        ? 'bg-indigo-600 text-white'
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <aside
      className={`${
        collapsed ? 'w-14' : 'w-60'
      } min-h-screen bg-slate-900 flex flex-col transition-all duration-200 ease-in-out shrink-0`}
    >
      {/* Logo + collapse toggle */}
      <div className="h-16 flex items-center border-b border-slate-700 px-3">
        {collapsed ? (
          <button
            type="button"
            onClick={toggle}
            title="Expand sidebar"
            className="w-8 h-8 mx-auto flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-slate-500 hover:text-slate-200 transition-all duration-150"
          >
            <ChevronRight size={13} />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 shrink-0 bg-indigo-500 rounded-lg flex items-center justify-center">
                <FileText size={16} className="text-white" />
              </div>
              <span className="font-semibold text-white text-lg whitespace-nowrap">InvoiceAI</span>
            </div>
            <button
              type="button"
              onClick={toggle}
              title="Collapse sidebar"
              className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-slate-500 hover:text-slate-200 transition-all duration-150"
            >
              <ChevronLeft size={13} />
            </button>
          </>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-1.5 py-4 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={navLinkClass}
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={18}
                  className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}
                />
                {!collapsed && (
                  <>
                    <span className="flex-1 whitespace-nowrap">{label}</span>
                    {isActive && <ChevronRight size={14} className="text-indigo-300" />}
                  </>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: Settings + Profile */}
      <div className="px-1.5 pb-1 border-t border-slate-800 pt-2 space-y-0.5">
        {/* Settings */}
        <NavLink
          to="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={navLinkClass}
        >
          {({ isActive }) => (
            <>
              <Settings
                size={18}
                className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}
              />
              {!collapsed && <span className="flex-1 whitespace-nowrap">Settings</span>}
            </>
          )}
        </NavLink>

        {/* Profile */}
        <NavLink
          to="/profile"
          title={collapsed ? (profile.name || 'Profile') : undefined}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg transition-colors ${
              collapsed ? 'justify-center p-2.5' : 'px-2.5 py-2'
            } ${
              isActive
                ? 'bg-indigo-600/20 ring-1 ring-indigo-500/30'
                : 'hover:bg-slate-800'
            }`
          }
        >
          <div className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-[11px] font-bold select-none">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-200 truncate leading-tight">
                {profile.name || 'Your Profile'}
              </p>
              {profile.organisation && (
                <p className="text-[11px] text-slate-500 truncate leading-tight">{profile.organisation}</p>
              )}
            </div>
          )}
        </NavLink>
      </div>

    </aside>
  );
}

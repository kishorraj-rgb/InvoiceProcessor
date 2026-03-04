import { NavLink } from 'react-router-dom';
import { RefreshCw, Receipt, Calendar } from 'lucide-react';

const tabs = [
  { to: '/subscriptions', label: 'Overview', icon: RefreshCw, end: true },
  { to: '/subscriptions/receipts', label: 'All Receipts', icon: Receipt, end: false },
  { to: '/subscriptions/calendar', label: 'Renewal Calendar', icon: Calendar, end: false },
];

export default function SubscriptionTabBar() {
  return (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6">
      {tabs.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`
          }
        >
          <Icon size={16} />
          {label}
        </NavLink>
      ))}
    </div>
  );
}

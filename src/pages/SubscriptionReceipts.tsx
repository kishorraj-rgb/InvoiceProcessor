import { useEffect, useState, useMemo } from 'react';
import { Receipt, Search } from 'lucide-react';
import {
  getSubscriptions,
  getSubscriptionInvoices,
} from '../lib/supabase';
import type { Subscription, SubscriptionInvoice } from '../types';
import SubscriptionTabBar from '../components/SubscriptionTabBar';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Get fiscal year months Apr–Mar. Returns { key: 'YYYY-MM', label: 'Apr', ... }[] */
function getFYMonths(): { key: string; label: string }[] {
  const now = new Date();
  const fyStart = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const months: { key: string; label: string }[] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 0; i < 12; i++) {
    const m = (3 + i) % 12; // Apr=3, May=4, …, Mar=2
    const y = m >= 3 ? fyStart : fyStart + 1;
    months.push({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: monthNames[m],
    });
  }
  return months;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    trial: 'bg-blue-100 text-blue-700',
    paused: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-slate-100 text-slate-500',
  };
  return map[status] ?? 'bg-slate-100 text-slate-500';
}

function cycleBadge(cycle: string) {
  const map: Record<string, string> = {
    monthly: 'bg-indigo-100 text-indigo-700',
    annual: 'bg-emerald-100 text-emerald-700',
    quarterly: 'bg-amber-100 text-amber-700',
    'one-time': 'bg-slate-100 text-slate-600',
  };
  return map[cycle] ?? 'bg-slate-100 text-slate-600';
}

function cycleLabel(cycle: string) {
  if (cycle === 'one-time') return 'One-Time';
  return cycle.charAt(0).toUpperCase() + cycle.slice(1);
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SubscriptionReceipts() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [invoicesMap, setInvoicesMap] = useState<Record<string, SubscriptionInvoice[]>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const fyMonths = useMemo(() => getFYMonths(), []);

  // Fetch subscriptions & all their invoices
  useEffect(() => {
    (async () => {
      try {
        const allSubs = await getSubscriptions();
        setSubs(allSubs);
        // Fetch invoices for all subs in parallel
        const entries = await Promise.all(
          allSubs.map(async (s) => {
            const invs = await getSubscriptionInvoices(s.id);
            return [s.id, invs] as [string, SubscriptionInvoice[]];
          }),
        );
        setInvoicesMap(Object.fromEntries(entries));
      } catch (err) {
        console.error('Failed to load receipts:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Filtered subscriptions
  const filtered = useMemo(() => {
    let list = subs;
    if (statusFilter !== 'all') {
      list = list.filter((s) => s.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      list = list.filter((s) => s.billing_cycle === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.vendor_name.toLowerCase().includes(q) ||
          s.service_name.toLowerCase().includes(q) ||
          (s.plan_name ?? '').toLowerCase().includes(q) ||
          (s.account_email ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [subs, statusFilter, typeFilter, search]);

  // Build month→amount map for each sub
  const monthGrid = useMemo(() => {
    const grid: Record<string, Record<string, number>> = {};
    for (const sub of filtered) {
      const invs = invoicesMap[sub.id] || [];
      const byMonth: Record<string, number> = {};
      for (const inv of invs) {
        if (!inv.invoice_date) continue;
        const key = inv.invoice_date.slice(0, 7); // YYYY-MM
        byMonth[key] = (byMonth[key] || 0) + (inv.inr_amount ?? inv.total_amount ?? 0);
      }
      grid[sub.id] = byMonth;
    }
    return grid;
  }, [filtered, invoicesMap]);

  // Monthly totals row
  const monthTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const mk of fyMonths) {
      totals[mk.key] = 0;
    }
    for (const sub of filtered) {
      const byMonth = monthGrid[sub.id] || {};
      for (const mk of fyMonths) {
        totals[mk.key] += byMonth[mk.key] || 0;
      }
    }
    return totals;
  }, [filtered, monthGrid, fyMonths]);

  const grandTotal = useMemo(
    () => Object.values(monthTotals).reduce((a, b) => a + b, 0),
    [monthTotals],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 space-y-5">
      <SubscriptionTabBar />

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
          <Receipt size={22} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">All Receipts</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Complete subscription data with monthly breakdowns
          </p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search vendor, account, plan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="paused">Paused</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="all">All Types</option>
          <option value="monthly">Monthly</option>
          <option value="annual">Annual</option>
          <option value="quarterly">Quarterly</option>
          <option value="one-time">One-Time</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
            Loading receipts...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
            No subscriptions found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-10">
                    #
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 min-w-[160px]">
                    Vendor
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 min-w-[140px]">
                    Account
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 min-w-[140px]">
                    Plan
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                    Type
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                    Start
                  </th>
                  {fyMonths.map((m) => (
                    <th
                      key={m.key}
                      className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3 min-w-[70px]"
                    >
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((sub, idx) => {
                  const byMonth = monthGrid[sub.id] || {};
                  return (
                    <tr
                      key={sub.id}
                      className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-slate-400 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{sub.vendor_name}</td>
                      <td className="px-4 py-3 text-slate-500 truncate max-w-[160px]">
                        {sub.account_email || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {sub.service_name}
                        {sub.plan_name ? ` ${sub.plan_name}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(sub.status)}`}
                        >
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cycleBadge(sub.billing_cycle)}`}
                        >
                          {cycleLabel(sub.billing_cycle)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {fmtDate(sub.start_date)}
                      </td>
                      {fyMonths.map((m) => {
                        const val = byMonth[m.key];
                        return (
                          <td
                            key={m.key}
                            className={`px-3 py-3 text-right whitespace-nowrap ${
                              val ? 'text-slate-700 font-medium' : 'text-slate-300'
                            }`}
                          >
                            {val ? fmtINR(val) : '–'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td colSpan={7} className="px-4 py-3 text-sm font-bold text-slate-700">
                    Total ({filtered.length} subscriptions) — {fmtINR(grandTotal)} FY Total
                  </td>
                  {fyMonths.map((m) => (
                    <td
                      key={m.key}
                      className={`px-3 py-3 text-right text-sm font-bold whitespace-nowrap ${
                        monthTotals[m.key] ? 'text-slate-800' : 'text-slate-300'
                      }`}
                    >
                      {monthTotals[m.key] ? fmtINR(monthTotals[m.key]) : '–'}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

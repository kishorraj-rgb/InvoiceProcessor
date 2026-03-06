import { useEffect, useState, useMemo } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  AlertTriangle,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  getSubscriptions,
  getSubscriptionInvoices,
  getSubscriptionInvoicesInRange,
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

/** YYYY-MM-DD from a Date object */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Get days in month grid: includes leading/trailing days to fill 7-column weeks */
function getMonthGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Monday=0 … Sunday=6
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: Date[] = [];
  // Leading days from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  // Days of current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Trailing days to complete last week
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1];
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  return days;
}

// ── Event types ─────────────────────────────────────────────────────────────

interface CalendarEvent {
  type: 'renewal' | 'invoice' | 'overdue';
  date: string; // YYYY-MM-DD
  subscription: Subscription;
  invoice?: SubscriptionInvoice & { vendor_name: string; service_name: string };
  amount: number; // INR
}

/** Project renewal dates for a subscription across a given month.
 *  Uses next_renewal_date if set, otherwise derives the renewal day
 *  from start_date or invoice history. */
function projectRenewals(
  sub: Subscription,
  year: number,
  month: number,
  invoices?: SubscriptionInvoice[],
): string[] {
  if (sub.status === 'cancelled' || sub.billing_cycle === 'one-time') return [];

  // Determine the renewal day-of-month from available data
  let renewalDay: number | null = null;

  if (sub.next_renewal_date) {
    renewalDay = new Date(sub.next_renewal_date).getDate();
  } else if (invoices && invoices.length > 0) {
    // Use the most common invoice day from history
    const days = invoices
      .filter(i => i.invoice_date)
      .map(i => new Date(i.invoice_date!).getDate());
    if (days.length > 0) {
      renewalDay = days.sort((a, b) =>
        days.filter(d => d === b).length - days.filter(d => d === a).length
      )[0];
    }
  } else if (sub.start_date) {
    renewalDay = new Date(sub.start_date).getDate();
  }

  if (!renewalDay) return [];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const day = Math.min(renewalDay, daysInMonth);

  const subStart = sub.start_date
    ? new Date(sub.start_date)
    : sub.next_renewal_date
      ? new Date(sub.next_renewal_date)
      : null;
  if (!subStart) return [];

  const monthDiff = (year - subStart.getFullYear()) * 12 + (month - subStart.getMonth());
  if (monthDiff < 0) return [];

  if (sub.billing_cycle === 'monthly') {
    return [toDateStr(new Date(year, month, day))];
  }
  if (sub.billing_cycle === 'quarterly' && monthDiff % 3 === 0) {
    return [toDateStr(new Date(year, month, day))];
  }
  if (sub.billing_cycle === 'annual' && monthDiff % 12 === 0) {
    return [toDateStr(new Date(year, month, day))];
  }

  return [];
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SubscriptionCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<(SubscriptionInvoice & { vendor_name: string; service_name: string })[]>([]);
  const [allInvoicesMap, setAllInvoicesMap] = useState<Record<string, SubscriptionInvoice[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const todayStr = toDateStr(today);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Navigate months
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  // Fetch data
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const allSubs = await getSubscriptions();
        setSubs(allSubs);

        // Fetch invoices for the current month (for display)
        const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const invs = await getSubscriptionInvoicesInRange(from, to);
        setInvoices(invs);

        // Fetch all invoices per sub (for renewal day derivation)
        const entries = await Promise.all(
          allSubs.map(async (s) => {
            const subInvs = await getSubscriptionInvoices(s.id);
            return [s.id, subInvs] as [string, SubscriptionInvoice[]];
          }),
        );
        setAllInvoicesMap(Object.fromEntries(entries));
      } catch (err) {
        console.error('Failed to load calendar data:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [year, month]);

  // Build events
  const events = useMemo(() => {
    const all: CalendarEvent[] = [];

    // Renewals
    for (const sub of subs) {
      const dates = projectRenewals(sub, year, month, allInvoicesMap[sub.id]);
      for (const date of dates) {
        const isPast = date < todayStr;
        const hasInvoice = invoices.some(
          (inv) => inv.invoice_date?.slice(0, 10) === date && inv.vendor_name === sub.vendor_name,
        );
        all.push({
          type: isPast && !hasInvoice ? 'overdue' : 'renewal',
          date,
          subscription: sub,
          amount: sub.inr_amount ?? 0,
        });
      }
    }

    // Invoices
    for (const inv of invoices) {
      const date = inv.invoice_date?.slice(0, 10);
      if (!date) continue;
      const sub = subs.find((s) => s.vendor_name === inv.vendor_name);
      all.push({
        type: 'invoice',
        date,
        subscription: sub || { vendor_name: inv.vendor_name, service_name: inv.service_name } as Subscription,
        invoice: inv,
        amount: inv.inr_amount ?? inv.total_amount ?? 0,
      });
    }

    return all;
  }, [subs, invoices, allInvoicesMap, year, month, todayStr]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      (map[ev.date] ??= []).push(ev);
    }
    return map;
  }, [events]);

  // Stats
  const stats = useMemo(() => {
    const renewals = events.filter((e) => e.type === 'renewal').length;
    const overdue = events.filter((e) => e.type === 'overdue').length;
    const totalDue = events
      .filter((e) => e.type === 'renewal' || e.type === 'overdue')
      .reduce((sum, e) => sum + e.amount, 0);
    const totalPaid = events
      .filter((e) => e.type === 'invoice')
      .reduce((sum, e) => sum + e.amount, 0);
    return { renewals, overdue, totalDue, totalPaid };
  }, [events]);

  // Day grid
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);

  // Selected day events
  const selectedEvents = selectedDate ? eventsByDate[selectedDate] || [] : [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 space-y-5">
      <SubscriptionTabBar />

      {/* Header + Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
            <Calendar size={22} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Renewal Calendar</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Subscription renewals and payment tracking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToday}
            className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-lg font-semibold text-slate-800 min-w-[180px] text-center">
            {monthNames[month]} {year}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: 'Renewals',
            value: String(stats.renewals),
            sub: 'This month',
            Icon: RefreshCw,
            bg: 'bg-indigo-50',
            tc: 'text-indigo-600',
          },
          {
            label: 'Total Due',
            value: fmtINR(stats.totalDue),
            sub: 'Upcoming renewals',
            Icon: IndianRupee,
            bg: 'bg-amber-50',
            tc: 'text-amber-600',
          },
          {
            label: 'Total Paid',
            value: fmtINR(stats.totalPaid),
            sub: 'Invoices this month',
            Icon: IndianRupee,
            bg: 'bg-emerald-50',
            tc: 'text-emerald-600',
          },
          {
            label: 'Overdue',
            value: String(stats.overdue),
            sub: 'Missing invoices',
            Icon: AlertTriangle,
            bg: 'bg-red-50',
            tc: 'text-red-600',
          },
        ].map(({ label, value, sub, Icon, bg, tc }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3`}>
              <Icon size={17} className={tc} />
            </div>
            <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
            <p className="text-xs font-medium text-slate-600 mt-1">{label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Calendar + Side panel */}
      <div className="flex gap-5">
        {/* Calendar grid */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-40 text-slate-400 text-sm">
              Loading calendar...
            </div>
          ) : (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-slate-200">
                {dayHeaders.map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider py-3"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7">
                {grid.map((date, i) => {
                  const dateStr = toDateStr(date);
                  const isCurrentMonth = date.getMonth() === month;
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDate;
                  const dayEvents = eventsByDate[dateStr] || [];
                  const hasRenewal = dayEvents.some((e) => e.type === 'renewal');
                  const hasInvoice = dayEvents.some((e) => e.type === 'invoice');
                  const hasOverdue = dayEvents.some((e) => e.type === 'overdue');

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedDate(dateStr === selectedDate ? null : dateStr)}
                      className={`relative min-h-[90px] p-2 border-b border-r border-slate-100 text-left transition-colors ${
                        !isCurrentMonth ? 'bg-slate-50/50' : 'bg-white hover:bg-slate-50/50'
                      } ${isSelected ? 'ring-2 ring-inset ring-indigo-400' : ''}`}
                    >
                      <span
                        className={`text-sm font-medium ${
                          isToday
                            ? 'bg-indigo-600 text-white w-7 h-7 rounded-full flex items-center justify-center'
                            : isCurrentMonth
                              ? 'text-slate-700'
                              : 'text-slate-300'
                        }`}
                      >
                        {date.getDate()}
                      </span>

                      {/* Event dots */}
                      {dayEvents.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {dayEvents.slice(0, 3).map((ev, j) => (
                            <div
                              key={j}
                              className={`text-[10px] leading-tight truncate rounded px-1 py-0.5 ${
                                ev.type === 'invoice'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : ev.type === 'overdue'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {ev.subscription.vendor_name?.slice(0, 12)}
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-[10px] text-slate-400 px-1">
                              +{dayEvents.length - 3} more
                            </div>
                          )}
                        </div>
                      )}

                      {/* Dot indicators in bottom-right */}
                      {(hasRenewal || hasInvoice || hasOverdue) && (
                        <div className="absolute bottom-1.5 right-1.5 flex gap-0.5">
                          {hasOverdue && <span className="w-2 h-2 rounded-full bg-red-500" />}
                          {hasRenewal && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                          {hasInvoice && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-5 px-4 py-3 border-t border-slate-200 bg-slate-50">
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  Renewal Due
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Invoice Received
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  Overdue
                </div>
              </div>
            </>
          )}
        </div>

        {/* Side panel: day detail */}
        {selectedDate && (
          <div className="w-80 shrink-0 bg-white rounded-xl border border-slate-200 overflow-hidden self-start">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <p className="text-sm font-semibold text-slate-800">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            </div>

            {selectedEvents.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                No events on this day
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {selectedEvents.map((ev, idx) => (
                  <div key={idx} className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                          ev.type === 'invoice'
                            ? 'bg-emerald-500'
                            : ev.type === 'overdue'
                              ? 'bg-red-500'
                              : 'bg-amber-500'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {ev.subscription.vendor_name}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {ev.subscription.service_name}
                          {ev.subscription.plan_name ? ` — ${ev.subscription.plan_name}` : ''}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${
                              ev.type === 'invoice'
                                ? 'bg-emerald-100 text-emerald-700'
                                : ev.type === 'overdue'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {ev.type === 'invoice' ? 'Paid' : ev.type === 'overdue' ? 'Overdue' : 'Due'}
                          </span>
                          <span className="text-xs font-semibold text-slate-700">
                            {fmtINR(ev.amount)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

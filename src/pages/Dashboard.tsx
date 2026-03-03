import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Users,
  Upload,
  ArrowRight,
  AlertTriangle,
  IndianRupee,
  Percent,
  TrendingUp,
} from 'lucide-react';
import { getDashboardStats, getInvoices } from '../lib/supabase';
import type { Invoice } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtCur(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}
function fmtAmt(n: number) {
  if (n === 0) return '0';
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000)    return `${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000)      return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}

function getFY() {
  const d = new Date();
  const yr = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return { yr, start: `${yr}-04-01`, end: `${yr + 1}-03-31` };
}
function buildMonthCols(yr: number) {
  const cols: { key: string; label: string }[] = [];
  for (let m = 4; m <= 12; m++) cols.push({ key: `${yr}-${String(m).padStart(2, '0')}`, label: MO[m - 1] });
  for (let m = 1; m <= 3;  m++) cols.push({ key: `${yr + 1}-${String(m).padStart(2, '0')}`, label: MO[m - 1] });
  return cols;
}
function daysOld(inv: Invoice): number {
  const ref = inv.due_date || inv.invoice_date;
  if (!ref) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000));
}

// ── Monthly Burn SVG Chart ────────────────────────────────────────────────────

interface BurnBar { label: string; paid: number; partial: number; unpaid: number; }

function MonthlyBurnChart({ data }: { data: BurnBar[] }) {
  const maxVal = Math.max(...data.map(d => d.paid + d.partial + d.unpaid), 1);
  const W = 560, H = 170;
  const P = { t: 18, r: 8, b: 26, l: 46 };
  const cW = W - P.l - P.r;
  const cH = H - P.t - P.b;
  const slot = cW / data.length;
  const bW = Math.max(slot * 0.55, 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* Gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => {
        const y = P.t + cH * (1 - t);
        return (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y} y2={y} stroke="#f1f5f9" strokeWidth={t === 0 ? 1 : 0.5} />
            <text x={P.l - 4} y={y + 3.5} textAnchor="end" fontSize={7.5} fill="#cbd5e1">
              {t === 0 ? '0' : fmtAmt(maxVal * t)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const x = P.l + i * slot + (slot - bW) / 2;
        const base = P.t + cH;
        const pH  = (d.paid    / maxVal) * cH;
        const paH = (d.partial / maxVal) * cH;
        const uH  = (d.unpaid  / maxVal) * cH;
        const totalH = pH + paH + uH;
        return (
          <g key={d.label}>
            {/* Unpaid — rose */}
            {uH > 0.5 && (
              <rect x={x} y={base - totalH} width={bW} height={uH}
                fill="#f87171" rx={totalH < 3 ? 1 : 0} />
            )}
            {/* Partial — amber */}
            {paH > 0.5 && (
              <rect x={x} y={base - pH - paH} width={bW} height={paH} fill="#fbbf24" />
            )}
            {/* Paid — emerald */}
            {pH > 0.5 && (
              <rect x={x} y={base - pH} width={bW} height={pH}
                fill="#10b981"
                rx={uH < 0.5 && paH < 0.5 ? 1 : 0} />
            )}
            {/* X label */}
            <text x={x + bW / 2} y={H - 4} textAnchor="middle" fontSize={7.5} fill="#94a3b8">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-slate-100 rounded animate-pulse ${className ?? ''}`} />;
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vendorCount, setVendorCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getInvoices(), getDashboardStats()])
      .then(([inv, s]) => { setInvoices(inv); setVendorCount(s.totalVendors); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const { yr, start, end } = useMemo(getFY, []);
  const monthCols = useMemo(() => buildMonthCols(yr), [yr]);

  const fyInvoices = useMemo(
    () => invoices.filter(i => { const d = i.invoice_date || ''; return d >= start && d <= end; }),
    [invoices, start, end],
  );

  // ── Computed stats ──
  const stats = useMemo(() => {
    const totalSpend = invoices.reduce((s, i) => s + (i.total_amount ?? 0), 0);
    const unpaidExposure = invoices
      .filter(i => !['paid', 'rejected'].includes(i.status))
      .reduce((s, i) => s + ((i.total_amount ?? 0) - (i.paid_amount ?? 0)), 0);
    const paidTotal = invoices
      .filter(i => i.status === 'paid')
      .reduce((s, i) => s + (i.total_amount ?? 0), 0);
    const paidRate = totalSpend > 0 ? ((paidTotal / totalSpend) * 100).toFixed(1) : '0.0';
    const pending = invoices.filter(i => ['received', 'processing'].includes(i.status)).length;
    return { totalSpend, unpaidExposure, paidRate, pending };
  }, [invoices]);

  // ── Monthly burn ──
  const burnData = useMemo<BurnBar[]>(() =>
    monthCols.map(col => {
      const mo = fyInvoices.filter(i => (i.invoice_date || '').startsWith(col.key));
      let paid = 0, partial = 0, unpaid = 0;
      for (const inv of mo) {
        const total = inv.total_amount ?? 0;
        const p = inv.paid_amount ?? 0;
        if (inv.status === 'paid') paid += total;
        else if (inv.status === 'partly_paid') { partial += p; unpaid += total - p; }
        else if (inv.status !== 'rejected') unpaid += total;
      }
      return { label: col.label, paid, partial, unpaid };
    }),
    [fyInvoices, monthCols],
  );

  // ── Unpaid invoices ──
  const unpaidInvoices = useMemo(
    () => invoices.filter(i => !['paid', 'rejected'].includes(i.status)),
    [invoices],
  );

  // ── Aging buckets ──
  const AGING_DEFS = [
    { label: '0–30 days',  min: 0,  max: 30,       color: '#10b981' },
    { label: '31–60 days', min: 31, max: 60,        color: '#3b82f6' },
    { label: '61–90 days', min: 61, max: 90,        color: '#f59e0b' },
    { label: '90+ days',   min: 91, max: Infinity,  color: '#ef4444' },
  ];
  const aging = useMemo(() =>
    AGING_DEFS.map(b => {
      const items = unpaidInvoices.filter(i => { const d = daysOld(i); return d >= b.min && d <= b.max; });
      return { ...b, count: items.length, balance: items.reduce((s, i) => s + ((i.total_amount ?? 0) - (i.paid_amount ?? 0)), 0) };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unpaidInvoices],
  );
  const maxAgingBal = useMemo(() => Math.max(...aging.map(b => b.balance), 1), [aging]);

  // ── Top vendors by unpaid ──
  const topVendors = useMemo(() => {
    const vm = new Map<string, number>();
    for (const inv of unpaidInvoices) {
      const bal = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0);
      vm.set(inv.vendor_name, (vm.get(inv.vendor_name) ?? 0) + bal);
    }
    return [...vm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, balance]) => ({ name, balance }));
  }, [unpaidInvoices]);
  const maxVendorBal = topVendors[0]?.balance ?? 1;

  // ── At-risk invoices ──
  const atRisk = useMemo(() =>
    unpaidInvoices.map(i => ({ ...i, age: daysOld(i) })).sort((a, b) => b.age - a.age).slice(0, 6),
    [unpaidInvoices],
  );

  function ageBadge(days: number) {
    if (days <= 30) return 'bg-emerald-100 text-emerald-700';
    if (days <= 60) return 'bg-blue-100 text-blue-700';
    if (days <= 90) return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  }

  const VENDOR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6'];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financial Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track spend, invoices, and vendor performance</p>
        </div>
        <Link
          to="/upload"
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Upload size={15} />
          Process Invoice
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          [
            { label: 'Total Spend',      value: fmtCur(stats.totalSpend),     sub: 'All invoices',       Icon: IndianRupee,  bg: 'bg-indigo-50',  tc: 'text-indigo-600' },
            { label: 'Unpaid Exposure',  value: fmtCur(stats.unpaidExposure), sub: 'Outstanding balance', Icon: AlertTriangle, bg: 'bg-red-50',     tc: 'text-red-500'    },
            { label: 'Paid Rate',        value: `${stats.paidRate}%`,          sub: 'By invoice amount',  Icon: Percent,      bg: 'bg-emerald-50', tc: 'text-emerald-600'},
            { label: 'Total Invoices',   value: String(invoices.length),       sub: `${stats.pending} pending`, Icon: FileText, bg: 'bg-slate-50',  tc: 'text-slate-600'  },
            { label: 'Vendors',          value: String(vendorCount),           sub: 'Registered',         Icon: Users,        bg: 'bg-violet-50',  tc: 'text-violet-600' },
          ].map(({ label, value, sub, Icon, bg, tc }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon size={17} className={tc} />
              </div>
              <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
              <p className="text-xs font-medium text-slate-600 mt-1">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
            </div>
          ))
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-5 gap-5">

        {/* Monthly Burn */}
        <div className="col-span-3 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-semibold text-slate-900 text-sm">Monthly Burn</p>
              <p className="text-xs text-slate-400">FY {yr}–{String(yr + 1).slice(2)} · Paid vs Partial vs Unpaid</p>
            </div>
            <div className="flex items-center gap-3">
              {[['#10b981', 'Paid'], ['#fbbf24', 'Partial'], ['#f87171', 'Unpaid']].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1 text-xs text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: c }} />
                  {l}
                </span>
              ))}
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-44 mt-3" />
          ) : (
            <MonthlyBurnChart data={burnData} />
          )}
        </div>

        {/* Vendor Concentration (Unpaid) */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <p className="font-semibold text-slate-900 text-sm">Vendor Concentration</p>
          <p className="text-xs text-slate-400 mb-5">Top vendors by unpaid balance</p>
          {loading ? (
            <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
          ) : topVendors.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No unpaid balances</p>
          ) : (
            <div className="space-y-4">
              {topVendors.map(({ name, balance }, i) => (
                <div key={name}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-700 font-medium truncate max-w-[140px]" title={name}>{name}</span>
                    <span className="text-slate-500 shrink-0 ml-2">{fmtAmt(balance)}</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(balance / maxVendorBal) * 100}%`, backgroundColor: VENDOR_COLORS[i] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-5 gap-5">

        {/* Aging Buckets */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <p className="font-semibold text-slate-900 text-sm">Aging Buckets</p>
          <p className="text-xs text-slate-400 mb-5">Unpaid invoices by overdue age</p>
          {loading ? (
            <div className="space-y-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <div className="space-y-4">
              {aging.map(b => (
                <div key={b.label}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-600">{b.label}</span>
                    <span className="font-semibold" style={{ color: b.color }}>
                      {b.count} invoice{b.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-1">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(b.balance / maxAgingBal) * 100}%`, backgroundColor: b.color }}
                    />
                  </div>
                  <p className="text-xs text-right font-medium" style={{ color: b.color }}>
                    {fmtCur(b.balance)}
                  </p>
                </div>
              ))}
              <div className="pt-3 border-t border-slate-100 flex justify-between text-sm font-semibold text-slate-800">
                <span>Total Unpaid</span>
                <span>{fmtCur(stats.unpaidExposure)}</span>
              </div>
            </div>
          )}
        </div>

        {/* At Risk Invoices */}
        <div className="col-span-3 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold text-slate-900 text-sm">At Risk Invoices</p>
              <p className="text-xs text-slate-400">Oldest unpaid · sorted by age</p>
            </div>
            <Link to="/tracker" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-medium">
              View all <ArrowRight size={11} />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : atRisk.length === 0 ? (
            <div className="py-10 text-center">
              <TrendingUp size={32} className="text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600">All caught up!</p>
              <p className="text-xs text-slate-400 mt-0.5">No unpaid invoices outstanding</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {atRisk.map(inv => (
                <div key={inv.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{inv.vendor_name}</p>
                    <p className="text-xs text-slate-400">{inv.invoice_number || 'No invoice #'}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${ageBadge(inv.age)}`}>
                    {inv.age}d old
                  </span>
                  <p className="text-sm font-semibold text-slate-900 shrink-0 tabular-nums w-28 text-right">
                    {fmtCur((inv.total_amount ?? 0) - (inv.paid_amount ?? 0))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

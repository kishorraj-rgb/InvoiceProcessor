import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import { getInvoices } from '../lib/supabase';
import { getTaxonomy, categoryDotStyle } from '../lib/categories';
import type { Invoice } from '../types';

// ── Colour palette (matches categories.ts DOT_STYLES order) ──────────────────
const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#f43f5e', '#06b6d4', '#f59e0b',
  '#3b82f6', '#a855f7', '#0ea5e9', '#14b8a6', '#10b981',
  '#ec4899', '#f97316',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatCurrency(n: number) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function formatCurrencyShort(n: number) {
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + ' Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + ' L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(0) + 'K';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function statusBadge(status: Invoice['status']) {
  const map: Record<string, string> = {
    paid:        'bg-emerald-100 text-emerald-700',
    approved:    'bg-blue-100 text-blue-700',
    processing:  'bg-amber-100 text-amber-700',
    received:    'bg-slate-100 text-slate-600',
    partly_paid: 'bg-violet-100 text-violet-700',
    rejected:    'bg-red-100 text-red-600',
  };
  return map[status] || 'bg-slate-100 text-slate-600';
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// ── Donut chart ───────────────────────────────────────────────────────────────
interface DonutSeg { label: string; value: number; color: string }

function DonutChart({ data, total }: { data: DonutSeg[]; total: number }) {
  const R = 70;
  const cx = 88;
  const cy = 88;
  const circ = 2 * Math.PI * R;
  let cumPct = 0;

  if (total === 0) return null;

  return (
    <svg viewBox="0 0 176 176" className="w-full h-full">
      {data.map((seg, i) => {
        const pct = seg.value / total;
        const dash = pct * circ;
        const gap = circ - dash;
        const rot = cumPct * 360 - 90;
        cumPct += pct;
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth={26}
            strokeDasharray={`${dash} ${gap}`}
            style={{ transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${rot}deg)` }}
          />
        );
      })}
      {/* Inner circle (white hole) */}
      <circle cx={cx} cy={cy} r={57} fill="white" />
      {/* Center text */}
      <text x={cx} y={cy - 7} textAnchor="middle" fill="#94a3b8" fontSize={9}>Total</text>
      <text x={cx} y={cy + 9} textAnchor="middle" fill="#1e293b" fontSize={12} fontWeight="600">
        {formatCurrencyShort(total)}
      </text>
    </svg>
  );
}

// ── Monthly bar chart ─────────────────────────────────────────────────────────
function MonthlyBarChart({ months }: { months: { label: string; amount: number }[] }) {
  const maxAmt = Math.max(...months.map(m => m.amount), 1);
  const CHART_H = 110;
  const BAR_W = 32;
  const GAP = 14;
  const LEFT_PAD = 8;
  const svgW = months.length * (BAR_W + GAP) - GAP + LEFT_PAD * 2;
  const svgH = CHART_H + 30;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ minWidth: svgW, width: '100%', height: 'auto', maxHeight: 160 }}
      >
        {/* Horizontal guide lines */}
        {[0.25, 0.5, 0.75, 1].map(pct => {
          const y = CHART_H - pct * CHART_H;
          return (
            <line
              key={pct}
              x1={0} y1={y} x2={svgW} y2={y}
              stroke="#f1f5f9" strokeWidth={1}
            />
          );
        })}
        {months.map((m, i) => {
          const barH = Math.max((m.amount / maxAmt) * CHART_H, m.amount > 0 ? 4 : 0);
          const x = LEFT_PAD + i * (BAR_W + GAP);
          const y = CHART_H - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={BAR_W} height={barH} rx={5} fill="#6366f1" fillOpacity={0.8} />
              {/* Month label */}
              <text
                x={x + BAR_W / 2} y={CHART_H + 16}
                textAnchor="middle" fill="#94a3b8" fontSize={9.5}
              >
                {m.label}
              </text>
              {/* Amount above bar */}
              {m.amount > 0 && (
                <text
                  x={x + BAR_W / 2} y={y - 5}
                  textAnchor="middle" fill="#6366f1" fontSize={8.5} fontWeight="500"
                >
                  {formatCurrencyShort(m.amount)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CategoryDetail() {
  const { category: rawCategory } = useParams<{ category: string }>();
  const category = decodeURIComponent(rawCategory || '');
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [taxonomy, setTaxonomy] = useState(getTaxonomy);

  useEffect(() => {
    function onUpdate() { setTaxonomy(getTaxonomy()); }
    window.addEventListener('ip-taxonomy-updated', onUpdate);
    return () => window.removeEventListener('ip-taxonomy-updated', onUpdate);
  }, []);

  useEffect(() => {
    getInvoices()
      .then(data => { setInvoices(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const allCategories = Object.keys(taxonomy);

  // Invoices in this category
  const catInvoices = useMemo(
    () => invoices.filter(inv => inv.category === category),
    [invoices, category],
  );

  // Subcategory stats
  const subcatStats = useMemo(() => {
    const map: Record<string, { count: number; spend: number }> = {};
    for (const inv of catInvoices) {
      const sub = inv.subcategory || 'Other';
      if (!map[sub]) map[sub] = { count: 0, spend: 0 };
      map[sub].count++;
      map[sub].spend += inv.total_amount || 0;
    }
    return Object.entries(map)
      .map(([name, s], i) => ({ name, count: s.count, spend: s.spend, color: CHART_COLORS[i % CHART_COLORS.length] }))
      .sort((a, b) => b.spend - a.spend);
  }, [catInvoices]);

  // Monthly spend — last 9 months
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 9 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (8 - i), 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        amount: 0,
      };
    });
    for (const inv of catInvoices) {
      const dateStr = inv.invoice_date || inv.created_at;
      if (!dateStr) continue;
      const d = new Date(dateStr);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const m = months.find(m => m.key === key);
      if (m) m.amount += inv.total_amount || 0;
    }
    return months;
  }, [catInvoices]);

  const totalSpend = catInvoices.reduce((s, inv) => s + (inv.total_amount || 0), 0);
  const dotStyle = categoryDotStyle(category, allCategories);

  if (loading) {
    return <div className="p-8 text-slate-400 text-sm">Loading…</div>;
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 mb-5 shadow-sm">
        <button
          type="button"
          onClick={() => navigate('/categories')}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 mb-3 transition-colors"
        >
          <ArrowLeft size={13} /> Back to Categories
        </button>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full shrink-0 ${dotStyle}`} />
            <h1 className="text-2xl font-bold text-slate-900">{category}</h1>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <p className="text-xl font-bold text-slate-900">{formatCurrency(totalSpend)}</p>
              <p className="text-xs text-slate-400">Total Spend</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-slate-900">{catInvoices.length}</p>
              <p className="text-xs text-slate-400">Invoices</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-slate-900">{subcatStats.length}</p>
              <p className="text-xs text-slate-400">Sub-categories</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      {catInvoices.length > 0 && (
        <div className="grid grid-cols-3 gap-5 mb-5">
          {/* Monthly bar chart — 2/3 width */}
          <div className="col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-4 text-sm">Monthly Spend</h2>
            <MonthlyBarChart months={monthlyData} />
          </div>

          {/* Donut — 1/3 width */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-3 text-sm">By Sub-category</h2>
            <div className="w-40 h-40 mx-auto">
              <DonutChart
                data={subcatStats.map(s => ({ label: s.name, value: s.spend, color: s.color }))}
                total={totalSpend}
              />
            </div>
            {/* Legend */}
            <div className="mt-3 space-y-1.5">
              {subcatStats.slice(0, 5).map(s => (
                <div key={s.name} className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="flex-1 text-slate-600 truncate">{s.name}</span>
                  <span className="text-slate-400 text-[10px]">
                    {totalSpend > 0 ? Math.round((s.spend / totalSpend) * 100) : 0}%
                  </span>
                </div>
              ))}
              {subcatStats.length > 5 && (
                <p className="text-[10px] text-slate-300 pl-4">+{subcatStats.length - 5} more</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sub-category Breakdown grid */}
      {subcatStats.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-5 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Sub-category Breakdown</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-slate-100">
            {subcatStats.map((s, i) => (
              <div key={s.name} className="px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  <span className="text-sm font-medium text-slate-700 truncate">{s.name}</span>
                </div>
                <p className="text-xl font-bold text-slate-900">{formatCurrency(s.spend)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.count} invoice{s.count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoices table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Invoices ({catInvoices.length})</h2>
          {catInvoices.length > 0 && (
            <button
              type="button"
              onClick={() => exportCSV(catInvoices, category)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Download size={12} /> Export CSV
            </button>
          )}
        </div>

        {catInvoices.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            No invoices in this category yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 920 }}>
              <thead>
                <tr className="border-b border-slate-100 text-[11px] text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Vendor</th>
                  <th className="text-left px-4 py-3 font-medium">Invoice #</th>
                  <th className="text-left px-4 py-3 font-medium">Description</th>
                  <th className="text-left px-4 py-3 font-medium">Sub-category</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                  <th className="text-right px-4 py-3 font-medium">Paid</th>
                  <th className="text-right px-4 py-3 font-medium">Balance</th>
                  <th className="text-right px-4 py-3 font-medium">Age</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {catInvoices.map(inv => {
                  const balance = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0);
                  const age = daysSince(inv.created_at);
                  return (
                    <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {formatDate(inv.invoice_date || inv.created_at)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                        {inv.vendor_name}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">
                        {inv.invoice_number || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[180px]">
                        <span className="truncate block">{inv.line_items?.[0]?.description || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        {inv.subcategory
                          ? <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">{inv.subcategory}</span>
                          : <span className="text-slate-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize whitespace-nowrap ${statusBadge(inv.status)}`}>
                          {inv.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                        {formatCurrency(inv.total_amount ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500 whitespace-nowrap">
                        {inv.paid_amount ? formatCurrency(inv.paid_amount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500 whitespace-nowrap">
                        {balance > 0 ? formatCurrency(balance) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400 whitespace-nowrap text-xs">
                        {age}d
                      </td>
                      <td className="px-4 py-3 text-center">
                        {inv.file_url && (
                          <a
                            href={inv.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-400 hover:text-indigo-600 transition-colors inline-flex"
                            title="View invoice file"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCSV(invoices: Invoice[], category: string) {
  const headers = ['Date', 'Vendor', 'Invoice #', 'Sub-category', 'Status', 'Amount', 'Paid', 'Balance'];
  const rows = invoices.map(inv => [
    inv.invoice_date || inv.created_at?.slice(0, 10) || '',
    inv.vendor_name,
    inv.invoice_number || '',
    inv.subcategory || '',
    inv.status,
    inv.total_amount ?? '',
    inv.paid_amount ?? '',
    Math.max((inv.total_amount ?? 0) - (inv.paid_amount ?? 0), 0) || '',
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${category.replace(/[^a-z0-9]/gi, '_')}_invoices.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

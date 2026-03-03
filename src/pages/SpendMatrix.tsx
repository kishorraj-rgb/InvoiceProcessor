import { useEffect, useState, useMemo } from 'react';
import { Search, ChevronRight, Download, BarChart2, Tag, Users, Calendar } from 'lucide-react';
import { getInvoices } from '../lib/supabase';
import type { Invoice } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtAmt(n: number): string {
  if (n === 0) return '—';
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

function fmtFull(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function getFY() {
  const d = new Date();
  const yr = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return { yr, start: `${yr}-04-01`, end: `${yr + 1}-03-31` };
}

function buildMonthCols(yr: number) {
  const cols: { key: string; label: string }[] = [];
  for (let m = 4; m <= 12; m++) cols.push({ key: `${yr}-${String(m).padStart(2,'0')}`, label: MO[m-1] });
  for (let m = 1; m <= 3;  m++) cols.push({ key: `${yr+1}-${String(m).padStart(2,'0')}`, label: MO[m-1] });
  return cols;
}

function buildQuarterCols(yr: number) {
  return [
    { key: 'Q1', label: 'Q1 Apr–Jun', months: [`${yr}-04`,`${yr}-05`,`${yr}-06`] },
    { key: 'Q2', label: 'Q2 Jul–Sep', months: [`${yr}-07`,`${yr}-08`,`${yr}-09`] },
    { key: 'Q3', label: 'Q3 Oct–Dec', months: [`${yr}-10`,`${yr}-11`,`${yr}-12`] },
    { key: 'Q4', label: 'Q4 Jan–Mar', months: [`${yr+1}-01`,`${yr+1}-02`,`${yr+1}-03`] },
  ];
}

function heatColor(val: number, max: number, dim = false): React.CSSProperties {
  if (val === 0 || max === 0) return {};
  const ratio = Math.min(val / max, 1);
  const alpha = dim ? 0.08 + ratio * 0.35 : 0.13 + ratio * 0.52;
  return { backgroundColor: `rgba(16,185,129,${alpha.toFixed(2)})` };
}

function downloadCSV(headers: string[], rows: (string|number)[][], filename: string) {
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c)}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = filename;
  a.click();
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, bg }: { label: string; value: string; icon: React.ReactNode; bg: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-2`}>{icon}</div>
      <p className="text-base font-bold text-slate-900 leading-tight truncate" title={value}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SpendMatrix() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [quarterly, setQuarterly] = useState(false);

  useEffect(() => {
    getInvoices()
      .then(data => setInvoices(data))
      .finally(() => setLoading(false));
  }, []);

  const { yr, start, end } = useMemo(getFY, []);

  const fyInvoices = useMemo(
    () => invoices.filter(i => { const d = i.invoice_date || ''; return d >= start && d <= end; }),
    [invoices, start, end],
  );

  const monthCols = useMemo(() => buildMonthCols(yr), [yr]);
  const quarterDefs = useMemo(() => buildQuarterCols(yr), [yr]);
  const cols = quarterly ? quarterDefs.map(q => ({ key: q.key, label: q.label })) : monthCols;

  // category → vendor → colKey → amount
  const matrix = useMemo(() => {
    const m = new Map<string, Map<string, Map<string, number>>>();
    for (const inv of fyInvoices) {
      const cat = inv.category || 'Uncategorised';
      const vendor = inv.vendor_name;
      const mo = (inv.invoice_date || '').slice(0, 7);
      let colKey: string;
      if (quarterly) {
        const q = quarterDefs.find(q => q.months.includes(mo));
        if (!q) continue;
        colKey = q.key;
      } else {
        colKey = mo;
      }
      if (!m.has(cat)) m.set(cat, new Map());
      const cmap = m.get(cat)!;
      if (!cmap.has(vendor)) cmap.set(vendor, new Map());
      const vmap = cmap.get(vendor)!;
      vmap.set(colKey, (vmap.get(colKey) ?? 0) + (inv.total_amount ?? 0));
    }
    return m;
  }, [fyInvoices, quarterly, quarterDefs]);

  const allCategories = useMemo(() => [...matrix.keys()].sort(), [matrix]);

  // ── Stats ──
  const stats = useMemo(() => {
    const totalSpend = fyInvoices.reduce((s, i) => s + (i.total_amount ?? 0), 0);

    let topCat = '', topCatAmt = 0;
    for (const [cat, vendors] of matrix) {
      let sum = 0;
      for (const months of vendors.values()) for (const a of months.values()) sum += a;
      if (sum > topCatAmt) { topCatAmt = sum; topCat = cat; }
    }

    const vt = new Map<string, number>();
    for (const inv of fyInvoices) vt.set(inv.vendor_name, (vt.get(inv.vendor_name) ?? 0) + (inv.total_amount ?? 0));
    let topVendor = '', topVendorAmt = 0;
    for (const [v, a] of vt) if (a > topVendorAmt) { topVendorAmt = a; topVendor = v; }

    const mt = new Map<string, number>();
    for (const inv of fyInvoices) {
      const mo = (inv.invoice_date || '').slice(0, 7);
      if (mo) mt.set(mo, (mt.get(mo) ?? 0) + (inv.total_amount ?? 0));
    }
    let peakMo = '', peakAmt = 0;
    for (const [mo, a] of mt) if (a > peakAmt) { peakAmt = a; peakMo = mo; }
    const peakLabel = peakMo ? MO[parseInt(peakMo.slice(5)) - 1] : '—';

    return { totalSpend, topCat, topVendor, peakLabel };
  }, [fyInvoices, matrix]);

  // ── Per-cell helpers ──
  function catColVal(cat: string, colKey: string): number {
    const vendors = matrix.get(cat);
    if (!vendors) return 0;
    let t = 0;
    for (const months of vendors.values()) t += months.get(colKey) ?? 0;
    return t;
  }
  function catTotal(cat: string): number {
    return cols.reduce((s, c) => s + catColVal(cat, c.key), 0);
  }
  function vendColVal(cat: string, vendor: string, colKey: string): number {
    return matrix.get(cat)?.get(vendor)?.get(colKey) ?? 0;
  }
  function vendTotal(cat: string, vendor: string): number {
    return cols.reduce((s, c) => s + vendColVal(cat, vendor, c.key), 0);
  }
  function colGrandTotal(colKey: string): number {
    if (quarterly) {
      const q = quarterDefs.find(q => q.key === colKey);
      if (!q) return 0;
      return fyInvoices
        .filter(i => q.months.includes((i.invoice_date || '').slice(0, 7)))
        .reduce((s, i) => s + (i.total_amount ?? 0), 0);
    }
    return fyInvoices
      .filter(i => (i.invoice_date || '').startsWith(colKey))
      .reduce((s, i) => s + (i.total_amount ?? 0), 0);
  }

  // Max value for heat map scale
  const maxVal = useMemo(() => {
    let max = 0;
    for (const cat of allCategories) for (const col of cols) { const v = catColVal(cat, col.key); if (v > max) max = v; }
    return max;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, cols, allCategories]);

  // Visible categories after filter
  const visibleCategories = useMemo(
    () => allCategories.filter(c => !activeCategory || c === activeCategory),
    [allCategories, activeCategory],
  );

  // ── Toggle expand ──
  function toggle(cat: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  // ── CSV export ──
  function handleCSV() {
    const headers = ['Category', 'Vendor', ...cols.map(c => c.label), 'Total'];
    const rows: (string|number)[][] = [];
    for (const cat of visibleCategories) {
      rows.push([cat, 'TOTAL', ...cols.map(c => catColVal(cat, c.key)), catTotal(cat)]);
      for (const vendor of (matrix.get(cat)?.keys() ?? [])) {
        rows.push(['', vendor, ...cols.map(c => vendColVal(cat, vendor, c.key)), vendTotal(cat, vendor)]);
      }
    }
    downloadCSV(headers, rows, `Spend_Matrix_FY${yr}-${String(yr+1).slice(2)}.csv`);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Spend Matrix</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Category × Vendor monthly spend pivot · FY {yr}–{String(yr + 1).slice(2)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCSV}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors"
        >
          <Download size={14} />
          CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Annual Spend"  value={loading ? '—' : fmtFull(stats.totalSpend)} icon={<BarChart2 size={16} className="text-indigo-600" />}  bg="bg-indigo-50" />
        <StatCard label="Top Category"        value={loading ? '—' : stats.topCat || '—'}       icon={<Tag size={16}      className="text-emerald-600" />} bg="bg-emerald-50" />
        <StatCard label="Top Vendor"          value={loading ? '—' : stats.topVendor || '—'}    icon={<Users size={16}    className="text-amber-600" />}   bg="bg-amber-50" />
        <StatCard label="Peak Month"          value={loading ? '—' : stats.peakLabel}           icon={<Calendar size={16} className="text-rose-600" />}    bg="bg-rose-50" />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Vendor search */}
        <div className="relative shrink-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vendors..."
            title="Search vendors"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 w-44 bg-white"
          />
        </div>

        {/* Category tabs */}
        <div className="flex-1 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors shrink-0 ${
              !activeCategory ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All
          </button>
          {allCategories.map(cat => (
            <button
              type="button"
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors shrink-0 ${
                activeCategory === cat ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Monthly / Quarterly toggle */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 shrink-0">
          {[false, true].map(q => (
            <button
              type="button"
              key={String(q)}
              onClick={() => setQuarterly(q)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                quarterly === q ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {q ? 'Quarterly' : 'Monthly'}
            </button>
          ))}
        </div>
      </div>

      {/* Matrix table */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : fyInvoices.length === 0 ? (
        <div className="text-center py-24 text-slate-400">
          <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No invoice data for FY {yr}–{String(yr+1).slice(2)}</p>
          <p className="text-sm mt-1">Process some invoices with invoice dates to populate this matrix.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse min-w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-slate-50 z-20 min-w-[220px] shadow-[1px_0_0_#e2e8f0]">
                    Category / Vendor
                  </th>
                  {cols.map(col => (
                    <th key={col.key} className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[80px] whitespace-nowrap">
                      {col.label}
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wide min-w-[90px] bg-slate-100 border-l border-slate-200">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleCategories.flatMap(cat => {
                  const isExpanded = expanded.has(cat);
                  const vendors = matrix.get(cat);
                  const vendorList = vendors
                    ? [...vendors.keys()].filter(v => !search || v.toLowerCase().includes(search.toLowerCase())).sort()
                    : [];
                  const cTotal = catTotal(cat);

                  const catRow = (
                    <tr
                      key={`cat:${cat}`}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer select-none"
                      onClick={() => toggle(cat)}
                    >
                      <td className="sticky left-0 bg-white hover:bg-slate-50 z-10 px-4 py-3 shadow-[1px_0_0_#e2e8f0]">
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            size={14}
                            className={`text-slate-400 transition-transform duration-150 shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                          />
                          <span className="font-semibold text-slate-800 text-sm">{cat}</span>
                        </div>
                      </td>
                      {cols.map(col => {
                        const val = catColVal(cat, col.key);
                        return (
                          <td key={col.key} className="text-right px-3 py-3 text-xs font-medium text-slate-700 tabular-nums" style={heatColor(val, maxVal)}>
                            {fmtAmt(val)}
                          </td>
                        );
                      })}
                      <td className="text-right px-4 py-3 text-xs font-bold text-slate-900 tabular-nums bg-slate-50 border-l border-slate-200">
                        {fmtAmt(cTotal)}
                      </td>
                    </tr>
                  );

                  const vendorRows = (isExpanded ? vendorList : []).map(vendor => {
                    const vTotal = vendTotal(cat, vendor);
                    return (
                      <tr key={`vend:${cat}:${vendor}`} className="border-b border-slate-50 hover:bg-emerald-50/30">
                        <td className="sticky left-0 bg-slate-50/80 hover:bg-emerald-50/30 z-10 px-4 py-2 shadow-[1px_0_0_#e2e8f0]">
                          <div className="flex items-center gap-2 pl-6">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                            <span className="text-slate-600 text-xs">{vendor}</span>
                          </div>
                        </td>
                        {cols.map(col => {
                          const val = vendColVal(cat, vendor, col.key);
                          return (
                            <td key={col.key} className="text-right px-3 py-2 text-xs text-slate-600 tabular-nums" style={heatColor(val, maxVal, true)}>
                              {fmtAmt(val)}
                            </td>
                          );
                        })}
                        <td className="text-right px-4 py-2 text-xs font-semibold text-slate-700 tabular-nums bg-slate-50/80 border-l border-slate-200">
                          {fmtAmt(vTotal)}
                        </td>
                      </tr>
                    );
                  });

                  return [catRow, ...vendorRows];
                })}

                {/* Grand total row */}
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                  <td className="sticky left-0 bg-slate-100 z-10 px-4 py-3 text-sm font-bold text-slate-900 shadow-[1px_0_0_#cbd5e1]">
                    TOTAL
                  </td>
                  {cols.map(col => (
                    <td key={col.key} className="text-right px-3 py-3 text-xs font-bold text-slate-900 tabular-nums">
                      {fmtAmt(colGrandTotal(col.key))}
                    </td>
                  ))}
                  <td className="text-right px-4 py-3 text-sm font-bold text-slate-900 tabular-nums border-l border-slate-300 bg-slate-200">
                    {fmtAmt(stats.totalSpend)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  FileText,
  Download,
  Printer,
  Clock,
  Users,
  BarChart2,
  LayoutGrid,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react';
import { getInvoices, getVendors, getSubscriptionInvoicesInRange } from '../lib/supabase';
import type { Invoice, Vendor } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}
function fmtCur(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function firstOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function daysOld(invoice: Invoice): number {
  const ref = invoice.due_date || invoice.invoice_date;
  if (!ref) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000));
}
function ageBucket(days: number) {
  if (days <= 30) return '0–30 days';
  if (days <= 60) return '31–60 days';
  if (days <= 90) return '61–90 days';
  return '90+ days';
}

// ── Excel download ────────────────────────────────────────────────────────────

function downloadXLSX(sheets: { name: string; data: Record<string, unknown>[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  for (const { name, data } of sheets) {
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, filename);
}

// ── Print (PDF) ───────────────────────────────────────────────────────────────

function printTable(title: string, subtitle: string, headers: string[], rows: (string | number)[][], footer?: string) {
  const html = `<!DOCTYPE html><html><head><title>${title}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11px;padding:20px;color:#111}
  h2{color:#312e81;margin-bottom:4px}
  p.sub{color:#64748b;margin-top:0;margin-bottom:14px;font-size:10px}
  table{width:100%;border-collapse:collapse}
  th{background:#312e81;color:#fff;padding:6px 8px;text-align:left;font-size:10px}
  td{padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:10px}
  tr:nth-child(even) td{background:#f8fafc}
  .footer{margin-top:12px;font-weight:bold;font-size:11px}
  @media print{body{padding:0}}
</style></head><body>
<h2>${title}</h2><p class="sub">${subtitle}</p>
<table>
  <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
</table>
${footer ? `<p class="footer">${footer}</p>` : ''}
</body></html>`;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

// ── Report generators ─────────────────────────────────────────────────────────

function monthlySpendData(invoices: Invoice[], from: string, to: string) {
  const filtered = invoices.filter(i => {
    const d = i.invoice_date || '';
    return d >= from && d <= to;
  });

  const detail = filtered.map(i => ({
    Date: i.invoice_date || '',
    'Invoice #': i.invoice_number || '',
    Vendor: i.vendor_name,
    Category: i.category || '',
    Subcategory: i.subcategory || '',
    Subtotal: i.subtotal ?? '',
    'Tax (CGST)': i.cgst_amount ?? '',
    'Tax (SGST)': i.sgst_amount ?? '',
    'Tax (IGST)': i.igst_amount ?? '',
    'Total (INR)': i.total_amount ?? 0,
    Status: i.status,
  }));

  // Category breakdown
  const catMap = new Map<string, number>();
  for (const i of filtered) {
    const k = i.category || 'Uncategorised';
    catMap.set(k, (catMap.get(k) ?? 0) + (i.total_amount ?? 0));
  }
  const byCategory = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, total]) => ({ Category: category, 'Total (INR)': total }));

  // Vendor breakdown
  const vendMap = new Map<string, { count: number; total: number }>();
  for (const i of filtered) {
    const e = vendMap.get(i.vendor_name) ?? { count: 0, total: 0 };
    e.count++; e.total += (i.total_amount ?? 0);
    vendMap.set(i.vendor_name, e);
  }
  const byVendor = [...vendMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([Vendor, v]) => ({ Vendor, 'Invoice Count': v.count, 'Total (INR)': v.total }));

  return { detail, byCategory, byVendor, filtered };
}

function agingData(invoices: Invoice[]) {
  const unpaid = invoices.filter(i => !['paid', 'rejected'].includes(i.status));
  const rows = unpaid.map(i => {
    const balance = (i.total_amount ?? 0) - (i.paid_amount ?? 0);
    const days = daysOld(i);
    return {
      'Invoice #': i.invoice_number || '',
      Vendor: i.vendor_name,
      Category: i.category || '',
      'Invoice Date': i.invoice_date || '',
      'Due Date': i.due_date || '',
      'Total (INR)': i.total_amount ?? 0,
      'Paid (INR)': i.paid_amount ?? 0,
      'Balance (INR)': balance,
      'Age (Days)': days,
      Bucket: ageBucket(days),
      Status: i.status,
    };
  });

  // Bucket summary
  const buckets = ['0–30 days', '31–60 days', '61–90 days', '90+ days'];
  const summary = buckets.map(b => {
    const items = rows.filter(r => r.Bucket === b);
    return {
      Bucket: b,
      'Invoice Count': items.length,
      'Total Balance (INR)': items.reduce((s, r) => s + r['Balance (INR)'], 0),
    };
  });

  return { rows, summary, unpaid };
}

function vendorSummaryData(vendors: Vendor[], invoices: Invoice[]) {
  const rows = vendors.map(v => {
    const inv = invoices.filter(i => i.vendor_id === v.id || i.vendor_name === v.vendor_name);
    const total = inv.reduce((s, i) => s + (i.total_amount ?? 0), 0);
    const paid = inv.reduce((s, i) => s + (i.paid_amount ?? 0), 0);
    const cats = [...new Set(inv.map(i => i.category).filter(Boolean))].join(', ');
    return {
      Vendor: v.vendor_name,
      GSTIN: v.gstin || '',
      State: v.place_of_supply || '',
      'Invoice Count': inv.length,
      'Total Amount (INR)': total,
      'Paid (INR)': paid,
      'Balance (INR)': total - paid,
      Categories: cats,
    };
  }).sort((a, b) => b['Total Amount (INR)'] - a['Total Amount (INR)']);

  return rows;
}

function spendMatrixData(invoices: Invoice[]) {
  const today = new Date();
  const yr = today.getMonth() + 1 >= 4 ? today.getFullYear() : today.getFullYear() - 1;
  const months: string[] = [];
  for (let m = 4; m <= 12; m++) months.push(`${yr}-${String(m).padStart(2, '0')}`);
  for (let m = 1; m <= 3; m++) months.push(`${yr + 1}-${String(m).padStart(2, '0')}`);

  const categories = [...new Set(invoices.map(i => i.category || 'Uncategorised'))].sort();

  const rows = categories.map(cat => {
    const row: Record<string, string | number> = { Category: cat };
    let rowTotal = 0;
    for (const mo of months) {
      const sum = invoices
        .filter(i => (i.category || 'Uncategorised') === cat && (i.invoice_date || '').startsWith(mo))
        .reduce((s, i) => s + (i.total_amount ?? 0), 0);
      row[mo] = sum;
      rowTotal += sum;
    }
    row['FY Total'] = rowTotal;
    return row;
  });

  // Column totals row
  const totalsRow: Record<string, string | number> = { Category: 'TOTAL' };
  for (const mo of months) {
    totalsRow[mo] = invoices
      .filter(i => (i.invoice_date || '').startsWith(mo))
      .reduce((s, i) => s + (i.total_amount ?? 0), 0);
  }
  totalsRow['FY Total'] = invoices.reduce((s, i) => s + (i.total_amount ?? 0), 0);
  rows.push(totalsRow);

  return { rows, months };
}

// ── ReportCard component ──────────────────────────────────────────────────────

function ReportCard({
  title,
  description,
  icon,
  tint,
  iconColor,
  children,
  onExcel,
  onPrint,
  disabled,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  tint: string;
  iconColor: string;
  children?: React.ReactNode;
  onExcel: () => void;
  onPrint: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 p-6 ${tint}`}>
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconColor}`}>
          {icon}
        </div>
        <div>
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="text-sm text-slate-500 mt-0.5 leading-snug">{description}</p>
        </div>
      </div>

      {children && <div className="mb-4">{children}</div>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onExcel}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          <Download size={14} />
          Download Excel
        </button>
        <button
          type="button"
          onClick={onPrint}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-white/60 disabled:opacity-50 transition-colors"
        >
          <Printer size={14} />
          PDF (Print)
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Reports() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(todayStr());
  const [subFrom, setSubFrom] = useState(firstOfMonth());
  const [subTo, setSubTo] = useState(todayStr());

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [inv, vend] = await Promise.all([getInvoices(), getVendors()]);
        setInvoices(inv);
        setVendors(vend);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Stats
  const totalSpend = invoices.reduce((s, i) => s + (i.total_amount ?? 0), 0);
  const unpaidBalance = invoices
    .filter(i => !['paid', 'rejected'].includes(i.status))
    .reduce((s, i) => s + ((i.total_amount ?? 0) - (i.paid_amount ?? 0)), 0);

  // ── Monthly Spend ──
  function handleMonthlyExcel() {
    const { detail, byCategory, byVendor } = monthlySpendData(invoices, dateFrom, dateTo);
    downloadXLSX(
      [
        { name: 'Invoices', data: detail },
        { name: 'By Category', data: byCategory },
        { name: 'By Vendor', data: byVendor },
      ],
      `Monthly_Spend_${dateFrom}_to_${dateTo}.xlsx`,
    );
  }
  function handleMonthlyPrint() {
    const { filtered } = monthlySpendData(invoices, dateFrom, dateTo);
    const total = filtered.reduce((s, i) => s + (i.total_amount ?? 0), 0);
    printTable(
      'Monthly Spend Summary',
      `Period: ${dateFrom} to ${dateTo}`,
      ['Date', 'Invoice #', 'Vendor', 'Category', 'Total (INR)', 'Status'],
      filtered.map(i => [
        i.invoice_date || '',
        i.invoice_number || '',
        i.vendor_name,
        i.category || '',
        fmt(i.total_amount ?? 0),
        i.status,
      ]),
      `Total: ₹${fmt(total)} across ${filtered.length} invoices`,
    );
  }

  // ── Aging Report ──
  function handleAgingExcel() {
    const { rows, summary } = agingData(invoices);
    downloadXLSX(
      [
        { name: 'Aging Detail', data: rows as unknown as Record<string, unknown>[] },
        { name: 'Summary', data: summary as unknown as Record<string, unknown>[] },
      ],
      'Aging_Report.xlsx',
    );
  }
  function handleAgingPrint() {
    const { rows } = agingData(invoices);
    const total = rows.reduce((s, r) => s + r['Balance (INR)'], 0);
    printTable(
      'Aging Report — Unpaid Invoices',
      `Generated on ${todayStr()}`,
      ['Invoice #', 'Vendor', 'Due Date', 'Total', 'Paid', 'Balance', 'Age', 'Bucket'],
      rows.map(r => [
        r['Invoice #'],
        r.Vendor,
        r['Due Date'],
        fmt(r['Total (INR)']),
        fmt(r['Paid (INR)']),
        fmt(r['Balance (INR)']),
        r['Age (Days)'],
        r.Bucket,
      ]),
      `Total Outstanding Balance: ₹${fmt(total)}`,
    );
  }

  // ── Vendor Summary ──
  function handleVendorExcel() {
    const rows = vendorSummaryData(vendors, invoices);
    downloadXLSX([{ name: 'Vendor Summary', data: rows as unknown as Record<string, unknown>[] }], 'Vendor_Summary.xlsx');
  }
  function handleVendorPrint() {
    const rows = vendorSummaryData(vendors, invoices);
    printTable(
      'Vendor Summary',
      `${rows.length} vendors · Generated on ${todayStr()}`,
      ['Vendor', 'GSTIN', 'Invoices', 'Total (INR)', 'Paid (INR)', 'Balance (INR)'],
      rows.map(r => [r.Vendor, r.GSTIN, r['Invoice Count'], fmt(r['Total Amount (INR)']), fmt(r['Paid (INR)']), fmt(r['Balance (INR)'])]),
    );
  }

  // ── Subscription Spend ──
  async function handleSubExcel() {
    const data = await getSubscriptionInvoicesInRange(subFrom, subTo);
    const rows = data.map(inv => ({
      Vendor: inv.vendor_name,
      Service: inv.service_name,
      'Invoice #': inv.invoice_number || '',
      Date: inv.invoice_date || '',
      'Period From': inv.billing_period_from || '',
      'Period To': inv.billing_period_to || '',
      Currency: inv.currency,
      'Base Amount': inv.amount,
      'Tax Amount': inv.tax_amount,
      'Total (orig. currency)': inv.total_amount,
      'Exchange Rate': inv.exchange_rate,
      'INR Equivalent': inv.inr_amount,
    }));
    downloadXLSX([{ name: 'Subscription Spend', data: rows }], `Subscription_Spend_${subFrom}_to_${subTo}.xlsx`);
  }
  async function handleSubPrint() {
    const data = await getSubscriptionInvoicesInRange(subFrom, subTo);
    const totalINR = data.reduce((s, i) => s + i.inr_amount, 0);
    printTable(
      'Subscription Spend Summary',
      `Period: ${subFrom} to ${subTo}`,
      ['Vendor', 'Service', 'Invoice #', 'Date', 'Currency', 'Total', 'INR Equivalent'],
      data.map(inv => [
        inv.vendor_name, inv.service_name, inv.invoice_number || '', inv.invoice_date || '',
        inv.currency, fmt(inv.total_amount), fmt(inv.inr_amount),
      ]),
      `Total INR Equivalent: ₹${fmt(totalINR)} across ${data.length} invoices`,
    );
  }

  // ── Spend Matrix ──
  function handleMatrixExcel() {
    const { rows } = spendMatrixData(invoices);
    downloadXLSX([{ name: 'Spend Matrix', data: rows }], 'Spend_Matrix.xlsx');
  }
  function handleMatrixPrint() {
    const { rows, months } = spendMatrixData(invoices);
    const today = new Date();
    const yr = today.getMonth() + 1 >= 4 ? today.getFullYear() : today.getFullYear() - 1;
    printTable(
      `Spend Matrix — FY ${yr}–${String(yr + 1).slice(2)}`,
      'Category × Month breakdown (Apr–Mar fiscal year)',
      ['Category', ...months, 'FY Total'],
      rows.map(r => ['Category', ...months, 'FY Total'].map(k => (k === 'Category' ? r[k] : fmt(Number(r[k] ?? 0))))),
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
          <FileSpreadsheet size={20} className="text-slate-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports & Export Center</h1>
          <p className="text-slate-500 text-sm mt-0.5">Generate and download financial reports in Excel or PDF format</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Invoices', value: String(invoices.length), icon: <FileText size={16} className="text-slate-600" />, bg: 'bg-slate-50' },
          { label: 'Vendors', value: String(vendors.length), icon: <Users size={16} className="text-indigo-600" />, bg: 'bg-indigo-50' },
          { label: 'Total Spend', value: fmtCur(totalSpend), icon: <BarChart2 size={16} className="text-emerald-600" />, bg: 'bg-emerald-50' },
          { label: 'Unpaid', value: fmtCur(unpaidBalance), icon: <Clock size={16} className="text-amber-600" />, bg: 'bg-amber-50' },
        ].map(({ label, value, icon, bg }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-2`}>{icon}</div>
            <p className="text-lg font-bold text-slate-900 leading-tight">{loading ? '—' : value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Report cards */}
      <div className="grid grid-cols-2 gap-5">
        {/* Monthly Spend Summary */}
        <ReportCard
          title="Monthly Spend Summary"
          description="Total spend, category breakdown, and vendor analysis for a selected period."
          icon={<BarChart2 size={18} className="text-blue-600" />}
          tint="bg-blue-50/40"
          iconColor="bg-blue-100"
          onExcel={handleMonthlyExcel}
          onPrint={handleMonthlyPrint}
          disabled={loading}
        >
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600">
            <FileText size={13} className="text-slate-400 shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              title="From date"
              className="bg-transparent focus:outline-none text-sm"
            />
            <span className="text-slate-400">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              title="To date"
              className="bg-transparent focus:outline-none text-sm"
            />
          </div>
        </ReportCard>

        {/* Aging Report */}
        <ReportCard
          title="Aging Report"
          description="Unpaid invoices categorized by age buckets (0–30, 31–60, 61–90, 90+ days)."
          icon={<Clock size={18} className="text-amber-600" />}
          tint="bg-amber-50/40"
          iconColor="bg-amber-100"
          onExcel={handleAgingExcel}
          onPrint={handleAgingPrint}
          disabled={loading}
        />

        {/* Vendor Summary */}
        <ReportCard
          title="Vendor Summary"
          description="All vendors with invoice counts, total and unpaid amounts, and categories."
          icon={<Users size={18} className="text-emerald-600" />}
          tint="bg-emerald-50/40"
          iconColor="bg-emerald-100"
          onExcel={handleVendorExcel}
          onPrint={handleVendorPrint}
          disabled={loading}
        />

        {/* Spend Matrix */}
        <ReportCard
          title="Spend Matrix"
          description="Category × vendor monthly spend pivot with fiscal year breakdown (Apr–Mar)."
          icon={<LayoutGrid size={18} className="text-indigo-600" />}
          tint="bg-indigo-50/40"
          iconColor="bg-indigo-100"
          onExcel={handleMatrixExcel}
          onPrint={handleMatrixPrint}
          disabled={loading}
        />

        {/* Subscription Spend Summary */}
        <div className="col-span-2">
          <ReportCard
            title="Subscription Spend Summary"
            description="All SaaS subscription invoices in a date range — with original currency, INR equivalent, and per-service breakdown."
            icon={<RefreshCw size={18} className="text-violet-600" />}
            tint="bg-violet-50/40"
            iconColor="bg-violet-100"
            onExcel={handleSubExcel}
            onPrint={handleSubPrint}
          >
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600">
              <RefreshCw size={13} className="text-slate-400 shrink-0" />
              <input
                type="date"
                value={subFrom}
                onChange={e => setSubFrom(e.target.value)}
                title="Subscription from date"
                className="bg-transparent focus:outline-none text-sm"
              />
              <span className="text-slate-400">–</span>
              <input
                type="date"
                value={subTo}
                onChange={e => setSubTo(e.target.value)}
                title="Subscription to date"
                className="bg-transparent focus:outline-none text-sm"
              />
            </div>
          </ReportCard>
        </div>
      </div>
    </div>
  );
}

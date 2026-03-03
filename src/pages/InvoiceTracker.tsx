import { useEffect, useState, useMemo, useRef } from 'react';
import {
  FileText, Search, RefreshCw, ChevronDown,
  ExternalLink, Paperclip, X, Download, Eye, Filter,
  ArrowUpDown, ArrowUp, ArrowDown, Trash2, CheckSquare, Pencil, Plus,
} from 'lucide-react';
import {
  getInvoices, updateInvoiceStatus, deleteInvoice, updateInvoiceCategory,
  getInvoicePayments, addInvoicePayment, deleteInvoicePayment,
} from '../lib/supabase';
import EditInvoiceModal from '../components/EditInvoiceModal';
import {
  getTaxonomy,
  categoryPillStyle,
  categoryDotStyle,
  type CategoryTaxonomy,
} from '../lib/categories';
import type { Invoice, InvoicePayment } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────
type StatusFilter = 'all' | Invoice['status'];
type DocTypeFilter = 'all' | string;
type CategoryFilter = 'all' | string;
type SortKey = 'invoice_date' | 'vendor_name' | 'total_amount' | 'status' | 'age';
type SortDir = 'asc' | 'desc';

// ── Formatters ────────────────────────────────────────────────────────────────
function formatCurrency(amount?: number | null) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(d?: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateShort(d?: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  const day = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const year = date.getFullYear();
  return { day, year: String(year) };
}

function getAgeDays(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function getDescription(inv: Invoice): string {
  if (inv.line_items && inv.line_items.length > 0) {
    const desc = inv.line_items[0].description;
    if (desc) return desc.length > 48 ? desc.slice(0, 48) + '…' : desc;
  }
  if (inv.service_period) return inv.service_period;
  if (inv.document_type) return inv.document_type;
  if (inv.notes) return inv.notes.length > 48 ? inv.notes.slice(0, 48) + '…' : inv.notes;
  return '—';
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<Invoice['status'], string> = {
  received:    'bg-slate-100 text-slate-600 border-slate-200',
  processing:  'bg-amber-100 text-amber-700 border-amber-200',
  approved:    'bg-blue-100 text-blue-700 border-blue-200',
  paid:        'bg-emerald-100 text-emerald-700 border-emerald-200',
  partly_paid: 'bg-violet-100 text-violet-700 border-violet-200',
  rejected:    'bg-red-100 text-red-600 border-red-200',
};

const STATUS_LABEL: Record<Invoice['status'], string> = {
  received: 'Received', processing: 'Processing', approved: 'Approved',
  paid: 'Paid', partly_paid: 'Partly Paid', rejected: 'Rejected',
};

function StatusPill({ status }: { status: Invoice['status'] }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── Checkbox ──────────────────────────────────────────────────────────────────
function Checkbox({
  checked, indeterminate, onChange, label,
}: {
  checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate ?? false;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label ?? 'Select'}
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
    />
  );
}

// ── Bulk action bar ───────────────────────────────────────────────────────────
const BULK_STATUS_OPTIONS: { value: Invoice['status']; label: string }[] = [
  { value: 'received',    label: 'Mark Received' },
  { value: 'processing',  label: 'Mark Processing' },
  { value: 'approved',    label: 'Mark Approved' },
  { value: 'paid',        label: 'Mark Paid' },
  { value: 'rejected',    label: 'Mark Rejected' },
];

function BulkActionBar({
  count,
  onStatusChange,
  onDelete,
  onClear,
}: {
  count: number;
  onStatusChange: (s: Invoice['status']) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700">
      <div className="flex items-center gap-2">
        <CheckSquare size={16} className="text-indigo-400" />
        <span className="text-sm font-semibold">{count} selected</span>
      </div>

      <div className="w-px h-5 bg-slate-600" />

      {/* Status change */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setStatusOpen(v => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          Change Status
          <ChevronDown size={13} className="opacity-70" />
        </button>
        {statusOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
            <div className="absolute bottom-full mb-2 left-0 w-44 bg-white border border-slate-200 rounded-xl shadow-xl z-20 py-1.5 overflow-hidden">
              {BULK_STATUS_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => { onStatusChange(opt.value); setStatusOpen(false); }}
                  className="w-full text-left px-3.5 py-2 text-xs hover:bg-slate-50 text-slate-700 flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLE[opt.value].split(' ')[0]}`} />
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        className="flex items-center gap-1.5 text-sm font-medium text-red-300 hover:text-red-200 bg-red-900/40 hover:bg-red-900/60 px-3 py-1.5 rounded-lg transition-colors"
      >
        <Trash2 size={13} />
        Delete
      </button>

      <div className="w-px h-5 bg-slate-600" />

      {/* Clear */}
      <button type="button" aria-label="Clear selection" onClick={onClear}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
        <X size={14} />
      </button>
    </div>
  );
}

// ── PDF Modal ─────────────────────────────────────────────────────────────────
function PdfModal({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const isPdf = url.toLowerCase().includes('.pdf');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-4xl h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Paperclip size={15} className="text-red-400" />
            <span className="font-medium text-slate-900 text-sm truncate max-w-sm">{name}</span>
          </div>
          <div className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:border-indigo-300 transition-colors">
              <ExternalLink size={12} /> Open in new tab
            </a>
            <button type="button" aria-label="Close PDF viewer" onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden rounded-b-2xl">
          {isPdf ? (
            <iframe src={url} className="w-full h-full" title={name} />
          ) : (
            <div className="flex items-center justify-center h-full overflow-auto p-4">
              <img src={url} alt={name} className="max-w-full max-h-full object-contain rounded-lg" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm modal ───────────────────────────────────────────────────────
function DeleteConfirmModal({
  invoice,
  onConfirm,
  onCancel,
}: {
  invoice: Invoice;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    setDeleting(true);
    try { await onConfirm(); } finally { setDeleting(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Delete Invoice</h2>
            <p className="text-sm text-slate-500">This action cannot be undone.</p>
          </div>
        </div>
        <div className="bg-slate-50 rounded-xl px-4 py-3 mb-5 text-sm">
          <p className="text-slate-700">
            <span className="font-semibold">{invoice.vendor_name}</span>
            {invoice.invoice_number && (
              <> · <span className="font-mono text-slate-500">{invoice.invoice_number}</span></>
            )}
          </p>
          {invoice.total_amount != null && (
            <p className="text-slate-500 mt-0.5">Amount: {formatCurrency(invoice.total_amount)}</p>
          )}
        </div>
        <div className="flex items-center gap-3 justify-end">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleDelete} disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2">
            {deleting ? (
              <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Deleting…</>
            ) : (
              <><Trash2 size={14} /> Delete Invoice</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk delete confirm modal ─────────────────────────────────────────────────
function BulkDeleteConfirmModal({
  count,
  onConfirm,
  onCancel,
}: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    setDeleting(true);
    try { await onConfirm(); } finally { setDeleting(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Delete {count} Invoice{count > 1 ? 's' : ''}</h2>
            <p className="text-sm text-slate-500">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-5">
          You are about to permanently delete <span className="font-semibold">{count} invoice{count > 1 ? 's' : ''}</span>. Are you sure?
        </p>
        <div className="flex items-center gap-3 justify-end">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleDelete} disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2">
            {deleting ? (
              <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Deleting…</>
            ) : (
              <><Trash2 size={14} /> Delete {count} Invoice{count > 1 ? 's' : ''}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status change dropdown ────────────────────────────────────────────────────
const STATUS_OPTIONS: { value: Invoice['status']; label: string }[] = [
  { value: 'received',    label: 'Mark Received' },
  { value: 'processing',  label: 'Mark Processing' },
  { value: 'approved',    label: 'Mark Approved' },
  { value: 'paid',        label: 'Mark Paid' },
  { value: 'rejected',    label: 'Mark Rejected' },
];

function StatusDropdown({
  invoice, onUpdate,
}: {
  invoice: Invoice; onUpdate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function changeStatus(status: Invoice['status']) {
    setSaving(true); setOpen(false);
    try {
      if (status === 'paid') {
        // Auto-record a payment for the remaining balance
        const alreadyPaid = invoice.paid_amount ?? 0;
        const remaining = (invoice.total_amount ?? 0) - alreadyPaid;
        const amount = remaining > 0 ? remaining : (invoice.total_amount ?? 0);
        if (amount > 0) {
          await addInvoicePayment(invoice.id, invoice.total_amount, {
            payment_date: new Date().toISOString().slice(0, 10),
            amount,
          });
        } else {
          await updateInvoiceStatus(invoice.id, 'paid');
        }
      } else {
        await updateInvoiceStatus(invoice.id, status);
      }
      onUpdate();
    } finally { setSaving(false); }
  }

  return (
    <div className="relative">
      <button type="button" aria-label="Change invoice status" onClick={() => setOpen(v => !v)} disabled={saving}
        className="flex items-center gap-1 disabled:opacity-50 group">
        <StatusPill status={invoice.status} />
        <ChevronDown size={11} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1.5 overflow-hidden">
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.value} type="button" onClick={() => changeStatus(opt.value)}
                className={`w-full text-left px-3.5 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 ${
                  invoice.status === opt.value ? 'text-indigo-600 font-semibold bg-indigo-50' : 'text-slate-700'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLE[opt.value].split(' ')[0]}`} />
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sort header ───────────────────────────────────────────────────────────────
function SortTh({
  label, sortKey: sk, current, dir, onSort, align = 'left',
}: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; align?: 'left' | 'right';
}) {
  const active = current === sk;
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-slate-800 hover:bg-slate-100 transition-colors ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(sk)}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        <Icon size={11} className={active ? 'text-indigo-500' : 'opacity-30'} />
      </span>
    </th>
  );
}

// ── Filter pill dropdown ──────────────────────────────────────────────────────
function FilterPill({
  label, value, options, onChange,
}: {
  label: string; value: string;
  options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);
  const isFiltered = value !== 'all';

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
          isFiltered
            ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium'
            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
        }`}>
        <Filter size={13} className={isFiltered ? 'text-indigo-500' : 'text-slate-400'} />
        {isFiltered ? selected?.label : label}
        <ChevronDown size={13} className="opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1.5 overflow-hidden">
            {options.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2 text-xs hover:bg-slate-50 ${
                  value === opt.value ? 'text-indigo-600 font-semibold bg-indigo-50' : 'text-slate-700'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCsv(invoices: Invoice[], filename: string) {
  const headers = [
    'Date', 'Document Type', 'Invoice #', 'Vendor', 'Vendor GSTIN',
    'Buyer', 'Buyer GSTIN', 'Payment Terms',
    'Category', 'Sub-category',
    'Subtotal', 'CGST Rate', 'CGST Amount', 'SGST Rate', 'SGST Amount',
    'IGST Rate', 'IGST Amount', 'Total Tax', 'TDS Rate', 'TDS Amount', 'Round Off',
    'Total Amount', 'Paid Amount', 'Amount in Words', 'Service Period', 'Billing From', 'Billing To',
    'Status', 'Due Date', 'Notes',
  ];
  const rows = invoices.map(i => [
    i.invoice_date || '', i.document_type || '', i.invoice_number || '',
    i.vendor_name, i.vendor_gstin || '',
    i.buyer_name || '', i.buyer_gstin || '', i.payment_terms || '',
    i.category || '', i.subcategory || '',
    i.subtotal ?? '', i.cgst_rate ?? '', i.cgst_amount ?? '',
    i.sgst_rate ?? '', i.sgst_amount ?? '', i.igst_rate ?? '', i.igst_amount ?? '',
    i.tax_amount ?? '', i.tds_rate ?? '', i.tds_amount ?? '', i.round_off ?? '',
    i.total_amount ?? '', i.paid_amount ?? '',
    i.amount_in_words || '',
    i.service_period || '', i.billing_period_from || '', i.billing_period_to || '',
    i.status, i.due_date || '', i.notes || '',
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ── Category helpers ───────────────────────────────────────────────────────────
function CategoryPill({
  category, subcategory, allCategories,
}: { category?: string | null; subcategory?: string | null; allCategories: string[] }) {
  if (!category) return null;
  const pillStyle = categoryPillStyle(category, allCategories);
  return (
    <div className="min-w-0 max-w-[156px]">
      <span
        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${pillStyle}`}
        title={category}
      >
        <span className="truncate">{category}</span>
      </span>
      {subcategory && (
        <p className="text-[10px] text-slate-400 mt-0.5 truncate leading-tight pl-0.5" title={subcategory}>
          {subcategory}
        </p>
      )}
    </div>
  );
}

function CategoryEditor({
  invoice, taxonomy, allCategories, onUpdate,
}: {
  invoice: Invoice;
  taxonomy: CategoryTaxonomy;
  allCategories: string[];
  onUpdate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);

  function handleOpen() {
    setHoveredCat(invoice.category ?? null);
    setSaveError(null);
    setOpen(v => !v);
  }

  async function selectCategory(category: string, subcategory?: string) {
    setSaving(true);
    setSaveError(null);
    setOpen(false);
    try {
      await updateInvoiceCategory(invoice.id, category, subcategory ?? null);
      onUpdate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update failed';
      setSaveError(msg.includes('column') ? 'Run the category migration SQL in Supabase first.' : msg);
    } finally {
      setSaving(false);
    }
  }

  async function clearCategory() {
    setSaving(true);
    setSaveError(null);
    setOpen(false);
    try {
      await updateInvoiceCategory(invoice.id, null, null);
      onUpdate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update failed';
      setSaveError(msg.includes('column') ? 'Run the category migration SQL in Supabase first.' : msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      {saveError && (
        <p className="text-[10px] text-red-500 mb-0.5 max-w-[160px] leading-tight">{saveError}</p>
      )}
      <button
        type="button"
        onClick={handleOpen}
        disabled={saving}
        className="text-left disabled:opacity-50"
      >
        {invoice.category ? (
          <CategoryPill category={invoice.category} subcategory={invoice.subcategory} allCategories={allCategories} />
        ) : (
          <span className="text-xs text-slate-300 hover:text-indigo-500 transition-colors whitespace-nowrap">+ Add</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden w-[380px]">
            <div className="flex h-[260px]">
              {/* Left: categories */}
              <div className="w-44 border-r border-slate-100 overflow-y-auto py-1 shrink-0">
                {allCategories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onMouseEnter={() => setHoveredCat(cat)}
                    onClick={() => selectCategory(cat)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                      hoveredCat === cat
                        ? 'bg-slate-50 text-slate-900 font-medium'
                        : invoice.category === cat
                        ? 'text-indigo-600 font-medium bg-indigo-50/60'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${categoryDotStyle(cat, allCategories)}`} />
                    <span className="truncate">{cat}</span>
                  </button>
                ))}
              </div>
              {/* Right: subcategories */}
              <div className="flex-1 overflow-y-auto py-1">
                {hoveredCat && (taxonomy[hoveredCat] ?? []).length > 0 ? (
                  <>
                    <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-50 sticky top-0 bg-white">
                      {hoveredCat}
                    </p>
                    {(taxonomy[hoveredCat] ?? []).map(sub => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => selectCategory(hoveredCat!, sub)}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-50 ${
                          invoice.category === hoveredCat && invoice.subcategory === sub
                            ? 'text-indigo-600 font-semibold bg-indigo-50'
                            : 'text-slate-700'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </>
                ) : (
                  <p className="px-3 py-6 text-xs text-slate-400 text-center">
                    {hoveredCat ? 'No subcategories' : 'Hover a category'}
                  </p>
                )}
              </div>
            </div>
            {invoice.category && (
              <div className="border-t border-slate-100 px-3 py-2">
                <button
                  type="button"
                  onClick={clearCategory}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                >
                  Clear category
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Expanded row helpers ───────────────────────────────────────────────────────
function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-slate-400 w-24 shrink-0">{label}</span>
      <span className={`text-slate-700 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function TaxRow({
  label, value, bold, negative,
}: { label: string; value?: number | null; bold?: boolean; negative?: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className={bold ? 'font-semibold text-slate-700' : 'text-slate-500'}>{label}</span>
      <span className={bold ? 'font-semibold text-slate-900' : negative ? 'text-red-600' : 'text-slate-700'}>
        {value != null ? formatCurrency(Math.abs(value)) : '—'}
      </span>
    </div>
  );
}

// ── Payment History Panel ─────────────────────────────────────────────────────
function PaymentHistoryPanel({
  invoice,
  onRefreshInvoice,
}: {
  invoice: Invoice;
  onRefreshInvoice: () => void;
}) {
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    amount: '',
    payment_mode: 'NEFT',
    reference_number: '',
    notes: '',
  });

  useEffect(() => {
    setLoadingPayments(true);
    getInvoicePayments(invoice.id)
      .then(data => { setPayments(data); setLoadingPayments(false); })
      .catch(() => setLoadingPayments(false));
  }, [invoice.id]);

  async function handleAdd() {
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) return;
    setSaving(true); setError(null);
    try {
      const newPayment = await addInvoicePayment(invoice.id, invoice.total_amount, {
        payment_date: form.payment_date,
        amount: amt,
        payment_mode: form.payment_mode || undefined,
        reference_number: form.reference_number || undefined,
        notes: form.notes || undefined,
      });
      setPayments(prev => [newPayment, ...prev]);
      setShowForm(false);
      setForm(f => ({ ...f, amount: '', reference_number: '', notes: '' }));
      onRefreshInvoice();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save payment');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePayment(paymentId: string) {
    setError(null);
    try {
      await deleteInvoicePayment(paymentId, invoice.id, invoice.total_amount);
      setPayments(prev => prev.filter(p => p.id !== paymentId));
      onRefreshInvoice();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete payment');
    }
  }

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = (invoice.total_amount ?? 0) - totalPaid;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payments</h4>
        {!showForm && (
          <button
            type="button"
            onClick={() => { setShowForm(true); setError(null); }}
            className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-2.5 py-1 rounded-lg transition-colors"
          >
            <Plus size={11} /> Record Payment
          </button>
        )}
      </div>

      {loadingPayments ? (
        <p className="text-xs text-slate-400 py-2">Loading…</p>
      ) : (
        <>
          {payments.length > 0 && (
            <div className="mb-3">
              <div className="grid grid-cols-[120px_80px_1fr_110px_32px] gap-2 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <span>Date</span>
                <span>Mode</span>
                <span>Reference</span>
                <span className="text-right">Amount</span>
                <span />
              </div>
              {payments.map(p => (
                <div key={p.id} className="grid grid-cols-[120px_80px_1fr_110px_32px] gap-2 py-2 items-center border-b border-slate-50">
                  <span className="text-slate-600 text-xs">{formatDate(p.payment_date)}</span>
                  <span className="text-slate-500 text-xs">{p.payment_mode || '—'}</span>
                  <span className="text-slate-400 text-xs font-mono truncate">{p.reference_number || '—'}</span>
                  <span className="text-right font-semibold text-emerald-700 text-xs">{formatCurrency(p.amount)}</span>
                  <button
                    type="button"
                    aria-label="Delete payment"
                    onClick={() => handleDeletePayment(p.id)}
                    className="flex items-center justify-center w-6 h-6 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <div className="pt-2 flex items-center gap-3 text-xs text-slate-500">
                <span>Paid <span className="font-semibold text-emerald-700">{formatCurrency(totalPaid)}</span></span>
                <span className="text-slate-300">·</span>
                <span>Balance <span className={`font-semibold ${balance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{formatCurrency(Math.max(balance, 0))}</span></span>
              </div>
            </div>
          )}

          {payments.length === 0 && !showForm && (
            <p className="text-xs text-slate-400 italic py-1">No payments recorded.</p>
          )}
        </>
      )}

      {/* Inline add form */}
      {showForm && (
        <div className={`${payments.length > 0 ? 'border-t border-slate-100 pt-3 mt-1' : ''}`}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Payment Date *</label>
              <input
                type="date"
                title="Payment Date"
                value={form.payment_date}
                onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Amount (₹) *
                {balance > 0 && (
                  <span className="ml-1 text-slate-400 normal-case font-normal">Balance: {formatCurrency(balance)}</span>
                )}
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Payment Mode</label>
              <select
                title="Payment Mode"
                value={form.payment_mode}
                onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {['NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Wire Transfer', 'Cash'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Reference / UTR</label>
              <input
                type="text"
                value={form.reference_number}
                onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))}
                placeholder="UTR / Cheque no."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null); }}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !form.payment_date || !form.amount || parseFloat(form.amount) <= 0}
              className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
            >
              {saving
                ? <><div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
                : 'Save Payment'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InvoiceTracker() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [docTypeFilter, setDocTypeFilter] = useState<DocTypeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  // Taxonomy — reloads if the user changes Settings during the session
  const [taxonomy, setTaxonomy] = useState<CategoryTaxonomy>(getTaxonomy);
  useEffect(() => {
    function onUpdate() { setTaxonomy(getTaxonomy()); }
    window.addEventListener('ip-taxonomy-updated', onUpdate);
    return () => window.removeEventListener('ip-taxonomy-updated', onUpdate);
  }, []);
  const allCategories = Object.keys(taxonomy);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pdfModal, setPdfModal] = useState<{ url: string; name: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('invoice_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [editTarget, setEditTarget] = useState<Invoice | null>(null);

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await getInvoices();
      setInvoices(data);
      setLastUpdated(new Date());
      setSelected(new Set()); // clear selection on reload
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  async function handleDelete(invoice: Invoice) {
    await deleteInvoice(invoice.id);
    setDeleteTarget(null);
    load();
  }

  // ── Selection helpers ────────────────────────────────────────────────────
  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll(filteredIds: string[], checked: boolean) {
    if (checked) setSelected(new Set(filteredIds));
    else setSelected(new Set());
  }

  async function handleBulkStatus(status: Invoice['status']) {
    await Promise.all([...selected].map(id => updateInvoiceStatus(id, status)));
    setSelected(new Set());
    load();
  }

  async function handleBulkDelete() {
    await Promise.all([...selected].map(id => deleteInvoice(id)));
    setBulkDeleteOpen(false);
    setSelected(new Set());
    load();
  }

  // Unique document types for filter
  const docTypeOptions = useMemo(() => {
    const types = Array.from(new Set(invoices.map(i => i.document_type).filter(Boolean))) as string[];
    return [
      { value: 'all', label: 'Doc Type' },
      ...types.map(t => ({ value: t, label: t })),
    ];
  }, [invoices]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const arr = invoices.filter(inv => {
      const matchSearch =
        inv.vendor_name.toLowerCase().includes(q) ||
        (inv.invoice_number || '').toLowerCase().includes(q) ||
        (inv.buyer_name || '').toLowerCase().includes(q) ||
        (inv.category || '').toLowerCase().includes(q) ||
        (inv.subcategory || '').toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
      const matchDocType = docTypeFilter === 'all' || inv.document_type === docTypeFilter;
      const matchCategory = categoryFilter === 'all' || inv.category === categoryFilter;
      return matchSearch && matchStatus && matchDocType && matchCategory;
    });
    return arr.sort((a, b) => {
      let va: string | number = '', vb: string | number = '';
      if (sortKey === 'invoice_date') { va = a.invoice_date || ''; vb = b.invoice_date || ''; }
      else if (sortKey === 'vendor_name') { va = a.vendor_name; vb = b.vendor_name; }
      else if (sortKey === 'total_amount') { va = a.total_amount || 0; vb = b.total_amount || 0; }
      else if (sortKey === 'status') { va = a.status; vb = b.status; }
      else if (sortKey === 'age') { va = getAgeDays(a.created_at); vb = getAgeDays(b.created_at); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [invoices, search, statusFilter, docTypeFilter, categoryFilter, sortKey, sortDir]);

  const filteredIds = filtered.map(i => i.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id));
  const someSelected = filteredIds.some(id => selected.has(id)) && !allSelected;

  const totalAmount = filtered.reduce((s, i) => s + (i.total_amount || 0), 0);
  const paidAmount = filtered.reduce((s, i) => {
    if (i.status === 'paid') return s + (i.total_amount || 0);
    if (i.status === 'partly_paid') return s + (i.paid_amount || 0);
    return s;
  }, 0);
  const balance = totalAmount - paidAmount;

  const updatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <>
      {pdfModal && (
        <PdfModal url={pdfModal.url} name={pdfModal.name} onClose={() => setPdfModal(null)} />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          invoice={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {bulkDeleteOpen && (
        <BulkDeleteConfirmModal
          count={selected.size}
          onConfirm={handleBulkDelete}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      )}
      {editTarget && (
        <EditInvoiceModal
          invoice={editTarget}
          onSaved={(updated) => {
            setInvoices(prev => prev.map(inv => inv.id === updated.id ? updated : inv));
            setEditTarget(null);
          }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          onStatusChange={handleBulkStatus}
          onDelete={() => setBulkDeleteOpen(true)}
          onClear={() => setSelected(new Set())}
        />
      )}

      <div className="p-8">

        {/* ── Page Header ──────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 mb-5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <FileText size={22} className="text-slate-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Invoices</h1>
              <p className="text-slate-400 text-sm mt-0.5">
                {invoices.length} invoices processed
                {updatedStr && <> · Last updated: {updatedStr}</>}
              </p>
            </div>
          </div>
          <button type="button" onClick={load}
            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors font-medium">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Reload
          </button>
        </div>

        {/* ── Search + Filters + Export ────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-56 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search vendor, invoice #..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white placeholder-slate-400"
            />
          </div>

          <FilterPill label="Status" value={statusFilter} onChange={v => setStatusFilter(v as StatusFilter)}
            options={[
              { value: 'all',         label: 'All Status' },
              { value: 'received',    label: 'Received' },
              { value: 'processing',  label: 'Processing' },
              { value: 'approved',    label: 'Approved' },
              { value: 'paid',        label: 'Paid' },
              { value: 'partly_paid', label: 'Partly Paid' },
              { value: 'rejected',    label: 'Rejected' },
            ]}
          />

          {docTypeOptions.length > 1 && (
            <FilterPill label="Doc Type" value={docTypeFilter} onChange={setDocTypeFilter} options={docTypeOptions} />
          )}

          {allCategories.length > 0 && (
            <FilterPill
              label="Category"
              value={categoryFilter}
              onChange={v => setCategoryFilter(v as CategoryFilter)}
              options={[
                { value: 'all', label: 'All Categories' },
                ...allCategories.map(c => ({ value: c, label: c })),
              ]}
            />
          )}

          {(statusFilter !== 'all' || docTypeFilter !== 'all' || categoryFilter !== 'all' || search) && (
            <button type="button"
              onClick={() => { setStatusFilter('all'); setDocTypeFilter('all'); setCategoryFilter('all'); setSearch(''); }}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded">
              <X size={12} /> Clear
            </button>
          )}

          <div className="flex-1" />

          <button type="button"
            onClick={() => exportCsv(filtered, `invoices-view-${new Date().toISOString().slice(0, 10)}.csv`)}
            className="flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 bg-white rounded-lg px-3.5 py-2 hover:bg-slate-50 hover:border-slate-300 transition-colors font-medium">
            <Download size={14} /> Export View
          </button>
          <button type="button"
            onClick={() => exportCsv(invoices, `invoices-all-${new Date().toISOString().slice(0, 10)}.csv`)}
            className="flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 bg-white rounded-lg px-3.5 py-2 hover:bg-slate-50 hover:border-slate-300 transition-colors font-medium">
            <Download size={14} /> Export All
          </button>
        </div>

        {/* ── Table container ──────────────────────────────────────────────── */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 flex items-center justify-center py-28 shadow-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
              <p className="text-sm text-slate-400">Loading invoices…</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 text-center py-28 shadow-sm">
            <FileText size={40} className="text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {search || statusFilter !== 'all' || docTypeFilter !== 'all' || categoryFilter !== 'all'
                ? 'No invoices match your filters'
                : 'No invoices yet'}
            </p>
            <p className="text-slate-400 text-sm mt-1">Upload and process an invoice to get started</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Table summary row */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
              <span className="text-sm font-semibold text-slate-700">
                Invoices ({filtered.length})
                {selected.size > 0 && (
                  <span className="ml-2 text-indigo-600 font-medium">· {selected.size} selected</span>
                )}
              </span>
              <div className="flex items-center gap-5 text-sm">
                <span className="text-slate-500">
                  Amount: <span className="font-semibold text-slate-800">{formatCurrency(totalAmount)}</span>
                </span>
                <span className="text-slate-500">
                  Paid: <span className="font-semibold text-emerald-600">{formatCurrency(paidAmount)}</span>
                </span>
                <span className="text-slate-500">
                  Balance: <span className={`font-semibold ${balance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{formatCurrency(balance)}</span>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1440px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-white">
                    {/* Select all checkbox */}
                    <th className="px-4 py-3 w-10" scope="col" aria-label="Select rows">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={checked => toggleAll(filteredIds, checked)}
                        label="Select all"
                      />
                    </th>
                    <SortTh label="Date"   sortKey="invoice_date"  current={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortTh label="Vendor" sortKey="vendor_name"   current={sortKey} dir={sortDir} onSort={handleSort} />
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Invoice #</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Category</th>
                    <SortTh label="Status" sortKey="status"        current={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortTh label="Amount" sortKey="total_amount"  current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Paid</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Balance</th>
                    <SortTh label="Age"    sortKey="age"           current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Invoice</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((invoice, idx) => {
                    const isExpanded = expanded === invoice.id;
                    const isSelected = selected.has(invoice.id);
                    const isPaid = invoice.status === 'paid';
                    const isPartlyPaid = invoice.status === 'partly_paid';

                    const paidAmt = isPaid
                      ? invoice.total_amount
                      : isPartlyPaid ? invoice.paid_amount : null;

                    const balanceAmt = isPaid
                      ? null
                      : isPartlyPaid
                      ? (invoice.total_amount != null && invoice.paid_amount != null
                          ? invoice.total_amount - invoice.paid_amount
                          : invoice.total_amount)
                      : invoice.total_amount;

                    const age = getAgeDays(invoice.created_at);
                    const dateFormatted = formatDateShort(invoice.invoice_date);

                    return (
                      <>
                        <tr
                          key={invoice.id}
                          onClick={() => setExpanded(isExpanded ? null : invoice.id)}
                          className={`cursor-pointer border-b border-slate-100 transition-colors ${
                            isSelected
                              ? 'bg-indigo-50'
                              : isExpanded
                              ? 'bg-indigo-100/80'
                              : idx % 2 === 0
                              ? 'bg-white hover:bg-slate-50'
                              : 'bg-slate-50/40 hover:bg-slate-100/60'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="px-4 py-3.5 w-10" onClick={e => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onChange={() => toggleRow(invoice.id)}
                              label={`Select ${invoice.vendor_name}`}
                            />
                          </td>

                          {/* Date */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {typeof dateFormatted === 'object' ? (
                              <div>
                                <p className="text-slate-800 font-medium text-[13px]">{dateFormatted.day}</p>
                                <p className="text-slate-400 text-xs">{dateFormatted.year}</p>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Vendor */}
                          <td className="px-4 py-3.5 max-w-[180px]">
                            <p className="font-semibold text-slate-900 truncate text-[13px]">{invoice.vendor_name}</p>
                            {invoice.vendor_gstin && (
                              <p className="text-xs text-slate-400 font-mono truncate">{invoice.vendor_gstin}</p>
                            )}
                          </td>

                          {/* Invoice # */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {invoice.invoice_number
                              ? <span className="text-slate-600 font-mono text-xs">{invoice.invoice_number}</span>
                              : <span className="text-slate-300 text-xs">—</span>}
                          </td>

                          {/* Description */}
                          <td className="px-4 py-3.5 max-w-[200px]">
                            <span className="text-slate-500 text-[13px] block truncate">{getDescription(invoice)}</span>
                          </td>

                          {/* Category */}
                          <td className="px-4 py-3.5 max-w-[180px]" onClick={e => e.stopPropagation()}>
                            <CategoryEditor
                              invoice={invoice}
                              taxonomy={taxonomy}
                              allCategories={allCategories}
                              onUpdate={load}
                            />
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                            <StatusDropdown
                              invoice={invoice}
                              onUpdate={load}
                            />
                          </td>

                          {/* Amount */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <span className="font-semibold text-slate-900">{formatCurrency(invoice.total_amount)}</span>
                          </td>

                          {/* Paid */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            {paidAmt != null
                              ? <span className="font-medium text-emerald-600">{formatCurrency(paidAmt)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>

                          {/* Balance */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            {balanceAmt != null && balanceAmt > 0
                              ? <span className="font-medium text-amber-600">{formatCurrency(balanceAmt)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>

                          {/* Age */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <span className={`text-sm font-medium ${age > 60 ? 'text-red-500' : age > 30 ? 'text-amber-500' : 'text-slate-500'}`}>
                              {age}d
                            </span>
                          </td>

                          {/* View */}
                          <td className="px-4 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                            {invoice.file_url ? (
                              <button type="button"
                                onClick={() => setPdfModal({ url: invoice.file_url!, name: invoice.file_name || 'Invoice' })}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors">
                                <Eye size={13} /> View
                              </button>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>

                          {/* Delete */}
                          <td className="px-4 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                            <button type="button" aria-label="Delete invoice"
                              onClick={() => setDeleteTarget(invoice)}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>

                        {/* ── Expanded row ─────────────────────────────────── */}
                        {isExpanded && (
                          <tr key={`${invoice.id}-exp`}>
                            <td colSpan={13} className="px-6 py-5 bg-indigo-50/80 border-b border-indigo-200/60">

                              {/* Edit button */}
                              <div className="flex justify-end mb-3">
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); setEditTarget(invoice); }}
                                  className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 hover:border-indigo-400 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                                >
                                  <Pencil size={12} /> Edit Invoice
                                </button>
                              </div>

                              {/* Zone 1 — FROM / Invoice Details */}
                              <div className="grid grid-cols-2 gap-4 mb-3 bg-white rounded-xl border border-slate-200 p-4">
                                {/* 1A: Vendor (FROM) */}
                                <div className="border-r border-slate-100 pr-4">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">From</p>
                                  <p className="font-semibold text-slate-800 text-sm">{invoice.vendor_name}</p>
                                  {invoice.vendor_gstin && (
                                    <p className="text-xs text-slate-500 font-mono mt-0.5">GSTIN: {invoice.vendor_gstin}</p>
                                  )}
                                  {invoice.vendor_address && (
                                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{invoice.vendor_address}</p>
                                  )}
                                </div>
                                {/* 1B: Invoice meta */}
                                <div className="space-y-1.5">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Invoice Details</p>
                                  {invoice.invoice_number && <MetaRow label="Invoice #" value={invoice.invoice_number} mono />}
                                  {invoice.invoice_date && <MetaRow label="Date" value={formatDate(invoice.invoice_date)} />}
                                  {invoice.due_date && <MetaRow label="Due Date" value={formatDate(invoice.due_date)} />}
                                  {invoice.payment_terms && <MetaRow label="Terms" value={invoice.payment_terms} />}
                                  {invoice.document_type && <MetaRow label="Type" value={invoice.document_type} />}
                                  {invoice.category && (
                                    <div className="flex gap-2 text-sm pt-1 border-t border-slate-50">
                                      <span className="text-slate-400 w-24 shrink-0">Category</span>
                                      <div className="min-w-0">
                                        <CategoryPill
                                          category={invoice.category}
                                          subcategory={invoice.subcategory}
                                          allCategories={allCategories}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Zone 2 — BILL TO / Service Period (only if data exists) */}
                              {(invoice.buyer_name || invoice.service_period || invoice.billing_period_from) && (
                                <div className="grid grid-cols-2 gap-4 mb-3 bg-white rounded-xl border border-slate-200 p-4">
                                  {/* 2A: Buyer (BILL TO) */}
                                  <div className="border-r border-slate-100 pr-4">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Bill To</p>
                                    <p className="font-semibold text-slate-800 text-sm">{invoice.buyer_name || '—'}</p>
                                    {invoice.buyer_gstin && (
                                      <p className="text-xs text-slate-500 font-mono mt-0.5">GSTIN: {invoice.buyer_gstin}</p>
                                    )}
                                    {invoice.buyer_address && (
                                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{invoice.buyer_address}</p>
                                    )}
                                  </div>
                                  {/* 2B: Service Period */}
                                  <div className="space-y-1.5">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Service Period</p>
                                    {invoice.billing_period_from && <MetaRow label="From" value={formatDate(invoice.billing_period_from)} />}
                                    {invoice.billing_period_to && <MetaRow label="To" value={formatDate(invoice.billing_period_to)} />}
                                    {invoice.service_period && <MetaRow label="Period" value={invoice.service_period} />}
                                  </div>
                                </div>
                              )}

                              {/* Zone 3 — Line Items */}
                              {invoice.line_items && invoice.line_items.length > 0 && (
                                <div className="rounded-xl border border-slate-200 overflow-x-auto mb-3">
                                  <table className="w-full text-xs min-w-[700px]">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                      <tr>
                                        <th className="text-left px-3 py-2.5 font-semibold text-slate-500">HSN/SAC</th>
                                        <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Description</th>
                                        <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Qty</th>
                                        <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Unit Rate</th>
                                        <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Basic Amt</th>
                                        <th className="text-right px-3 py-2.5 font-semibold text-slate-500">CGST</th>
                                        <th className="text-right px-3 py-2.5 font-semibold text-slate-500">SGST</th>
                                        <th className="text-right px-3 py-2.5 font-semibold text-slate-500">IGST</th>
                                        <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                      {invoice.line_items.map((item, i) => (
                                        <tr key={i} className="hover:bg-slate-50">
                                          <td className="px-3 py-2 text-slate-400 font-mono">{item.hsn_sac_code || '—'}</td>
                                          <td className="px-3 py-2 text-slate-700">{item.description}</td>
                                          <td className="px-3 py-2 text-right text-slate-600">{item.quantity}</td>
                                          <td className="px-3 py-2 text-right text-slate-600">₹{item.unit_price?.toFixed(2)}</td>
                                          <td className="px-3 py-2 text-right text-slate-600">{item.basic_amount != null ? `₹${item.basic_amount.toFixed(2)}` : '—'}</td>
                                          <td className="px-3 py-2 text-right text-slate-500">{item.cgst_amount != null ? `₹${item.cgst_amount.toFixed(2)}` : '—'}</td>
                                          <td className="px-3 py-2 text-right text-slate-500">{item.sgst_amount != null ? `₹${item.sgst_amount.toFixed(2)}` : '—'}</td>
                                          <td className="px-3 py-2 text-right text-slate-500">{item.igst_amount != null ? `₹${item.igst_amount.toFixed(2)}` : '—'}</td>
                                          <td className="px-3 py-2 text-right font-semibold text-slate-900">₹{item.total?.toFixed(2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* Zone 4 — Amount in Words / Tax Summary */}
                              {(invoice.subtotal != null || invoice.cgst_amount != null ||
                                invoice.igst_amount != null || invoice.tds_amount != null ||
                                invoice.amount_in_words) && (
                                <div className="grid grid-cols-2 gap-0 mb-3 bg-white rounded-xl border border-slate-200 overflow-hidden">
                                  {/* 4A: Amount in words */}
                                  <div className="p-4 border-r border-slate-100 flex items-center">
                                    {invoice.amount_in_words
                                      ? <p className="text-xs text-slate-500 italic leading-relaxed">{invoice.amount_in_words}</p>
                                      : <p className="text-xs text-slate-300 italic">—</p>
                                    }
                                  </div>
                                  {/* 4B: Tax summary */}
                                  <div className="p-4 space-y-1.5">
                                    <TaxRow label="Subtotal" value={invoice.subtotal} />
                                    {invoice.cgst_amount != null && (
                                      <TaxRow label={`CGST${invoice.cgst_rate != null ? ` @ ${invoice.cgst_rate}%` : ''}`} value={invoice.cgst_amount} />
                                    )}
                                    {invoice.sgst_amount != null && (
                                      <TaxRow label={`SGST${invoice.sgst_rate != null ? ` @ ${invoice.sgst_rate}%` : ''}`} value={invoice.sgst_amount} />
                                    )}
                                    {invoice.igst_amount != null && (
                                      <TaxRow label={`IGST${invoice.igst_rate != null ? ` @ ${invoice.igst_rate}%` : ''}`} value={invoice.igst_amount} />
                                    )}
                                    {invoice.tds_amount != null && (
                                      <TaxRow label={`TDS${invoice.tds_rate != null ? ` @ ${invoice.tds_rate}%` : ''}`} value={invoice.tds_amount} negative />
                                    )}
                                    <div className="border-t border-slate-200 pt-1.5">
                                      <TaxRow label="Grand Total" value={invoice.total_amount} bold />
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Zone 5 — Payment History */}
                              <PaymentHistoryPanel
                                invoice={invoice}
                                onRefreshInvoice={load}
                              />

                              {/* Zone 6 — Attached file */}
                              {invoice.file_url && (
                                <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
                                  <Paperclip size={14} className="text-red-400 flex-shrink-0" />
                                  <span className="text-sm text-slate-600 flex-1 truncate">{invoice.file_name || 'Invoice file'}</span>
                                  <button type="button"
                                    onClick={() => setPdfModal({ url: invoice.file_url!, name: invoice.file_name || 'Invoice' })}
                                    className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors">
                                    <Eye size={12} /> View PDF
                                  </button>
                                </div>
                              )}

                              {/* Zone 7 — Footer: processed + notes */}
                              <div className="flex items-start justify-between mt-3 text-xs text-slate-400">
                                <span>Processed {new Date(invoice.created_at).toLocaleString('en-IN')}</span>
                                {invoice.notes && (
                                  <span className="ml-4 text-right max-w-sm italic">{invoice.notes}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Showing {filtered.length} of {invoices.length} invoices
                {selected.size > 0 && <> · <span className="text-indigo-600 font-medium">{selected.size} selected</span></>}
              </span>
              {(statusFilter !== 'all' || docTypeFilter !== 'all' || categoryFilter !== 'all' || search) && (
                <button type="button"
                  onClick={() => { setStatusFilter('all'); setDocTypeFilter('all'); setCategoryFilter('all'); setSearch(''); }}
                  className="text-xs text-indigo-600 hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  RefreshCw,
  Plus,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  X,
  Check,
  IndianRupee,
  Calendar,
  AlertCircle,
  Upload,
  Loader2,
  FileText,
  Sparkles,
  CheckCircle,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import {
  getSubscriptions,
  saveSubscription,
  deleteSubscription,
  getSubscriptionInvoices,
  saveSubscriptionInvoice,
  deleteSubscriptionInvoice,
  uploadSubscriptionInvoiceFile,
} from '../lib/supabase';
import { extractInvoiceData } from '../lib/claude';
import type { Subscription, SubscriptionInvoice } from '../types';
import SubscriptionTabBar from '../components/SubscriptionTabBar';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED'];
const CYCLES = ['monthly', 'annual', 'quarterly', 'one-time'] as const;
const STATUSES = ['active', 'trial', 'paused', 'cancelled'] as const;

function fmtCur(n: number, currency = 'INR') {
  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
}

function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toMonthlyINR(sub: Subscription): number {
  if (sub.status === 'cancelled') return 0;
  const inr = sub.inr_amount ?? 0;
  if (sub.billing_cycle === 'annual') return inr / 12;
  if (sub.billing_cycle === 'quarterly') return inr / 3;
  if (sub.billing_cycle === 'one-time') return 0;
  return inr;
}

function renewalInfo(sub: Subscription): { label: string; urgency: 'ok' | 'soon' | 'overdue' | 'none' } {
  if (!sub.next_renewal_date || sub.status === 'cancelled') return { label: '—', urgency: 'none' };
  const diff = Math.ceil((new Date(sub.next_renewal_date).getTime() - Date.now()) / 86_400_000);
  const label = fmtDate(sub.next_renewal_date);
  if (diff < 0) return { label, urgency: 'overdue' };
  if (diff <= 7) return { label, urgency: 'soon' };
  return { label, urgency: 'ok' };
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

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    trial: 'bg-blue-100 text-blue-700',
    paused: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-slate-100 text-slate-500',
  };
  return map[status] ?? 'bg-slate-100 text-slate-500';
}

// ── Fuzzy vendor matching ─────────────────────────────────────────────────────

function fuzzyMatchSubscription(
  extractedVendorName: string,
  subscriptions: Subscription[],
): Subscription | null {
  if (!extractedVendorName) return null;
  const needle = extractedVendorName.toLowerCase().trim();

  // Pass 1: Exact (case-insensitive)
  const exact = subscriptions.find(s => s.vendor_name.toLowerCase().trim() === needle);
  if (exact) return exact;

  // Pass 2: Substring containment (either direction)
  const containsMatch = subscriptions.find(s => {
    const subName = s.vendor_name.toLowerCase().trim();
    return needle.includes(subName) || subName.includes(needle);
  });
  if (containsMatch) return containsMatch;

  // Pass 3: Token-overlap scoring (≥50% shared tokens)
  const needleTokens = new Set(needle.split(/\s+/));
  let bestScore = 0;
  let bestSub: Subscription | null = null;
  for (const sub of subscriptions) {
    const subTokens = new Set(sub.vendor_name.toLowerCase().trim().split(/\s+/));
    const shared = [...needleTokens].filter(t => subTokens.has(t)).length;
    const score = shared / Math.max(needleTokens.size, subTokens.size);
    if (score > bestScore) { bestScore = score; bestSub = sub; }
  }
  return bestScore >= 0.5 ? bestSub : null;
}

// ── Default form states ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  vendor_name: '', service_name: '', plan_name: '',
  billing_cycle: 'monthly' as Subscription['billing_cycle'],
  currency: 'USD', amount: '', tax_rate: '0', exchange_rate: '87',
  account_email: '', category: '', status: 'active' as Subscription['status'],
  start_date: '', next_renewal_date: '', notes: '',
};

const EMPTY_INV_FORM = {
  invoice_number: '', invoice_date: '', billing_period_from: '', billing_period_to: '',
  currency: 'USD', amount: '', tax_rate: '0', exchange_rate: '87', notes: '',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | Subscription['status']>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [invoicesMap, setInvoicesMap] = useState<Record<string, SubscriptionInvoice[]>>({});
  const [loadingInvoices, setLoadingInvoices] = useState<Set<string>>(new Set());

  // Add/Edit subscription form
  const [showForm, setShowForm] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Add invoice form
  const [showInvoiceForm, setShowInvoiceForm] = useState<string | null>(null); // subscription_id
  const [invForm, setInvForm] = useState({ ...EMPTY_INV_FORM });
  const [savingInv, setSavingInv] = useState(false);

  // Delete confirms
  const [deletingSubId, setDeletingSubId] = useState<string | null>(null);
  const [deletingInvId, setDeletingInvId] = useState<string | null>(null);

  // Top-level drop zone
  const [dropProcessing, setDropProcessing] = useState(false);
  const [dropCurrentFile, setDropCurrentFile] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingNewSubData, setPendingNewSubData] = useState<any>(null);
  const [dropResult, setDropResult] = useState<{
    fileName: string;
    status: 'matched' | 'new' | 'error';
    vendorName?: string;
    matchedSubName?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    getSubscriptions()
      .then(setSubs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ── Computed stats ──
  const stats = useMemo(() => {
    const active = subs.filter(s => s.status === 'active');
    const monthlyINR = subs.reduce((sum, s) => sum + toMonthlyINR(s), 0);
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const thisMonthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const renewing = subs.filter(s =>
      s.next_renewal_date &&
      s.next_renewal_date >= thisMonthStart &&
      s.next_renewal_date <= thisMonthEnd &&
      s.status !== 'cancelled',
    ).length;
    return { monthly: monthlyINR, annual: monthlyINR * 12, active: active.length, renewing };
  }, [subs]);

  const filtered = useMemo(() =>
    statusFilter === 'all' ? subs : subs.filter(s => s.status === statusFilter),
    [subs, statusFilter],
  );

  // ── Form helpers ──
  function calcFormAmounts(f: typeof form) {
    const amount = parseFloat(f.amount) || 0;
    const tax = parseFloat(f.tax_rate) || 0;
    const taxAmt = amount * (tax / 100);
    const total = amount + taxAmt;
    const rate = f.currency === 'INR' ? 1 : (parseFloat(f.exchange_rate) || 1);
    return { taxAmt, total, inr: total * rate };
  }

  function calcInvAmounts(f: typeof invForm) {
    const amount = parseFloat(f.amount) || 0;
    const tax = parseFloat(f.tax_rate) || 0;
    const taxAmt = amount * (tax / 100);
    const total = amount + taxAmt;
    const rate = f.currency === 'INR' ? 1 : (parseFloat(f.exchange_rate) || 1);
    return { taxAmt, total, inr: total * rate };
  }

  function openAddForm() {
    setEditingSub(null);
    setForm({ ...EMPTY_FORM });
    setFormError('');
    setShowForm(true);
  }

  function openEditForm(sub: Subscription) {
    setEditingSub(sub);
    setForm({
      vendor_name: sub.vendor_name,
      service_name: sub.service_name,
      plan_name: sub.plan_name ?? '',
      billing_cycle: sub.billing_cycle,
      currency: sub.currency,
      amount: String(sub.amount),
      tax_rate: String(sub.tax_rate ?? 0),
      exchange_rate: String(sub.exchange_rate ?? 1),
      account_email: sub.account_email ?? '',
      category: sub.category ?? '',
      status: sub.status,
      start_date: sub.start_date ?? '',
      next_renewal_date: sub.next_renewal_date ?? '',
      notes: sub.notes ?? '',
    });
    setFormError('');
    setShowForm(true);
  }

  async function handleSaveSub(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vendor_name.trim() || !form.service_name.trim()) {
      setFormError('Vendor name and service name are required.');
      return;
    }
    setSaving(true);
    setFormError('');
    const { taxAmt, total, inr } = calcFormAmounts(form);
    const payload: Partial<Subscription> = {
      ...(editingSub ? { id: editingSub.id } : {}),
      vendor_name: form.vendor_name.trim(),
      service_name: form.service_name.trim(),
      plan_name: form.plan_name.trim() || undefined,
      billing_cycle: form.billing_cycle,
      currency: form.currency,
      amount: parseFloat(form.amount) || 0,
      tax_rate: parseFloat(form.tax_rate) || 0,
      tax_amount: taxAmt,
      total_amount: total,
      exchange_rate: form.currency === 'INR' ? 1 : (parseFloat(form.exchange_rate) || 1),
      inr_amount: inr,
      account_email: form.account_email.trim() || undefined,
      category: form.category.trim() || undefined,
      status: form.status,
      start_date: form.start_date || undefined,
      next_renewal_date: form.next_renewal_date || undefined,
      notes: form.notes.trim() || undefined,
    };
    try {
      const saved = await saveSubscription(payload);
      setSubs(prev => editingSub
        ? prev.map(s => s.id === saved.id ? saved : s)
        : [saved, ...prev],
      );
      setShowForm(false);
      setEditingSub(null);

      // If created from a dropped file, auto-create the first invoice
      if (pendingNewSubData && pendingFile && !editingSub) {
        const ext = pendingNewSubData;
        const subtotal = ext.subtotal ?? 0;
        const taxAmt2 = ext.tax_amount ?? 0;
        const computedTaxRate = subtotal > 0 ? parseFloat(((taxAmt2 / subtotal) * 100).toFixed(2)) : 0;
        const baseAmount = subtotal > 0 ? subtotal : Math.max(0, (ext.total_amount ?? 0) - taxAmt2);
        const extractedCurrency = ext.currency ?? saved.currency;
        const exchangeRate = extractedCurrency === 'INR' ? 1 : saved.exchange_rate;
        const totalAmt = baseAmount + (baseAmount * computedTaxRate / 100);
        const inrAmt = totalAmt * exchangeRate;
        try {
          const invPayload: Partial<SubscriptionInvoice> = {
            subscription_id: saved.id,
            invoice_number: ext.invoice_number || undefined,
            invoice_date: ext.invoice_date || undefined,
            billing_period_from: ext.billing_period_from || undefined,
            billing_period_to: ext.billing_period_to || undefined,
            currency: extractedCurrency,
            amount: baseAmount,
            tax_amount: taxAmt2,
            total_amount: ext.total_amount ?? totalAmt,
            exchange_rate: exchangeRate,
            inr_amount: inrAmt,
            file_name: pendingFile.name,
          };
          const savedInv = await saveSubscriptionInvoice(invPayload);
          try {
            const url = await uploadSubscriptionInvoiceFile(pendingFile, savedInv.id);
            if (url) await saveSubscriptionInvoice({ id: savedInv.id, file_url: url });
          } catch { console.error('File upload failed for auto-created invoice'); }
          setInvoicesMap(prev => ({ ...prev, [saved.id]: [savedInv] }));
          setExpandedId(saved.id);
        } catch (invErr) {
          console.error('Failed to auto-create first invoice:', invErr);
        }
        setPendingFile(null);
        setPendingNewSubData(null);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSub(id: string) {
    try {
      await deleteSubscription(id);
      setSubs(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
    setDeletingSubId(null);
  }

  // ── Expand / invoices ──
  async function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!invoicesMap[id]) {
      setLoadingInvoices(prev => new Set(prev).add(id));
      try {
        const invs = await getSubscriptionInvoices(id);
        setInvoicesMap(prev => ({ ...prev, [id]: invs }));
      } finally {
        setLoadingInvoices(prev => { const s = new Set(prev); s.delete(id); return s; });
      }
    }
  }

  function openInvoiceForm(subId: string) {
    const sub = subs.find(s => s.id === subId);
    setInvForm({
      ...EMPTY_INV_FORM,
      currency: sub?.currency ?? 'USD',
      exchange_rate: String(sub?.exchange_rate ?? 87),
    });
    setShowInvoiceForm(subId);
  }

  async function handleSaveInvoice(e: React.FormEvent, subId: string) {
    e.preventDefault();
    setSavingInv(true);
    const { taxAmt, total, inr } = calcInvAmounts(invForm);
    const payload: Partial<SubscriptionInvoice> = {
      subscription_id: subId,
      invoice_number: invForm.invoice_number.trim() || undefined,
      invoice_date: invForm.invoice_date || undefined,
      billing_period_from: invForm.billing_period_from || undefined,
      billing_period_to: invForm.billing_period_to || undefined,
      currency: invForm.currency,
      amount: parseFloat(invForm.amount) || 0,
      tax_amount: taxAmt,
      total_amount: total,
      exchange_rate: invForm.currency === 'INR' ? 1 : (parseFloat(invForm.exchange_rate) || 1),
      inr_amount: inr,
      file_name: pendingFile?.name || undefined,
      notes: invForm.notes.trim() || undefined,
    };
    try {
      const saved = await saveSubscriptionInvoice(payload);
      // Upload file to Supabase Storage if we have one pending
      if (pendingFile) {
        try {
          const url = await uploadSubscriptionInvoiceFile(pendingFile, saved.id);
          if (url) {
            await saveSubscriptionInvoice({ id: saved.id, file_url: url });
            saved.file_url = url;
          }
        } catch (uploadErr) {
          console.error('File upload failed:', uploadErr);
        }
        setPendingFile(null);
      }
      setInvoicesMap(prev => ({ ...prev, [subId]: [saved, ...(prev[subId] || [])] }));
      setShowInvoiceForm(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save invoice');
    } finally {
      setSavingInv(false);
    }
  }

  async function handleDeleteInvoice(invId: string, subId: string) {
    try {
      await deleteSubscriptionInvoice(invId);
      setInvoicesMap(prev => ({ ...prev, [subId]: (prev[subId] || []).filter(i => i.id !== invId) }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
    setDeletingInvId(null);
  }

  // ── Top-level drop zone handler ──
  const onTopLevelDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    setDropProcessing(true);
    setDropCurrentFile(file.name);
    setDropResult(null);

    try {
      const extracted = await extractInvoiceData(file);
      const vendorName = extracted.vendor_name || '';
      const matched = fuzzyMatchSubscription(vendorName, subs);

      if (matched) {
        // ── Match found: expand subscription, pre-fill invoice form ──
        setExpandedId(matched.id);
        if (!invoicesMap[matched.id]) {
          setLoadingInvoices(prev => new Set(prev).add(matched.id));
          try {
            const invs = await getSubscriptionInvoices(matched.id);
            setInvoicesMap(prev => ({ ...prev, [matched.id]: invs }));
          } finally {
            setLoadingInvoices(prev => { const s = new Set(prev); s.delete(matched.id); return s; });
          }
        }
        const subtotal = extracted.subtotal ?? 0;
        const taxAmt = extracted.tax_amount ?? 0;
        const computedTaxRate = subtotal > 0 ? parseFloat(((taxAmt / subtotal) * 100).toFixed(2)) : 0;
        const baseAmount = subtotal > 0 ? subtotal : Math.max(0, (extracted.total_amount ?? 0) - taxAmt);
        const extractedCurrency = extracted.currency ?? matched.currency ?? 'USD';
        const rate = extractedCurrency === 'INR' ? '1' : String(matched.exchange_rate ?? 87);
        setInvForm({
          invoice_number: extracted.invoice_number ?? '',
          invoice_date: extracted.invoice_date ?? '',
          billing_period_from: extracted.billing_period_from ?? '',
          billing_period_to: extracted.billing_period_to ?? '',
          currency: extractedCurrency,
          amount: String(baseAmount),
          tax_rate: String(computedTaxRate),
          exchange_rate: rate,
          notes: '',
        });
        setShowInvoiceForm(matched.id);
        setPendingFile(file);
        setDropResult({ fileName: file.name, status: 'matched', vendorName, matchedSubName: matched.vendor_name });
      } else {
        // ── No match: open Add Subscription form pre-filled ──
        const subtotal = extracted.subtotal ?? 0;
        const taxAmt = extracted.tax_amount ?? 0;
        const computedTaxRate = subtotal > 0 ? parseFloat(((taxAmt / subtotal) * 100).toFixed(2)) : 0;
        const baseAmount = subtotal > 0 ? subtotal : Math.max(0, (extracted.total_amount ?? 0) - taxAmt);
        const extractedCurrency = extracted.currency ?? 'USD';
        const rate = extractedCurrency === 'INR' ? '1' : '87';
        setEditingSub(null);
        setForm({
          vendor_name: vendorName,
          service_name: vendorName,
          plan_name: '',
          billing_cycle: 'monthly',
          currency: extractedCurrency,
          amount: String(baseAmount),
          tax_rate: String(computedTaxRate),
          exchange_rate: rate,
          account_email: '',
          category: extracted.category ?? '',
          status: 'active',
          start_date: extracted.invoice_date ?? '',
          next_renewal_date: '',
          notes: '',
        });
        setShowForm(true);
        setPendingFile(file);
        setPendingNewSubData(extracted);
        setDropResult({ fileName: file.name, status: 'new', vendorName });
      }
    } catch (err) {
      setDropResult({
        fileName: file.name,
        status: 'error',
        error: err instanceof Error ? err.message : 'Extraction failed',
      });
    } finally {
      setDropCurrentFile(null);
      setDropProcessing(false);
    }
  }, [subs, invoicesMap]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onTopLevelDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    disabled: dropProcessing,
    noClick: false,
  });

  // ── Computed form preview ──
  const formCalc = calcFormAmounts(form);
  const invCalc = calcInvAmounts(invForm);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 space-y-5">

      <SubscriptionTabBar />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subscription Manager</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track recurring SaaS spend, renewals, and invoice history</p>
        </div>
        <button
          type="button"
          onClick={openAddForm}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus size={15} />
          Add Subscription
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Monthly Spend',   value: fmtINR(stats.monthly), sub: 'Active subscriptions',   Icon: IndianRupee, bg: 'bg-indigo-50',  tc: 'text-indigo-600' },
          { label: 'Annual Spend',    value: fmtINR(stats.annual),  sub: 'Projected (12 months)',   Icon: RefreshCw,   bg: 'bg-emerald-50', tc: 'text-emerald-600'},
          { label: 'Active',          value: String(stats.active),  sub: 'Active subscriptions',    Icon: Check,       bg: 'bg-slate-50',   tc: 'text-slate-600'  },
          { label: 'Renewing',        value: String(stats.renewing),sub: 'This calendar month',     Icon: Calendar,    bg: 'bg-amber-50',   tc: 'text-amber-600'  },
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

      {/* ── Prominent Drop Zone ── */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl transition-all cursor-pointer ${
          isDragActive
            ? 'border-indigo-400 bg-indigo-50 shadow-lg shadow-indigo-100'
            : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30'
        } ${dropProcessing ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="flex items-center gap-5 px-6 py-5">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isDragActive ? 'bg-indigo-100' : 'bg-slate-100'
          }`}>
            {dropProcessing ? (
              <Loader2 size={24} className="text-indigo-600 animate-spin" />
            ) : (
              <Upload size={24} className={isDragActive ? 'text-indigo-600' : 'text-slate-400'} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            {dropProcessing ? (
              <>
                <p className="text-sm font-semibold text-indigo-700">
                  Extracting from {dropCurrentFile}...
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  AI is reading your invoice. This usually takes a few seconds.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-700">
                  {isDragActive
                    ? 'Drop your subscription invoice here'
                    : 'Drop subscription invoices here, or click to browse'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  PDF, JPG, PNG — AI will extract data and match to existing subscriptions automatically
                </p>
              </>
            )}
          </div>
          {!dropProcessing && (
            <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 flex-shrink-0">
              <Sparkles size={12} />
              AI-Powered
            </div>
          )}
        </div>
      </div>

      {/* Drop result banner */}
      {dropResult && !dropProcessing && (
        <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs ${
          dropResult.status === 'matched' ? 'bg-green-50 border border-green-200' :
          dropResult.status === 'new' ? 'bg-amber-50 border border-amber-200' :
          'bg-red-50 border border-red-200'
        }`}>
          {dropResult.status === 'matched' && (
            <>
              <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
              <span className="text-slate-700">
                <span className="font-medium">{dropResult.fileName}</span>
                {' — matched to '}
                <span className="font-semibold text-indigo-600">{dropResult.matchedSubName}</span>
                . Review and save the invoice below.
              </span>
            </>
          )}
          {dropResult.status === 'new' && (
            <>
              <Plus size={14} className="text-amber-500 flex-shrink-0" />
              <span className="text-slate-700">
                <span className="font-medium">{dropResult.fileName}</span>
                {' — new vendor: '}
                <span className="font-semibold text-amber-600">{dropResult.vendorName}</span>
                . Fill in subscription details and save.
              </span>
            </>
          )}
          {dropResult.status === 'error' && (
            <>
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <span className="text-red-600">
                <span className="font-medium">{dropResult.fileName}</span>
                {' — '}{dropResult.error}
              </span>
            </>
          )}
          <button
            type="button"
            title="Dismiss"
            onClick={() => setDropResult(null)}
            className="ml-auto text-slate-400 hover:text-slate-600 flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main panel */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">

        {/* Filter tabs + Add form toggle */}
        <div className="flex items-center gap-1 px-4 pt-4 pb-0 border-b border-slate-100">
          {(['all', 'active', 'trial', 'paused', 'cancelled'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-t text-xs font-medium capitalize transition-colors ${
                statusFilter === f
                  ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-500'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Add/Edit form (slide-down) */}
        {showForm && (
          <div className="border-b border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-slate-800 text-sm">
                {editingSub ? 'Edit Subscription' : 'New Subscription'}
              </p>
              <button type="button" title="Close" onClick={() => { setShowForm(false); setEditingSub(null); setPendingFile(null); setPendingNewSubData(null); }} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveSub} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Vendor Name *</label>
                  <input
                    type="text" title="Vendor name" value={form.vendor_name}
                    onChange={e => setForm(p => ({ ...p, vendor_name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="e.g. Figma"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Service Name *</label>
                  <input
                    type="text" title="Service name" value={form.service_name}
                    onChange={e => setForm(p => ({ ...p, service_name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="e.g. Figma Professional"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Plan (optional)</label>
                  <input
                    type="text" title="Plan name" value={form.plan_name}
                    onChange={e => setForm(p => ({ ...p, plan_name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="e.g. Professional Full seats"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Billing Cycle</label>
                  <select
                    title="Billing cycle" value={form.billing_cycle}
                    onChange={e => setForm(p => ({ ...p, billing_cycle: e.target.value as Subscription['billing_cycle'] }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {CYCLES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Currency</label>
                  <select
                    title="Currency" value={form.currency}
                    onChange={e => setForm(p => ({ ...p, currency: e.target.value, exchange_rate: e.target.value === 'INR' ? '1' : '87' }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Base Amount</label>
                  <input
                    type="number" title="Base amount" value={form.amount} min="0" step="0.01"
                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tax %</label>
                  <input
                    type="number" title="Tax rate" value={form.tax_rate} min="0" step="0.01"
                    onChange={e => setForm(p => ({ ...p, tax_rate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="18"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                {form.currency !== 'INR' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Exchange Rate (to ₹)</label>
                    <input
                      type="number" title="Exchange rate" value={form.exchange_rate} min="0" step="0.0001"
                      onChange={e => setForm(p => ({ ...p, exchange_rate: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Total ({form.currency})</label>
                  <div className="w-full border border-slate-100 bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-600">
                    {fmtCur(formCalc.total, form.currency)}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">INR Equivalent</label>
                  <div className="w-full border border-indigo-100 bg-indigo-50 rounded-lg px-3 py-2 text-sm text-indigo-700 font-semibold">
                    {fmtINR(formCalc.inr)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Account Email</label>
                  <input
                    type="email" title="Account email" value={form.account_email}
                    onChange={e => setForm(p => ({ ...p, account_email: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="kishor.raj@icloud.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                  <input
                    type="text" title="Category" value={form.category}
                    onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="SaaS / Design Tools / AI"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                  <select
                    title="Status" value={form.status}
                    onChange={e => setForm(p => ({ ...p, status: e.target.value as Subscription['status'] }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
                  <input
                    type="date" title="Start date" value={form.start_date}
                    onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Next Renewal Date</label>
                  <input
                    type="date" title="Next renewal date" value={form.next_renewal_date}
                    onChange={e => setForm(p => ({ ...p, next_renewal_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                  <input
                    type="text" title="Notes" value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Optional notes"
                  />
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <AlertCircle size={14} />
                  {formError}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingSub(null); setPendingFile(null); setPendingNewSubData(null); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
                >
                  {saving ? 'Saving…' : editingSub ? 'Update Subscription' : 'Add Subscription'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading subscriptions…</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <RefreshCw size={36} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No subscriptions yet</p>
            <p className="text-xs text-slate-400 mt-1">Click "Add Subscription" to get started</p>
          </div>
        ) : (
          <div>
            {/* Header row */}
            <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <span>Vendor / Account</span>
              <span>Service</span>
              <span>Cycle</span>
              <span>INR / mo</span>
              <span>Renews</span>
              <span>Status</span>
              <span className="w-20" />
            </div>

            {filtered.map(sub => {
              const ri = renewalInfo(sub);
              const isExpanded = expandedId === sub.id;
              const subInvoices = invoicesMap[sub.id] || [];
              const isLoadingInv = loadingInvoices.has(sub.id);

              return (
                <div key={sub.id} className="border-b border-slate-100 last:border-0">
                  {/* Main row */}
                  <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3.5 items-center hover:bg-slate-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{sub.vendor_name}</p>
                      {sub.account_email && (
                        <p className="text-xs text-slate-400 truncate">{sub.account_email}</p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 truncate">{sub.service_name}</p>
                      {sub.plan_name && <p className="text-xs text-slate-400 truncate">{sub.plan_name}</p>}
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium w-fit ${cycleBadge(sub.billing_cycle)}`}>
                      {sub.billing_cycle}
                    </span>
                    <p className="text-sm font-semibold text-slate-800 tabular-nums">
                      {fmtINR(toMonthlyINR(sub))}
                    </p>
                    <p className={`text-xs font-medium ${
                      ri.urgency === 'overdue' ? 'text-red-600' :
                      ri.urgency === 'soon'    ? 'text-amber-600' :
                      'text-slate-600'
                    }`}>
                      {ri.label}
                    </p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium w-fit ${statusBadge(sub.status)}`}>
                      {sub.status}
                    </span>
                    <div className="flex items-center gap-1 w-20 justify-end">
                      <button
                        type="button"
                        title="Expand invoice history"
                        onClick={() => toggleExpand(sub.id)}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <button
                        type="button"
                        title="Edit subscription"
                        onClick={() => { openEditForm(sub); setExpandedId(null); }}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700"
                      >
                        <Pencil size={13} />
                      </button>
                      {deletingSubId === sub.id ? (
                        <span className="flex items-center gap-1 text-xs text-red-600">
                          <button
                            type="button"
                            title="Confirm delete"
                            onClick={() => handleDeleteSub(sub.id)}
                            className="w-6 h-6 flex items-center justify-center rounded bg-red-100 hover:bg-red-200 text-red-600"
                          >
                            <Check size={11} />
                          </button>
                          <button
                            type="button"
                            title="Cancel delete"
                            onClick={() => setDeletingSubId(null)}
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 text-slate-500"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          title="Delete subscription"
                          onClick={() => setDeletingSubId(sub.id)}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded invoice rows */}
                  {isExpanded && (
                    <div className="bg-slate-50 border-t border-slate-100 px-5 py-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Invoice History</p>
                      {isLoadingInv ? (
                        <p className="text-xs text-slate-400 py-2">Loading…</p>
                      ) : subInvoices.length === 0 && showInvoiceForm !== sub.id ? (
                        <p className="text-xs text-slate-400 py-1">No invoices recorded yet.</p>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {/* Invoice header */}
                          {subInvoices.length > 0 && (
                            <div className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr_auto] gap-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                              <span>Invoice #</span>
                              <span>Date</span>
                              <span>Period</span>
                              <span>Amount</span>
                              <span>INR</span>
                              <span />
                            </div>
                          )}
                          {subInvoices.map(inv => (
                            <div key={inv.id} className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr_auto] gap-3 py-2 items-center text-xs">
                              <span className="text-slate-700 font-medium">{inv.invoice_number || '—'}</span>
                              <span className="text-slate-500">{fmtDate(inv.invoice_date)}</span>
                              <span className="text-slate-500">
                                {inv.billing_period_from && inv.billing_period_to
                                  ? `${fmtDate(inv.billing_period_from)} – ${fmtDate(inv.billing_period_to)}`
                                  : '—'}
                              </span>
                              <span className="text-slate-600 tabular-nums">{fmtCur(inv.total_amount, inv.currency)}</span>
                              <span className="text-slate-800 font-semibold tabular-nums">{fmtINR(inv.inr_amount)}</span>
                              <div className="flex items-center gap-1">
                                {deletingInvId === inv.id ? (
                                  <>
                                    <button
                                      type="button"
                                      title="Confirm delete invoice"
                                      onClick={() => handleDeleteInvoice(inv.id, sub.id)}
                                      className="w-5 h-5 flex items-center justify-center rounded bg-red-100 hover:bg-red-200 text-red-600"
                                    >
                                      <Check size={10} />
                                    </button>
                                    <button
                                      type="button"
                                      title="Cancel"
                                      onClick={() => setDeletingInvId(null)}
                                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 text-slate-500"
                                    >
                                      <X size={10} />
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    title="Delete invoice"
                                    onClick={() => setDeletingInvId(inv.id)}
                                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add Invoice button (visible when form is not open) */}
                      {showInvoiceForm !== sub.id && (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => openInvoiceForm(sub.id)}
                            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                          >
                            <Plus size={12} />
                            Add Invoice
                          </button>
                        </div>
                      )}

                      {/* Add Invoice inline form */}
                      {showInvoiceForm === sub.id ? (
                        <form onSubmit={e => handleSaveInvoice(e, sub.id)} className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                          {pendingFile && showInvoiceForm === sub.id && (
                            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs">
                              <FileText size={13} className="text-indigo-600 flex-shrink-0" />
                              <span className="text-indigo-700 flex-1 truncate">{pendingFile.name}</span>
                              <span className="text-indigo-500 font-medium flex items-center gap-1">
                                <Sparkles size={10} /> AI Extracted
                              </span>
                              <button type="button" title="Remove file" onClick={() => setPendingFile(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={13} />
                              </button>
                            </div>
                          )}
                          <p className="text-xs font-semibold text-slate-600">Add Invoice</p>
                          <div className="grid grid-cols-4 gap-2">
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Invoice #</label>
                              <input
                                type="text" title="Invoice number" value={invForm.invoice_number}
                                onChange={e => setInvForm(p => ({ ...p, invoice_number: e.target.value }))}
                                className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                placeholder="LPQGDKKT-0007"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Invoice Date</label>
                              <input
                                type="date" title="Invoice date" value={invForm.invoice_date}
                                onChange={e => setInvForm(p => ({ ...p, invoice_date: e.target.value }))}
                                className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Period From</label>
                              <input
                                type="date" title="Billing period from" value={invForm.billing_period_from}
                                onChange={e => setInvForm(p => ({ ...p, billing_period_from: e.target.value }))}
                                className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Period To</label>
                              <input
                                type="date" title="Billing period to" value={invForm.billing_period_to}
                                onChange={e => setInvForm(p => ({ ...p, billing_period_to: e.target.value }))}
                                className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-5 gap-2 items-end">
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Currency</label>
                              <select
                                title="Currency" value={invForm.currency}
                                onChange={e => setInvForm(p => ({ ...p, currency: e.target.value, exchange_rate: e.target.value === 'INR' ? '1' : p.exchange_rate }))}
                                className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              >
                                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Base Amount</label>
                              <input
                                type="number" title="Base amount" value={invForm.amount} min="0" step="0.01"
                                onChange={e => setInvForm(p => ({ ...p, amount: e.target.value }))}
                                className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                placeholder="0.00"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Tax %</label>
                              <input
                                type="number" title="Tax rate" value={invForm.tax_rate} min="0" step="0.01"
                                onChange={e => setInvForm(p => ({ ...p, tax_rate: e.target.value }))}
                                className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              />
                            </div>
                            {invForm.currency !== 'INR' && (
                              <div>
                                <label className="block text-xs text-slate-500 mb-1">Exchange Rate</label>
                                <input
                                  type="number" title="Exchange rate" value={invForm.exchange_rate} min="0" step="0.0001"
                                  onChange={e => setInvForm(p => ({ ...p, exchange_rate: e.target.value }))}
                                  className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                />
                              </div>
                            )}
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">INR Total</label>
                              <div className="w-full border border-indigo-100 bg-indigo-50 rounded px-2 py-1.5 text-xs text-indigo-700 font-semibold">
                                {fmtINR(invCalc.inr)}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => { setShowInvoiceForm(null); setPendingFile(null); }}
                              className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={savingInv}
                              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 font-medium"
                            >
                              {savingInv ? 'Saving…' : 'Save Invoice'}
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

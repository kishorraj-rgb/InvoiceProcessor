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
  Eye,
  ExternalLink,
  DollarSign,
  ArrowRightLeft,
  ArrowUpDown,
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
import { getBillingAccounts, type BillingAccount } from '../lib/accounts';
import type { Subscription, SubscriptionInvoice } from '../types';
import SubscriptionTabBar from '../components/SubscriptionTabBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';

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

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}

// How many INR is 1 USD — used as fallback when exchange_rate is 1 or missing
const FALLBACK_USD_INR = 87;

/** Convert an amount in `currency` to INR, using stored exchange_rate (with fallback). */
function amountToINR(amount: number, currency: string, exchangeRate: number | null | undefined): number {
  if (currency === 'INR') return amount;
  // exchange_rate stores orig_currency → INR; must be > 1 to be meaningful for non-INR
  const rate = (exchangeRate ?? 0) > 1 ? (exchangeRate as number) : FALLBACK_USD_INR;
  return amount * rate;
}

/** Convert an amount in `currency` to USD, using stored exchange_rate (with fallback). */
function amountToUSD(amount: number, currency: string, exchangeRate: number | null | undefined): number {
  if (currency === 'USD') return amount;
  const inr = amountToINR(amount, currency, exchangeRate);
  // Divide by USD/INR rate: use stored rate if currency is USD-like, else fallback
  const usdInrRate = (exchangeRate ?? 0) > 1 ? (exchangeRate as number) : FALLBACK_USD_INR;
  return currency === 'INR' ? amount / usdInrRate : inr / FALLBACK_USD_INR;
}

function toMonthlyUSD(sub: Subscription): number {
  if (sub.status === 'cancelled') return 0;
  const usd = amountToUSD(sub.total_amount ?? 0, sub.currency, sub.exchange_rate);
  if (sub.billing_cycle === 'annual') return usd / 12;
  if (sub.billing_cycle === 'quarterly') return usd / 3;
  if (sub.billing_cycle === 'one-time') return 0;
  return usd;
}

function invToUSD(inv: { total_amount: number; currency: string; exchange_rate: number; inr_amount: number }): number {
  return amountToUSD(inv.total_amount, inv.currency, inv.exchange_rate);
}

function invToINR(inv: { total_amount: number; currency: string; exchange_rate: number; inr_amount: number }): number {
  return amountToINR(inv.total_amount, inv.currency, inv.exchange_rate);
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toMonthlyINR(sub: Subscription): number {
  if (sub.status === 'cancelled') return 0;
  const inr = amountToINR(sub.total_amount ?? 0, sub.currency, sub.exchange_rate);
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

/** Returns ALL subscriptions whose vendor name fuzzy-matches the extracted name. */
function fuzzyMatchAll(extractedVendorName: string, subscriptions: Subscription[]): Subscription[] {
  if (!extractedVendorName) return [];
  const needle = extractedVendorName.toLowerCase().trim();
  const needleTokens = new Set(needle.split(/\s+/));
  return subscriptions.filter(s => {
    const subName = s.vendor_name.toLowerCase().trim();
    if (subName === needle) return true;
    if (needle.includes(subName) || subName.includes(needle)) return true;
    const subTokens = new Set(subName.split(/\s+/));
    const shared = [...needleTokens].filter(t => subTokens.has(t)).length;
    return shared / Math.max(needleTokens.size, subTokens.size) >= 0.5;
  });
}

function fuzzyMatchSubscription(
  extractedVendorName: string,
  subscriptions: Subscription[],
  buyerEmail?: string | null,
): Subscription | null {
  if (!extractedVendorName) return null;
  const needle = extractedVendorName.toLowerCase().trim();
  const email = buyerEmail?.toLowerCase().trim() || null;

  // When buyer email is known, prefer same-account subs first, then fall back to all
  const candidateSets = email
    ? [subscriptions.filter(s => s.account_email?.toLowerCase() === email), subscriptions]
    : [subscriptions];

  for (const candidates of candidateSets) {
    if (candidates.length === 0) continue;

    // Pass 1: Exact (case-insensitive)
    const exact = candidates.find(s => s.vendor_name.toLowerCase().trim() === needle);
    if (exact) return exact;

    // Pass 2: Substring containment (either direction)
    const containsMatch = candidates.find(s => {
      const subName = s.vendor_name.toLowerCase().trim();
      return needle.includes(subName) || subName.includes(needle);
    });
    if (containsMatch) return containsMatch;

    // Pass 3: Token-overlap scoring (≥50% shared tokens)
    const needleTokens = new Set(needle.split(/\s+/));
    let bestScore = 0;
    let bestSub: Subscription | null = null;
    for (const sub of candidates) {
      const subTokens = new Set(sub.vendor_name.toLowerCase().trim().split(/\s+/));
      const shared = [...needleTokens].filter(t => subTokens.has(t)).length;
      const score = shared / Math.max(needleTokens.size, subTokens.size);
      if (score > bestScore) { bestScore = score; bestSub = sub; }
    }
    if (bestScore >= 0.5) return bestSub;
  }
  return null;
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
  // Reassign invoice to different subscription
  const [reassigningInvId, setReassigningInvId] = useState<string | null>(null);
  const [reassignTargetSubId, setReassignTargetSubId] = useState<string>('');
  // Inline invoice editing
  const [editingInvId, setEditingInvId] = useState<string | null>(null);
  const [editInvForm, setEditInvForm] = useState<{
    invoice_number: string; invoice_date: string;
    billing_period_from: string; billing_period_to: string;
    currency: string; amount: string; tax_amount: string;
    total_amount: string; exchange_rate: string;
  }>({ invoice_number: '', invoice_date: '', billing_period_from: '', billing_period_to: '', currency: 'USD', amount: '', tax_amount: '', total_amount: '', exchange_rate: '' });

  // Currency display toggle
  const [viewCurrency, setViewCurrency] = useState<'USD' | 'INR'>('USD');
  const [invSortAsc, setInvSortAsc] = useState(true); // true = oldest first
  // File viewer modal
  const [viewingFile, setViewingFile] = useState<{ url: string; name: string } | null>(null);
  // Top-level drop zone – multi-file queue
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [queueItems, setQueueItems] = useState<{
    fileName: string;
    status: 'pending' | 'processing' | 'saved' | 'error' | 'needs_account';
    subName?: string;
    error?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deferred?: { extracted: any; file: File; vendorName: string };
    selectedAccount?: string;
  }[]>([]);
  const [queueBusy, setQueueBusy] = useState(false);

  // Billing accounts (localStorage)
  const [billingAccounts, setBillingAccounts] = useState<BillingAccount[]>(getBillingAccounts);

  // Alert/confirm dialog (replaces native alert())
  const [dialog, setDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    mode: 'alert' | 'confirm';
    variant: 'danger' | 'default';
    actionLabel?: string;
    onConfirm?: () => void;
  }>({ open: false, title: '', message: '', mode: 'alert', variant: 'default' });

  function showAlert(title: string, message: string) {
    setDialog({ open: true, title, message, mode: 'alert', variant: 'default' });
  }

  function closeDialog() {
    setDialog(prev => ({ ...prev, open: false }));
  }

  useEffect(() => {
    const onUpdate = () => setBillingAccounts(getBillingAccounts());
    window.addEventListener('ip-accounts-updated', onUpdate);
    return () => window.removeEventListener('ip-accounts-updated', onUpdate);
  }, []);

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
    const monthlyUSD = subs.reduce((sum, s) => sum + toMonthlyUSD(s), 0);
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const thisMonthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const renewing = subs.filter(s =>
      s.next_renewal_date &&
      s.next_renewal_date >= thisMonthStart &&
      s.next_renewal_date <= thisMonthEnd &&
      s.status !== 'cancelled',
    ).length;
    return { monthly: monthlyINR, annual: monthlyINR * 12, monthlyUSD, annualUSD: monthlyUSD * 12, active: active.length, renewing };
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
    setForm({ ...EMPTY_FORM, account_email: billingAccounts[0]?.email ?? '' });
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
    if (!form.account_email) {
      setFormError('Billing account is required for accounting purposes.');
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

      // No auto-create here; multi-file drops now handle this automatically
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
      showAlert('Delete Failed', err instanceof Error ? err.message : 'Failed to delete subscription.');
    }
    setDeletingSubId(null);
  }

  // ── Expand / invoices ──
  async function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    // Always re-fetch from DB to ensure freshly saved invoices appear
    setLoadingInvoices(prev => new Set(prev).add(id));
    try {
      const invs = await getSubscriptionInvoices(id);
      setInvoicesMap(prev => ({ ...prev, [id]: invs }));
    } finally {
      setLoadingInvoices(prev => { const s = new Set(prev); s.delete(id); return s; });
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
      showAlert('Save Failed', err instanceof Error ? err.message : 'Failed to save invoice.');
    } finally {
      setSavingInv(false);
    }
  }

  async function handleDeleteInvoice(invId: string, subId: string) {
    try {
      await deleteSubscriptionInvoice(invId);
      setInvoicesMap(prev => ({ ...prev, [subId]: (prev[subId] || []).filter(i => i.id !== invId) }));
    } catch (err) {
      showAlert('Delete Failed', err instanceof Error ? err.message : 'Failed to delete invoice.');
    }
    setDeletingInvId(null);
  }

  async function handleReassignInvoice(invId: string, fromSubId: string, toSubId: string) {
    if (!toSubId || toSubId === fromSubId) { setReassigningInvId(null); return; }
    try {
      await saveSubscriptionInvoice({ id: invId, subscription_id: toSubId });
      // Move in-memory: remove from old sub, append to new sub (will re-fetch on next expand)
      setInvoicesMap(prev => {
        const inv = (prev[fromSubId] || []).find(i => i.id === invId);
        const fromList = (prev[fromSubId] || []).filter(i => i.id !== invId);
        const toList = inv ? [inv, ...(prev[toSubId] || [])] : (prev[toSubId] || []);
        return { ...prev, [fromSubId]: fromList, [toSubId]: toList };
      });
    } catch (err) {
      showAlert('Reassign Failed', err instanceof Error ? err.message : 'Failed to reassign invoice.');
    }
    setReassigningInvId(null);
    setReassignTargetSubId('');
  }

  function startEditInvoice(inv: SubscriptionInvoice) {
    setEditingInvId(inv.id);
    setEditInvForm({
      invoice_number: inv.invoice_number || '',
      invoice_date: inv.invoice_date || '',
      billing_period_from: inv.billing_period_from || '',
      billing_period_to: inv.billing_period_to || '',
      currency: inv.currency || 'USD',
      amount: String(inv.amount ?? ''),
      tax_amount: String(inv.tax_amount ?? ''),
      total_amount: String(inv.total_amount ?? ''),
      exchange_rate: String(inv.exchange_rate ?? ''),
    });
    setDeletingInvId(null);
    setReassigningInvId(null);
  }

  async function saveEditInvoice(subId: string) {
    if (!editingInvId) return;
    const amount = parseFloat(editInvForm.amount) || 0;
    const taxAmt = parseFloat(editInvForm.tax_amount) || 0;
    const total = parseFloat(editInvForm.total_amount) || (amount + taxAmt);
    const exRate = parseFloat(editInvForm.exchange_rate) || 87;
    const inrAmt = editInvForm.currency === 'INR' ? total : total * exRate;
    try {
      await saveSubscriptionInvoice({
        id: editingInvId,
        invoice_number: editInvForm.invoice_number || undefined,
        invoice_date: editInvForm.invoice_date || undefined,
        billing_period_from: editInvForm.billing_period_from || undefined,
        billing_period_to: editInvForm.billing_period_to || undefined,
        currency: editInvForm.currency,
        amount, tax_amount: taxAmt, total_amount: total,
        exchange_rate: exRate, inr_amount: inrAmt,
      });
      setInvoicesMap(prev => ({
        ...prev,
        [subId]: (prev[subId] || []).map(inv =>
          inv.id === editingInvId
            ? { ...inv, invoice_number: editInvForm.invoice_number || undefined, invoice_date: editInvForm.invoice_date || undefined, billing_period_from: editInvForm.billing_period_from || undefined, billing_period_to: editInvForm.billing_period_to || undefined, currency: editInvForm.currency, amount, tax_amount: taxAmt, total_amount: total, exchange_rate: exRate, inr_amount: inrAmt }
            : inv,
        ),
      }));
    } catch (err) {
      showAlert('Update Failed', err instanceof Error ? err.message : 'Failed to update invoice.');
    }
    setEditingInvId(null);
  }

  // ── Top-level drop zone handler (multi-file, auto-save) ──
  const onTopLevelDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    setQueueBusy(true);
    setQueueItems(acceptedFiles.map(f => ({ fileName: f.name, status: 'pending' as const })));
    let firstSavedSubId: string | null = null;
    // Live list that grows as new subs are created, so subsequent files match existing subs
    let liveSubs = [...subs];

    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      setQueueItems(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'processing' } : item));

      try {
        const extracted = await extractInvoiceData(file);
        const vendorName = extracted.vendor_name || 'Unknown Vendor';
        const buyerEmail = extracted.buyer_email || null;
        const allMatches = fuzzyMatchAll(vendorName, liveSubs);

        // Dedup: check ALL matching subscriptions for duplicate invoice_number
        const extractedInvNum = extracted.invoice_number?.trim();
        if (extractedInvNum && allMatches.length > 0) {
          let isDup = false;
          for (const m of allMatches) {
            let existingInvs = invoicesMap[m.id];
            if (!existingInvs) {
              try {
                existingInvs = await getSubscriptionInvoices(m.id);
                setInvoicesMap(prev => ({ ...prev, [m.id]: existingInvs! }));
              } catch { existingInvs = []; }
            }
            if (existingInvs.some(inv => inv.invoice_number === extractedInvNum)) {
              isDup = true;
              break;
            }
          }
          if (isDup) {
            setQueueItems(prev => prev.map((item, idx) => idx === i
              ? { ...item, status: 'saved', subName: `${vendorName} (duplicate skipped)` }
              : item,
            ));
            continue;
          }
        }

        // No billing accounts configured → block
        if (billingAccounts.length === 0) {
          setQueueItems(prev => prev.map((item, idx) => idx === i
            ? { ...item, status: 'error' as const, error: 'No billing accounts configured — add one in Settings first' }
            : item,
          ));
          continue;
        }

        // Always ask user to pick a billing account
        // Pre-select: buyer email from invoice > matched subscription's account > first account
        const matched = allMatches.length === 1 ? allMatches[0] : fuzzyMatchSubscription(vendorName, liveSubs, buyerEmail);
        let preselect = billingAccounts[0]?.email;
        if (buyerEmail && billingAccounts.some(a => a.email.toLowerCase() === buyerEmail.toLowerCase())) {
          preselect = buyerEmail;
        } else if (matched?.account_email && billingAccounts.some(a => a.email.toLowerCase() === matched.account_email!.toLowerCase())) {
          preselect = matched.account_email!;
        }

        setQueueItems(prev => prev.map((item, idx) => idx === i
          ? { ...item, status: 'needs_account' as const, subName: vendorName, deferred: { extracted, file, vendorName }, selectedAccount: preselect }
          : item,
        ));
        continue;
      } catch (err) {
        setQueueItems(prev => prev.map((item, idx) => idx === i
          ? { ...item, status: 'error', error: err instanceof Error ? err.message : 'Failed' }
          : item,
        ));
      }
    }
    setQueueBusy(false);
    // Auto-expand the first subscription that received an invoice
    if (firstSavedSubId) setExpandedId(firstSavedSubId);
  }, [subs]);

  // Save a deferred queue item after user picks an account
  async function saveDeferredItem(idx: number) {
    const item = queueItems[idx];
    if (!item?.deferred || !item.selectedAccount) return;
    const { extracted, file, vendorName } = item.deferred;
    const accountEmail = item.selectedAccount;
    setQueueItems(prev => prev.map((q, i) => i === idx ? { ...q, status: 'processing' as const } : q));
    try {
      const extractedCurrency = extracted.currency ?? 'USD';
      const subtotal = extracted.subtotal ?? 0;
      const taxAmt = extracted.tax_amount ?? 0;
      const baseAmount = subtotal > 0 ? subtotal : Math.max(0, (extracted.total_amount ?? 0) - taxAmt);
      const extractedTotal = extracted.total_amount ?? (baseAmount + taxAmt);

      // Only match subscriptions under the chosen account (no fallback to other accounts)
      const accountSubs = subs.filter(s => s.account_email?.toLowerCase() === accountEmail.toLowerCase());
      const matched = fuzzyMatchSubscription(vendorName, accountSubs, accountEmail);
      if (matched) {
        // Dedup: check for duplicate invoice_number before saving
        let existingInvs = invoicesMap[matched.id];
        if (!existingInvs) {
          try {
            existingInvs = await getSubscriptionInvoices(matched.id);
            setInvoicesMap(prev => ({ ...prev, [matched.id]: existingInvs! }));
          } catch { existingInvs = []; }
        }
        const extractedInvNum = extracted.invoice_number?.trim();
        if (extractedInvNum && existingInvs.some(inv => inv.invoice_number === extractedInvNum)) {
          setQueueItems(prev => prev.map((q, i) => i === idx
            ? { ...q, status: 'saved' as const, subName: `${matched.vendor_name} (duplicate skipped)`, deferred: undefined }
            : q,
          ));
          return;
        }
        const exchangeRate = extractedCurrency === 'INR' ? 1 : (matched.exchange_rate ?? 87);
        const inrAmt = extractedTotal * exchangeRate;
        const savedInv = await saveSubscriptionInvoice({
          subscription_id: matched.id,
          invoice_number: extracted.invoice_number || undefined,
          invoice_date: extracted.invoice_date || undefined,
          billing_period_from: extracted.billing_period_from || undefined,
          billing_period_to: extracted.billing_period_to || undefined,
          currency: extractedCurrency, amount: baseAmount, tax_amount: taxAmt,
          total_amount: extractedTotal, exchange_rate: exchangeRate, inr_amount: inrAmt,
          file_name: file.name,
        });
        try { const url = await uploadSubscriptionInvoiceFile(file, savedInv.id); if (url) { await saveSubscriptionInvoice({ id: savedInv.id, file_url: url }); savedInv.file_url = url; } } catch {}
        setInvoicesMap(prev => ({ ...prev, [matched.id]: [savedInv, ...(prev[matched.id] || [])] }));
        setQueueItems(prev => prev.map((q, i) => i === idx ? { ...q, status: 'saved' as const, subName: matched.vendor_name, deferred: undefined } : q));
      } else {
        const exchangeRate = extractedCurrency === 'INR' ? 1 : 87;
        const inrAmt = extractedTotal * exchangeRate;
        const computedTaxRate = subtotal > 0 ? parseFloat(((taxAmt / subtotal) * 100).toFixed(2)) : 0;
        const savedSub = await saveSubscription({
          vendor_name: vendorName, service_name: vendorName, billing_cycle: 'monthly',
          currency: extractedCurrency, amount: baseAmount, tax_rate: computedTaxRate,
          tax_amount: taxAmt, total_amount: extractedTotal, exchange_rate: exchangeRate,
          inr_amount: inrAmt, account_email: accountEmail, status: 'active',
          start_date: extracted.invoice_date || undefined,
        });
        setSubs(prev => [savedSub, ...prev]);
        const savedInv = await saveSubscriptionInvoice({
          subscription_id: savedSub.id,
          invoice_number: extracted.invoice_number || undefined,
          invoice_date: extracted.invoice_date || undefined,
          billing_period_from: extracted.billing_period_from || undefined,
          billing_period_to: extracted.billing_period_to || undefined,
          currency: extractedCurrency, amount: baseAmount, tax_amount: taxAmt,
          total_amount: extractedTotal, exchange_rate: exchangeRate, inr_amount: inrAmt,
          file_name: file.name,
        });
        try { const url = await uploadSubscriptionInvoiceFile(file, savedInv.id); if (url) { await saveSubscriptionInvoice({ id: savedInv.id, file_url: url }); savedInv.file_url = url; } } catch {}
        setInvoicesMap(prev => ({ ...prev, [savedSub.id]: [savedInv] }));
        setQueueItems(prev => prev.map((q, i) => i === idx ? { ...q, status: 'saved' as const, subName: `New: ${vendorName}`, deferred: undefined } : q));
      }
    } catch (err) {
      setQueueItems(prev => prev.map((q, i) => i === idx ? { ...q, status: 'error' as const, error: err instanceof Error ? err.message : 'Failed', deferred: undefined } : q));
    }
  }


  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onTopLevelDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    disabled: queueBusy,
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
      <div className="flex items-center justify-between gap-4">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold text-slate-900">Subscription Manager</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track recurring SaaS spend, renewals, and invoice history</p>
        </div>
        {/* USD / INR toggle */}
        <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden text-xs font-medium shadow-sm">
          <button
            type="button"
            onClick={() => setViewCurrency('USD')}
            className={`flex items-center gap-1.5 px-3 py-2 transition-colors ${viewCurrency === 'USD' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <DollarSign size={11} /> USD
          </button>
          <button
            type="button"
            onClick={() => setViewCurrency('INR')}
            className={`flex items-center gap-1.5 px-3 py-2 transition-colors ${viewCurrency === 'INR' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <IndianRupee size={11} /> INR
          </button>
        </div>
        <button
          type="button"
          onClick={openAddForm}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shrink-0"
        >
          <Plus size={15} />
          Add Subscription
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Monthly Spend',   value: viewCurrency === 'USD' ? fmtUSD(stats.monthlyUSD) : fmtINR(stats.monthly), sub: 'Active subscriptions',   Icon: viewCurrency === 'USD' ? DollarSign : IndianRupee, bg: 'bg-indigo-50',  tc: 'text-indigo-600' },
          { label: 'Annual Spend',    value: viewCurrency === 'USD' ? fmtUSD(stats.annualUSD)  : fmtINR(stats.annual),  sub: 'Projected (12 months)',   Icon: RefreshCw,   bg: 'bg-emerald-50', tc: 'text-emerald-600'},
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
        } ${queueBusy ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="flex items-center gap-5 px-6 py-5">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isDragActive ? 'bg-indigo-100' : 'bg-slate-100'
          }`}>
            {queueBusy ? (
              <Loader2 size={24} className="text-indigo-600 animate-spin" />
            ) : (
              <Upload size={24} className={isDragActive ? 'text-indigo-600' : 'text-slate-400'} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            {queueBusy ? (
              <>
                <p className="text-sm font-semibold text-indigo-700">
                  Processing {queueItems.filter(q => q.status === 'saved' || q.status === 'error').length} of {queueItems.length} invoice{queueItems.length !== 1 ? 's' : ''}…
                </p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {queueItems.find(q => q.status === 'processing')?.fileName ?? ''}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-700">
                  {isDragActive
                    ? 'Drop invoices here — all will be saved automatically'
                    : 'Drop multiple invoices here, or click to browse'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  PDF, JPG, PNG — AI extracts and auto-saves each invoice to its subscription
                </p>
              </>
            )}
          </div>
          {!queueBusy && (
            <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 flex-shrink-0">
              <Sparkles size={12} />
              AI-Powered
            </div>
          )}
        </div>
      </div>

      {/* Queue results panel */}
      {queueItems.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              {queueBusy ? 'Processing…' : 'Results'} · {queueItems.length} file{queueItems.length !== 1 ? 's' : ''}
            </p>
            {!queueBusy && (
              <button type="button" onClick={() => setQueueItems([])} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {queueItems.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                {item.status === 'pending'             && <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 shrink-0" />}
                {item.status === 'processing'          && <Loader2 size={14} className="text-indigo-500 animate-spin shrink-0" />}
                {item.status === 'saved'               && <CheckCircle size={14} className="text-emerald-500 shrink-0" />}
                {item.status === 'error'               && <AlertCircle size={14} className="text-red-500 shrink-0" />}
                {item.status === 'needs_account'       && <AlertCircle size={14} className="text-amber-500 shrink-0" />}
                <span className="text-slate-600 flex-1 truncate">{item.fileName}</span>
                {item.status === 'saved' && <span className="text-emerald-600 font-medium shrink-0">{item.subName}</span>}
                {item.status === 'error' && <span className="text-red-500 shrink-0">{item.error}</span>}
                {item.status === 'needs_account' && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-amber-600 font-medium text-[11px]">{item.subName}</span>
                    <select
                      value={item.selectedAccount || ''}
                      onChange={e => setQueueItems(prev => prev.map((q, j) => j === i ? { ...q, selectedAccount: e.target.value } : q))}
                      className="text-[11px] border border-amber-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400 max-w-[180px]"
                    >
                      {billingAccounts.map(a => (
                        <option key={a.email} value={a.email}>{a.label || a.email}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => saveDeferredItem(i)}
                      className="w-5 h-5 flex items-center justify-center rounded bg-amber-100 hover:bg-amber-200 text-amber-700"
                      title="Save with selected account"
                    >
                      <Check size={10} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
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
              <button type="button" title="Close" onClick={() => { setShowForm(false); setEditingSub(null); setPendingFile(null); }} className="text-slate-400 hover:text-slate-600">
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
                  <label className="block text-xs font-medium text-slate-600 mb-1">Billing Account *</label>
                  <select
                    title="Billing account" value={form.account_email}
                    onChange={e => setForm(p => ({ ...p, account_email: e.target.value }))}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                      !form.account_email ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
                    }`}
                  >
                    <option value="">— Select account —</option>
                    {billingAccounts.map(a => (
                      <option key={a.email} value={a.email}>
                        {a.email}{a.label ? ` (${a.label})` : ''}
                      </option>
                    ))}
                  </select>
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
                  onClick={() => { setShowForm(false); setEditingSub(null); setPendingFile(null); }}
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
              <span>{viewCurrency} / mo</span>
              <span>Renews</span>
              <span>Status</span>
              <span className="w-20" />
            </div>

            {filtered.map(sub => {
              const ri = renewalInfo(sub);
              const isExpanded = expandedId === sub.id;
              const subInvoices = [...(invoicesMap[sub.id] || [])].sort((a, b) => {
                const da = a.invoice_date || '';
                const db = b.invoice_date || '';
                return invSortAsc ? da.localeCompare(db) : db.localeCompare(da);
              });
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
                      {viewCurrency === 'USD' ? fmtUSD(toMonthlyUSD(sub)) : fmtINR(toMonthlyINR(sub))}
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
                              <button
                                type="button"
                                onClick={() => setInvSortAsc(prev => !prev)}
                                className="flex items-center gap-1 hover:text-slate-600 transition-colors"
                                title={invSortAsc ? 'Sorted oldest first — click to reverse' : 'Sorted newest first — click to reverse'}
                              >
                                Date <ArrowUpDown size={10} />
                              </button>
                              <span>Period</span>
                              <span>Original</span>
                              <span>{viewCurrency}</span>
                              <span />
                            </div>
                          )}
                          {subInvoices.map(inv => editingInvId === inv.id ? (
                            <div key={inv.id} className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr_auto] gap-2 py-2 items-center text-xs bg-amber-50/50 -mx-2 px-2 rounded-lg">
                              <input value={editInvForm.invoice_number} onChange={e => setEditInvForm(f => ({ ...f, invoice_number: e.target.value }))} className="border border-slate-200 rounded px-1.5 py-1 text-xs w-full" placeholder="Invoice #" />
                              <input type="date" value={editInvForm.invoice_date} onChange={e => setEditInvForm(f => ({ ...f, invoice_date: e.target.value }))} className="border border-slate-200 rounded px-1.5 py-1 text-xs w-full" />
                              <div className="flex gap-1">
                                <input type="date" value={editInvForm.billing_period_from} onChange={e => setEditInvForm(f => ({ ...f, billing_period_from: e.target.value }))} className="border border-slate-200 rounded px-1 py-1 text-xs flex-1" title="Period from" />
                                <input type="date" value={editInvForm.billing_period_to} onChange={e => setEditInvForm(f => ({ ...f, billing_period_to: e.target.value }))} className="border border-slate-200 rounded px-1 py-1 text-xs flex-1" title="Period to" />
                              </div>
                              <div className="flex gap-1 items-center">
                                <select value={editInvForm.currency} onChange={e => setEditInvForm(f => ({ ...f, currency: e.target.value }))} className="border border-slate-200 rounded px-1 py-1 text-xs w-14">
                                  <option value="USD">USD</option>
                                  <option value="INR">INR</option>
                                </select>
                                <input value={editInvForm.total_amount} onChange={e => setEditInvForm(f => ({ ...f, total_amount: e.target.value }))} className="border border-slate-200 rounded px-1.5 py-1 text-xs flex-1 w-16" placeholder="Total" />
                              </div>
                              <input value={editInvForm.exchange_rate} onChange={e => setEditInvForm(f => ({ ...f, exchange_rate: e.target.value }))} className="border border-slate-200 rounded px-1.5 py-1 text-xs w-full" placeholder="Ex. Rate" title="Exchange rate" />
                              <div className="flex items-center gap-1">
                                <button type="button" onClick={() => saveEditInvoice(sub.id)} className="w-5 h-5 flex items-center justify-center rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-700" title="Save"><Check size={10} /></button>
                                <button type="button" onClick={() => setEditingInvId(null)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 text-slate-500" title="Cancel"><X size={10} /></button>
                              </div>
                            </div>
                          ) : (
                            <div key={inv.id} className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr_auto] gap-3 py-2 items-center text-xs">
                              <span className="text-slate-700 font-medium">{inv.invoice_number || '—'}</span>
                              <span className="text-slate-500">{fmtDate(inv.invoice_date)}</span>
                              <span className="text-slate-500">
                                {inv.billing_period_from && inv.billing_period_to
                                  ? `${fmtDate(inv.billing_period_from)} – ${fmtDate(inv.billing_period_to)}`
                                  : '—'}
                              </span>
                              <span className="text-slate-500 tabular-nums">{fmtCur(inv.total_amount, inv.currency)}</span>
                              <span className="text-slate-800 font-semibold tabular-nums">
                                {viewCurrency === 'USD' ? fmtUSD(invToUSD(inv)) : fmtINR(invToINR(inv))}
                              </span>
                              <div className="flex items-center gap-1">
                                {inv.file_url && (
                                  <button
                                    type="button"
                                    title="View invoice"
                                    onClick={() => setViewingFile({ url: inv.file_url!, name: inv.file_name || inv.invoice_number || 'Invoice' })}
                                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-indigo-50 text-slate-400 hover:text-indigo-600"
                                  >
                                    <Eye size={12} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  title="Edit invoice"
                                  onClick={() => startEditInvoice(inv)}
                                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600"
                                >
                                  <Pencil size={11} />
                                </button>
                                {reassigningInvId === inv.id ? (
                                  <div className="flex items-center gap-1">
                                    <select
                                      title="Move to subscription"
                                      value={reassignTargetSubId}
                                      onChange={e => setReassignTargetSubId(e.target.value)}
                                      className="text-xs border border-indigo-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 max-w-[160px]"
                                    >
                                      <option value="">— pick subscription —</option>
                                      {subs.filter(s => s.id !== sub.id).map(s => (
                                        <option key={s.id} value={s.id}>
                                          {s.vendor_name}{s.account_email ? ` (${s.account_email})` : ''}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      title="Confirm move"
                                      onClick={() => handleReassignInvoice(inv.id, sub.id, reassignTargetSubId)}
                                      className="w-5 h-5 flex items-center justify-center rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-600"
                                    >
                                      <Check size={10} />
                                    </button>
                                    <button
                                      type="button"
                                      title="Cancel"
                                      onClick={() => { setReassigningInvId(null); setReassignTargetSubId(''); }}
                                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 text-slate-500"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    title="Move to different subscription"
                                    onClick={() => { setReassigningInvId(inv.id); setReassignTargetSubId(''); setDeletingInvId(null); }}
                                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600"
                                  >
                                    <ArrowRightLeft size={11} />
                                  </button>
                                )}
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
                                    onClick={() => { setDeletingInvId(inv.id); setReassigningInvId(null); }}
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

      {/* ── File viewer modal ── */}
      {viewingFile && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setViewingFile(null)}
        >
          <div
            className="bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <p className="text-sm font-semibold text-slate-800 truncate flex-1 mr-4">{viewingFile.name}</p>
              <div className="flex items-center gap-3">
                <a
                  href={viewingFile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium whitespace-nowrap"
                >
                  <ExternalLink size={13} /> Open in new tab
                </a>
                <button
                  type="button"
                  onClick={() => setViewingFile(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              {/\.(pdf)$/i.test(viewingFile.url) || viewingFile.url.includes('pdf') ? (
                <iframe
                  src={viewingFile.url}
                  className="w-full h-full"
                  style={{ minHeight: '70vh' }}
                  title={viewingFile.name}
                />
              ) : (
                <div className="flex items-center justify-center h-full p-4 bg-slate-50" style={{ minHeight: '50vh' }}>
                  <img
                    src={viewingFile.url}
                    alt={viewingFile.name}
                    className="max-w-full max-h-full object-contain rounded-lg"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={dialog.open}
        title={dialog.title}
        message={dialog.message}
        mode={dialog.mode}
        variant={dialog.variant}
        actionLabel={dialog.actionLabel}
        onConfirm={() => { dialog.onConfirm?.(); closeDialog(); }}
        onCancel={closeDialog}
      />
    </div>
  );
}

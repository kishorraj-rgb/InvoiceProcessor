import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import {
  Package, Plus, Download, FileSpreadsheet, Search,
  ChevronDown, Filter, X, Pencil, Trash2, History,
  Clock, AlertTriangle, CheckCircle2,
  Monitor, Laptop, Cpu, Video, Keyboard, Mouse,
  Headphones, Smartphone, Tablet, Printer, Armchair,
  Users, Network, type LucideIcon,
} from 'lucide-react';
import {
  getAssets, getNextAssetTag, createAsset, updateAsset,
  deleteAsset, getAssetHistory, addAssetHistory,
} from '../lib/supabase';
import type { Asset, AssetHistory } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────
const ASSET_TYPES = [
  'Monitor', 'Display', 'Laptop', 'Desktop / Computing Device', 'Webcam',
  'Keyboard', 'Mouse', 'Headset', 'Phone', 'Tablet', 'Printer',
  'Furniture / Mount', 'Classroom / Meeting Equipment',
  'Networking Equipment', 'Other',
];

const STATUS_LABELS: Record<Asset['status'], string> = {
  available:   'Available',
  assigned:    'Assigned',
  under_repair: 'Under Repair',
  retired:     'Retired',
};

const STATUS_STYLE: Record<Asset['status'], string> = {
  available:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  assigned:    'bg-blue-100 text-blue-700 border-blue-200',
  under_repair: 'bg-amber-100 text-amber-700 border-amber-200',
  retired:     'bg-slate-100 text-slate-600 border-slate-200',
};

// ── Asset type icon config ─────────────────────────────────────────────────────
const ASSET_TYPE_CONFIG: Record<string, { icon: LucideIcon; gradient: string }> = {
  'Monitor':                        { icon: Monitor,    gradient: 'from-cyan-400 to-cyan-600' },
  'Display':                        { icon: Monitor,    gradient: 'from-teal-400 to-teal-600' },
  'Laptop':                         { icon: Laptop,     gradient: 'from-indigo-400 to-indigo-600' },
  'Desktop / Computing Device':     { icon: Cpu,        gradient: 'from-slate-500 to-slate-700' },
  'Webcam':                         { icon: Video,      gradient: 'from-emerald-400 to-emerald-600' },
  'Keyboard':                       { icon: Keyboard,   gradient: 'from-violet-400 to-violet-600' },
  'Mouse':                          { icon: Mouse,      gradient: 'from-purple-400 to-purple-600' },
  'Headset':                        { icon: Headphones, gradient: 'from-orange-400 to-orange-600' },
  'Phone':                          { icon: Smartphone, gradient: 'from-blue-400 to-blue-600' },
  'Tablet':                         { icon: Tablet,     gradient: 'from-sky-400 to-sky-600' },
  'Printer':                        { icon: Printer,    gradient: 'from-amber-400 to-amber-600' },
  'Furniture / Mount':              { icon: Armchair,   gradient: 'from-amber-500 to-orange-600' },
  'Classroom / Meeting Equipment':  { icon: Users,      gradient: 'from-blue-500 to-indigo-600' },
  'Networking Equipment':           { icon: Network,    gradient: 'from-cyan-500 to-blue-600' },
};

function AssetTypeIcon({ type }: { type: string }) {
  const cfg = ASSET_TYPE_CONFIG[type] ?? { icon: Package, gradient: 'from-slate-400 to-slate-600' };
  const Icon = cfg.icon;
  return (
    <div className={`w-8 h-8 bg-gradient-to-br ${cfg.gradient} rounded-lg flex items-center justify-center shrink-0`}>
      <Icon size={14} className="text-white" strokeWidth={1.8} />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatCurrency(v?: number | null) {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
}

function formatDate(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function num(v: string): number | undefined {
  const n = parseFloat(v);
  return isNaN(n) ? undefined : n;
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Asset['status'] }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── Filter pill dropdown ──────────────────────────────────────────────────────
function FilterPill({ label, value, options, onChange }: {
  label: string; value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = value !== 'all';
  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
          active ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium'
                 : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
        }`}>
        <Filter size={13} className={active ? 'text-indigo-500' : 'text-slate-400'} />
        {active ? selected?.label : label}
        <ChevronDown size={13} className="opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 min-w-max bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1.5 overflow-hidden">
            {options.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2 text-xs hover:bg-slate-50 ${value === opt.value ? 'text-indigo-600 font-semibold bg-indigo-50' : 'text-slate-700'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Form field helpers ────────────────────────────────────────────────────────
type AssetForm = {
  asset_tag: string; asset_type: string; asset_name: string;
  brand: string; model: string; serial_number: string; purchased_from: string;
  purchase_date: string; warranty_expiry: string;
  base_cost: string; gst_percent: string; gst_amount: string; total_cost: string;
  status: Asset['status']; assigned_to: string; notes: string;
};

const emptyForm: AssetForm = {
  asset_tag: '', asset_type: '', asset_name: '',
  brand: '', model: '', serial_number: '', purchased_from: '',
  purchase_date: '', warranty_expiry: '',
  base_cost: '', gst_percent: '', gst_amount: '', total_cost: '',
  status: 'available', assigned_to: '', notes: '',
};

function assetToForm(a: Asset): AssetForm {
  return {
    asset_tag: a.asset_tag, asset_type: a.asset_type, asset_name: a.asset_name,
    brand: a.brand || '', model: a.model || '', serial_number: a.serial_number || '',
    purchased_from: a.purchased_from || '', purchase_date: a.purchase_date || '',
    warranty_expiry: a.warranty_expiry || '', base_cost: a.base_cost != null ? String(a.base_cost) : '',
    gst_percent: a.gst_percent != null ? String(a.gst_percent) : '',
    gst_amount: a.gst_amount != null ? String(a.gst_amount) : '',
    total_cost: a.total_cost != null ? String(a.total_cost) : '',
    status: a.status, assigned_to: a.assigned_to || '', notes: a.notes || '',
  };
}

// ── Add/Edit Asset Modal ──────────────────────────────────────────────────────
function AssetModal({ initial, editAsset, onClose, onSaved }: {
  initial: AssetForm; editAsset: Asset | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<AssetForm>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field: keyof AssetForm, value: string) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Auto-compute GST amount and total
      const base = parseFloat(next.base_cost) || 0;
      const pct  = parseFloat(next.gst_percent) || 0;
      if (field === 'base_cost' || field === 'gst_percent') {
        const gstAmt = base * pct / 100;
        next.gst_amount = gstAmt > 0 ? gstAmt.toFixed(2) : '';
        next.total_cost = base > 0 ? (base + gstAmt).toFixed(2) : '';
      }
      if (field === 'gst_amount') {
        next.total_cost = base > 0 ? (base + (parseFloat(value) || 0)).toFixed(2) : '';
      }
      return next;
    });
  }

  async function handleSave() {
    if (!form.asset_name.trim()) { setError('Asset Name is required.'); return; }
    if (!form.asset_type.trim()) { setError('Asset Type is required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        asset_tag:      form.asset_tag || undefined,
        asset_type:     form.asset_type,
        asset_name:     form.asset_name,
        brand:          form.brand || undefined,
        model:          form.model || undefined,
        serial_number:  form.serial_number || undefined,
        purchased_from: form.purchased_from || undefined,
        purchase_date:  form.purchase_date || undefined,
        warranty_expiry: form.warranty_expiry || undefined,
        base_cost:      num(form.base_cost),
        gst_percent:    num(form.gst_percent),
        gst_amount:     num(form.gst_amount),
        total_cost:     num(form.total_cost),
        status:         form.status,
        assigned_to:    form.assigned_to || undefined,
        notes:          form.notes || undefined,
      };

      if (editAsset) {
        await updateAsset(editAsset.id, payload);
        const changed: string[] = [];
        if (editAsset.status !== form.status) changed.push(`status → ${STATUS_LABELS[form.status]}`);
        if (editAsset.assigned_to !== form.assigned_to) changed.push(`assigned to → ${form.assigned_to || 'unassigned'}`);
        await addAssetHistory({
          asset_id: editAsset.id,
          action: changed.length ? changed.join(', ') : 'Asset updated',
          from_status: editAsset.status,
          to_status: form.status,
          assigned_to: form.assigned_to || undefined,
        });
      } else {
        const created = await createAsset(payload);
        await addAssetHistory({
          asset_id: created.id,
          action: 'Asset created',
          to_status: created.status,
          assigned_to: created.assigned_to || undefined,
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save asset.');
    } finally {
      setSaving(false);
    }
  }

  function F({ label, name, value, placeholder, type = 'text', required, half }: {
    label: string; name: keyof AssetForm; value: string; placeholder?: string;
    type?: string; required?: boolean; half?: boolean;
  }) {
    return (
      <div className={half ? '' : 'col-span-2'}>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
        <input type={type} value={value} onChange={e => set(name, e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-900">
            {editAsset ? 'Edit Asset' : 'Add New Asset'}
          </h2>
          <button type="button" aria-label="Close modal" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-4 text-sm text-red-700">
              <AlertTriangle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Row 1: Tag + Type */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Asset Tag</label>
              <input value={form.asset_tag} onChange={e => set('asset_tag', e.target.value)}
                placeholder="Auto-generated"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Asset Type <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <select value={form.asset_type} onChange={e => set('asset_type', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none bg-white">
                  <option value="">Select type…</option>
                  {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Asset Name */}
            <F label="Asset Name" name="asset_name" value={form.asset_name}
              placeholder="e.g., Dell UltraSharp 27" required />

            {/* Brand + Model */}
            <F label="Brand" name="brand" value={form.brand} placeholder="e.g., Dell" half />
            <F label="Model" name="model" value={form.model} placeholder="e.g., U2722D" half />

            {/* Serial Number */}
            <F label="Serial Number" name="serial_number" value={form.serial_number} />

            {/* Purchased From */}
            <F label="Purchased From" name="purchased_from" value={form.purchased_from}
              placeholder="e.g., Amazon, Vendor Name" />

            {/* Purchase Date + Warranty */}
            <F label="Purchase Date" name="purchase_date" value={form.purchase_date} type="date" half />
            <F label="Warranty Expiry" name="warranty_expiry" value={form.warranty_expiry} type="date" half />

            {/* Cost section */}
            <div className="col-span-2">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Base Cost (₹)</label>
                  <input type="number" value={form.base_cost} onChange={e => set('base_cost', e.target.value)}
                    placeholder="Excl. GST"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">GST %</label>
                  <input type="number" value={form.gst_percent} onChange={e => set('gst_percent', e.target.value)}
                    placeholder="e.g., 18"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">GST Amount (₹)</label>
                  <input type="number" value={form.gst_amount} onChange={e => set('gst_amount', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Total Cost (₹)</label>
                  <input type="number" value={form.total_cost} readOnly
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700 font-medium" />
                </div>
              </div>
            </div>

            {/* Status + Assigned To */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Status <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <select value={form.status} onChange={e => set('status', e.target.value as Asset['status'])}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none bg-white">
                  <option value="available">Available</option>
                  <option value="assigned">Assigned</option>
                  <option value="under_repair">Under Repair</option>
                  <option value="retired">Retired</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <F label="Assigned To" name="assigned_to" value={form.assigned_to}
              placeholder="Name or email" half />

            {/* Notes */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                rows={2} placeholder="Any additional information…"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300 resize-none" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : editAsset ? 'Save Changes' : 'Add Asset'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Excel Import Modal ────────────────────────────────────────────────────────
type ImportRow = Omit<Partial<Asset>, 'id' | 'created_at' | 'updated_at'> & {
  asset_type: string; asset_name: string;
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function mapRow(raw: Record<string, unknown>): ImportRow | null {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    // cellDates: true returns JS Date objects — convert to YYYY-MM-DD for SQL
    if (v instanceof Date) {
      r[normalizeHeader(k)] = v.toISOString().slice(0, 10);
    } else {
      r[normalizeHeader(k)] = String(v ?? '').trim();
    }
  }

  const asset_name = r['asset_name'] || r['name'] || '';
  const asset_type = r['asset_type'] || r['type'] || '';
  if (!asset_name) return null;

  const statusMap: Record<string, Asset['status']> = {
    available: 'available', assigned: 'assigned',
    under_repair: 'under_repair', 'under repair': 'under_repair', retired: 'retired',
  };

  return {
    asset_type: asset_type || 'Other',
    asset_name,
    brand: r['brand'] || undefined,
    model: r['model'] || undefined,
    serial_number: r['serial_number'] || r['serial'] || undefined,
    purchased_from: r['purchased_from'] || r['vendor'] || undefined,
    purchase_date: r['purchase_date'] || undefined,
    base_cost: r['base_cost'] || r['base_cost_excl_gst'] ? parseFloat(r['base_cost'] || r['base_cost_excl_gst']) || undefined : undefined,
    gst_percent: r['gst_percent'] || r['gst'] ? parseFloat(r['gst_percent'] || r['gst']) || undefined : undefined,
    gst_amount: r['gst_amount'] ? parseFloat(r['gst_amount']) || undefined : undefined,
    total_cost: r['total_cost'] || r['purchase_cost_incl_gst'] ? parseFloat(r['total_cost'] || r['purchase_cost_incl_gst']) || undefined : undefined,
    status: statusMap[(r['status'] || '').toLowerCase()] ?? 'available',
    notes: r['notes'] || undefined,
  };
}

function ImportModal({ onClose, onImported, startingTag }: {
  onClose: () => void; onImported: () => void; startingTag: number;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const onDrop = useCallback((files: File[]) => {
    setError('');
    const file = files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        const parsed = data.map(mapRow).filter((r): r is ImportRow => r !== null);
        setRows(parsed);
      } catch {
        setError('Could not parse the file. Make sure it is a valid .xlsx or .xls file.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  async function handleImport() {
    setImporting(true); setProgress(0);
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const tag = 'AST' + String(startingTag + i).padStart(3, '0');
        const created = await createAsset({ ...row, asset_tag: tag });
        await addAssetHistory({ asset_id: created.id, action: 'Imported from Excel', to_status: created.status });
        setProgress(i + 1);
      }
      onImported();
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e !== null && 'message' in e
          ? String((e as { message: unknown }).message)
          : 'Import failed.';
      setError(msg);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet size={18} className="text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">Import Assets from Excel</h2>
          </div>
          <button type="button" aria-label="Close import modal" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm text-slate-500 mb-4 leading-relaxed">
            Upload an Excel file with asset data. Columns should include:{' '}
            <span className="font-medium text-slate-700">
              Asset Name, Asset Type, Brand, Model, Serial Number, Purchase Date,
              Base Cost (Excl. GST), GST %, GST Amount, Purchase Cost (Incl. GST),
              Status, Notes, Purchased From.
            </span>
          </p>

          {/* Drop zone */}
          <div {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors mb-4 ${
              isDragActive ? 'border-indigo-400 bg-indigo-50' : rows.length > 0
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
            }`}>
            <input {...getInputProps()} />
            {rows.length > 0 ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 size={28} className="text-emerald-500" />
                <p className="font-semibold text-emerald-700">{rows.length} asset(s) ready to import</p>
                <p className="text-xs text-slate-400">Drop another file to replace</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <FileSpreadsheet size={28} />
                <p className="font-medium text-slate-600">Drag &amp; drop an Excel file here, or click to select</p>
                <p className="text-xs">Supports .xlsx and .xls files</p>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-4 text-sm text-red-700">
              <AlertTriangle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}

          {importing && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Importing…</span>
                <span>{progress} / {rows.length}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="bg-indigo-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${(progress / rows.length) * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleImport}
            disabled={rows.length === 0 || importing}
            className="px-5 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40">
            Import {rows.length > 0 ? `${rows.length} Assets` : '0 Assets'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── History Modal ─────────────────────────────────────────────────────────────
function HistoryModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const [history, setHistory] = useState<AssetHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAssetHistory(asset.id).then(setHistory).finally(() => setLoading(false));
  }, [asset.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock size={15} className="text-slate-400" /> Asset History
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{asset.asset_tag} · {asset.asset_name}</p>
          </div>
          <button type="button" aria-label="Close history" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-10">No history yet.</p>
          ) : (
            <div className="relative">
              <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200" />
              <div className="space-y-4">
                {history.map((h, i) => (
                  <div key={h.id} className="relative flex gap-4 pl-8">
                    <div className={`absolute left-1.5 top-1 w-3 h-3 rounded-full border-2 border-white ${i === 0 ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{h.action}</p>
                      {h.assigned_to && (
                        <p className="text-xs text-slate-500 mt-0.5">Assigned to: {h.assigned_to}</p>
                      )}
                      {(h.from_status || h.to_status) && h.from_status !== h.to_status && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {h.from_status && STATUS_LABELS[h.from_status as Asset['status']]} → {h.to_status && STATUS_LABELS[h.to_status as Asset['status']]}
                        </p>
                      )}
                      {h.notes && <p className="text-xs text-slate-500 italic mt-0.5">{h.notes}</p>}
                      <p className="text-[11px] text-slate-400 mt-1">
                        {new Date(h.created_at).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Delete confirmation ───────────────────────────────────────────────────────
function DeleteConfirm({ asset, onClose, onDeleted }: {
  asset: Asset; onClose: () => void; onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function confirm() {
    setDeleting(true);
    try { await deleteAsset(asset.id); onDeleted(); }
    finally { setDeleting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 size={20} className="text-red-600" />
        </div>
        <h3 className="text-base font-bold text-slate-900 text-center mb-1">Delete Asset?</h3>
        <p className="text-sm text-slate-500 text-center mb-6">
          <span className="font-medium">{asset.asset_tag} — {asset.asset_name}</span> will be permanently deleted along with its history.
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={deleting}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCsv(assets: Asset[]) {
  const headers = [
    'Asset Tag', 'Asset Type', 'Asset Name', 'Brand', 'Model', 'Serial Number',
    'Purchased From', 'Purchase Date', 'Warranty Expiry',
    'Base Cost', 'GST %', 'GST Amount', 'Total Cost',
    'Status', 'Assigned To', 'Notes', 'Created At',
  ];
  const rows = assets.map(a => [
    a.asset_tag, a.asset_type, a.asset_name, a.brand || '', a.model || '',
    a.serial_number || '', a.purchased_from || '',
    a.purchase_date || '', a.warranty_expiry || '',
    a.base_cost ?? '', a.gst_percent ?? '', a.gst_amount ?? '', a.total_cost ?? '',
    a.status, a.assigned_to || '', a.notes || '',
    new Date(a.created_at).toLocaleDateString('en-IN'),
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `assets-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Assets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextTag, setNextTag] = useState('AST001');
  const [nextTagNum, setNextTagNum] = useState(1);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal states
  const [addModal, setAddModal] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null);
  const [deleteAssetObj, setDeleteAssetObj] = useState<Asset | null>(null);
  const [importModal, setImportModal] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [data, tag] = await Promise.all([getAssets(), getNextAssetTag()]);
      setAssets(data);
      setNextTag(tag);
      setNextTagNum(data.length + 1);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Stats
  const stats = useMemo(() => ({
    total:      assets.length,
    available:  assets.filter(a => a.status === 'available').length,
    assigned:   assets.filter(a => a.status === 'assigned').length,
    under_repair: assets.filter(a => a.status === 'under_repair').length,
  }), [assets]);

  // Unique types for filter
  const typeOptions = useMemo(() => {
    const types = Array.from(new Set(assets.map(a => a.asset_type)));
    return [{ value: 'all', label: 'All Types' }, ...types.map(t => ({ value: t, label: t }))];
  }, [assets]);

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assets.filter(a => {
      const matchSearch = a.asset_name.toLowerCase().includes(q) ||
        a.asset_tag.toLowerCase().includes(q) ||
        (a.serial_number || '').toLowerCase().includes(q) ||
        (a.brand || '').toLowerCase().includes(q) ||
        (a.assigned_to || '').toLowerCase().includes(q);
      const matchType = typeFilter === 'all' || a.asset_type === typeFilter;
      const matchStatus = statusFilter === 'all' || a.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    });
  }, [assets, search, typeFilter, statusFilter]);

  const anyFilter = search || typeFilter !== 'all' || statusFilter !== 'all';

  return (
    <>
      {/* Modals */}
      {(addModal || editAsset) && (
        <AssetModal
          initial={editAsset ? assetToForm(editAsset) : { ...emptyForm, asset_tag: nextTag }}
          editAsset={editAsset}
          onClose={() => { setAddModal(false); setEditAsset(null); }}
          onSaved={() => { setAddModal(false); setEditAsset(null); load(); }}
        />
      )}
      {historyAsset && (
        <HistoryModal asset={historyAsset} onClose={() => setHistoryAsset(null)} />
      )}
      {deleteAssetObj && (
        <DeleteConfirm
          asset={deleteAssetObj}
          onClose={() => setDeleteAssetObj(null)}
          onDeleted={() => { setDeleteAssetObj(null); load(); }}
        />
      )}
      {importModal && (
        <ImportModal
          onClose={() => setImportModal(false)}
          onImported={() => { setImportModal(false); load(); }}
          startingTag={nextTagNum}
        />
      )}

      <div className="p-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 mb-5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Package size={22} className="text-orange-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Asset Management</h1>
              <p className="text-slate-400 text-sm mt-0.5">{assets.length} total assets</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => exportCsv(filtered)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors font-medium">
              <Download size={14} /> Export CSV
            </button>
            <button type="button" onClick={() => setImportModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors font-medium">
              <FileSpreadsheet size={14} /> Import from Excel
            </button>
            <button type="button" onClick={() => setAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors">
              <Plus size={15} /> Add Asset
            </button>
          </div>
        </div>

        {/* ── Stats cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4 mb-5">
          {[
            { label: 'Total Assets', value: stats.total, color: 'text-slate-800', bg: 'bg-white' },
            { label: 'Available',    value: stats.available,  color: 'text-emerald-600', bg: 'bg-white' },
            { label: 'Assigned',     value: stats.assigned,   color: 'text-blue-600',    bg: 'bg-white' },
            { label: 'Under Repair', value: stats.under_repair, color: 'text-amber-500', bg: 'bg-white' },
          ].map(card => (
            <div key={card.label} className={`${card.bg} rounded-xl border border-slate-200 px-5 py-4 shadow-sm`}>
              <p className="text-sm text-slate-500 mb-1">{card.label}</p>
              <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* ── Search + Filters ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-56 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search assets, tags, serial numbers…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white placeholder-slate-400" />
          </div>

          <FilterPill label="All Types" value={typeFilter} onChange={setTypeFilter} options={typeOptions} />
          <FilterPill
            label="All Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all',         label: 'All Status' },
              { value: 'available',   label: 'Available' },
              { value: 'assigned',    label: 'Assigned' },
              { value: 'under_repair', label: 'Under Repair' },
              { value: 'retired',     label: 'Retired' },
            ]}
          />
          {anyFilter && (
            <button type="button"
              onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); }}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded">
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* ── Table ────────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 flex items-center justify-center py-28 shadow-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
              <p className="text-sm text-slate-400">Loading assets…</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 text-center py-28 shadow-sm">
            <Package size={40} className="text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {anyFilter ? 'No assets match your filters' : 'No assets yet'}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              {anyFilter ? '' : 'Click "Add Asset" or import from Excel to get started'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Table header count */}
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Assets ({filtered.length})</span>
              {anyFilter && (
                <button type="button"
                  onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); }}
                  className="text-xs text-indigo-600 hover:underline">
                  Clear filters
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-white">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Asset</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Tag</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Serial #</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Assigned To</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Purchase Date</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Cost (₹)</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((asset, idx) => (
                    <tr key={asset.id}
                      className={`border-b border-slate-100 transition-colors ${
                        idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/40 hover:bg-slate-100/60'
                      }`}>
                      {/* Asset name + type */}
                      <td className="px-4 py-3.5 max-w-[260px]">
                        <div className="flex items-center gap-3">
                          <AssetTypeIcon type={asset.asset_type} />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">{asset.asset_name}</p>
                            <p className="text-xs text-slate-400 truncate">
                              {[asset.asset_type, asset.brand, asset.model].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </div>
                      </td>
                      {/* Tag */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          {asset.asset_tag}
                        </span>
                      </td>
                      {/* Serial */}
                      <td className="px-4 py-3.5 text-slate-500 font-mono text-xs whitespace-nowrap">
                        {asset.serial_number || <span className="text-slate-300">—</span>}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <StatusBadge status={asset.status} />
                      </td>
                      {/* Assigned To */}
                      <td className="px-4 py-3.5 text-slate-600 text-[13px] max-w-[140px] truncate">
                        {asset.assigned_to || <span className="text-slate-300">—</span>}
                      </td>
                      {/* Purchase date */}
                      <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap text-[13px]">
                        {formatDate(asset.purchase_date)}
                      </td>
                      {/* Cost */}
                      <td className="px-4 py-3.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {formatCurrency(asset.total_cost)}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" aria-label="View history"
                            onClick={() => setHistoryAsset(asset)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                            <History size={14} />
                          </button>
                          <button type="button" aria-label="Edit asset"
                            onClick={() => setEditAsset(asset)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                            <Pencil size={14} />
                          </button>
                          <button type="button" aria-label="Delete asset"
                            onClick={() => setDeleteAssetObj(asset)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
              <span className="text-xs text-slate-400">
                Showing {filtered.length} of {assets.length} assets
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

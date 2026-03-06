import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Save,
  Plus,
  Trash2,
  Upload,
  FileText,
  Download,
  Copy,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import {
  fetchCompanyData,
  saveCompanyData,
  EMPTY_COMPANY,
  type CompanyData,
  type Signatory,
} from '../lib/admin';
import { supabase } from '../lib/supabase';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function uploadAdminFile(file: File, prefix: string): Promise<string | null> {
  const ext = file.name.split('.').pop();
  const path = `admin-docs/${prefix}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('invoice-files')
    .upload(path, file, { upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from('invoice-files').getPublicUrl(path);
  return data.publicUrl;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all shrink-0"
      title="Copy to clipboard"
    >
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}

function CopyAllButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
    >
      {copied ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy All</>}
    </button>
  );
}

// ── Document viewer item in right panel ──────────────────────────────────────

interface DocItem {
  label: string;
  url: string;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function Admin() {
  const [data, setData] = useState<CompanyData>({ ...EMPTY_COMPANY });
  const [rowId, setRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<DocItem | null>(null);

  // Load from Supabase on mount
  useEffect(() => {
    fetchCompanyData()
      .then(({ id, data: d }) => {
        setRowId(id);
        setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function update(patch: Partial<CompanyData>) {
    setData(prev => ({ ...prev, ...patch }));
  }

  async function save() {
    setSaving(true);
    try {
      const id = await saveCompanyData(rowId, data);
      setRowId(id);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }

  function updateSignatory(idx: number, patch: Partial<Signatory>) {
    const updated = [...data.signatories];
    updated[idx] = { ...updated[idx], ...patch };
    update({ signatories: updated });
  }

  function addSignatory() {
    update({
      signatories: [
        ...data.signatories,
        { name: '', designation: '', phone: '', email: '', pan: '', aadhaar: '' },
      ],
    });
  }

  function removeSignatory(idx: number) {
    update({ signatories: data.signatories.filter((_, i) => i !== idx) });
  }

  // File upload handler
  async function handleFileUpload(
    field: keyof CompanyData | { sigIdx: number; sigField: 'panFileUrl' | 'aadhaarFileUrl' },
    file: File,
  ) {
    const key = typeof field === 'string' ? field : `sig-${field.sigIdx}-${field.sigField}`;
    setUploading(key);
    const prefix =
      typeof field === 'string'
        ? field.replace('FileUrl', '')
        : `sig-${field.sigIdx}-${field.sigField.replace('FileUrl', '')}`;
    const url = await uploadAdminFile(file, prefix);
    if (url) {
      if (typeof field === 'string') {
        update({ [field]: url });
      } else {
        updateSignatory(field.sigIdx, { [field.sigField]: url });
      }
    }
    setUploading(null);
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingField, setPendingField] = useState<
    keyof CompanyData | { sigIdx: number; sigField: 'panFileUrl' | 'aadhaarFileUrl' } | null
  >(null);

  function triggerUpload(field: typeof pendingField) {
    setPendingField(field);
    fileInputRef.current?.click();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && pendingField) handleFileUpload(pendingField, file);
    e.target.value = '';
  }

  // ── Build quick-reference text ──
  const buildRefText = useCallback(() => {
    const lines: string[] = [];
    if (data.companyName) lines.push(`Company: ${data.companyName}`);
    if (data.address) lines.push(`Address: ${data.address}`);
    if (data.pan) lines.push(`PAN: ${data.pan}`);
    if (data.tan) lines.push(`TAN: ${data.tan}`);
    if (data.cin) lines.push(`CIN: ${data.cin}`);
    if (data.gstin) lines.push(`GSTIN: ${data.gstin}`);
    if (data.dateOfIncorporation) lines.push(`Incorporated: ${data.dateOfIncorporation}`);
    if (data.signatories.length > 0) {
      lines.push('');
      lines.push('--- Signatories ---');
      data.signatories.forEach((s, i) => {
        lines.push(`${i + 1}. ${s.name || '(unnamed)'}${s.designation ? ` — ${s.designation}` : ''}`);
        if (s.phone) lines.push(`   Phone: ${s.phone}`);
        if (s.email) lines.push(`   Email: ${s.email}`);
        if (s.pan) lines.push(`   PAN: ${s.pan}`);
        if (s.aadhaar) lines.push(`   Aadhaar: ${s.aadhaar}`);
      });
    }
    if (data.pocName || data.pocPhone || data.pocEmail) {
      lines.push('');
      lines.push('--- Point of Contact ---');
      if (data.pocName) lines.push(`Name: ${data.pocName}`);
      if (data.pocPhone) lines.push(`Phone: ${data.pocPhone}`);
      if (data.pocEmail) lines.push(`Email: ${data.pocEmail}`);
    }
    return lines.join('\n');
  }, [data]);

  // ── Collect all uploaded documents ──
  const allDocs: DocItem[] = [];
  if (data.panFileUrl) allDocs.push({ label: 'Company PAN', url: data.panFileUrl });
  if (data.tanFileUrl) allDocs.push({ label: 'TAN Certificate', url: data.tanFileUrl });
  if (data.cinFileUrl) allDocs.push({ label: 'Certificate of Incorporation', url: data.cinFileUrl });
  if (data.gstinFileUrl) allDocs.push({ label: 'GST Certificate', url: data.gstinFileUrl });
  if (data.incorporationFileUrl)
    allDocs.push({ label: 'Incorporation Certificate', url: data.incorporationFileUrl });
  data.signatories.forEach((s, i) => {
    if (s.panFileUrl) allDocs.push({ label: `${s.name || `Signatory ${i + 1}`} — PAN`, url: s.panFileUrl });
    if (s.aadhaarFileUrl)
      allDocs.push({ label: `${s.name || `Signatory ${i + 1}`} — Aadhaar`, url: s.aadhaarFileUrl });
  });

  const inputClass =
    'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300';
  const labelClass = 'text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block';

  function ViewBtn({ url, label }: { url?: string; label: string }) {
    if (!url) return null;
    return (
      <button
        type="button"
        onClick={() => setViewingDoc({ label, url })}
        className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
      >
        <FileText size={11} /> {label}
      </button>
    );
  }

  function UploadBtn({
    field,
    label,
    isUploading,
  }: {
    field: typeof pendingField;
    label: string;
    isUploading: boolean;
  }) {
    return (
      <button
        type="button"
        onClick={() => triggerUpload(field)}
        disabled={isUploading}
        className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-600 border border-slate-200 px-2 py-1 rounded-md hover:bg-indigo-50 transition-colors disabled:opacity-40"
      >
        <Upload size={10} /> {isUploading ? 'Uploading...' : label}
      </button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 gap-2">
        <Loader2 size={18} className="animate-spin" /> Loading company data...
      </div>
    );
  }

  return (
    <div className="p-8 flex gap-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onFileSelected}
        accept=".pdf,.jpg,.jpeg,.png"
      />

      {/* ═══ LEFT COLUMN — Form ═══ */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 mb-5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={22} className="text-slate-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Admin</h1>
              <p className="text-slate-400 text-sm mt-0.5">
                Company registration details, signatories, and document repository
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                <Check size={11} /> Saved
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </button>
          </div>
        </div>

        {/* Company Details */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Company Details</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Registration numbers, tax IDs, and incorporation details
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Company Name</label>
                <input
                  className={inputClass}
                  value={data.companyName}
                  onChange={e => update({ companyName: e.target.value })}
                  placeholder="Legal entity name"
                />
              </div>
              <div>
                <label className={labelClass}>Address</label>
                <input
                  className={inputClass}
                  value={data.address}
                  onChange={e => update({ address: e.target.value })}
                  placeholder="Registered address"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Company PAN</label>
                <div className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    value={data.pan}
                    onChange={e => update({ pan: e.target.value.toUpperCase() })}
                    placeholder="AANCC1234A"
                  />
                  <CopyButton text={data.pan} />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <UploadBtn field="panFileUrl" label="Upload PAN" isUploading={uploading === 'panFileUrl'} />
                  <ViewBtn url={data.panFileUrl} label="View PAN" />
                </div>
              </div>
              <div>
                <label className={labelClass}>TAN</label>
                <div className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    value={data.tan}
                    onChange={e => update({ tan: e.target.value.toUpperCase() })}
                    placeholder="BLRC12345B"
                  />
                  <CopyButton text={data.tan} />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <UploadBtn field="tanFileUrl" label="Upload TAN" isUploading={uploading === 'tanFileUrl'} />
                  <ViewBtn url={data.tanFileUrl} label="View TAN" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>CIN</label>
                <div className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    value={data.cin}
                    onChange={e => update({ cin: e.target.value.toUpperCase() })}
                    placeholder="U62011KA2025PTC123456"
                  />
                  <CopyButton text={data.cin} />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <UploadBtn
                    field="cinFileUrl"
                    label="Upload Certificate"
                    isUploading={uploading === 'cinFileUrl'}
                  />
                  <ViewBtn url={data.cinFileUrl} label="View Certificate" />
                </div>
              </div>
              <div>
                <label className={labelClass}>GSTIN</label>
                <div className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    value={data.gstin}
                    onChange={e => update({ gstin: e.target.value.toUpperCase() })}
                    placeholder="29AANCC1234A1ZL"
                  />
                  <CopyButton text={data.gstin} />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <UploadBtn
                    field="gstinFileUrl"
                    label="Upload GST Certificate"
                    isUploading={uploading === 'gstinFileUrl'}
                  />
                  <ViewBtn url={data.gstinFileUrl} label="View GST Certificate" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Date of Incorporation</label>
                <input
                  type="date"
                  className={inputClass}
                  value={data.dateOfIncorporation}
                  onChange={e => update({ dateOfIncorporation: e.target.value })}
                />
                <div className="flex items-center gap-2 mt-1.5">
                  <UploadBtn
                    field="incorporationFileUrl"
                    label="Upload Incorporation Cert"
                    isUploading={uploading === 'incorporationFileUrl'}
                  />
                  <ViewBtn url={data.incorporationFileUrl} label="View Certificate" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Authorized Signatories */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Authorized Signatories</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Directors and authorized persons with their ID documents
              </p>
            </div>
            <button
              type="button"
              onClick={addSignatory}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              <Plus size={12} /> Add Signatory
            </button>
          </div>

          <div className="p-6 space-y-6">
            {data.signatories.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">No signatories added yet</p>
            )}

            {data.signatories.map((sig, idx) => (
              <div key={idx} className="border border-slate-200 rounded-xl p-5 relative group">
                <button
                  type="button"
                  onClick={() => removeSignatory(idx)}
                  className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                  title="Remove signatory"
                >
                  <Trash2 size={14} />
                </button>

                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Signatory {idx + 1}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className={labelClass}>Name</label>
                    <input
                      className={inputClass}
                      value={sig.name}
                      onChange={e => updateSignatory(idx, { name: e.target.value })}
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Designation</label>
                    <input
                      className={inputClass}
                      value={sig.designation}
                      onChange={e => updateSignatory(idx, { designation: e.target.value })}
                      placeholder="Director / Partner"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input
                      className={inputClass}
                      value={sig.phone}
                      onChange={e => updateSignatory(idx, { phone: e.target.value })}
                      placeholder="+91 99999 99999"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Email</label>
                    <input
                      type="email"
                      className={inputClass}
                      value={sig.email}
                      onChange={e => updateSignatory(idx, { email: e.target.value })}
                      placeholder="email@company.com"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>PAN</label>
                    <div className="flex items-center gap-2">
                      <input
                        className={inputClass}
                        value={sig.pan}
                        onChange={e => updateSignatory(idx, { pan: e.target.value.toUpperCase() })}
                        placeholder="ABCDE1234F"
                      />
                      <CopyButton text={sig.pan} />
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <UploadBtn
                        field={{ sigIdx: idx, sigField: 'panFileUrl' }}
                        label="Upload PAN"
                        isUploading={uploading === `sig-${idx}-panFileUrl`}
                      />
                      <ViewBtn url={sig.panFileUrl} label="View PAN" />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Aadhaar</label>
                    <div className="flex items-center gap-2">
                      <input
                        className={inputClass}
                        value={sig.aadhaar}
                        onChange={e => updateSignatory(idx, { aadhaar: e.target.value })}
                        placeholder="1234 5678 9012"
                      />
                      <CopyButton text={sig.aadhaar} />
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <UploadBtn
                        field={{ sigIdx: idx, sigField: 'aadhaarFileUrl' }}
                        label="Upload Aadhaar"
                        isUploading={uploading === `sig-${idx}-aadhaarFileUrl`}
                      />
                      <ViewBtn url={sig.aadhaarFileUrl} label="View Aadhaar" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Point of Contact */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Point of Contact</h2>
            <p className="text-sm text-slate-500 mt-0.5">Primary contact person for the organisation</p>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Name</label>
                <input
                  className={inputClass}
                  value={data.pocName}
                  onChange={e => update({ pocName: e.target.value })}
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input
                  className={inputClass}
                  value={data.pocPhone}
                  onChange={e => update({ pocPhone: e.target.value })}
                  placeholder="+91 99999 99999"
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  className={inputClass}
                  value={data.pocEmail}
                  onChange={e => update({ pocEmail: e.target.value })}
                  placeholder="contact@company.com"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT COLUMN — Quick Reference / Document Viewer ═══ */}
      <div className="w-[420px] shrink-0 sticky top-8 self-start">
        {viewingDoc ? (
          /* ── Document Viewer ── */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-200">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={14} className="text-indigo-500 shrink-0" />
                <span className="text-sm font-semibold text-slate-900 truncate">
                  {viewingDoc.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={viewingDoc.url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                  title="Download"
                >
                  <Download size={14} />
                </a>
                <button
                  type="button"
                  onClick={() => setViewingDoc(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                  title="Close"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="bg-slate-50">
              {viewingDoc.url.match(/\.(pdf)$/i) ? (
                <iframe
                  src={viewingDoc.url}
                  className="w-full border-0"
                  style={{ height: 'calc(100vh - 200px)' }}
                  title={viewingDoc.label}
                />
              ) : (
                <img
                  src={viewingDoc.url}
                  alt={viewingDoc.label}
                  className="w-full object-contain"
                  style={{ maxHeight: 'calc(100vh - 200px)' }}
                />
              )}
            </div>
          </div>
        ) : (
          /* ── Quick Reference ── */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-sm">Quick Reference</h3>
              <CopyAllButton text={buildRefText()} />
            </div>

            {/* Company info summary */}
            <div className="px-5 py-4 space-y-3 border-b border-slate-100">
              {data.companyName && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Company
                  </p>
                  <p className="text-sm text-slate-800 font-medium">{data.companyName}</p>
                </div>
              )}
              {data.address && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Address
                  </p>
                  <p className="text-sm text-slate-700">{data.address}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {data.pan && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      PAN
                    </p>
                    <div className="flex items-center gap-1">
                      <p className="text-sm text-slate-800 font-mono">{data.pan}</p>
                      <CopyButton text={data.pan} />
                    </div>
                  </div>
                )}
                {data.tan && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      TAN
                    </p>
                    <div className="flex items-center gap-1">
                      <p className="text-sm text-slate-800 font-mono">{data.tan}</p>
                      <CopyButton text={data.tan} />
                    </div>
                  </div>
                )}
                {data.cin && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      CIN
                    </p>
                    <div className="flex items-center gap-1">
                      <p className="text-sm text-slate-800 font-mono break-all">{data.cin}</p>
                      <CopyButton text={data.cin} />
                    </div>
                  </div>
                )}
                {data.gstin && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      GSTIN
                    </p>
                    <div className="flex items-center gap-1">
                      <p className="text-sm text-slate-800 font-mono">{data.gstin}</p>
                      <CopyButton text={data.gstin} />
                    </div>
                  </div>
                )}
              </div>

              {data.dateOfIncorporation && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Incorporated
                  </p>
                  <p className="text-sm text-slate-700">{data.dateOfIncorporation}</p>
                </div>
              )}
            </div>

            {/* Signatories summary */}
            {data.signatories.length > 0 && (
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Signatories
                </p>
                <div className="space-y-2">
                  {data.signatories.map((s, i) => (
                    <div key={i} className="text-sm">
                      <p className="text-slate-800 font-medium">
                        {s.name || `Signatory ${i + 1}`}
                        {s.designation && (
                          <span className="text-slate-400 font-normal"> — {s.designation}</span>
                        )}
                      </p>
                      <div className="text-xs text-slate-500 space-y-0.5 mt-0.5">
                        {s.phone && <p>{s.phone}</p>}
                        {s.email && <p>{s.email}</p>}
                        {s.pan && (
                          <div className="flex items-center gap-1">
                            <span>PAN: {s.pan}</span>
                            <CopyButton text={s.pan} />
                          </div>
                        )}
                        {s.aadhaar && (
                          <div className="flex items-center gap-1">
                            <span>Aadhaar: {s.aadhaar}</span>
                            <CopyButton text={s.aadhaar} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* POC summary */}
            {(data.pocName || data.pocPhone || data.pocEmail) && (
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Point of Contact
                </p>
                <div className="text-sm">
                  {data.pocName && <p className="text-slate-800 font-medium">{data.pocName}</p>}
                  {data.pocPhone && <p className="text-xs text-slate-500">{data.pocPhone}</p>}
                  {data.pocEmail && <p className="text-xs text-slate-500">{data.pocEmail}</p>}
                </div>
              </div>
            )}

            {/* Uploaded Documents list */}
            {allDocs.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Documents ({allDocs.length})
                </p>
                <div className="space-y-1.5">
                  {allDocs.map((doc, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-50 cursor-pointer group transition-colors"
                      onClick={() => setViewingDoc(doc)}
                    >
                      <FileText size={13} className="text-slate-400 shrink-0" />
                      <span className="text-sm text-slate-700 flex-1 truncate">{doc.label}</span>
                      <a
                        href={doc.url}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all"
                        title="Download"
                      >
                        <Download size={12} />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!data.companyName && !data.pan && allDocs.length === 0 && (
              <div className="px-5 py-12 text-center">
                <ShieldCheck size={28} className="text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">
                  Fill in company details on the left and they will appear here for quick reference
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

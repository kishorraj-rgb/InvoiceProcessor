import { useState, useRef } from 'react';
import {
  ShieldCheck,
  Save,
  Plus,
  Trash2,
  Upload,
  FileText,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { getCompanyData, saveCompanyData, type CompanyData, type Signatory } from '../lib/admin';
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
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all shrink-0"
      title="Copy to clipboard"
    >
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function Admin() {
  const [data, setData] = useState<CompanyData>(getCompanyData);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  function update(patch: Partial<CompanyData>) {
    setData(prev => ({ ...prev, ...patch }));
  }

  function save() {
    saveCompanyData(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updateSignatory(idx: number, patch: Partial<Signatory>) {
    const updated = [...data.signatories];
    updated[idx] = { ...updated[idx], ...patch };
    update({ signatories: updated });
  }

  function addSignatory() {
    update({
      signatories: [...data.signatories, { name: '', designation: '', phone: '', email: '', pan: '', aadhaar: '' }],
    });
  }

  function removeSignatory(idx: number) {
    update({ signatories: data.signatories.filter((_, i) => i !== idx) });
  }

  // File upload handler — updates the correct field
  async function handleFileUpload(
    field: keyof CompanyData | { sigIdx: number; sigField: 'panFileUrl' | 'aadhaarFileUrl' },
    file: File,
  ) {
    const key = typeof field === 'string' ? field : `sig-${field.sigIdx}-${field.sigField}`;
    setUploading(key);
    const prefix = typeof field === 'string' ? field.replace('FileUrl', '') : `sig-${field.sigIdx}-${field.sigField.replace('FileUrl', '')}`;
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

  // Hidden file input refs
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

  const inputClass =
    'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300';
  const labelClass = 'text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block';

  function FileLink({ url, label }: { url?: string; label: string }) {
    if (!url) return null;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
      >
        <FileText size={11} /> {label} <ExternalLink size={9} />
      </a>
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

  return (
    <div className="p-8 max-w-5xl">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} accept=".pdf,.jpg,.jpeg,.png" />

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 mb-5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={22} className="text-slate-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin</h1>
            <p className="text-slate-400 text-sm mt-0.5">Company registration details, signatories, and document repository</p>
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
            className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Save size={14} /> Save
          </button>
        </div>
      </div>

      {/* Company Details */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Company Details</h2>
          <p className="text-sm text-slate-500 mt-0.5">Registration numbers, tax IDs, and incorporation details</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Company Name + Address */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Company Name</label>
              <input className={inputClass} value={data.companyName} onChange={e => update({ companyName: e.target.value })} placeholder="Legal entity name" />
            </div>
            <div>
              <label className={labelClass}>Address</label>
              <input className={inputClass} value={data.address} onChange={e => update({ address: e.target.value })} placeholder="Registered address" />
            </div>
          </div>

          {/* PAN / TAN */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Company PAN</label>
              <div className="flex items-center gap-2">
                <input className={inputClass} value={data.pan} onChange={e => update({ pan: e.target.value.toUpperCase() })} placeholder="AANCC1234A" />
                <CopyButton text={data.pan} />
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <UploadBtn field="panFileUrl" label="Upload PAN" isUploading={uploading === 'panFileUrl'} />
                <FileLink url={data.panFileUrl} label="View PAN" />
              </div>
            </div>
            <div>
              <label className={labelClass}>TAN</label>
              <div className="flex items-center gap-2">
                <input className={inputClass} value={data.tan} onChange={e => update({ tan: e.target.value.toUpperCase() })} placeholder="BLRC12345B" />
                <CopyButton text={data.tan} />
              </div>
            </div>
          </div>

          {/* CIN / GSTIN */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>CIN</label>
              <div className="flex items-center gap-2">
                <input className={inputClass} value={data.cin} onChange={e => update({ cin: e.target.value.toUpperCase() })} placeholder="U62011KA2025PTC123456" />
                <CopyButton text={data.cin} />
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <UploadBtn field="cinFileUrl" label="Upload Certificate" isUploading={uploading === 'cinFileUrl'} />
                <FileLink url={data.cinFileUrl} label="View Certificate" />
              </div>
            </div>
            <div>
              <label className={labelClass}>GSTIN</label>
              <div className="flex items-center gap-2">
                <input className={inputClass} value={data.gstin} onChange={e => update({ gstin: e.target.value.toUpperCase() })} placeholder="29AANCC1234A1ZL" />
                <CopyButton text={data.gstin} />
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <UploadBtn field="gstinFileUrl" label="Upload GST Certificate" isUploading={uploading === 'gstinFileUrl'} />
                <FileLink url={data.gstinFileUrl} label="View GST Certificate" />
              </div>
            </div>
          </div>

          {/* Date of Incorporation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Date of Incorporation</label>
              <input type="date" className={inputClass} value={data.dateOfIncorporation} onChange={e => update({ dateOfIncorporation: e.target.value })} />
              <div className="flex items-center gap-2 mt-1.5">
                <UploadBtn field="incorporationFileUrl" label="Upload Incorporation Cert" isUploading={uploading === 'incorporationFileUrl'} />
                <FileLink url={data.incorporationFileUrl} label="View Certificate" />
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
            <p className="text-sm text-slate-500 mt-0.5">Directors and authorized persons with their ID documents</p>
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

              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Signatory {idx + 1}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className={labelClass}>Name</label>
                  <input className={inputClass} value={sig.name} onChange={e => updateSignatory(idx, { name: e.target.value })} placeholder="Full name" />
                </div>
                <div>
                  <label className={labelClass}>Designation</label>
                  <input className={inputClass} value={sig.designation} onChange={e => updateSignatory(idx, { designation: e.target.value })} placeholder="Director / Partner" />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input className={inputClass} value={sig.phone} onChange={e => updateSignatory(idx, { phone: e.target.value })} placeholder="+91 99999 99999" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Email</label>
                  <input type="email" className={inputClass} value={sig.email} onChange={e => updateSignatory(idx, { email: e.target.value })} placeholder="email@company.com" />
                </div>
                <div>
                  <label className={labelClass}>PAN</label>
                  <div className="flex items-center gap-2">
                    <input className={inputClass} value={sig.pan} onChange={e => updateSignatory(idx, { pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" />
                    <CopyButton text={sig.pan} />
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <UploadBtn
                      field={{ sigIdx: idx, sigField: 'panFileUrl' }}
                      label="Upload PAN"
                      isUploading={uploading === `sig-${idx}-panFileUrl`}
                    />
                    <FileLink url={sig.panFileUrl} label="View PAN" />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Aadhaar</label>
                  <div className="flex items-center gap-2">
                    <input className={inputClass} value={sig.aadhaar} onChange={e => updateSignatory(idx, { aadhaar: e.target.value })} placeholder="1234 5678 9012" />
                    <CopyButton text={sig.aadhaar} />
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <UploadBtn
                      field={{ sigIdx: idx, sigField: 'aadhaarFileUrl' }}
                      label="Upload Aadhaar"
                      isUploading={uploading === `sig-${idx}-aadhaarFileUrl`}
                    />
                    <FileLink url={sig.aadhaarFileUrl} label="View Aadhaar" />
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
              <input className={inputClass} value={data.pocName} onChange={e => update({ pocName: e.target.value })} placeholder="Full name" />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input className={inputClass} value={data.pocPhone} onChange={e => update({ pocPhone: e.target.value })} placeholder="+91 99999 99999" />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" className={inputClass} value={data.pocEmail} onChange={e => update({ pocEmail: e.target.value })} placeholder="contact@company.com" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Tag,
} from 'lucide-react';
import { extractInvoiceData } from '../lib/claude';
import { createInvoice, upsertVendor, recalculateVendorStats, uploadInvoiceFile, supabase } from '../lib/supabase';
import { runComplianceCheck } from '../lib/compliance';
import { getTaxonomy } from '../lib/categories';
import ComplianceReportPanel from '../components/ComplianceReport';
import type { ExtractedInvoiceData, LineItem } from '../types';
import type { ComplianceReport } from '../lib/compliance';

type Step = 'upload' | 'extracting' | 'review' | 'saving' | 'done' | 'error';

function Field({
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  fullWidth,
  span3,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  fullWidth?: boolean;
  span3?: boolean;
}) {
  return (
    <div className={fullWidth ? 'col-span-full' : span3 ? 'col-span-3' : ''}>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-300"
      />
    </div>
  );
}

type FormData = {
  // Vendor
  vendor_name: string;
  vendor_address: string;
  vendor_gstin: string;
  vendor_pan: string;
  vendor_contact_email: string;
  place_of_supply: string;
  // Bank
  beneficiary_name: string;
  bank_name: string;
  bank_branch: string;
  account_number: string;
  ifsc_code: string;
  swift_code: string;
  // Invoice header
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  payment_terms: string;
  document_type: string;
  // Bill to
  buyer_name: string;
  buyer_gstin: string;
  buyer_address: string;
  // Amounts
  subtotal: string;
  cgst_rate: string;
  cgst_amount: string;
  sgst_rate: string;
  sgst_amount: string;
  igst_rate: string;
  igst_amount: string;
  tax_amount: string;
  tds_rate: string;
  tds_amount: string;
  round_off: string;
  total_amount: string;
  amount_in_words: string;
  currency: string;
  // Period
  service_period: string;
  billing_period_from: string;
  billing_period_to: string;
  // Classification
  category: string;
  subcategory: string;
  // Notes
  notes: string;
};

function n(v: number | null | undefined): string {
  return v != null ? String(v) : '';
}

function toFormData(data: ExtractedInvoiceData): FormData {
  return {
    vendor_name: data.vendor_name || '',
    vendor_address: data.vendor_address || '',
    vendor_gstin: data.vendor_gstin || '',
    vendor_pan: data.vendor_pan || '',
    vendor_contact_email: data.vendor_contact_email || '',
    place_of_supply: data.place_of_supply || '',
    beneficiary_name: data.beneficiary_name || '',
    bank_name: data.bank_name || '',
    bank_branch: data.bank_branch || '',
    account_number: data.account_number || '',
    ifsc_code: data.ifsc_code || '',
    swift_code: data.swift_code || '',
    invoice_number: data.invoice_number || '',
    invoice_date: data.invoice_date || '',
    due_date: data.due_date || '',
    payment_terms: data.payment_terms || '',
    document_type: data.document_type || '',
    buyer_name: data.buyer_name || '',
    buyer_gstin: data.buyer_gstin || '',
    buyer_address: data.buyer_address || '',
    subtotal: n(data.subtotal),
    cgst_rate: n(data.cgst_rate),
    cgst_amount: n(data.cgst_amount),
    sgst_rate: n(data.sgst_rate),
    sgst_amount: n(data.sgst_amount),
    igst_rate: n(data.igst_rate),
    igst_amount: n(data.igst_amount),
    tax_amount: n(data.tax_amount),
    tds_rate: n(data.tds_rate),
    tds_amount: n(data.tds_amount),
    round_off: n(data.round_off),
    total_amount: n(data.total_amount),
    amount_in_words: data.amount_in_words || '',
    currency: data.currency || 'INR',
    service_period: data.service_period || '',
    billing_period_from: data.billing_period_from || '',
    billing_period_to: data.billing_period_to || '',
    category: data.category || '',
    subcategory: data.subcategory || '',
    notes: '',
  };
}

const emptyForm: FormData = {
  vendor_name: '', vendor_address: '', vendor_gstin: '', vendor_pan: '',
  vendor_contact_email: '', place_of_supply: '',
  beneficiary_name: '', bank_name: '', bank_branch: '', account_number: '', ifsc_code: '', swift_code: '',
  invoice_number: '', invoice_date: '', due_date: '', payment_terms: '', document_type: '',
  buyer_name: '', buyer_gstin: '', buyer_address: '',
  subtotal: '', cgst_rate: '', cgst_amount: '', sgst_rate: '', sgst_amount: '',
  igst_rate: '', igst_amount: '', tax_amount: '', tds_rate: '', tds_amount: '',
  round_off: '', total_amount: '', amount_in_words: '', currency: 'INR',
  service_period: '', billing_period_from: '', billing_period_to: '',
  category: '', subcategory: '', notes: '',
};

function SectionHeader({ num, title }: { num: number; title: string }) {
  return (
    <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
      <span className="w-6 h-6 bg-indigo-100 rounded text-indigo-700 text-xs flex items-center justify-center font-bold">{num}</span>
      {title}
    </h3>
  );
}

export default function UploadInvoice() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [showLineItems, setShowLineItems] = useState(false);
  const [complianceReport, setComplianceReport] = useState<ComplianceReport | null>(null);
  const [taxonomy] = useState(getTaxonomy);

  const onDrop = useCallback(async (accepted: File[]) => {
    if (accepted.length === 0) return;
    const f = accepted[0];
    setFile(f);
    setFilePreviewUrl(URL.createObjectURL(f));
    setStep('extracting');
    setErrorMsg('');

    try {
      const data = await extractInvoiceData(f, taxonomy);
      setForm(toFormData(data));
      setLineItems(data.line_items || []);
      setComplianceReport(runComplianceCheck(data));
      setStep('review');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to extract invoice data.';
      setErrorMsg(msg);
      setStep('review');
      setForm(emptyForm);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxFiles: 1,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSave() {
    if (!form.vendor_name.trim()) {
      setErrorMsg('Vendor name is required.');
      return;
    }
    setStep('saving');
    setErrorMsg('');

    try {
      // 1. Upsert vendor
      const vendor = await upsertVendor({
        vendor_name: form.vendor_name,
        vendor_address: form.vendor_address || undefined,
        gstin: form.vendor_gstin || undefined,
        vendor_pan: form.vendor_pan || undefined,
        vendor_contact_email: form.vendor_contact_email || undefined,
        place_of_supply: form.place_of_supply || undefined,
        beneficiary_name: form.beneficiary_name || undefined,
        bank_name: form.bank_name || undefined,
        bank_branch: form.bank_branch || undefined,
        account_number: form.account_number || undefined,
        ifsc_code: form.ifsc_code || undefined,
        swift_code: form.swift_code || undefined,
      });

      // 2. Create invoice
      const total = parseFloat(form.total_amount) || 0;
      const invoice = await createInvoice({
        vendor_id: vendor.id,
        vendor_name: form.vendor_name,
        vendor_gstin: form.vendor_gstin || undefined,
        vendor_address: form.vendor_address || undefined,
        invoice_number: form.invoice_number || undefined,
        invoice_date: form.invoice_date || undefined,
        due_date: form.due_date || undefined,
        payment_terms: form.payment_terms || undefined,
        document_type: form.document_type || undefined,
        buyer_name: form.buyer_name || undefined,
        buyer_gstin: form.buyer_gstin || undefined,
        buyer_address: form.buyer_address || undefined,
        line_items: lineItems,
        subtotal: parseFloat(form.subtotal) || undefined,
        cgst_rate: parseFloat(form.cgst_rate) || undefined,
        cgst_amount: parseFloat(form.cgst_amount) || undefined,
        sgst_rate: parseFloat(form.sgst_rate) || undefined,
        sgst_amount: parseFloat(form.sgst_amount) || undefined,
        igst_rate: parseFloat(form.igst_rate) || undefined,
        igst_amount: parseFloat(form.igst_amount) || undefined,
        tax_amount: parseFloat(form.tax_amount) || undefined,
        tds_rate: parseFloat(form.tds_rate) || undefined,
        tds_amount: parseFloat(form.tds_amount) || undefined,
        round_off: parseFloat(form.round_off) || undefined,
        total_amount: total || undefined,
        amount_in_words: form.amount_in_words || undefined,
        currency: form.currency || 'INR',
        service_period: form.service_period || undefined,
        billing_period_from: form.billing_period_from || undefined,
        billing_period_to: form.billing_period_to || undefined,
        category: form.category || undefined,
        subcategory: form.subcategory || undefined,
        notes: form.notes || undefined,
        file_name: file?.name,
        raw_extracted_data: {},
      });

      // 3. Upload file (non-blocking — errors shown as warning)
      if (file) {
        try {
          const url = await uploadInvoiceFile(file, invoice.id);
          if (url) {
            await supabase.from('invoices').update({ file_url: url }).eq('id', invoice.id);
          }
        } catch (uploadErr) {
          const msg = uploadErr instanceof Error ? uploadErr.message : 'File upload failed.';
          console.error(msg);
          setErrorMsg(`Invoice saved, but PDF upload failed: ${msg}`);
        }
      }

      // 4. Recalculate vendor stats from actual invoice rows
      await recalculateVendorStats(vendor.id);

      setStep('done');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save invoice.';
      setErrorMsg(msg);
      setStep('review');
    }
  }

  function reset() {
    setStep('upload');
    setFile(null);
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFilePreviewUrl(null);
    setForm(emptyForm);
    setLineItems([]);
    setErrorMsg('');
    setShowLineItems(false);
    setComplianceReport(null);
  }

  if (step === 'done') {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[80vh]">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle size={32} className="text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Invoice Saved!</h2>
        <p className="text-slate-500 mb-6">Vendor details updated and invoice recorded in the tracker.</p>
        <button
          type="button"
          onClick={reset}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          Process Another Invoice
        </button>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Process Invoice</h1>
        <p className="text-slate-500 mt-1">Upload a PDF or image — AI will extract all details automatically</p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-8">
        {(['upload', 'review', 'done'] as const).map((s, i) => {
          const isCurrent =
            (s === 'upload' && (step === 'upload' || step === 'extracting')) ||
            (s === 'review' && (step === 'review' || step === 'saving'));
          const isCompleted = s === 'upload' && step !== 'upload' && step !== 'extracting';
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                isCompleted ? 'bg-indigo-600 text-white' : isCurrent ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500' : 'bg-slate-100 text-slate-400'
              }`}>{i + 1}</div>
              <span className="text-sm text-slate-500">{s === 'upload' ? 'Upload' : s === 'review' ? 'Review & Edit' : 'Saved'}</span>
              {i < 2 && <div className="w-12 h-px bg-slate-200 ml-1" />}
            </div>
          );
        })}
      </div>

      {/* Upload Zone */}
      {step === 'upload' && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
          }`}
        >
          <input {...getInputProps()} />
          <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Upload size={28} className="text-slate-500" />
          </div>
          <p className="text-lg font-semibold text-slate-700 mb-1">
            {isDragActive ? 'Drop your invoice here' : 'Drop invoice here or click to upload'}
          </p>
          <p className="text-sm text-slate-400">Supports PDF, JPG, PNG</p>
        </div>
      )}

      {/* Extracting */}
      {step === 'extracting' && (
        <div className="border-2 border-dashed border-indigo-300 rounded-xl p-16 text-center bg-indigo-50">
          <div className="w-14 h-14 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Sparkles size={28} className="text-indigo-600 animate-pulse" />
          </div>
          <p className="text-lg font-semibold text-slate-700 mb-1">Extracting Invoice Data</p>
          <p className="text-sm text-slate-500 flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            GPT-4o is reading your invoice...
          </p>
          {file && (
            <div className="mt-4 inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">
              <FileText size={14} className="text-indigo-500" />
              {file.name}
            </div>
          )}
        </div>
      )}

      {/* Review Form */}
      {(step === 'review' || step === 'saving') && (
        <div className="flex gap-5 items-start">
        <div className="w-[540px] flex-shrink-0 space-y-5">
          {/* File info bar */}
          {file && (
            <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5">
              <FileText size={16} className="text-indigo-600 flex-shrink-0" />
              <span className="text-sm text-indigo-700 flex-1">{file.name}</span>
              <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium bg-indigo-100 px-2 py-0.5 rounded-md">
                <Sparkles size={12} /> AI Extracted
              </div>
              <button type="button" aria-label="Remove file" onClick={reset} className="text-slate-400 hover:text-slate-600 ml-1">
                <X size={16} />
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{errorMsg}</p>
            </div>
          )}

          {/* Compliance Report */}
          {complianceReport && <ComplianceReportPanel report={complianceReport} />}

          {/* 1. Vendor Information */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <SectionHeader num={1} title="Vendor Information" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Vendor Name" name="vendor_name" value={form.vendor_name} onChange={handleChange} required placeholder="Company name" fullWidth />
              <Field label="GSTIN" name="vendor_gstin" value={form.vendor_gstin} onChange={handleChange} placeholder="29ABCDE1234F1Z5" />
              <Field label="PAN" name="vendor_pan" value={form.vendor_pan} onChange={handleChange} placeholder="ABCDE1234F" />
              <Field label="Contact / Email" name="vendor_contact_email" value={form.vendor_contact_email} onChange={handleChange} placeholder="email@vendor.com or phone" />
              <Field label="Place of Supply" name="place_of_supply" value={form.place_of_supply} onChange={handleChange} placeholder="e.g., Karnataka" />
              <div className="col-span-full">
                <label className="block text-xs font-medium text-slate-600 mb-1">Vendor Address</label>
                <textarea
                  name="vendor_address"
                  value={form.vendor_address}
                  onChange={handleChange}
                  placeholder="Full address"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300 resize-none"
                />
              </div>
            </div>
          </div>

          {/* 2. Bank Details */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <SectionHeader num={2} title="Bank Details" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bank Account Name" name="beneficiary_name" value={form.beneficiary_name} onChange={handleChange} placeholder="Account holder name" fullWidth />
              <Field label="Bank Name" name="bank_name" value={form.bank_name} onChange={handleChange} placeholder="e.g., HDFC Bank" />
              <Field label="Bank Branch" name="bank_branch" value={form.bank_branch} onChange={handleChange} placeholder="Branch name" />
              <Field label="Account Number" name="account_number" value={form.account_number} onChange={handleChange} placeholder="Account number" />
              <Field label="IFSC Code" name="ifsc_code" value={form.ifsc_code} onChange={handleChange} placeholder="HDFC0001234" />
              <Field label="SWIFT Code" name="swift_code" value={form.swift_code} onChange={handleChange} placeholder="HDFCINBB (if applicable)" />
            </div>
          </div>

          {/* 3. Invoice Details */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <SectionHeader num={3} title="Invoice Details" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Invoice Number" name="invoice_number" value={form.invoice_number} onChange={handleChange} placeholder="INV-2024-001" />
              <Field label="Document Type" name="document_type" value={form.document_type} onChange={handleChange} placeholder="Tax Invoice / Credit Note etc." />
              <Field label="Invoice Date" name="invoice_date" value={form.invoice_date} onChange={handleChange} type="date" />
              <Field label="Due Date" name="due_date" value={form.due_date} onChange={handleChange} type="date" />
              <Field label="Payment Terms" name="payment_terms" value={form.payment_terms} onChange={handleChange} placeholder="e.g., Net 30, Immediate" fullWidth />
            </div>
          </div>

          {/* 4. Bill To */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <SectionHeader num={4} title="Bill To" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bill To Name" name="buyer_name" value={form.buyer_name} onChange={handleChange} placeholder="Buyer company name" />
              <Field label="Bill To GSTIN" name="buyer_gstin" value={form.buyer_gstin} onChange={handleChange} placeholder="Buyer GSTIN" />
              <div className="col-span-full">
                <label className="block text-xs font-medium text-slate-600 mb-1">Bill To Address</label>
                <textarea
                  name="buyer_address"
                  value={form.buyer_address}
                  onChange={handleChange}
                  placeholder="Full billing address"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300 resize-none"
                />
              </div>
            </div>
          </div>

          {/* 5. Classification */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-indigo-100 rounded text-indigo-700 text-xs flex items-center justify-center font-bold">5</span>
              Classification
              {form.category && (
                <span className="ml-1 flex items-center gap-1 text-[11px] text-indigo-600 font-normal bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                  <Sparkles size={10} /> AI suggested
                </span>
              )}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                <div className="relative">
                  <Tag size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    title="Category"
                    value={form.category}
                    onChange={e => setForm(prev => ({ ...prev, category: e.target.value, subcategory: '' }))}
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white appearance-none"
                  >
                    <option value="">— Select category —</option>
                    {Object.keys(taxonomy).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Sub-category</label>
                <select
                  title="Sub-category"
                  value={form.subcategory}
                  onChange={e => setForm(prev => ({ ...prev, subcategory: e.target.value }))}
                  disabled={!form.category}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:bg-slate-50 disabled:text-slate-400 appearance-none"
                >
                  <option value="">— Select subcategory —</option>
                  {form.category && (taxonomy[form.category] ?? []).map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 6. Line Items (collapsible) */}
          {lineItems.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowLineItems(v => !v)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50"
              >
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 bg-indigo-100 rounded text-indigo-700 text-xs flex items-center justify-center font-bold">5</span>
                  Line Items
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{lineItems.length}</span>
                </h3>
                {showLineItems ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </button>
              {showLineItems && (
                <div className="overflow-x-auto border-t border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-slate-600 whitespace-nowrap">HSN/SAC</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Description</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">Qty</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600 whitespace-nowrap">Unit Rate</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600 whitespace-nowrap">Basic Amt</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">CGST%</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">CGST</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">SGST%</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">SGST</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">IGST%</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">IGST</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lineItems.map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{item.hsn_sac_code || '—'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.description}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{item.quantity}</td>
                          <td className="px-3 py-2 text-right text-slate-600">₹{item.unit_price?.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{item.basic_amount != null ? `₹${item.basic_amount.toFixed(2)}` : '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{item.cgst_rate != null ? `${item.cgst_rate}%` : '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{item.cgst_amount != null ? `₹${item.cgst_amount.toFixed(2)}` : '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{item.sgst_rate != null ? `${item.sgst_rate}%` : '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{item.sgst_amount != null ? `₹${item.sgst_amount.toFixed(2)}` : '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{item.igst_rate != null ? `${item.igst_rate}%` : '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{item.igst_amount != null ? `₹${item.igst_amount.toFixed(2)}` : '—'}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">₹{item.total?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 6. Tax Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <SectionHeader num={6} title="Tax Breakdown" />
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-full grid grid-cols-3 gap-4">
                <Field label="CGST Rate (%)" name="cgst_rate" value={form.cgst_rate} onChange={handleChange} type="number" placeholder="9" />
                <Field label="CGST Amount (₹)" name="cgst_amount" value={form.cgst_amount} onChange={handleChange} type="number" placeholder="0.00" />
                <div />
                <Field label="SGST Rate (%)" name="sgst_rate" value={form.sgst_rate} onChange={handleChange} type="number" placeholder="9" />
                <Field label="SGST Amount (₹)" name="sgst_amount" value={form.sgst_amount} onChange={handleChange} type="number" placeholder="0.00" />
                <div />
                <Field label="IGST Rate (%)" name="igst_rate" value={form.igst_rate} onChange={handleChange} type="number" placeholder="18" />
                <Field label="IGST Amount (₹)" name="igst_amount" value={form.igst_amount} onChange={handleChange} type="number" placeholder="0.00" />
                <div />
              </div>
              <Field label="Total Tax Amount (₹)" name="tax_amount" value={form.tax_amount} onChange={handleChange} type="number" placeholder="0.00" />
            </div>
          </div>

          {/* 7. Deductions & Totals */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <SectionHeader num={7} title="Deductions & Totals" />
            <div className="grid grid-cols-3 gap-4">
              <Field label="TDS Rate (%)" name="tds_rate" value={form.tds_rate} onChange={handleChange} type="number" placeholder="2" />
              <Field label="TDS Amount (₹)" name="tds_amount" value={form.tds_amount} onChange={handleChange} type="number" placeholder="0.00" />
              <Field label="Round Off (₹)" name="round_off" value={form.round_off} onChange={handleChange} type="number" placeholder="0.00" />
              <Field label="Subtotal (₹)" name="subtotal" value={form.subtotal} onChange={handleChange} type="number" placeholder="0.00" />
              <Field label="Total Invoice Amount (₹)" name="total_amount" value={form.total_amount} onChange={handleChange} type="number" placeholder="0.00" />
              <div />
              <div className="col-span-full">
                <Field label="Amount in Words" name="amount_in_words" value={form.amount_in_words} onChange={handleChange} placeholder="Rs. Seven Lacs Sixty Six Thousand Nineteen Only" fullWidth />
              </div>
            </div>
          </div>

          {/* 8. Service Period */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <SectionHeader num={8} title="Service Period" />
            <div className="grid grid-cols-3 gap-4">
              <Field label="Service Period" name="service_period" value={form.service_period} onChange={handleChange} placeholder="e.g., January 2025" />
              <Field label="Billing Period From" name="billing_period_from" value={form.billing_period_from} onChange={handleChange} type="date" />
              <Field label="Billing Period To" name="billing_period_to" value={form.billing_period_to} onChange={handleChange} type="date" />
            </div>
          </div>

          {/* 9. Notes */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">Notes (optional)</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Any additional notes about this invoice..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 justify-end pb-4">
            <button
              type="button"
              onClick={reset}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={step === 'saving'}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {step === 'saving' ? (
                <><Loader2 size={15} className="animate-spin" /> Saving...</>
              ) : (
                <><CheckCircle size={15} /> Save Invoice</>
              )}
            </button>
          </div>
        </div>

        {/* Right: PDF Preview */}
        {filePreviewUrl && (
          <div className="flex-1 sticky top-6 self-start">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-120px)]">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 flex-shrink-0 bg-slate-50">
                <FileText size={14} className="text-indigo-500 flex-shrink-0" />
                <span className="text-xs font-medium text-slate-600 truncate flex-1">{file?.name}</span>
              </div>
              <div className="flex-1 overflow-hidden">
                {file?.type === 'application/pdf' || file?.name.toLowerCase().endsWith('.pdf') ? (
                  <iframe
                    src={filePreviewUrl}
                    className="w-full h-full border-0"
                    title="Invoice preview"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full overflow-auto p-4">
                    <img
                      src={filePreviewUrl}
                      alt="Invoice preview"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      )}
    </div>
  );
}

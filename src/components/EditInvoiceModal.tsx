import { useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { updateInvoice } from '../lib/supabase';
import { getTaxonomy } from '../lib/categories';
import type { Invoice, LineItem } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────
function n(v: number | null | undefined): string {
  return v != null ? String(v) : '';
}

function Field({
  label, name, value, onChange, type = 'text', placeholder, span2,
}: {
  label: string; name: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string; placeholder?: string; span2?: boolean;
}) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
        {label}
      </label>
      <input
        type={type} name={name} value={value} onChange={onChange}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300"
      />
    </div>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 mt-1">{title}</h3>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
type FormData = {
  vendor_name: string; vendor_address: string; vendor_gstin: string;
  vendor_pan: string; vendor_contact_email: string; place_of_supply: string;
  beneficiary_name: string; bank_name: string; bank_branch: string;
  account_number: string; ifsc_code: string; swift_code: string;
  invoice_number: string; invoice_date: string; due_date: string;
  payment_terms: string; document_type: string;
  buyer_name: string; buyer_gstin: string; buyer_address: string;
  subtotal: string; cgst_rate: string; cgst_amount: string;
  sgst_rate: string; sgst_amount: string; igst_rate: string; igst_amount: string;
  tax_amount: string; tds_rate: string; tds_amount: string;
  round_off: string; total_amount: string; amount_in_words: string; currency: string;
  service_period: string; billing_period_from: string; billing_period_to: string;
  category: string; subcategory: string; notes: string;
};

function invoiceToForm(inv: Invoice): FormData {
  return {
    vendor_name:         inv.vendor_name || '',
    vendor_address:      inv.vendor_address || '',
    vendor_gstin:        inv.vendor_gstin || '',
    vendor_pan:          '',
    vendor_contact_email:'',
    place_of_supply:     '',
    beneficiary_name:    '',
    bank_name:           '',
    bank_branch:         '',
    account_number:      '',
    ifsc_code:           '',
    swift_code:          '',
    invoice_number:      inv.invoice_number || '',
    invoice_date:        inv.invoice_date || '',
    due_date:            inv.due_date || '',
    payment_terms:       inv.payment_terms || '',
    document_type:       inv.document_type || '',
    buyer_name:          inv.buyer_name || '',
    buyer_gstin:         inv.buyer_gstin || '',
    buyer_address:       inv.buyer_address || '',
    subtotal:            n(inv.subtotal),
    cgst_rate:           n(inv.cgst_rate),
    cgst_amount:         n(inv.cgst_amount),
    sgst_rate:           n(inv.sgst_rate),
    sgst_amount:         n(inv.sgst_amount),
    igst_rate:           n(inv.igst_rate),
    igst_amount:         n(inv.igst_amount),
    tax_amount:          n(inv.tax_amount),
    tds_rate:            n(inv.tds_rate),
    tds_amount:          n(inv.tds_amount),
    round_off:           n(inv.round_off),
    total_amount:        n(inv.total_amount),
    amount_in_words:     inv.amount_in_words || '',
    currency:            inv.currency || 'INR',
    service_period:      inv.service_period || '',
    billing_period_from: inv.billing_period_from || '',
    billing_period_to:   inv.billing_period_to || '',
    category:            inv.category || '',
    subcategory:         inv.subcategory || '',
    notes:               inv.notes || '',
  };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EditInvoiceModal({
  invoice, onSaved, onClose,
}: {
  invoice: Invoice;
  onSaved: (updated: Invoice) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormData>(() => invoiceToForm(invoice));
  const [lineItems, setLineItems] = useState<LineItem[]>(invoice.line_items || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taxonomy = getTaxonomy();
  const allCategories = Object.keys(taxonomy);
  const subcategories = form.category ? (taxonomy[form.category] ?? []) : [];

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (name === 'category') setForm(prev => ({ ...prev, category: value, subcategory: '' }));
  }

  function updateLineItem(idx: number, field: keyof LineItem, value: string | number) {
    setLineItems(prev => prev.map((li, i) => i === idx ? { ...li, [field]: value } : li));
  }

  function addLineItem() {
    setLineItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0, total: 0 }]);
  }

  function removeLineItem(idx: number) {
    setLineItems(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!form.vendor_name.trim()) { setError('Vendor name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateInvoice(invoice.id, {
        vendor_name:          form.vendor_name,
        vendor_address:       form.vendor_address || undefined,
        vendor_gstin:         form.vendor_gstin || undefined,
        invoice_number:       form.invoice_number || undefined,
        invoice_date:         form.invoice_date || undefined,
        due_date:             form.due_date || undefined,
        payment_terms:        form.payment_terms || undefined,
        document_type:        form.document_type || undefined,
        buyer_name:           form.buyer_name || undefined,
        buyer_gstin:          form.buyer_gstin || undefined,
        buyer_address:        form.buyer_address || undefined,
        line_items:           lineItems,
        subtotal:             parseFloat(form.subtotal) || undefined,
        cgst_rate:            parseFloat(form.cgst_rate) || undefined,
        cgst_amount:          parseFloat(form.cgst_amount) || undefined,
        sgst_rate:            parseFloat(form.sgst_rate) || undefined,
        sgst_amount:          parseFloat(form.sgst_amount) || undefined,
        igst_rate:            parseFloat(form.igst_rate) || undefined,
        igst_amount:          parseFloat(form.igst_amount) || undefined,
        tax_amount:           parseFloat(form.tax_amount) || undefined,
        tds_rate:             parseFloat(form.tds_rate) || undefined,
        tds_amount:           parseFloat(form.tds_amount) || undefined,
        round_off:            parseFloat(form.round_off) || undefined,
        total_amount:         parseFloat(form.total_amount) || undefined,
        amount_in_words:      form.amount_in_words || undefined,
        currency:             form.currency || 'INR',
        service_period:       form.service_period || undefined,
        billing_period_from:  form.billing_period_from || undefined,
        billing_period_to:    form.billing_period_to || undefined,
        category:             form.category || undefined,
        subcategory:          form.subcategory || undefined,
        notes:                form.notes || undefined,
      });
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40 backdrop-blur-sm">
      {/* Backdrop close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white h-full w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0 bg-white">
          <div>
            <h2 className="text-base font-bold text-slate-900">Edit Invoice</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {invoice.vendor_name}{invoice.invoice_number ? ` · ${invoice.invoice_number}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {error && <p className="text-xs text-red-500 max-w-xs text-right">{error}</p>}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Vendor */}
          <div>
            <SectionLabel title="Vendor" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vendor Name *" name="vendor_name" value={form.vendor_name} onChange={handleChange} span2 />
              <Field label="GSTIN" name="vendor_gstin" value={form.vendor_gstin} onChange={handleChange} placeholder="29AADCI7611M1Z7" />
              <Field label="Place of Supply" name="place_of_supply" value={form.place_of_supply} onChange={handleChange} />
              <Field label="Vendor Address" name="vendor_address" value={form.vendor_address} onChange={handleChange} span2 />
            </div>
          </div>

          {/* Invoice header */}
          <div>
            <SectionLabel title="Invoice Details" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice Number" name="invoice_number" value={form.invoice_number} onChange={handleChange} />
              <Field label="Document Type" name="document_type" value={form.document_type} onChange={handleChange} placeholder="Tax Invoice" />
              <Field label="Invoice Date" name="invoice_date" value={form.invoice_date} onChange={handleChange} type="date" />
              <Field label="Due Date" name="due_date" value={form.due_date} onChange={handleChange} type="date" />
              <Field label="Payment Terms" name="payment_terms" value={form.payment_terms} onChange={handleChange} placeholder="Net 30" />
              <Field label="Currency" name="currency" value={form.currency} onChange={handleChange} placeholder="INR" />
            </div>
          </div>

          {/* Bill to */}
          <div>
            <SectionLabel title="Bill To" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Buyer Name" name="buyer_name" value={form.buyer_name} onChange={handleChange} />
              <Field label="Buyer GSTIN" name="buyer_gstin" value={form.buyer_gstin} onChange={handleChange} />
              <Field label="Buyer Address" name="buyer_address" value={form.buyer_address} onChange={handleChange} span2 />
            </div>
          </div>

          {/* Service period */}
          <div>
            <SectionLabel title="Service Period" />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Period Label" name="service_period" value={form.service_period} onChange={handleChange} placeholder="Dec 2025" />
              <Field label="From" name="billing_period_from" value={form.billing_period_from} onChange={handleChange} type="date" />
              <Field label="To" name="billing_period_to" value={form.billing_period_to} onChange={handleChange} type="date" />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SectionLabel title="Line Items" />
              <button
                type="button"
                onClick={addLineItem}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                + Add row
              </button>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium w-1/2">Description</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-medium">Qty</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-medium">Unit Rate</th>
                    <th className="text-right px-3 py-2 text-slate-500 font-medium">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lineItems.map((li, idx) => (
                    <tr key={idx}>
                      <td className="px-2 py-1.5">
                        <input
                          type="text" value={li.description}
                          onChange={e => updateLineItem(idx, 'description', e.target.value)}
                          className="w-full border-0 focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded px-1 py-0.5 text-slate-700"
                          placeholder="Description"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number" value={li.quantity}
                          onChange={e => updateLineItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-16 text-right border-0 focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded px-1 py-0.5 text-slate-700"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number" value={li.unit_price}
                          onChange={e => updateLineItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="w-24 text-right border-0 focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded px-1 py-0.5 text-slate-700"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number" value={li.total}
                          onChange={e => updateLineItem(idx, 'total', parseFloat(e.target.value) || 0)}
                          className="w-24 text-right border-0 focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded px-1 py-0.5 text-slate-700"
                        />
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {lineItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-slate-300">No line items</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Amounts */}
          <div>
            <SectionLabel title="Amounts (₹)" />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Subtotal" name="subtotal" value={form.subtotal} onChange={handleChange} type="number" />
              <Field label="CGST Rate %" name="cgst_rate" value={form.cgst_rate} onChange={handleChange} type="number" />
              <Field label="CGST Amount" name="cgst_amount" value={form.cgst_amount} onChange={handleChange} type="number" />
              <Field label="SGST Rate %" name="sgst_rate" value={form.sgst_rate} onChange={handleChange} type="number" />
              <Field label="SGST Amount" name="sgst_amount" value={form.sgst_amount} onChange={handleChange} type="number" />
              <Field label="IGST Rate %" name="igst_rate" value={form.igst_rate} onChange={handleChange} type="number" />
              <Field label="IGST Amount" name="igst_amount" value={form.igst_amount} onChange={handleChange} type="number" />
              <Field label="TDS Rate %" name="tds_rate" value={form.tds_rate} onChange={handleChange} type="number" />
              <Field label="TDS Amount" name="tds_amount" value={form.tds_amount} onChange={handleChange} type="number" />
              <Field label="Round Off" name="round_off" value={form.round_off} onChange={handleChange} type="number" />
              <Field label="Total Amount" name="total_amount" value={form.total_amount} onChange={handleChange} type="number" />
              <div className="col-span-3">
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Amount in Words</label>
                <input
                  type="text" name="amount_in_words" value={form.amount_in_words}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300"
                  placeholder="Rupees…"
                />
              </div>
            </div>
          </div>

          {/* Classification */}
          <div>
            <SectionLabel title="Classification" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Category</label>
                <select
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  title="Category"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">— None —</option>
                  {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Sub-category</label>
                <select
                  name="subcategory"
                  value={form.subcategory}
                  onChange={handleChange}
                  title="Sub-category"
                  disabled={!form.category}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:opacity-40"
                >
                  <option value="">— None —</option>
                  {subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <SectionLabel title="Notes" />
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Any additional notes…"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-300 resize-none"
            />
          </div>

          {/* Bottom save */}
          <div className="flex justify-end pt-2 pb-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { createClient } from '@supabase/supabase-js';
import type { Vendor, Invoice, Asset, AssetHistory, InvoicePayment, AppUser, Subscription, SubscriptionInvoice } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Add them to your .env file.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

// Vendor operations
export async function getVendors(): Promise<Vendor[]> {
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function upsertVendor(vendor: Partial<Vendor> & { vendor_name: string }): Promise<Vendor> {
  // Only pass known vendor columns (avoids sending invoice fields accidentally)
  const vendorFields = {
    vendor_name: vendor.vendor_name,
    vendor_address: vendor.vendor_address,
    gstin: vendor.gstin,
    place_of_supply: vendor.place_of_supply,
    vendor_pan: vendor.vendor_pan,
    vendor_contact_email: vendor.vendor_contact_email,
    beneficiary_name: vendor.beneficiary_name,
    bank_name: vendor.bank_name,
    bank_branch: vendor.bank_branch,
    account_number: vendor.account_number,
    ifsc_code: vendor.ifsc_code,
    swift_code: vendor.swift_code,
  };

  // 1. Try GSTIN match first (reliable even when OCR mis-reads the name)
  if (vendor.gstin) {
    const { data: byGstin } = await supabase
      .from('vendors')
      .select('*')
      .eq('gstin', vendor.gstin)
      .single();

    if (byGstin) {
      const { data, error } = await supabase
        .from('vendors')
        .update({ ...vendorFields, updated_at: new Date().toISOString() })
        .eq('id', byGstin.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  }

  // 2. Fallback: case-insensitive name match
  const { data: existing } = await supabase
    .from('vendors')
    .select('*')
    .ilike('vendor_name', vendor.vendor_name)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from('vendors')
      .update({ ...vendorFields, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // 3. New vendor
  const vendorCode = 'V' + String(Date.now()).slice(-6);
  const { data, error } = await supabase
    .from('vendors')
    .insert({ vendor_code: vendorCode, ...vendorFields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Recalculate invoice_count and total_amount from actual invoice rows (accurate after any mutation)
export async function recalculateVendorStats(vendorId: string): Promise<void> {
  const { data } = await supabase
    .from('invoices')
    .select('total_amount')
    .eq('vendor_id', vendorId);
  const count = data?.length ?? 0;
  const total = (data || []).reduce((s, r) => s + (r.total_amount ?? 0), 0);
  await supabase
    .from('vendors')
    .update({ invoice_count: count, total_amount: total, updated_at: new Date().toISOString() })
    .eq('id', vendorId);
}

export async function deleteVendor(id: string): Promise<void> {
  const { error } = await supabase.from('vendors').delete().eq('id', id);
  if (error) throw error;
}

export async function updateVendorName(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('vendors')
    .update({ vendor_name: name, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Invoice operations
export async function getInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createInvoice(invoice: Partial<Invoice> & { vendor_name: string }): Promise<Invoice> {
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      currency: invoice.currency || 'INR',
      status: 'received',
      line_items: invoice.line_items || [],
      vendor_name: invoice.vendor_name,
      vendor_id: invoice.vendor_id,
      vendor_gstin: invoice.vendor_gstin,
      vendor_address: invoice.vendor_address,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      payment_terms: invoice.payment_terms,
      document_type: invoice.document_type,
      buyer_name: invoice.buyer_name,
      buyer_gstin: invoice.buyer_gstin,
      buyer_address: invoice.buyer_address,
      subtotal: invoice.subtotal,
      cgst_rate: invoice.cgst_rate,
      cgst_amount: invoice.cgst_amount,
      sgst_rate: invoice.sgst_rate,
      sgst_amount: invoice.sgst_amount,
      igst_rate: invoice.igst_rate,
      igst_amount: invoice.igst_amount,
      tax_amount: invoice.tax_amount,
      tds_rate: invoice.tds_rate,
      tds_amount: invoice.tds_amount,
      round_off: invoice.round_off,
      total_amount: invoice.total_amount,
      amount_in_words: invoice.amount_in_words,
      service_period: invoice.service_period,
      billing_period_from: invoice.billing_period_from,
      billing_period_to: invoice.billing_period_to,
      category: invoice.category,
      subcategory: invoice.subcategory,
      notes: invoice.notes,
      file_name: invoice.file_name,
      file_url: invoice.file_url,
      raw_extracted_data: invoice.raw_extracted_data,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInvoiceCategory(
  id: string,
  category: string | null,
  subcategory: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ category, subcategory, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function updateInvoice(id: string, updates: Partial<import('../types').Invoice>): Promise<import('../types').Invoice> {
  const { data, error } = await supabase
    .from('invoices')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInvoiceStatus(
  id: string,
  status: Invoice['status'],
  paid_amount?: number,
) {
  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (paid_amount !== undefined) updates.paid_amount = paid_amount;
  const { error } = await supabase.from('invoices').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) throw error;
}

export async function getDashboardStats() {
  const [invoicesResult, vendorsResult] = await Promise.all([
    supabase.from('invoices').select('status, total_amount'),
    supabase.from('vendors').select('id'),
  ]);

  const invoices = invoicesResult.data || [];
  const vendors = vendorsResult.data || [];

  const totalInvoices = invoices.length;
  const totalAmount = invoices.reduce((sum, i) => sum + (i.total_amount || 0), 0);
  const pendingInvoices = invoices.filter(i => i.status === 'received' || i.status === 'processing').length;
  const paidInvoices = invoices.filter(i => i.status === 'paid').length;
  const totalVendors = vendors.length;

  return { totalInvoices, totalAmount, pendingInvoices, paidInvoices, totalVendors };
}

export async function uploadInvoiceFile(file: File, invoiceId: string): Promise<string | null> {
  const ext = file.name.split('.').pop();
  const path = `invoices/${invoiceId}.${ext}`;

  const { error } = await supabase.storage
    .from('invoice-files')
    .upload(path, file, { upsert: true });

  if (error) {
    // Surface the real error message so it's visible
    throw new Error(`File upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from('invoice-files').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadSubscriptionInvoiceFile(file: File, subscriptionInvoiceId: string): Promise<string | null> {
  const ext = file.name.split('.').pop();
  const path = `subscription-invoices/${subscriptionInvoiceId}.${ext}`;

  const { error } = await supabase.storage
    .from('invoice-files')
    .upload(path, file, { upsert: true });

  if (error) {
    throw new Error(`File upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from('invoice-files').getPublicUrl(path);
  return data.publicUrl;
}

// ── Asset operations ──────────────────────────────────────────────────────────

export async function getAssets(): Promise<Asset[]> {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getNextAssetTag(): Promise<string> {
  const { count } = await supabase
    .from('assets')
    .select('*', { count: 'exact', head: true });
  const next = (count ?? 0) + 1;
  return 'AST' + String(next).padStart(3, '0');
}

export async function createAsset(
  asset: Partial<Asset> & { asset_type: string; asset_name: string },
): Promise<Asset> {
  const { data, error } = await supabase
    .from('assets')
    .insert({
      asset_tag: asset.asset_tag,
      asset_type: asset.asset_type,
      asset_name: asset.asset_name,
      brand: asset.brand,
      model: asset.model,
      serial_number: asset.serial_number,
      purchased_from: asset.purchased_from,
      purchase_date: asset.purchase_date,
      warranty_expiry: asset.warranty_expiry,
      base_cost: asset.base_cost,
      gst_percent: asset.gst_percent,
      gst_amount: asset.gst_amount,
      total_cost: asset.total_cost,
      status: asset.status ?? 'available',
      assigned_to: asset.assigned_to,
      notes: asset.notes,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAsset(id: string, updates: Partial<Asset>): Promise<Asset> {
  const { data, error } = await supabase
    .from('assets')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAsset(id: string): Promise<void> {
  const { error } = await supabase.from('assets').delete().eq('id', id);
  if (error) throw error;
}

export async function getAssetHistory(assetId: string): Promise<AssetHistory[]> {
  const { data, error } = await supabase
    .from('asset_history')
    .select('*')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addAssetHistory(
  entry: Omit<AssetHistory, 'id' | 'created_at'>,
): Promise<void> {
  const { error } = await supabase.from('asset_history').insert(entry);
  if (error) throw error;
}

// ── Invoice Payment operations ────────────────────────────────────────────────

export async function getInvoicePayments(invoiceId: string): Promise<InvoicePayment[]> {
  const { data, error } = await supabase
    .from('invoice_payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('payment_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function recalculateInvoicePaid(invoiceId: string, totalAmount: number | undefined): Promise<void> {
  const { data: payments } = await supabase
    .from('invoice_payments')
    .select('amount')
    .eq('invoice_id', invoiceId);

  const newPaid = (payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
  const total = totalAmount ?? 0;

  let newStatus: Invoice['status'];
  if (newPaid <= 0) {
    newStatus = 'approved';
  } else if (newPaid >= total) {
    newStatus = 'paid';
  } else {
    newStatus = 'partly_paid';
  }

  await supabase
    .from('invoices')
    .update({ paid_amount: newPaid, status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', invoiceId);
}

export async function addInvoicePayment(
  invoiceId: string,
  totalAmount: number | undefined,
  payment: Omit<InvoicePayment, 'id' | 'invoice_id' | 'created_at' | 'updated_at'>,
): Promise<InvoicePayment> {
  const { data, error } = await supabase
    .from('invoice_payments')
    .insert({ invoice_id: invoiceId, ...payment })
    .select()
    .single();
  if (error) throw error;
  await recalculateInvoicePaid(invoiceId, totalAmount);
  return data;
}

export async function deleteInvoicePayment(
  paymentId: string,
  invoiceId: string,
  totalAmount: number | undefined,
): Promise<void> {
  const { error } = await supabase.from('invoice_payments').delete().eq('id', paymentId);
  if (error) throw error;
  await recalculateInvoicePaid(invoiceId, totalAmount);
}

// ── Team / User operations ─────────────────────────────────────────────────────

export async function getUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function inviteUser(email: string, name: string, role: string): Promise<AppUser> {
  const { data, error } = await supabase
    .from('app_users')
    .insert({ email, name, role, status: 'invited' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateUserRole(id: string, role: string): Promise<void> {
  const { error } = await supabase
    .from('app_users')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function removeUser(id: string): Promise<void> {
  const { error } = await supabase.from('app_users').delete().eq('id', id);
  if (error) throw error;
}

// ── Subscription operations ───────────────────────────────────────────────────

export async function getSubscriptions(): Promise<Subscription[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .order('status')
    .order('vendor_name');
  if (error) throw error;
  return data || [];
}

export async function saveSubscription(sub: Partial<Subscription>): Promise<Subscription> {
  if (sub.id) {
    const { id, created_at, ...fields } = sub;
    const { data, error } = await supabase
      .from('subscriptions')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('subscriptions')
    .insert(sub)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSubscription(id: string): Promise<void> {
  // Guard: block if invoices exist
  const { count } = await supabase
    .from('subscription_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_id', id);
  if ((count ?? 0) > 0) {
    throw new Error('Cannot delete a subscription that has invoice history. Remove the invoices first.');
  }
  const { error } = await supabase.from('subscriptions').delete().eq('id', id);
  if (error) throw error;
}

export async function getSubscriptionInvoices(subscriptionId: string): Promise<SubscriptionInvoice[]> {
  const { data, error } = await supabase
    .from('subscription_invoices')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .order('invoice_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveSubscriptionInvoice(inv: Partial<SubscriptionInvoice>): Promise<SubscriptionInvoice> {
  if (inv.id) {
    const { id, created_at, ...fields } = inv;
    const { data, error } = await supabase
      .from('subscription_invoices')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('subscription_invoices')
    .insert(inv)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSubscriptionInvoice(id: string): Promise<void> {
  const { error } = await supabase.from('subscription_invoices').delete().eq('id', id);
  if (error) throw error;
}

export async function getSubscriptionInvoicesInRange(from: string, to: string): Promise<(SubscriptionInvoice & { vendor_name: string; service_name: string })[]> {
  const { data: invData, error: invErr } = await supabase
    .from('subscription_invoices')
    .select('*')
    .gte('invoice_date', from)
    .lte('invoice_date', to)
    .order('invoice_date', { ascending: false });
  if (invErr) throw invErr;
  if (!invData || invData.length === 0) return [];

  // Fetch subscription names for the IDs present
  const subIds = [...new Set(invData.map((i) => i.subscription_id))];
  const { data: subData } = await supabase
    .from('subscriptions')
    .select('id, vendor_name, service_name')
    .in('id', subIds);
  const subMap = new Map((subData || []).map((s) => [s.id, s]));

  return invData.map((inv) => ({
    ...inv,
    vendor_name: subMap.get(inv.subscription_id)?.vendor_name ?? '',
    service_name: subMap.get(inv.subscription_id)?.service_name ?? '',
  }));
}

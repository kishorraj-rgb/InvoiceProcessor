export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  basic_amount?: number;      // qty × unit_price (before tax)
  hsn_sac_code?: string;
  cgst_rate?: number;
  cgst_amount?: number;
  sgst_rate?: number;
  sgst_amount?: number;
  igst_rate?: number;
  igst_amount?: number;
  tax_rate?: number;          // combined rate (for simple invoices)
  tax_amount?: number;
  total: number;
}

export interface Vendor {
  id: string;
  vendor_code: string;
  vendor_name: string;
  vendor_address?: string;
  gstin?: string;
  place_of_supply?: string;
  vendor_pan?: string;
  vendor_contact_email?: string;
  beneficiary_name?: string;
  bank_name?: string;
  bank_branch?: string;
  account_number?: string;
  ifsc_code?: string;
  swift_code?: string;
  invoice_count: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  payment_terms?: string;
  document_type?: string;
  vendor_id?: string;
  vendor_name: string;
  vendor_gstin?: string;
  vendor_address?: string;
  buyer_name?: string;
  buyer_gstin?: string;
  buyer_address?: string;
  line_items: LineItem[];
  subtotal?: number;
  cgst_rate?: number;
  cgst_amount?: number;
  sgst_rate?: number;
  sgst_amount?: number;
  igst_rate?: number;
  igst_amount?: number;
  tax_amount?: number;
  tds_rate?: number;
  tds_amount?: number;
  round_off?: number;
  total_amount?: number;
  amount_in_words?: string;
  currency: string;
  service_period?: string;
  billing_period_from?: string;
  billing_period_to?: string;
  status: 'received' | 'processing' | 'approved' | 'paid' | 'partly_paid' | 'rejected';
  paid_amount?: number;
  category?: string;
  subcategory?: string;
  notes?: string;
  file_name?: string;
  file_url?: string;
  raw_extracted_data?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  payment_date: string;        // YYYY-MM-DD
  amount: number;
  payment_mode?: string;
  reference_number?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  asset_tag: string;
  asset_type: string;
  asset_name: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  purchased_from?: string;
  purchase_date?: string;
  warranty_expiry?: string;
  base_cost?: number;
  gst_percent?: number;
  gst_amount?: number;
  total_cost?: number;
  status: 'available' | 'assigned' | 'under_repair' | 'retired';
  assigned_to?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface AssetHistory {
  id: string;
  asset_id: string;
  action: string;
  from_status?: string;
  to_status?: string;
  assigned_to?: string;
  notes?: string;
  created_at: string;
}

export interface AppUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  status: 'active' | 'invited';
  invited_at: string;
  last_active_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  vendor_name: string;
  service_name: string;
  plan_name?: string;
  billing_cycle: 'monthly' | 'annual' | 'quarterly' | 'one-time';
  currency: string;
  amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  exchange_rate: number;
  inr_amount: number;
  account_email?: string;
  category?: string;
  status: 'active' | 'cancelled' | 'paused' | 'trial';
  start_date?: string;
  next_renewal_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionInvoice {
  id: string;
  subscription_id: string;
  invoice_number?: string;
  invoice_date?: string;
  billing_period_from?: string;
  billing_period_to?: string;
  currency: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  exchange_rate: number;
  inr_amount: number;
  file_name?: string;
  file_url?: string;
  notes?: string;
  created_at: string;
}

export interface ExtractedInvoiceData {
  // Vendor
  vendor_name?: string;
  vendor_address?: string;
  vendor_gstin?: string;
  vendor_pan?: string;
  vendor_contact_email?: string;
  place_of_supply?: string;
  // Bank
  beneficiary_name?: string;
  bank_name?: string;
  bank_branch?: string;
  account_number?: string;
  ifsc_code?: string;
  swift_code?: string;
  // Invoice header
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  payment_terms?: string;
  document_type?: string;
  // Bill to
  buyer_name?: string;
  buyer_email?: string;
  buyer_gstin?: string;
  buyer_address?: string;
  // Line items
  line_items?: LineItem[];
  // Amounts
  subtotal?: number;
  cgst_rate?: number;
  cgst_amount?: number;
  sgst_rate?: number;
  sgst_amount?: number;
  igst_rate?: number;
  igst_amount?: number;
  tax_amount?: number;
  tds_rate?: number;
  tds_amount?: number;
  round_off?: number;
  total_amount?: number;
  amount_in_words?: string;
  currency?: string;
  // Periods
  service_period?: string;
  billing_period_from?: string;
  billing_period_to?: string;
  category?: string;
  subcategory?: string;
}

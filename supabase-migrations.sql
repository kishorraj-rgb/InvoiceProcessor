-- Invoice Processor Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Vendors table
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_code text unique not null,
  vendor_name text not null,
  vendor_address text,
  gstin text,
  place_of_supply text,
  beneficiary_name text,
  bank_name text,
  account_number text,
  ifsc_code text,
  invoice_count integer default 0,
  total_amount numeric(14, 2) default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Invoices table
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text,
  invoice_date date,
  due_date date,
  vendor_id uuid references vendors(id) on delete set null,
  vendor_name text not null,
  vendor_gstin text,
  vendor_address text,
  buyer_name text,
  buyer_gstin text,
  line_items jsonb default '[]'::jsonb,
  subtotal numeric(14, 2),
  tax_amount numeric(14, 2),
  total_amount numeric(14, 2),
  currency text default 'INR',
  status text default 'received' check (status in ('received', 'processing', 'approved', 'paid', 'rejected')),
  notes text,
  file_name text,
  file_url text,
  raw_extracted_data jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- ============================================================
-- MIGRATION: Extended fields for audit compliance
-- Run these ALTER TABLE statements in Supabase SQL Editor
-- ============================================================

-- Vendor new columns
alter table vendors add column if not exists vendor_pan text;
alter table vendors add column if not exists vendor_contact_email text;
alter table vendors add column if not exists bank_branch text;
alter table vendors add column if not exists swift_code text;

-- Invoice new columns
alter table invoices add column if not exists payment_terms text;
alter table invoices add column if not exists document_type text;
alter table invoices add column if not exists buyer_address text;
alter table invoices add column if not exists cgst_rate numeric(6,2);
alter table invoices add column if not exists cgst_amount numeric(14,2);
alter table invoices add column if not exists sgst_rate numeric(6,2);
alter table invoices add column if not exists sgst_amount numeric(14,2);
alter table invoices add column if not exists igst_rate numeric(6,2);
alter table invoices add column if not exists igst_amount numeric(14,2);
alter table invoices add column if not exists tds_rate numeric(6,2);
alter table invoices add column if not exists tds_amount numeric(14,2);
alter table invoices add column if not exists round_off numeric(14,2);
alter table invoices add column if not exists amount_in_words text;
alter table invoices add column if not exists service_period text;
alter table invoices add column if not exists billing_period_from date;
alter table invoices add column if not exists billing_period_to date;

-- Indexes for common queries
create index if not exists invoices_vendor_id_idx on invoices(vendor_id);
create index if not exists invoices_status_idx on invoices(status);
create index if not exists invoices_invoice_date_idx on invoices(invoice_date);
create index if not exists vendors_vendor_name_idx on vendors(lower(vendor_name));

-- ============================================================
-- MIGRATION: Partly Paid status + paid_amount tracking
-- Run these in Supabase SQL Editor
-- ============================================================

-- Add paid_amount column (tracks how much has been paid for partly_paid invoices)
alter table invoices add column if not exists paid_amount numeric(14,2);

-- Update the status check constraint to allow 'partly_paid'
-- (Drop old constraint first, then recreate with the new value)
alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status in ('received', 'processing', 'approved', 'paid', 'partly_paid', 'rejected'));

-- Supabase Storage bucket for invoice files
-- Run this separately in the Supabase Dashboard > Storage > Create bucket
-- Bucket name: invoice-files
-- Public: true (or false if you want signed URLs)

-- Enable Row Level Security (optional - remove if not using auth)
-- alter table vendors enable row level security;
-- alter table invoices enable row level security;

-- Sample data (optional)
-- insert into vendors (vendor_code, vendor_name, vendor_address, gstin, invoice_count, total_amount)
-- values ('V000001', 'Sample Vendor Ltd', '123 Business St, Mumbai, MH', '27ABCDE1234F1Z5', 0, 0);

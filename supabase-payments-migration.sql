-- ── Multi-Tranche Invoice Payments ──────────────────────────────────────────
-- Run this in your Supabase SQL Editor

create table if not exists invoice_payments (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references invoices(id) on delete cascade,
  payment_date     date not null,
  amount           numeric(14, 2) not null check (amount > 0),
  payment_mode     text,           -- NEFT | RTGS | IMPS | UPI | Cheque | Wire Transfer | Cash
  reference_number text,           -- UTR / cheque no. / wire ref
  notes            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists invoice_payments_invoice_idx on invoice_payments(invoice_id);
create index if not exists invoice_payments_date_idx    on invoice_payments(payment_date);

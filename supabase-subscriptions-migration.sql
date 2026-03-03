-- ── Subscription Manager ─────────────────────────────────────────────────────
-- Run this in your Supabase SQL Editor

create table if not exists subscriptions (
  id                uuid primary key default gen_random_uuid(),
  vendor_name       text not null,
  service_name      text not null,
  plan_name         text,
  billing_cycle     text not null default 'monthly',  -- monthly | annual | quarterly | one-time
  currency          text not null default 'INR',
  amount            numeric(12,2) not null default 0,  -- base before tax, original currency
  tax_rate          numeric(5,2)  default 0,
  tax_amount        numeric(12,2) default 0,
  total_amount      numeric(12,2) not null default 0,  -- total in original currency
  exchange_rate     numeric(10,4) default 1,           -- original currency → INR
  inr_amount        numeric(12,2) default 0,           -- total_amount * exchange_rate
  account_email     text,
  category          text,
  status            text not null default 'active',    -- active | cancelled | paused | trial
  start_date        date,
  next_renewal_date date,
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists subscription_invoices (
  id                  uuid primary key default gen_random_uuid(),
  subscription_id     uuid not null references subscriptions(id) on delete cascade,
  invoice_number      text,
  invoice_date        date,
  billing_period_from date,
  billing_period_to   date,
  currency            text not null default 'INR',
  amount              numeric(12,2) default 0,
  tax_amount          numeric(12,2) default 0,
  total_amount        numeric(12,2) not null default 0,
  exchange_rate       numeric(10,4) default 1,
  inr_amount          numeric(12,2) default 0,
  file_name           text,
  file_url            text,
  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists sub_invoices_sub_id_idx   on subscription_invoices(subscription_id);
create index if not exists subscriptions_status_idx  on subscriptions(status);
create index if not exists subscriptions_renewal_idx on subscriptions(next_renewal_date);

-- ── Invoice Category & Subcategory ────────────────────────────────────────────
-- Run this in your Supabase SQL Editor

alter table invoices add column if not exists category text;
alter table invoices add column if not exists subcategory text;

create index if not exists invoices_category_idx on invoices(category);

-- ── Asset Management Tables ────────────────────────────────────────────────
-- Run this in your Supabase SQL Editor

-- Assets table
create table if not exists assets (
  id             uuid primary key default gen_random_uuid(),
  asset_tag      text unique not null,
  asset_type     text not null,
  asset_name     text not null,
  brand          text,
  model          text,
  serial_number  text,
  purchased_from text,
  purchase_date  date,
  warranty_expiry date,
  base_cost      numeric(14,2),
  gst_percent    numeric(6,2),
  gst_amount     numeric(14,2),
  total_cost     numeric(14,2),
  status         text not null default 'available'
                   check (status in ('available','assigned','under_repair','retired')),
  assigned_to    text,
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- Asset change history
create table if not exists asset_history (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid references assets(id) on delete cascade,
  action      text not null,
  from_status text,
  to_status   text,
  assigned_to text,
  notes       text,
  created_at  timestamptz default now()
);

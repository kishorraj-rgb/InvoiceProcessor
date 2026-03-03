-- ── Role Management / Team Members ───────────────────────────────────────────
-- Run this in your Supabase SQL Editor

create table if not exists app_users (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique,
  name             text,
  role             text not null default 'Viewer',  -- Admin | Finance / Accounts | Viewer | custom
  status           text not null default 'invited', -- active | invited
  invited_at       timestamptz default now(),
  last_active_at   timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists app_users_email_idx on app_users(email);
create index if not exists app_users_role_idx  on app_users(role);

-- Seed the admin — update email/name to match your profile
insert into app_users (email, name, role, status)
values ('kishor@educationtechplus.com', 'Kishor Raj', 'Admin', 'active')
on conflict (email) do nothing;

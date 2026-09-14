-- TRINITY desk snapshot (run in Supabase SQL Editor after profiles.sql)
-- Re-run safe: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--
-- Contract for IMOEX (desktop app), not this landing repo:
--   Same Supabase project + user JWT as the cabinet (email/password).
--   Desk (user JWT) may upsert paper/regime only.
--   License fields are NOT writable with the anon/user key: a trigger forces
--   trial on insert and freezes license_* / live_trading / trial dates on update.
--   Paid upgrade: service_role only (you, Stripe webhook, Edge Function) —
--     set license_status = 'active', live_trading = true.
--   NEVER write broker tokens or order payloads here.
--   Cabinet only SELECTs.

create table if not exists public.desk_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  license_status text not null default 'trial'
    check (license_status in ('trial', 'active', 'expired')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  trial_days_left integer,
  live_trading boolean not null default false,
  regime_label text,
  regime_note text,
  book text,
  realized_pnl_rub numeric,
  unrealized_pnl_rub numeric,
  open_count integer not null default 0,
  closed_count integer not null default 0,
  open_slots jsonb not null default '[]'::jsonb,
  equity_points jsonb not null default '[]'::jsonb
);

alter table public.desk_snapshots add column if not exists license_status text;
alter table public.desk_snapshots add column if not exists trial_started_at timestamptz;
alter table public.desk_snapshots add column if not exists trial_ends_at timestamptz;
alter table public.desk_snapshots add column if not exists trial_days_left integer;
alter table public.desk_snapshots add column if not exists live_trading boolean not null default false;
alter table public.desk_snapshots add column if not exists regime_label text;
alter table public.desk_snapshots add column if not exists regime_note text;
alter table public.desk_snapshots add column if not exists book text;
alter table public.desk_snapshots add column if not exists realized_pnl_rub numeric;
alter table public.desk_snapshots add column if not exists unrealized_pnl_rub numeric;
alter table public.desk_snapshots add column if not exists open_count integer not null default 0;
alter table public.desk_snapshots add column if not exists closed_count integer not null default 0;
alter table public.desk_snapshots add column if not exists open_slots jsonb not null default '[]'::jsonb;
alter table public.desk_snapshots add column if not exists equity_points jsonb not null default '[]'::jsonb;

alter table public.desk_snapshots enable row level security;

drop policy if exists "desk_snapshots_select_own" on public.desk_snapshots;
create policy "desk_snapshots_select_own"
  on public.desk_snapshots for select
  using (auth.uid() = user_id);

drop policy if exists "desk_snapshots_insert_own" on public.desk_snapshots;
create policy "desk_snapshots_insert_own"
  on public.desk_snapshots for insert
  with check (auth.uid() = user_id);

drop policy if exists "desk_snapshots_update_own" on public.desk_snapshots;
create policy "desk_snapshots_update_own"
  on public.desk_snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.desk_snapshots is
  'Paper/regime snapshot from the desktop desk. License columns are service_role-only. No broker tokens.';

-- User JWT cannot self-upgrade to paid. service_role (SQL editor / webhook) can.
create or replace function public.desk_snapshots_protect_license()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.license_status := 'trial';
    new.live_trading := false;
    new.trial_started_at := coalesce(new.trial_started_at, now());
    new.trial_ends_at := new.trial_started_at + interval '7 days';
    new.trial_days_left := 7;
    return new;
  end if;

  new.license_status := old.license_status;
  new.live_trading := old.live_trading;
  new.trial_started_at := old.trial_started_at;
  new.trial_ends_at := old.trial_ends_at;
  new.trial_days_left := old.trial_days_left;
  return new;
end;
$$;

drop trigger if exists desk_snapshots_protect_license on public.desk_snapshots;
create trigger desk_snapshots_protect_license
  before insert or update on public.desk_snapshots
  for each row execute function public.desk_snapshots_protect_license();

-- TRINITY invest circuit (run in Supabase SQL Editor)
-- Idempotent. RLS: each user sees only own rows (auth.uid() = user_id).
-- Does not replace profiles.sql — run after cabinet profiles exist.

-- —— Risk questionnaire (one row per user) ——
create table if not exists public.invest_risk_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  horizon text,
  liquidity text,
  reserve text,
  drawdown_behavior text,
  expense_impact text,
  volatility text,
  acknowledgement boolean not null default false,
  answers jsonb not null default '{}'::jsonb,
  risk_level text not null,
  warn_drawdown_pct numeric not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.invest_risk_profiles add column if not exists horizon text;
alter table public.invest_risk_profiles add column if not exists liquidity text;
alter table public.invest_risk_profiles add column if not exists reserve text;
alter table public.invest_risk_profiles add column if not exists drawdown_behavior text;
alter table public.invest_risk_profiles add column if not exists expense_impact text;
alter table public.invest_risk_profiles add column if not exists volatility text;
alter table public.invest_risk_profiles add column if not exists acknowledgement boolean not null default false;
alter table public.invest_risk_profiles add column if not exists answers jsonb not null default '{}'::jsonb;
alter table public.invest_risk_profiles add column if not exists risk_level text;
alter table public.invest_risk_profiles add column if not exists warn_drawdown_pct numeric;
alter table public.invest_risk_profiles add column if not exists completed_at timestamptz;
alter table public.invest_risk_profiles add column if not exists created_at timestamptz not null default now();
alter table public.invest_risk_profiles add column if not exists updated_at timestamptz not null default now();

create unique index if not exists invest_risk_profiles_user_uidx
  on public.invest_risk_profiles (user_id);

-- —— Manual portfolio (assets + liabilities) ——
create table if not exists public.invest_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  side text not null,
  asset_class text not null,
  name text,
  ticker text,
  value numeric not null default 0,
  income_monthly numeric,
  yield_annual_pct numeric,
  currency text not null default 'RUB',
  notes text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invest_positions add column if not exists side text;
alter table public.invest_positions add column if not exists asset_class text;
alter table public.invest_positions add column if not exists name text;
alter table public.invest_positions add column if not exists ticker text;
alter table public.invest_positions add column if not exists value numeric not null default 0;
alter table public.invest_positions add column if not exists income_monthly numeric;
alter table public.invest_positions add column if not exists yield_annual_pct numeric;
alter table public.invest_positions add column if not exists currency text not null default 'RUB';
alter table public.invest_positions add column if not exists notes text;
alter table public.invest_positions add column if not exists source text not null default 'manual';
alter table public.invest_positions add column if not exists created_at timestamptz not null default now();
alter table public.invest_positions add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invest_positions_side_check'
  ) then
    alter table public.invest_positions
      add constraint invest_positions_side_check
      check (side in ('asset', 'liability'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'invest_positions_source_check'
  ) then
    alter table public.invest_positions
      add constraint invest_positions_source_check
      check (source in ('manual', 'desk'));
  end if;
end $$;

create index if not exists invest_positions_user_idx
  on public.invest_positions (user_id, created_at desc);

-- —— Auto-analysis runs (verdict + deep explanation) ——
create table if not exists public.invest_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  inputs jsonb not null default '{}'::jsonb,
  gates jsonb not null default '{}'::jsonb,
  verdict text not null,
  scenarios jsonb,
  explanation jsonb,
  created_at timestamptz not null default now()
);

alter table public.invest_analysis_runs add column if not exists ticker text;
alter table public.invest_analysis_runs add column if not exists inputs jsonb not null default '{}'::jsonb;
alter table public.invest_analysis_runs add column if not exists gates jsonb not null default '{}'::jsonb;
alter table public.invest_analysis_runs add column if not exists verdict text;
alter table public.invest_analysis_runs add column if not exists scenarios jsonb;
alter table public.invest_analysis_runs add column if not exists explanation jsonb;
alter table public.invest_analysis_runs add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invest_analysis_runs_verdict_check'
  ) then
    alter table public.invest_analysis_runs
      add constraint invest_analysis_runs_verdict_check
      check (verdict in ('invest', 'watch', 'skip'));
  end if;
end $$;

create index if not exists invest_analysis_runs_user_idx
  on public.invest_analysis_runs (user_id, created_at desc);

-- —— Watch list (interest, not a position) ——
create table if not exists public.invest_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  name text,
  last_verdict text,
  last_price numeric,
  last_lead text,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ticker)
);

alter table public.invest_watchlist add column if not exists ticker text;
alter table public.invest_watchlist add column if not exists name text;
alter table public.invest_watchlist add column if not exists last_verdict text;
alter table public.invest_watchlist add column if not exists last_price numeric;
alter table public.invest_watchlist add column if not exists last_lead text;
alter table public.invest_watchlist add column if not exists last_run_at timestamptz;
alter table public.invest_watchlist add column if not exists created_at timestamptz not null default now();
alter table public.invest_watchlist add column if not exists updated_at timestamptz not null default now();

create unique index if not exists invest_watchlist_user_ticker_uidx
  on public.invest_watchlist (user_id, ticker);

create index if not exists invest_watchlist_user_idx
  on public.invest_watchlist (user_id, updated_at desc);

-- —— RLS ——
alter table public.invest_risk_profiles enable row level security;
alter table public.invest_positions enable row level security;
alter table public.invest_analysis_runs enable row level security;
alter table public.invest_watchlist enable row level security;

drop policy if exists "invest_risk_select_own" on public.invest_risk_profiles;
create policy "invest_risk_select_own"
  on public.invest_risk_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "invest_risk_insert_own" on public.invest_risk_profiles;
create policy "invest_risk_insert_own"
  on public.invest_risk_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "invest_risk_update_own" on public.invest_risk_profiles;
create policy "invest_risk_update_own"
  on public.invest_risk_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "invest_risk_delete_own" on public.invest_risk_profiles;
create policy "invest_risk_delete_own"
  on public.invest_risk_profiles for delete
  using (auth.uid() = user_id);

drop policy if exists "invest_pos_select_own" on public.invest_positions;
create policy "invest_pos_select_own"
  on public.invest_positions for select
  using (auth.uid() = user_id);

drop policy if exists "invest_pos_insert_own" on public.invest_positions;
create policy "invest_pos_insert_own"
  on public.invest_positions for insert
  with check (auth.uid() = user_id);

drop policy if exists "invest_pos_update_own" on public.invest_positions;
create policy "invest_pos_update_own"
  on public.invest_positions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "invest_pos_delete_own" on public.invest_positions;
create policy "invest_pos_delete_own"
  on public.invest_positions for delete
  using (auth.uid() = user_id);

drop policy if exists "invest_runs_select_own" on public.invest_analysis_runs;
create policy "invest_runs_select_own"
  on public.invest_analysis_runs for select
  using (auth.uid() = user_id);

drop policy if exists "invest_runs_insert_own" on public.invest_analysis_runs;
create policy "invest_runs_insert_own"
  on public.invest_analysis_runs for insert
  with check (auth.uid() = user_id);

drop policy if exists "invest_runs_update_own" on public.invest_analysis_runs;
create policy "invest_runs_update_own"
  on public.invest_analysis_runs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "invest_runs_delete_own" on public.invest_analysis_runs;
create policy "invest_runs_delete_own"
  on public.invest_analysis_runs for delete
  using (auth.uid() = user_id);

drop policy if exists "invest_watch_select_own" on public.invest_watchlist;
create policy "invest_watch_select_own"
  on public.invest_watchlist for select
  using (auth.uid() = user_id);

drop policy if exists "invest_watch_insert_own" on public.invest_watchlist;
create policy "invest_watch_insert_own"
  on public.invest_watchlist for insert
  with check (auth.uid() = user_id);

drop policy if exists "invest_watch_update_own" on public.invest_watchlist;
create policy "invest_watch_update_own"
  on public.invest_watchlist for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "invest_watch_delete_own" on public.invest_watchlist;
create policy "invest_watch_delete_own"
  on public.invest_watchlist for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.invest_risk_profiles to authenticated;
grant select, insert, update, delete on public.invest_positions to authenticated;
grant select, insert, update, delete on public.invest_analysis_runs to authenticated;
grant select, insert, update, delete on public.invest_watchlist to authenticated;

comment on table public.invest_risk_profiles is
  'TRINITY invest: risk questionnaire + derived risk_level / warn_drawdown_pct. One row per user.';
comment on table public.invest_positions is
  'TRINITY invest: manual assets/liabilities. value = capital; income_monthly = rent/coupon/payment; yield_annual_pct = optional annual rate. Desk legs merge client-side.';
comment on table public.invest_analysis_runs is
  'TRINITY invest: ticker analysis runs with gates, verdict, scenarios, explanation JSON.';
comment on table public.invest_watchlist is
  'TRINITY invest: watch list of tickers not yet bought. Refresh to wait for a calmer entry.';

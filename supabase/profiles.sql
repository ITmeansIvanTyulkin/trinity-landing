-- TRINITY cabinet profiles (run in Supabase SQL Editor)
-- Auth emails/passwords live in auth.users; this table is for mailing + product profile.
-- Re-run safe: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  marketing_opt_in boolean not null default false,
  source text not null default 'cabinet',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists age_years integer;
alter table public.profiles add column if not exists trading_experience text;
alter table public.profiles add column if not exists pdn_consent boolean not null default false;
alter table public.profiles add column if not exists pdn_consent_at timestamptz;

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists profiles_marketing_idx on public.profiles (marketing_opt_in)
  where marketing_opt_in = true;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Inserts only via trigger (security definer), not from anon client.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  age_val integer;
begin
  begin
    age_val := nullif(meta->>'age_years', '')::integer;
  exception when others then
    age_val := null;
  end;

  insert into public.profiles (
    id,
    email,
    display_name,
    phone,
    gender,
    age_years,
    trading_experience,
    marketing_opt_in,
    pdn_consent,
    pdn_consent_at,
    source
  )
  values (
    new.id,
    new.email,
    coalesce(meta->>'display_name', split_part(new.email, '@', 1)),
    nullif(meta->>'phone', ''),
    nullif(meta->>'gender', ''),
    age_val,
    nullif(meta->>'trading_experience', ''),
    coalesce((meta->>'marketing_opt_in')::boolean, false),
    coalesce((meta->>'pdn_consent')::boolean, false),
    case
      when coalesce((meta->>'pdn_consent')::boolean, false) then now()
      else null
    end,
    coalesce(meta->>'source', 'cabinet')
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on table public.profiles is
  'TRINITY user profile + mailing opt-in (with explicit PDN consent). Passwords never stored here.';

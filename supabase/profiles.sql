-- TRINITY cabinet profiles (run in Supabase SQL Editor)
-- Auth emails/passwords live in auth.users; this table is for mailing + product profile.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  marketing_opt_in boolean not null default true,
  source text not null default 'cabinet',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
begin
  insert into public.profiles (id, email, display_name, marketing_opt_in, source)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean, true),
    coalesce(new.raw_user_meta_data->>'source', 'cabinet')
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
  'TRINITY user profile + mailing opt-in. Passwords never stored here.';

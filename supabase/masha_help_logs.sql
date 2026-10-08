-- TRINITY: диалоги с Машей (помощь в кабинете) для дообучения ответов.
-- Run in Supabase SQL Editor after profiles.sql.
-- Export for training: service_role / SQL Editor (RLS: users insert own rows only).

create table if not exists public.masha_help_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  session_id text not null,
  created_at timestamptz not null default now(),
  event_type text not null default 'turn',
  user_text text,
  reply_mode text,
  reply_summary text,
  topic_ids text[] not null default '{}',
  wiki_id text,
  wiki_href text,
  path text,
  feedback text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists masha_help_logs_created_idx
  on public.masha_help_logs (created_at desc);
create index if not exists masha_help_logs_user_idx
  on public.masha_help_logs (user_id, created_at desc);
create index if not exists masha_help_logs_session_idx
  on public.masha_help_logs (session_id);
create index if not exists masha_help_logs_feedback_idx
  on public.masha_help_logs (feedback)
  where feedback is not null;

alter table public.masha_help_logs enable row level security;

drop policy if exists "masha_help_insert_own" on public.masha_help_logs;
create policy "masha_help_insert_own"
  on public.masha_help_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "masha_help_select_own" on public.masha_help_logs;
create policy "masha_help_select_own"
  on public.masha_help_logs for select
  to authenticated
  using (auth.uid() = user_id);

-- Training export example (run as project owner / service_role):
--   select created_at, user_text, reply_mode, reply_summary, topic_ids,
--          wiki_id, wiki_href, path, feedback
--   from public.masha_help_logs
--   order by created_at desc;

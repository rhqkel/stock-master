-- Run once in the Supabase SQL Editor.
create table public.portfolios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.portfolios enable row level security;
revoke all on public.portfolios from anon, authenticated;
grant select, insert, update on public.portfolios to authenticated;
create policy "Read own portfolio" on public.portfolios for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Create own portfolio" on public.portfolios for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own portfolio" on public.portfolios for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

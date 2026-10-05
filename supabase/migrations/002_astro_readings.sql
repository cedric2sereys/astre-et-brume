-- Astre & Brume — cached FreeAstroAPI results (free plan: 80 requests/day).
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- One row per user and reading:
--   reading_key = 'natal'             → natal chart, recalculated only when birth data changes
--   reading_key = 'daily:YYYY-MM-DD'  → personal daily horoscope + transits for that date
-- `digest` holds a compact summary of the API answer (what the agent needs), not the raw JSON.

create table if not exists public.astro_readings (
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reading_key      text not null check (reading_key = 'natal' or reading_key ~ '^daily:\d{4}-\d{2}-\d{2}$'),
  input_signature  text not null,           -- birth data used; a change triggers a recalculation
  digest           jsonb not null,
  created_at       timestamptz not null default now(),
  primary key (user_id, reading_key)
);

alter table public.astro_readings enable row level security;

drop policy if exists "Users read their own readings" on public.astro_readings;
create policy "Users read their own readings"
  on public.astro_readings for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users add their own readings" on public.astro_readings;
create policy "Users add their own readings"
  on public.astro_readings for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users refresh their own readings" on public.astro_readings;
create policy "Users refresh their own readings"
  on public.astro_readings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.astro_readings from anon;
grant select, insert, update on public.astro_readings to authenticated;

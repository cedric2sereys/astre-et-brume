-- Astre & Brume — profiles and chat history.
-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- Leaves the existing tables (Horoscopes, n8n_chat_histories) untouched.

-- ---------------------------------------------------------------------------
-- profiles: one row per user (nickname + birth data)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  pseudo        text not null check (char_length(pseudo) between 1 and 32),
  birth_date    date,
  birth_time    time,                    -- local time at birth place, HH:MM
  birth_place   text,                    -- label returned by OpenStreetMap
  latitude      double precision check (latitude between -90 and 90),
  longitude     double precision check (longitude between -180 and 180),
  timezone      text,                    -- IANA name, e.g. Europe/Paris
  house_system  text check (house_system in ('placidus', 'koch', 'whole_sign', 'equal')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users create their own profile" on public.profiles;
create policy "Users create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- chat_messages: conversation history between a user and the agent
-- ---------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null check (char_length(content) between 1 and 20000),
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at);

alter table public.chat_messages enable row level security;

drop policy if exists "Users read their own messages" on public.chat_messages;
create policy "Users read their own messages"
  on public.chat_messages for select to authenticated
  using ((select auth.uid()) = user_id);

-- For now the browser also writes the (simulated) agent replies.
-- When the real AI is connected, this will be narrowed to role = 'user' and the
-- server-side function will write the assistant replies itself.
drop policy if exists "Users add their own messages" on public.chat_messages;
create policy "Users add their own messages"
  on public.chat_messages for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Privileges: signed-in users only; nothing for anonymous visitors.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.chat_messages from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.chat_messages to authenticated;

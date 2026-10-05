-- Astre & Brume — several conversations per user.
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- Adds public.conversations and links every chat message to one conversation.
-- Existing messages are grouped, per user, into a first conversation ("Première conversation").

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text check (char_length(title) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()   -- time of the latest message
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

alter table public.conversations enable row level security;

drop policy if exists "Users read their own conversations" on public.conversations;
create policy "Users read their own conversations"
  on public.conversations for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own conversations" on public.conversations;
create policy "Users create their own conversations"
  on public.conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own conversations" on public.conversations;
create policy "Users update their own conversations"
  on public.conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.conversations from anon;
grant select, insert, update on public.conversations to authenticated;

-- ---------------------------------------------------------------------------
-- chat_messages → conversation
-- ---------------------------------------------------------------------------
alter table public.chat_messages
  add column if not exists conversation_id uuid references public.conversations (id) on delete cascade;

-- Group the messages that existed before this migration into one conversation per user.
with first_conversations as (
  insert into public.conversations (user_id, title, created_at, updated_at)
  select user_id, 'Première conversation', min(created_at), max(created_at)
  from public.chat_messages
  where conversation_id is null
  group by user_id
  returning id, user_id
)
update public.chat_messages m
set conversation_id = f.id
from first_conversations f
where m.user_id = f.user_id
  and m.conversation_id is null;

alter table public.chat_messages alter column conversation_id set not null;

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at, id);

-- A message can only be added to one of the user's own conversations.
drop policy if exists "Users add their own messages" on public.chat_messages;
create policy "Users add their own messages"
  on public.chat_messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

-- Keep conversations.updated_at = time of the latest message (sorts the list).
create or replace function public.touch_conversation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists chat_messages_touch_conversation on public.chat_messages;
create trigger chat_messages_touch_conversation
  after insert on public.chat_messages
  for each row execute function public.touch_conversation();

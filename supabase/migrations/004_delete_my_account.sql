-- Astre & Brume — let a signed-in user delete their own account and all their data.
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- Deleting the auth user cascades to everything that references it:
-- profiles, conversations, chat_messages, astro_readings (all "on delete cascade").

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer          -- runs with the owner's rights, needed to delete from auth.users
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  -- Only ever the caller's own account.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

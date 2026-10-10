-- Astre & Brume — count the characters read aloud by hosted voices (Gradium, later ElevenLabs),
-- so the whole app stays within their free monthly allowance and each user within a daily cap.
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- Only the "voice" Edge Function (service role) reads or writes this: users have no access.

create table if not exists public.voice_usage (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  provider text not null,
  chars    integer not null default 0,
  primary key (user_id, day, provider)
);

alter table public.voice_usage enable row level security;  -- no policies: no user access

-- Adds p_chars to today's count (UTC) if both caps allow it, and says why not otherwise:
-- 'ok', 'daily' (this user's daily cap) or 'monthly' (the whole app's monthly budget).
-- A negative p_chars gives characters back after a failed request (never refused).
create or replace function public.reserve_voice_chars(
  p_user uuid,
  p_provider text,
  p_chars integer,
  p_daily_cap integer,
  p_monthly_cap integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  used_today integer;
  used_month integer;
begin
  -- One request at a time per provider, so two users cannot both take the last characters.
  perform pg_advisory_xact_lock(hashtext('voice_usage:' || p_provider));

  if p_chars > 0 then
    select coalesce(sum(chars), 0) into used_today
      from public.voice_usage
      where user_id = p_user and day = today and provider = p_provider;
    if used_today + p_chars > p_daily_cap then
      return 'daily';
    end if;

    select coalesce(sum(chars), 0) into used_month
      from public.voice_usage
      where provider = p_provider and day >= date_trunc('month', today)::date;
    if used_month + p_chars > p_monthly_cap then
      return 'monthly';
    end if;
  end if;

  insert into public.voice_usage as u (user_id, day, provider, chars)
    values (p_user, today, p_provider, greatest(p_chars, 0))
    on conflict (user_id, day, provider)
    do update set chars = greatest(u.chars + p_chars, 0);
  return 'ok';
end;
$$;

revoke all on function public.reserve_voice_chars(uuid, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_voice_chars(uuid, text, integer, integer, integer)
  to service_role;

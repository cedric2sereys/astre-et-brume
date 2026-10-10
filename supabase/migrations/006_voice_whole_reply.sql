-- Astre & Brume — one voice per reply: before reading the first piece of a reply, the "voice"
-- function checks that the WHOLE reply still fits a provider's caps, while counting only that piece.
-- Run once in Supabase: SQL Editor → New query → paste → Run (after 005_voice_usage.sql).

drop function if exists public.reserve_voice_chars(uuid, text, integer, integer, integer);

-- Adds p_chars to today's count (UTC) if p_needed characters (the whole reply, or just p_chars)
-- still fit both caps, and says why not otherwise: 'ok', 'daily' (this user's daily cap) or
-- 'monthly' (the whole app's monthly budget).
-- A negative p_chars gives characters back after a failed request (never refused).
create or replace function public.reserve_voice_chars(
  p_user uuid,
  p_provider text,
  p_chars integer,
  p_needed integer,
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
  needed integer := greatest(coalesce(p_needed, 0), p_chars);
  used_today integer;
  used_month integer;
begin
  -- One request at a time per provider, so two users cannot both take the last characters.
  perform pg_advisory_xact_lock(hashtext('voice_usage:' || p_provider));

  if p_chars > 0 then
    select coalesce(sum(chars), 0) into used_today
      from public.voice_usage
      where user_id = p_user and day = today and provider = p_provider;
    if used_today + needed > p_daily_cap then
      return 'daily';
    end if;

    select coalesce(sum(chars), 0) into used_month
      from public.voice_usage
      where provider = p_provider and day >= date_trunc('month', today)::date;
    if used_month + needed > p_monthly_cap then
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

revoke all on function public.reserve_voice_chars(uuid, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_voice_chars(uuid, text, integer, integer, integer, integer)
  to service_role;

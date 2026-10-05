// Supabase Edge Function "chat": the Astre & Brume agent, powered by Google Gemini (free tier)
// and FreeAstroAPI (natal chart + personal daily horoscope with transits, free tier).
//
// The browser sends { message, timezone }. This function checks who the user is, loads their
// profile and recent history (with the user's own rights, so RLS applies), makes sure the
// natal chart and today's horoscope are available (cached in astro_readings to stay within
// FreeAstroAPI's 80 requests/day), asks Gemini for a reply grounded in that data, then saves
// both messages and returns the reply.
//
// Secrets required (Supabase → Edge Functions → Secrets): GEMINI_API_KEY, FREEASTRO_API_KEY
// Optional secret: GEMINI_MODEL (defaults to gemini-flash-latest)

import { ApiError, GoogleGenAI } from 'npm:@google/genai@2.27.0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest';
const FALLBACK_MODEL = 'gemini-flash-lite-latest'; // larger free daily quota
const HISTORY_LIMIT = 40; // most recent messages sent to the model as context
const MAX_MESSAGE_LENGTH = 4000;

const FREEASTRO_URL = 'https://api.freeastroapi.com';
const FREEASTRO_KEY = Deno.env.get('FREEASTRO_API_KEY') ?? '';
const INTERPRETATION_CHARS = 320; // per natal interpretation text, to keep the prompt compact

const GREETING =
  'Bonjour, comment puis-je t’aider ? Souhaites-tu que je te donne ton horoscope du jour personnalisé ?';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const gemini = new GoogleGenAI({ apiKey: Deno.env.get('GEMINI_API_KEY') ?? '' });

type ChatTurn = { role: 'user' | 'assistant'; content: string };

interface Profile {
  pseudo: string;
  birth_date: string | null;
  birth_time: string | null;
  birth_place: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  house_system: string | null;
}

/** Profile whose birth data is complete enough for FreeAstroAPI. */
type BirthProfile = Profile & {
  birth_date: string;
  birth_time: string;
  latitude: number;
  longitude: number;
  timezone: string;
  house_system: string;
};

interface Readings {
  natal: unknown | null;
  daily: unknown | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Today's date as YYYY-MM-DD (ISO 8601) in the given time zone. */
function isoDateIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// ---------------------------------------------------------------------------------------
// FreeAstroAPI
// ---------------------------------------------------------------------------------------

function hasBirthData(p: Profile): p is BirthProfile {
  return Boolean(
    p.birth_date && p.birth_time && p.latitude != null && p.longitude != null &&
      p.timezone && p.house_system,
  );
}

/** Changes whenever the birth data changes, so cached readings get recalculated. */
function birthSignature(p: BirthProfile): string {
  return [p.birth_date, p.birth_time.slice(0, 5), p.latitude, p.longitude, p.timezone, p.house_system]
    .join('|');
}

function birthFields(p: BirthProfile) {
  const [year, month, day] = p.birth_date.split('-').map(Number);
  const [hour, minute] = p.birth_time.split(':').map(Number);
  return {
    year,
    month,
    day,
    hour,
    minute,
    time_known: true,
    city: (p.birth_place ?? '').split(',')[0].trim() || 'Unknown',
    lat: p.latitude,
    lng: p.longitude,
    tz_str: p.timezone,
  };
}

// deno-lint-ignore no-explicit-any
async function freeAstro(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${FREEASTRO_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': FREEASTRO_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`FreeAstroAPI ${path} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Cuts a text at the last sentence end before `max` characters. */
function shorten(text: string, max: number): string {
  if (!text || text.length <= max) return text ?? '';
  const cut = text.slice(0, max);
  const end = cut.lastIndexOf('. ');
  return end > max / 2 ? cut.slice(0, end + 1) : `${cut}…`;
}

/** Keeps what the agent needs from the natal answer (~5k tokens instead of ~100 KB). */
// deno-lint-ignore no-explicit-any
function natalDigest(d: any) {
  // deno-lint-ignore no-explicit-any
  const sections = (d.interpretation?.sections ?? {}) as Record<string, any[]>;
  return {
    planets: (d.planets ?? []).map((p: any) => ({
      body: p.id,
      sign: p.sign_id,
      degree: round1(p.pos),
      house: p.house,
      retrograde: p.retrograde,
    })),
    ascendant: { sign: d.angles_details?.asc?.sign_id, degree: round1(d.angles_details?.asc?.pos ?? 0) },
    midheaven: { sign: d.angles_details?.mc?.sign_id, degree: round1(d.angles_details?.mc?.pos ?? 0) },
    houses: (d.houses ?? []).map((h: any) => ({ house: h.house, sign: h.sign_id, degree: round1(h.pos) })),
    aspects: (d.aspects ?? [])
      .filter((a: any) => a.is_major)
      .sort((a: any, b: any) => a.orb - b.orb)
      .slice(0, 20)
      .map((a: any) => `${a.p1} ${a.type} ${a.p2} (orb ${round1(a.orb)}°)`),
    interpretations: Object.entries(sections).flatMap(([section, entries]) =>
      entries.map((e) => ({ section, title: e.title, text: shorten(e.body, INTERPRETATION_CHARS) }))
    ),
  };
}

/** Keeps what the agent needs from the personal daily horoscope answer. */
// deno-lint-ignore no-explicit-any
function dailyDigest(d: any) {
  const data = d.data ?? {};
  const personal = data.personal ?? {};
  return {
    date: data.date,
    theme: data.content?.theme,
    keywords: data.content?.keywords,
    scores_out_of_100: data.scores,
    moon: { sign: data.astro?.moon_sign?.label, phase: data.astro?.moon_phase?.label },
    focus_areas: personal.focus_areas,
    supportive_vs_challenging: personal.supportive_vs_challenging,
    score_reasons: (data.score_factors ?? [])
      .filter((f: any) => f.dimension !== 'overall')
      .map((f: any) => ({
        area: f.dimension,
        drivers: (f.drivers ?? []).map((x: any) => x.label),
        reason: f.reason?.main,
      })),
    top_transits: (personal.transits_top ?? []).map((t: any) => ({
      transit: t.label,
      strength: t.score,
      exact_at_utc: t.exact_at,
      meaning: t.explanation?.main,
      advice: t.explanation?.supporting,
    })),
    lucky: {
      color: data.lucky?.color?.label,
      number: data.lucky?.number,
      time_window: data.lucky?.time_window
        ? `${data.lucky.time_window.display} (${data.lucky.time_window.tz})`
        : undefined,
    },
  };
}

/**
 * Returns the natal chart and today's horoscope, from the cache when it is still valid,
 * otherwise from FreeAstroAPI (then cached). A failure only drops that reading.
 */
async function loadReadings(
  supabase: SupabaseClient,
  userId: string,
  profile: Profile,
  today: string,
  userTimeZone: string,
): Promise<Readings> {
  const readings: Readings = { natal: null, daily: null };
  if (!hasBirthData(profile) || !FREEASTRO_KEY) return readings;

  const signature = birthSignature(profile);
  const dailyKey = `daily:${today}`;
  const { data: cached, error } = await supabase
    .from('astro_readings')
    .select('reading_key, input_signature, digest')
    .in('reading_key', ['natal', dailyKey]);
  if (error) console.error('reading cache failed', error);

  const fresh = (key: string) =>
    cached?.find((r) => r.reading_key === key && r.input_signature === signature)?.digest ?? null;
  readings.natal = fresh('natal');
  readings.daily = fresh(dailyKey);

  const save = async (reading_key: string, digest: unknown) => {
    const { error } = await supabase
      .from('astro_readings')
      .upsert(
        { user_id: userId, reading_key, input_signature: signature, digest },
        { onConflict: 'user_id,reading_key' },
      );
    if (error) console.error(`saving ${reading_key} failed`, error);
  };

  let calledApi = false;
  if (!readings.natal) {
    try {
      const natal = await freeAstro('/api/v1/natal/calculate', {
        name: profile.pseudo,
        ...birthFields(profile),
        house_system: profile.house_system,
        zodiac_type: 'tropical',
        interpretation: { enable: true, style: 'improved' },
      });
      readings.natal = natalDigest(natal);
      await save('natal', readings.natal);
    } catch (e) {
      console.error('natal chart unavailable:', (e as Error).message);
    }
    calledApi = true;
  }

  if (!readings.daily) {
    // Free plan allows 1 request per second.
    if (calledApi) await new Promise((r) => setTimeout(r, 1100));
    try {
      const daily = await freeAstro('/api/v3/horoscope/daily/personal', {
        birth: birthFields(profile),
        date: today,
        tz_str: userTimeZone,
        include_interpretation_blocks: true,
      });
      readings.daily = dailyDigest(daily);
      await save(dailyKey, readings.daily);
    } catch (e) {
      console.error('daily horoscope unavailable:', (e as Error).message);
    }
  }
  return readings;
}

// ---------------------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------------------

// Written in English on purpose: a French prompt plus a French history pulls the model
// toward French even when the user switches language.
function systemPrompt(
  profile: Profile,
  todayLabel: string,
  userTimeZone: string,
  readings: Readings,
): string {
  const birth = profile.birth_date
    ? [
        `- Birth date: ${profile.birth_date}`,
        `- Birth time (local): ${profile.birth_time?.slice(0, 5) ?? 'unknown'}`,
        `- Birth place: ${profile.birth_place ?? 'unknown'} (lat ${profile.latitude}, lon ${profile.longitude})`,
        `- Time zone: ${profile.timezone ?? 'unknown'}`,
        `- House system: ${profile.house_system ?? 'unknown'}`,
      ].join('\n')
    : '- Birth chart not provided.';

  const natal = readings.natal
    ? JSON.stringify(readings.natal)
    : 'UNAVAILABLE right now. Rely on the sun sign derived from the birth date, and say briefly that the full chart could not be calculated if the user asks for precise placements.';
  const daily = readings.daily
    ? JSON.stringify(readings.daily)
    : "UNAVAILABLE right now. If the user asks for today's horoscope, give a general reading based on the sun sign and say briefly that today's precise transits could not be calculated.";

  return `You are the agent of "Astre & Brume", a celestial workshop: a kind, warm astrologer with a poetic touch who never becomes grandiloquent.

LANGUAGE — most important rule:
- Always reply in the language of the user's LATEST message, whatever language earlier messages, your greeting, this prompt or the astrological data are in.
- If the user writes in English, reply entirely in English; in Spanish, entirely in Spanish; and so on. Switch immediately when they switch.
- Speak informally: "tu" in French, a friendly informal tone in other languages.

The user's nickname is "${profile.pseudo}". Their birth data:
${birth}

Today's date: ${todayLabel}. The user's current time zone: ${userTimeZone}.

The app opened the conversation with this greeting (in French, the app's default language): "${GREETING}"

ASTROLOGICAL DATA — calculated by FreeAstroAPI (Swiss Ephemeris). It is in English: translate everything you use into the user's language.
Natal chart (tropical zodiac; degrees are positions within the sign):
${natal}

Today's personal horoscope (theme, scores, top transits from today's sky to the natal chart):
${daily}

How to use the data:
- Base every reading on this data. Never invent planetary positions, degrees, aspects or transits that are not listed.
- Summarise and interpret: pick the 2 to 4 most relevant elements for the question, explain them simply and warmly, and connect them. Do not list or dump the raw data, and only quote degrees or scores if the user asks.
- Daily horoscope: start from the theme and the strongest transits, mention the areas with the highest and lowest scores, and give one or two concrete pieces of advice. Times in the data are UTC: convert them to the user's time zone if you mention them.
- Birth chart reading: start with the Sun, Moon and Ascendant, then what the user asks about.

What you do:
- Personalised daily horoscope, birth chart reading, questions about signs, planets and transits.
- Short, readable answers: a few paragraphs at most, no Markdown headings. Often end with a question to keep the conversation going.
- Astrology is a tool for reflection: never present medical, legal or financial advice as certain, and suggest a professional if the user seems to be in distress.`;
}

// Sent with the user's message to the model only (not saved, not shown).
const LANGUAGE_REMINDER =
  '[Reminder for the assistant: reply in the same language as the message above.]';

// ---------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // --- Who is calling? --------------------------------------------------------
  const authHeader = req.headers.get('Authorization');
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey');
  if (!authHeader || !apiKey) return json({ error: 'unauthorized' }, 401);

  // Acts with the caller's own token: RLS limits every read/write to their rows.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, apiKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(
    authHeader.replace(/^Bearer\s+/i, ''),
  );
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);

  // --- Input ---------------------------------------------------------------------
  let message: string;
  let browserTimeZone: unknown;
  try {
    const body = await req.json();
    message = String(body?.message ?? '').trim();
    browserTimeZone = body?.timezone;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!message || message.length > MAX_MESSAGE_LENGTH) return json({ error: 'invalid_message' }, 400);

  // --- Context: profile + recent history ------------------------------------------
  const [{ data: profile, error: profileError }, { data: recent, error: historyError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('pseudo, birth_date, birth_time, birth_place, latitude, longitude, timezone, house_system')
        .eq('id', userData.user.id)
        .maybeSingle<Profile>(),
      supabase
        .from('chat_messages')
        .select('role, content')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(HISTORY_LIMIT),
    ]);
  if (profileError || historyError) {
    console.error('context load failed', profileError ?? historyError);
    return json({ error: 'context_unavailable' }, 500);
  }
  if (!profile) return json({ error: 'profile_missing' }, 409);

  // Oldest first, starting with a user turn, with consecutive same-role turns merged
  // (e.g. after an unanswered message) so roles strictly alternate.
  const history: ChatTurn[] = [];
  for (const m of (recent ?? []).reverse() as ChatTurn[]) {
    const last = history.at(-1);
    if (!last && m.role !== 'user') continue;
    if (last?.role === m.role) last.content += `\n\n${m.content}`;
    else history.push({ role: m.role, content: m.content });
  }
  if (history.at(-1)?.role === 'user') history.push({ role: 'assistant', content: '…' });

  // "Today" is the user's day where they are now (browser time zone), not where they were born.
  const userTimeZone = isValidTimeZone(browserTimeZone)
    ? browserTimeZone
    : profile.timezone ?? 'Europe/Paris';
  const today = isoDateIn(userTimeZone);
  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: userTimeZone,
  });

  // --- Astrological data (cached; FreeAstroAPI only when missing) --------------------
  const readings = await loadReadings(supabase, userData.user.id, profile, today, userTimeZone);

  // --- Ask Gemini -------------------------------------------------------------------
  // On a 429 (free-tier quota used up) or 503 (model overloaded), retry once on the lighter model.
  const contents = [
    ...history.map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    })),
    { role: 'user', parts: [{ text: message }, { text: LANGUAGE_REMINDER }] },
  ];
  const models = [...new Set([MODEL, FALLBACK_MODEL])];
  let reply = '';
  for (const [i, model] of models.entries()) {
    try {
      const response = await gemini.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: systemPrompt(profile, todayLabel, userTimeZone, readings),
          temperature: 0.7,
          maxOutputTokens: 4096, // includes the model's internal reasoning on Flash models
        },
      });
      reply = (response.text ?? '').trim();
      if (!reply) {
        throw new Error(`empty reply (finish reason: ${response.candidates?.[0]?.finishReason})`);
      }
      break;
    } catch (error) {
      const status = error instanceof ApiError ? error.status : undefined;
      // Gemini's own explanation (invalid key, quota exceeded, unknown model…).
      console.error(`Gemini ${model} failed${status ? ` (HTTP ${status})` : ''}:`, (error as Error).message);
      const busy = status === 429 || status === 503;
      if (busy && i < models.length - 1) continue;
      if (busy) return json({ error: 'busy' }, 429);
      return json({ error: 'agent_unavailable' }, 502);
    }
  }

  // --- Save both messages (only once the reply exists, so history never has gaps) ----
  const { error: saveError } = await supabase.from('chat_messages').insert([
    { role: 'user', content: message },
    { role: 'assistant', content: reply },
  ]);
  if (saveError) console.error('saving messages failed', saveError);

  return json({ reply });
});

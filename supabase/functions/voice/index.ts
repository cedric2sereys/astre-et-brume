// Supabase Edge Function "voice": reads a piece of the agent's reply aloud with a hosted voice
// (Gradium, free plan: about 45,000 characters ≈ 1 hour per month for the whole app, non-commercial).
//
// The browser sends { text, voice_id, format: 'opus' | 'wav' } and gets the audio back.
// Every character is counted in voice_usage (migration 005) before calling Gradium, so the app
// stays within the free monthly budget and each user within a daily cap. When this function
// refuses or fails, the browser reads the reply with its own built-in voice instead.
//
// Secret required (Supabase → Edge Functions → Secrets): GRADIUM_API_KEY
// Optional secrets: VOICE_DAILY_CHARS (per user, default 4000), VOICE_MONTHLY_CHARS (whole app, default 42000)

import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const GRADIUM_URL = 'https://api.gradium.ai/api/post/speech/tts';
const GRADIUM_KEY = Deno.env.get('GRADIUM_API_KEY') ?? '';
const DAILY_CHARS = Number(Deno.env.get('VOICE_DAILY_CHARS')) || 4000;
// A little under the free 45,000 so tests in Gradium's own Studio do not tip it over.
const MONTHLY_CHARS = Number(Deno.env.get('VOICE_MONTHLY_CHARS')) || 42000;
const MAX_TEXT_LENGTH = 600; // the browser sends a reply in pieces of a few sentences

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const VOICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** A WAV file around raw 16-bit mono PCM (for browsers that cannot play Opus, e.g. older iPhones). */
function wav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // size of the format block
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per sample
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!GRADIUM_KEY) return json({ error: 'not_configured' }, 503);

  // --- Who is calling? --------------------------------------------------------
  const authHeader = req.headers.get('Authorization');
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return json({ error: 'not_configured' }, 503);
  if (!authHeader || !apiKey) return json({ error: 'unauthorized' }, 401);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, apiKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(
    authHeader.replace(/^Bearer\s+/i, ''),
  );
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  // --- Input ---------------------------------------------------------------------
  let text: string;
  let voiceId: string;
  let opus: boolean;
  try {
    const body = await req.json();
    text = String(body?.text ?? '').trim();
    voiceId = String(body?.voice_id ?? '');
    opus = body?.format === 'opus';
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!text || text.length > MAX_TEXT_LENGTH || !VOICE_ID_PATTERN.test(voiceId)) {
    return json({ error: 'invalid_text' }, 400);
  }

  // --- Within the free allowance? (Gradium counts 1 credit per character) ----------
  // The service role is needed: users cannot touch voice_usage themselves.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } });
  const reserve = (chars: number) =>
    admin.rpc('reserve_voice_chars', {
      p_user: userId,
      p_provider: 'gradium',
      p_chars: chars,
      p_daily_cap: DAILY_CHARS,
      p_monthly_cap: MONTHLY_CHARS,
    });
  const { data: verdict, error: reserveError } = await reserve(text.length);
  if (reserveError) {
    console.error('counting characters failed', reserveError);
    return json({ error: 'not_configured' }, 503);
  }
  if (verdict === 'daily') return json({ error: 'quota_daily' }, 429);
  if (verdict === 'monthly') return json({ error: 'quota_monthly' }, 429);

  // --- Ask Gradium ------------------------------------------------------------------
  let res: Response;
  try {
    res = await fetch(GRADIUM_URL, {
      method: 'POST',
      headers: { 'x-api-key': GRADIUM_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice_id: voiceId,
        output_format: opus ? 'opus' : 'pcm_24000',
        only_audio: true,
      }),
    });
  } catch (error) {
    console.error('Gradium unreachable:', (error as Error).message);
    await reserve(-text.length);
    return json({ error: 'voice_unavailable' }, 502);
  }
  if (!res.ok) {
    // Gradium's own explanation (invalid key, credits used up, too many at once…).
    console.error(`Gradium failed (HTTP ${res.status}):`, (await res.text().catch(() => '')).slice(0, 300));
    await reserve(-text.length);
    // The free plan allows 2 readings at the same time for the whole app: the browser retries.
    if (res.status === 429) return json({ error: 'busy' }, 429);
    return json({ error: 'voice_unavailable' }, 502);
  }

  const audio = new Uint8Array(await res.arrayBuffer());
  return new Response(opus ? audio : wav(audio, 24000), {
    headers: {
      ...corsHeaders,
      'Content-Type': opus ? 'audio/ogg' : 'audio/wav',
      'Cache-Control': 'no-store',
    },
  });
});

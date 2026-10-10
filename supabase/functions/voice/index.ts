// Supabase Edge Function "voice": reads a piece of the agent's reply aloud with a hosted voice.
//   1. Gradium (free plan: about 45,000 characters ≈ 1 hour per month for the whole app)
//   2. ElevenLabs (free plan, Flash model: about 20,000 characters ≈ 20 minutes per month)
// Both free plans are non-commercial; ElevenLabs' requires crediting "elevenlabs.io" in the app.
//
// The browser sends { text, voice_id, lang: 'fr' | 'en', format: 'opus' | 'wav' } and gets the audio
// back, with the provider used in the X-Voice-Provider header. Every character is counted in
// voice_usage (migration 005) before calling a provider, so the app stays within each free monthly
// budget and each user within a daily cap. When Gradium refuses or fails, ElevenLabs is tried; when
// both do, the browser reads the reply with its own built-in voice.
//
// Secrets (Supabase → Edge Functions → Secrets): GRADIUM_API_KEY, ELEVENLABS_API_KEY
// (a provider without its key is skipped).
// Optional secrets: GRADIUM_DAILY_CHARS (per user, default 4000), GRADIUM_MONTHLY_CHARS (whole app, default 42000),
// ELEVENLABS_DAILY_CHARS (default 1500), ELEVENLABS_MONTHLY_CHARS (default 18000),
// ELEVENLABS_VOICE_FR / ELEVENLABS_VOICE_EN (ElevenLabs voice ids, default "Sarah").

import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const MAX_TEXT_LENGTH = 600; // the browser sends a reply in pieces of a few sentences
const VOICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-voice-provider',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const env = (name: string) => Deno.env.get(name) ?? '';
const envNumber = (name: string, fallback: number) => Number(Deno.env.get(name)) || fallback;

interface Reading {
  text: string;
  voiceId: string; // the Gradium voice chosen on /compte
  lang: 'fr' | 'en';
  opus: boolean;
}

/** Audio, or why the provider could not read: 'busy' (too many at once) or 'failed'. */
type Synthesis = { audio: Uint8Array<ArrayBuffer>; type: string } | 'busy' | 'failed';

interface Provider {
  name: 'gradium' | 'elevenlabs';
  key: string;
  dailyChars: number;
  monthlyChars: number;
  synthesize(r: Reading): Promise<Synthesis>;
}

/** Reads the provider's answer; logs its own explanation (invalid key, credits used up…) on failure. */
async function audioFrom(name: string, res: Response): Promise<Uint8Array<ArrayBuffer> | 'busy' | 'failed'> {
  if (res.ok) return new Uint8Array(await res.arrayBuffer());
  console.error(`${name} failed (HTTP ${res.status}):`, (await res.text().catch(() => '')).slice(0, 300));
  return res.status === 429 ? 'busy' : 'failed';
}

async function call(name: string, url: string, init: RequestInit): Promise<Uint8Array<ArrayBuffer> | 'busy' | 'failed'> {
  try {
    return await audioFrom(name, await fetch(url, init));
  } catch (error) {
    console.error(`${name} unreachable:`, (error as Error).message);
    return 'failed';
  }
}

const gradium: Provider = {
  name: 'gradium',
  key: env('GRADIUM_API_KEY'),
  dailyChars: envNumber('GRADIUM_DAILY_CHARS', 4000),
  // A little under the free 45,000 so tests in Gradium's own Studio do not tip it over.
  monthlyChars: envNumber('GRADIUM_MONTHLY_CHARS', 42000),
  async synthesize(r) {
    const audio = await call('Gradium', 'https://api.gradium.ai/api/post/speech/tts', {
      method: 'POST',
      headers: { 'x-api-key': this.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: r.text,
        voice_id: r.voiceId,
        output_format: r.opus ? 'opus' : 'pcm_24000',
        only_audio: true,
      }),
    });
    if (typeof audio === 'string') return audio;
    return r.opus ? { audio, type: 'audio/ogg' } : { audio: wav(audio, 24000), type: 'audio/wav' };
  },
};

/** "Sarah", one of ElevenLabs' default voices (library voices need a paid plan through the API). */
const ELEVENLABS_DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL';

const elevenlabs: Provider = {
  name: 'elevenlabs',
  key: env('ELEVENLABS_API_KEY'),
  dailyChars: envNumber('ELEVENLABS_DAILY_CHARS', 1500),
  // The Flash model costs half a credit per character: 10,000 free credits ≈ 20,000 characters.
  monthlyChars: envNumber('ELEVENLABS_MONTHLY_CHARS', 18000),
  async synthesize(r) {
    const voice = env(r.lang === 'fr' ? 'ELEVENLABS_VOICE_FR' : 'ELEVENLABS_VOICE_EN') || ELEVENLABS_DEFAULT_VOICE;
    // MP3 plays in every browser.
    const audio = await call(
      'ElevenLabs',
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`,
      {
        method: 'POST',
        headers: { 'xi-api-key': this.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: r.text, model_id: 'eleven_flash_v2_5', language_code: r.lang }),
      },
    );
    return typeof audio === 'string' ? audio : { audio, type: 'audio/mpeg' };
  },
};

/** A WAV file around raw 16-bit mono PCM (for browsers that cannot play Opus, e.g. older iPhones). */
function wav(pcm: Uint8Array, sampleRate: number): Uint8Array<ArrayBuffer> {
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
  const providers = [gradium, elevenlabs].filter((p) => p.key);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!providers.length || !serviceKey) return json({ error: 'not_configured' }, 503);

  // --- Who is calling? --------------------------------------------------------
  const authHeader = req.headers.get('Authorization');
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey');
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
  let r: Reading;
  try {
    const body = await req.json();
    r = {
      text: String(body?.text ?? '').trim(),
      voiceId: String(body?.voice_id ?? ''),
      lang: body?.lang === 'en' ? 'en' : 'fr',
      opus: body?.format === 'opus',
    };
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!r.text || r.text.length > MAX_TEXT_LENGTH || !VOICE_ID_PATTERN.test(r.voiceId)) {
    return json({ error: 'invalid_text' }, 400);
  }

  // --- First provider within its free allowance that manages to read it ------------
  // The service role is needed: users cannot touch voice_usage themselves.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } });
  const reserve = (p: Provider, chars: number) =>
    admin.rpc('reserve_voice_chars', {
      p_user: userId,
      p_provider: p.name,
      p_chars: chars,
      p_daily_cap: p.dailyChars,
      p_monthly_cap: p.monthlyChars,
    });

  const refusals: string[] = [];
  for (const p of providers) {
    const { data: verdict, error: reserveError } = await reserve(p, r.text.length);
    if (reserveError) {
      console.error('counting characters failed', reserveError);
      return json({ error: 'not_configured' }, 503);
    }
    if (verdict !== 'ok') {
      refusals.push(verdict as string);
      continue;
    }
    const result = await p.synthesize(r);
    if (typeof result !== 'string') {
      return new Response(result.audio, {
        headers: {
          ...corsHeaders,
          'Content-Type': result.type,
          'X-Voice-Provider': p.name,
          'Cache-Control': 'no-store',
        },
      });
    }
    await reserve(p, -r.text.length); // nothing was read: give the characters back
    refusals.push(result);
  }

  // Nobody could read it: the browser voice takes over.
  if (refusals.includes('daily')) return json({ error: 'quota_daily' }, 429);
  if (refusals.includes('monthly')) return json({ error: 'quota_monthly' }, 429);
  if (refusals.includes('busy')) return json({ error: 'busy' }, 429);
  return json({ error: 'voice_unavailable' }, 502);
});

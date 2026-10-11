# Astre & Brume — Atelier céleste (Angular)

An astrology chat app: users sign up, enter a nickname and their birth data, then chat with an
AI astrologer that reads their natal chart and personal daily horoscope.

## Stack

- **Front end:** Angular (this folder), UI in French and English (FR | EN switch; all texts in `src/app/core/i18n.ts`)
- **Auth & database:** Supabase (email/password login, `profiles`, `chat_messages`, `astro_readings`)
- **AI agent:** Google Gemini (free tier), called from the Supabase Edge Function `chat`
- **Astrology data:** FreeAstroAPI (free tier, 80 requests/day) — natal chart + personal daily horoscope/transits, cached per user
- **Geocoding:** OpenStreetMap Nominatim (birth place → latitude/longitude)
- **Voice:** the browser's Web Speech API — replies read aloud (voice chosen on /compte) and 🎤 dictation; free, no key

## Run locally

    npm install      # first time only
    npm start        # then open http://localhost:4200

## Structure

- `src/app/pages/` — the 4 screens: auth (connexion), pseudo, releve (birth data form), conversation
- `src/app/layout/` — header and animated starfield background
- `src/app/core/` — Supabase client, session/profile, chat history, agent call, geocoding, route guards
- `src/styles.scss` — colors, fonts and shared styles
- `src/environments/environment.ts` — Supabase URL + publishable key (public by design; never put a secret key here)
- `supabase/migrations/` — SQL to run once in the Supabase SQL Editor, in order
- `supabase/functions/chat/index.ts` — the agent: loads profile + history, gets FreeAstroAPI data, asks Gemini, saves the exchange
- `supabase/functions/voice/index.ts` — reads replies aloud with Gradium voices, then ElevenLabs when Gradium refuses or fails (both free plans, non-commercial; ElevenLabs is credited "elevenlabs.io" next to the replies it reads), counting characters in `voice_usage` (per-user daily cap + app-wide monthly budget per provider; one voice per reply: the first piece picks the provider whose caps fit the whole reply); the browser voice takes over when both refuse or fail
- `scripts/` — PowerShell scripts to test a Gemini or FreeAstroAPI key from this PC

## Supabase setup

Edge Function secrets (Supabase → Edge Functions → Secrets):

- `GEMINI_API_KEY` — Google AI Studio key
- `FREEASTRO_API_KEY` — FreeAstroAPI key
- `GEMINI_MODEL` — optional, defaults to `gemini-flash-latest`
- `GRADIUM_API_KEY` — Gradium key (function `voice`)
- `ELEVENLABS_API_KEY` — ElevenLabs key (function `voice`; needs the "Text to Speech" permission)
- Optional caps for `voice`: `GRADIUM_DAILY_CHARS` / `GRADIUM_MONTHLY_CHARS` (defaults 4000 per user per day,
  42000 for the whole app per month; free plan 45,000), `ELEVENLABS_DAILY_CHARS` / `ELEVENLABS_MONTHLY_CHARS`
  (defaults 1500 and 18000; free plan ≈ 20,000 characters with the Flash model). Setting `GRADIUM_DAILY_CHARS`
  to `1` for a moment is a way to test ElevenLabs.
- `ELEVENLABS_VOICE_FR` / `ELEVENLABS_VOICE_EN` — optional ElevenLabs voice ids (default: "Sarah", a default voice)

Deploy each function by pasting its `index.ts` into Edge Functions → `chat` (or `voice`) → Code → Deploy.

Auth emails (password reset) are sent through Gmail SMTP from `astre.et.brume@gmail.com`
(Authentication → Emails → SMTP Settings: host `smtp.gmail.com`, port 465, password = a Google
"app password", which needs 2-Step Verification on that account). Supabase's built-in mailer only
reaches project members, so custom SMTP is required for real users. The "Reset Password" template
(Authentication → Emails → Templates) is customised in the dashboard as a bilingual FR/EN email;
keep `{{ .ConfirmationURL }}` in it.

Authentication → URL Configuration: Site URL `https://astre-et-brume.pages.dev`; Redirect URLs
`https://astre-et-brume.pages.dev/**` and `http://localhost:4200/**` (for local development).

Users overview (SQL Editor; saved there as "Utilisateurs"): one line per account, newest first.

```sql
select u.email, u.created_at as signed_up, u.last_sign_in_at as last_login,
       p.pseudo, p.birth_date, p.birth_time, p.birth_place,
       count(distinct c.id) as conversations, count(m.id) as messages,
       max(m.created_at) as last_message
from auth.users u
left join public.profiles p on p.id = u.id
left join public.conversations c on c.user_id = u.id
left join public.chat_messages m on m.conversation_id = c.id
group by u.id, p.id
order by u.created_at desc;
```

## Hosting (Cloudflare Pages)

Live at **https://astre-et-brume.pages.dev**. The Cloudflare Pages project is connected to this
GitHub repository: every push to `main` rebuilds and redeploys the site automatically.

- Build command: `npm run build`
- Build output directory: `dist/astre-et-brume/browser`
- Environment variable `NODE_VERSION` = `24.19.0` — use an exact version: Angular 22 needs
  Node ≥ 24.15, and a bare `24` made Cloudflare pick an older 24.x that fails the build.

The Edge Function is not deployed by Cloudflare: redeploy it in Supabase when
`supabase/functions/chat/index.ts` or `supabase/functions/voice/index.ts` changes.

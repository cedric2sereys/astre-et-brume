# Astre & Brume — Atelier céleste (Angular)

An astrology chat app: users sign up, enter a nickname and their birth data, then chat with an
AI astrologer that reads their natal chart and personal daily horoscope.

## Stack

- **Front end:** Angular (this folder), UI in French and English (FR | EN switch; all texts in `src/app/core/i18n.ts`)
- **Auth & database:** Supabase (email/password login, `profiles`, `chat_messages`, `astro_readings`)
- **AI agent:** Google Gemini (free tier), called from the Supabase Edge Function `chat`
- **Astrology data:** FreeAstroAPI (free tier, 80 requests/day) — natal chart + personal daily horoscope/transits, cached per user
- **Geocoding:** OpenStreetMap Nominatim (birth place → latitude/longitude)

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
- `scripts/` — PowerShell scripts to test a Gemini or FreeAstroAPI key from this PC

## Supabase setup

Edge Function secrets (Supabase → Edge Functions → Secrets):

- `GEMINI_API_KEY` — Google AI Studio key
- `FREEASTRO_API_KEY` — FreeAstroAPI key
- `GEMINI_MODEL` — optional, defaults to `gemini-flash-latest`

Deploy the function by pasting `supabase/functions/chat/index.ts` into Edge Functions → `chat` → Code → Deploy.

Auth emails (password reset) are sent through Gmail SMTP from `astre.et.brume@gmail.com`
(Authentication → Emails → SMTP Settings: host `smtp.gmail.com`, port 465, password = a Google
"app password", which needs 2-Step Verification on that account). Supabase's built-in mailer only
reaches project members, so custom SMTP is required for real users. The "Reset Password" template
(Authentication → Emails → Templates) is customised in the dashboard as a bilingual FR/EN email;
keep `{{ .ConfirmationURL }}` in it.

Authentication → URL Configuration: Site URL `https://astre-et-brume.pages.dev`; Redirect URLs
`https://astre-et-brume.pages.dev/**` and `http://localhost:4200/**` (for local development).

## Hosting (Cloudflare Pages)

Live at **https://astre-et-brume.pages.dev**. The Cloudflare Pages project is connected to this
GitHub repository: every push to `main` rebuilds and redeploys the site automatically.

- Build command: `npm run build`
- Build output directory: `dist/astre-et-brume/browser`
- Environment variable `NODE_VERSION` = `24.19.0` — use an exact version: Angular 22 needs
  Node ≥ 24.15, and a bare `24` made Cloudflare pick an older 24.x that fails the build.

The Edge Function is not deployed by Cloudflare: redeploy it in Supabase when
`supabase/functions/chat/index.ts` changes.

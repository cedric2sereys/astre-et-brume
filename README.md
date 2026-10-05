# Astre & Brume — Atelier céleste (Angular)

An astrology chat app: users sign up, enter a nickname and their birth data, then chat with an
AI astrologer that reads their natal chart and personal daily horoscope.

## Stack

- **Front end:** Angular (this folder), UI in French
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

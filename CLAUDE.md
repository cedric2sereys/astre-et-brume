# Astre & Brume — notes for Claude Code

Read README.md for the stack, setup and deployment. This file holds how we work and where we are.

## Working with the owner
- Explain things simply, step by step; the owner is not a developer.
- Ask **one question at a time** (never a long list) and build progressively, one feature per step.
- The owner does the dashboard steps (Supabase, Cloudflare, Google, GitHub website); give exact click paths.
  The owner types commands in **PowerShell** (one-line commands; avoid multi-line pastes).
- Never ask the owner to paste secret keys in the chat: they go straight into Supabase secrets.
- Everything must stay on **free plans**.
- After each feature: build, check in a browser when possible, commit, `git push` (Cloudflare redeploys).
  When `supabase/functions/chat/index.ts` or `voice/index.ts` changes, the owner must redeploy it in Supabase.
  New SQL in `supabase/migrations/` must be run by the owner in the Supabase SQL Editor.

## Status (2026-10-11)
Live at https://astre-et-brume.pages.dev, everything working: login/sign-up, forgot password
(bilingual email via Gmail SMTP), account deletion, nickname + birth data, Gemini agent with
FreeAstroAPI natal chart + daily horoscope, streaming replies, Markdown, conversation list,
FR | EN interface, 8-character passwords with letters and digits.
Reading voices (`core/speech.service.ts`, 🔊 on each reply + "Lecture auto" toggle), in order:
Gradium → ElevenLabs → browser voice, see "Hosted voices" below. Browser voice (Web Speech API,
free, no keys): voice picker on /compte, natural voices first and Microsoft Vivienne
as the automatic French choice; 🎤 dictation in the composer (`core/dictation.service.ts`),
hidden in Firefox and Brave. Tested and working on PC Edge and Chrome (Chrome needed the right
microphone in chrome://settings/content/microphone) and on iPhone Safari and Chrome. Edge's "Natural"
voices sound the most human; iPhones only offer the voices installed on the phone (better ones can be
downloaded in Settings → Accessibility → Spoken Content → Voices). On iPhone, dictation needs
Settings → General → Keyboard → Enable Dictation (+ Microphone and Speech Recognition for Chrome):
a step-by-step notice shows this when the 🎤 cannot start. Voice code must never block the app
(an iPhone Safari crash in it once kept users on the login page).

## Hosted voices (done and tested on PC, 2026-10-11)
The owner confirmed the app is free and non-commercial (both free plans require that).
Edge Function `voice` (`supabase/functions/voice/index.ts`) + migrations `005_voice_usage.sql`, `006_voice_whole_reply.sql`:
Gradium first, then ElevenLabs, then the browser voice when both refuse (caps) or fail.
One voice per reply (owner's request): the provider must fit the whole reply's length.
Written 2026-10-11; waiting for the owner to run 006, redeploy `voice` and test.
- Gradium: set up, tested and working. Automatic choice (FR Noémie, EN Tilly); caps 4000 chars per
  user per day, 42000 per month (free plan 45000). Free plan: API yes, commercial no, no attribution,
  2 readings at once. Key "astre-et-brume" expires 2037-12-31. A short first piece makes readings start sooner.
- ElevenLabs: set up and tested (key `ELEVENLABS_API_KEY`). Flash model ≈ 20,000 free chars/month;
  caps 1500 per user per day, 18000 per month; "Voix : elevenlabs.io" credit next to each reply it
  read (required by the free plan). Free plan cannot use library voices through the API: English uses
  the default voice "Sarah"; French uses a voice the owner made with Voice Design ("Warm, calm French
  woman astrologer", id 879ywO262DJwTNa6UfeH, secret `ELEVENLABS_VOICE_FR`), as Sarah sounded Canadian.
  Test ElevenLabs by setting secret `GRADIUM_DAILY_CHARS` to 1 for a moment.
Dictation stays on the browser (owner's choice: Gradium STT would share the same free credits).
Real people's/celebrity voices are not allowed: only the provider's library voices.

## Next step (not started; confirm with the owner first)
Check the hosted voices on iPhone (Safari gets WAV instead of Opus on older iOS; the audio is
unlocked during the tap) and test Android phones, which have not been tested yet.

## Ideas set aside
Own domain name, full mobile check, legal notice / privacy page, reset email in the user's
language only.

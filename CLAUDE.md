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
  When `supabase/functions/chat/index.ts` changes, the owner must redeploy it in Supabase.
  New SQL in `supabase/migrations/` must be run by the owner in the Supabase SQL Editor.

## Status (2026-10-10)
Live at https://astre-et-brume.pages.dev, everything working: login/sign-up, forgot password
(bilingual email via Gmail SMTP), account deletion, nickname + birth data, Gemini agent with
FreeAstroAPI natal chart + daily horoscope, streaming replies, Markdown, conversation list,
FR | EN interface, 8-character passwords with letters and digits.
Voice (browser Web Speech API, free, no keys): 🔊 on each reply + "Lecture auto" toggle
(`core/speech.service.ts`); voice picker on /compte, natural voices first and Microsoft Vivienne
as the automatic French choice; 🎤 dictation in the composer (`core/dictation.service.ts`),
hidden in Firefox and Brave. Tested and working on PC Edge and Chrome (Chrome needed the right
microphone in chrome://settings/content/microphone) and on iPhone Safari and Chrome. Edge's "Natural"
voices sound the most human; iPhones only offer the voices installed on the phone (better ones can be
downloaded in Settings → Accessibility → Spoken Content → Voices). On iPhone, dictation needs
Settings → General → Keyboard → Enable Dictation (+ Microphone and Speech Recognition for Chrome):
a step-by-step notice shows this when the 🎤 cannot start. Voice code must never block the app
(an iPhone Safari crash in it once kept users on the login page).

## In progress (2026-10-10): hosted voices
The owner confirmed the app is free and non-commercial (both free plans require that).
Gradium step written, waiting for the owner's setup and test: Edge Function `voice`
(`supabase/functions/voice/index.ts`), migration `005_voice_usage.sql`, secret `GRADIUM_API_KEY`.
Gradium voices are the automatic choice (FR Noémie, EN Tilly); the browser voice takes over when
the per-user daily cap (4000 chars) or the app's monthly budget (42000 of Gradium's free 45000) is
reached or Gradium fails. Gradium free: API yes, commercial no, no attribution, 2 readings at once.
Next: ElevenLabs free (≈ 10 min/month, non-commercial, must credit "elevenlabs.io" in the app)
between Gradium and the browser voice. Real people's/celebrity voices are not allowed: only the
provider's library voices. Android phones are not tested yet.

## Ideas set aside
Own domain name, full mobile check, legal notice / privacy page, reset email in the user's
language only.

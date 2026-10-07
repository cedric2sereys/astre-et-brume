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

## Status (2026-10-07)
Live at https://astre-et-brume.pages.dev, everything working: login/sign-up, forgot password
(bilingual email via Gmail SMTP), account deletion, nickname + birth data, Gemini agent with
FreeAstroAPI natal chart + daily horoscope, streaming replies, Markdown, conversation list,
FR | EN interface, 8-character passwords with letters and digits.

## Next step (not started; confirm with the owner first)
**Voice features with the browser Web Speech API** (free, unlimited, no keys, no server change):
1. 🔊 button on each agent reply + "auto-read replies" toggle; strip Markdown before speaking.
2. Voice picker on /compte, filtered by the FR/EN interface language, with a preview; saved in localStorage.
3. 🎤 button in the chat composer with live transcription (SpeechRecognition); hidden where
   unsupported (Firefox).
4. FR/EN texts in `src/app/core/i18n.ts`.
Estimate: ~4–5 h of work + ~20 min of owner testing (PC Edge/Chrome and phone).
Not chosen: ElevenLabs (free ≈ 10 min/month for the whole app, non-commercial); Gradium (free ≈ 1 h/month,
non-commercial) could come later as an optional premium voice. Real people's/celebrity voices are not
allowed: only the provider's library voices.

## Ideas set aside
Own domain name, full mobile check, legal notice / privacy page, reset email in the user's
language only.

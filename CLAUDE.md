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

## Hosted voices (done; tested on PC Edge/Chrome, iPhone Safari and iPhone Chrome, 2026-10-12)
The owner confirmed the app is free and non-commercial (both free plans require that).
Edge Function `voice` (`supabase/functions/voice/index.ts`) + migrations `005_voice_usage.sql`, `006_voice_whole_reply.sql`:
Gradium first, then ElevenLabs, then the browser voice when both refuse (caps) or fail.
One voice per reply (owner's request): the provider must fit the whole reply's length.
Pieces grow 150/300/450 characters and the second is fetched at once, so readings start fast with a
short pause after the first sentence (iPhone). Replies already heard replay from memory (same visit).
Browser voices saved before Gradium are reset once to automatic (key `astre-et-brume.voice.hostedReset`).
- Gradium: automatic choice (FR Noémie, kept by the owner; EN Tilly); caps 4000 chars per user per day,
  42000 per month (free plan 45000). Free plan: API yes, commercial no, no attribution, 2 readings at
  once. Key "astre-et-brume" expires 2037-12-31.
- ElevenLabs (key `ELEVENLABS_API_KEY`): Flash model ≈ 20,000 free chars/month; caps 1500 per user per
  day, 18000 per month; "Voix : elevenlabs.io" credit next to each reply it read (required by the free
  plan). Free plan cannot use library voices through the API: English uses the default voice "Sarah";
  French uses a voice the owner made with Voice Design ("Warm, calm French woman astrologer",
  id 879ywO262DJwTNa6UfeH, secret `ELEVENLABS_VOICE_FR`), as Sarah sounded Canadian.
- Testing: the owner's own tests use up their daily caps quickly. Test ElevenLabs by setting secret
  `GRADIUM_DAILY_CHARS` to 1 for a moment (then delete it). Usage per user per day per provider (all
  devices of an account together): `select provider, day, chars from voice_usage order by day desc, provider;`
Dictation stays on the browser (owner's choice: Gradium STT would share the same free credits).
Real people's/celebrity voices are not allowed: only the provider's library voices.

## Voice tour (done; tested on PC and iPhone Safari, 2026-10-12)
A one-time 3-bubble tour in the conversation (`layout/tour.ts`), for new and existing users, once per
device (key `astre-et-brume.tour`): 🔊 on the last reply, "Lecture auto", and "Mon compte" to choose
one's voice, with a sentence on the daily limit of the most natural voices; buttons marked
`data-tour="…"`. "Suivant" / "J'ai compris" + "Passer". Remembered per browser, not per account.

## Ideas set aside
Own domain name, full mobile check, legal notice / privacy page, reset email in the user's
language only. Android phones never tested (the owner has none). Free downloadable voice models
(Kyutai Pocket TTS, Kokoro, Piper…; ElevenLabs/Gradium have no local version): only useful for everyone
if run inside each visitor's browser (big download, slow on phones, French uncertain); a possible
better last fallback if the free caps ever become a real problem.

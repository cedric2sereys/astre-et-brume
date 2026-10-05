# Astre & Brume — Atelier céleste (Angular)

Front-end only, demo mode: nothing is saved, a page refresh starts over,
any valid email / 6+ character password is accepted, and the chat agent's answers are simulated.

## Run locally

    npm install      # first time only
    npm start        # then open http://localhost:4200

## Structure

- `src/app/layout/` — header and animated starfield background
- `src/app/pages/` — the 4 screens: auth (connexion), pseudo, releve (birth chart), conversation
- `src/app/core/session.service.ts` — in-memory session state (where Supabase will plug in)
- `src/app/core/mock-agent.ts` — simulated agent replies (to be replaced by the real AI call)
- `src/app/core/guards.ts` — keeps the user on the right onboarding step
- `src/styles.scss` — colors, fonts and shared styles

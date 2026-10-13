# League Tracker

Website + installable mobile app (PWA) for running leagues and knockout tournaments.

## What it does

**League (table)**
- Admin signs in, creates a tournament, types the team names; fixtures are generated automatically (play each team once, or home & away).
- Admin enters the score after each game. The table updates: win 3, draw 1, loss 0, with goals scored (GF), goals conceded (GA) and goal difference (GD).

**Knockout (bracket)**
- Admin types the teams. They are drawn at random into a bracket that scales with the number of teams (2, 4, 8, 16… slots).
- If the number of teams is not a power of two, the extra slots are byes: those teams go straight into the next round.
- Admin enters each result. The winner moves on to face the winner of the neighbouring match, the loser is out. If the score is level, the admin picks who won on penalties.
- Changing an earlier result resets any later results that depended on it (the app asks first).
- "Draw again" reshuffles the bracket, as long as no result has been entered yet.

**Both**
- Everything is hidden from participants by default. The admin ticks the numbered round boxes to choose which rounds participants can see (enforced in the database, not just the page).
- Results are stored in the database, can be marked "completed" for future reference (leagues can also be exported as CSV).
- Admin shares one link (`/t/<slug>`). Participants open it with no login and can only view. Their page refreshes every 15 seconds.

Stack: Next.js 14 (App Router) + TypeScript + Tailwind + Supabase (Auth + Postgres). Deploys to Vercel.

## Setup

1. Create a Supabase project. In the SQL editor, run `supabase/schema.sql`.
   - Already ran an earlier version? Run `supabase/add-publishing.sql` (if you have not yet) and then
     `supabase/add-knockout.sql`, once each.
2. Copy `.env.example` to `.env.local` and fill in the project URL and the publishable (anon) key
   (Supabase → Project Settings → API Keys).
3. `npm install`
4. `npm run dev` and open http://localhost:3000
5. Click "Admin sign in", create an account, then create a tournament.

Tip: for local testing, turn off "Confirm email" in Supabase → Authentication → Providers → Email,
and turn it back on before you go live.

## Admin access

Anyone who creates an account becomes the admin of the tournaments they create (row-level security
makes every tournament editable only by its creator). If only you should be able to create tournaments,
disable new signups in Supabase after creating your own account.

## Deploy

Push to GitHub, import into Vercel, add the two environment variables, deploy.
Add your Vercel URL to Supabase → Authentication → URL Configuration → Site URL.

## Install on a phone

Open the site in Chrome (Android) → menu → "Install app" / "Add to Home screen".
On iPhone, open it in Safari → Share → "Add to Home Screen". It then opens full screen like a native app.

## Tests

`npm test` runs unit tests for the fixture generator, the league standings and the knockout bracket
(random draw, byes for every team count from 2 to 40, advancement, penalties, resetting later rounds).

# SKPL — Smash Karts Premier League

A tournament/league management web app for the Smash Karts Premier League: public standings, stats and match
coverage, plus a full admin panel for running seasons.

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS + shadcn-style UI primitives (Radix UI under the hood)
- Lucide React icons
- React Router
- Supabase (Postgres, Auth, Row Level Security) accessed directly from the browser with the publishable/anon key

No custom backend server exists — Supabase Postgres, RPC functions and RLS policies are the entire backend.

## Project Structure

```
src/
  components/   shared UI (cards, tables, layout) and shadcn-style primitives (components/ui)
  pages/        public/ and admin/ route components
  layouts/      PublicLayout, AdminLayout
  services/     Supabase queries, one file per domain (teams, players, seasons, matches, stats, auth)
  utils/        pure business logic: calculations, schedule generation, validation
  hooks/        small reusable hooks (useAsync, useSeasonFilter)
  context/      AuthContext (session + admin status)
  types/        generated-style Database types + app-level aliases
supabase/
  migrations/   SQL migrations (schema, RLS, RPC functions)
scripts/
  seed.ts       optional demo data generator
```

## Local Setup

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase project values
npm run dev
```

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run the migration in `supabase/migrations/0001_init.sql`. This creates every table,
   Row Level Security policy, and the RPC functions the app relies on (`create_season_with_setup`,
   `delete_season_schedule`, `save_match_result`).
3. In Project Settings → API, copy the **Project URL** and the **anon/publishable key**.

## Environment Variables

Create `.env.local` (never commit it) from `.env.example`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-public-key
```

Only the publishable/anon key is ever used in frontend code. The service-role key is never used by the app and
should never be placed in any `VITE_`-prefixed variable.

## Database Migration

All schema, security policies and RPCs live in `supabase/migrations/0001_init.sql`. Apply it via the Supabase
SQL Editor, or with the Supabase CLI:

```bash
supabase db push
```

## First Admin Setup

There is no public "make me admin" button — admins are provisioned manually:

1. In the Supabase dashboard, go to Authentication → Users → **Add user**, and create an account with an
   email and password.
2. Copy that user's UUID from the Users table.
3. In the SQL Editor, run:

   ```sql
   insert into admin_profiles (user_id, is_admin) values ('paste-the-uuid-here', true);
   ```

4. Sign in at `/admin/login` with that email and password.

## Demo Data (optional)

A small seed script creates 6 teams, ~24 players, one sample season and a handful of matches (some completed
with stats) so you have something to look at immediately. It uses the Supabase **service role** key to bypass
RLS for bulk inserts — run it locally only, never in a deployed/browser context:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co SUPABASE_SERVICE_ROLE_KEY=your-service-role-key npm run seed
```

This is demo data only — the application never depends on it, and you can delete every row it creates from the
Supabase dashboard at any time.

## Development

```bash
npm run dev       # start the Vite dev server
npm run build     # type-check and build for production
npm run preview   # preview the production build locally
```

## Deployment

The app is a static Vite build — deploy the `dist/` folder to any static host (Vercel, Netlify, Cloudflare
Pages, etc.):

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as environment variables in your hosting
   provider.
2. Build command: `npm run build`. Output directory: `dist`.
3. Configure a SPA rewrite (all routes → `index.html`) so client-side routing works on refresh/deep links.

## Core Business Rules (for reference)

- Players and teams are never hard-deleted — deactivating them (`is_active = false`) hides them from future
  season creation while preserving every historical match and statistic.
- `season_rosters` is the source of truth for which team a player belonged to in a given season — a player can
  be on different teams across different seasons, and career stats aggregate across all of them.
- Standings, and "regular season" team statistics, only count `REGULAR_SEASON` + `COMPLETED` matches.
  Playoff, custom and tie-breaker matches never affect standings.
- A team's score must always equal the sum of that team's player flags for the match — enforced both in the UI
  and again server-side in the `save_match_result` RPC.
- MVPs (match and tournament) and the season champion are administrator decisions/derivations only — there is
  no automatic MVP formula. The champion is derived automatically from a completed `FINAL` match's score via a
  database trigger, and cleared automatically if that Final is edited away from a decisive result or deleted.

# Startup Radar

Startup Radar ranks startup events in South Korea for a founder profile. Demo mode runs without Supabase or OpenRouter. A sample profile and a labeled demo catalog are loaded so the ranking is visible immediately.

## Run the app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env.local` only when you want Supabase or OpenRouter. With `APP_MODE=demo`, or with Supabase variables left blank, the app stays in demo mode.

```bash
npm test
npm run lint
npm run build
```

## Configure Supabase

1. Create a Supabase project and run the SQL in `supabase/migrations`, in filename order.
2. Set these in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
APP_MODE=supabase
```

The anon key is public. The service role key stays on the server and is used to write collected events.

Profiles, saved events, and scores are stored per signed-in user. This app does not include a sign-in screen. Supabase mode expects an existing auth session. Without one, refresh asks you to sign in and does not write listings.

## Configure OpenRouter

Jev is called from the server at `POST https://openrouter.ai/api/alpha/decisions`. Set:

```bash
OPENROUTER_API_KEY=your-openrouter-key
JEV_MODEL=typesafe/jev-1.13
```

Do not prefix `OPENROUTER_API_KEY` with `NEXT_PUBLIC_`. Jev is used only when `APP_MODE=supabase` and the Supabase URL and anon key are set. A missing key stops scoring and shows that message. It does not invent a Jev score.

Startup Radar turns Jev's industry and stage judgments into a 0–100 score with a 60/40 split. Those weights belong to this app, not to Jev. Preferred event types are reported as a match criterion and do not change that split.

## Demo mode and real integrations

| `APP_MODE` | What runs |
| --- | --- |
| `demo` (default) | In-memory catalog. Demo matcher. No credentials. |
| `supabase`, missing URL or anon key | Falls back to demo mode. |
| `supabase`, with URL and anon key | Supabase persistence. Jev through OpenRouter on refresh. |

Saving a profile in demo mode re-ranks the current list immediately. Refresh collects listings again. In Supabase mode, saving stores the profile, and refresh is what asks Jev to score.

## Event sources

**Live:** [TIPS](https://jointips.or.kr) public event listings, when that API responds. Listings are normalized into the shared event schema, deduplicated by source URL, and keep the original detail URL. Missing dates, organizers, descriptions, and industry tags stay empty.

**Demo catalog:** used before the first refresh, and when TIPS cannot be read and the store has no listings yet. Every demo card is marked "Demo data". After TIPS returns listings, those demo cards leave the ranked list so they are not shown beside live results.

No other event source is connected.

## Still mocked

- Relevance scores in demo mode. The explanation says it is a demo score, not a Jev judgment.
- The fallback event catalog, including titles, dates, and descriptions written for this app.
- Industry overlap for live TIPS rows. TIPS does not provide the app's industry tags, so the demo matcher does not treat a blank tag list as a match.

## Known limitations

- Demo data lives in server memory and resets when the process restarts.
- There is no sign-in UI. Supabase mode cannot save a profile or score events until a session exists.
- Jev scores one listing per Decisions API call, in order. A large TIPS catalog is slow, and a failed call does not save partial demo scores.
- "Newly discovered" means a listing whose first-seen time is later than the previous scoring run. The first scoring run does not mark the whole catalog as new.
- A TIPS failure keeps listings already stored. It does not replace them with the demo catalog.
- Invalid dates are shown as "Date not listed". The app does not fill in a date, organizer, or description that the source omitted.

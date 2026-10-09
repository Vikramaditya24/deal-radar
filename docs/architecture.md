# Architecture

## Goal

Take a raw list of small businesses and turn it into a ranked, explainable shortlist of acquisition targets, with sourced outreach drafts and a lightweight pipeline. Design priorities: every claim has evidence, unknowns stay unknown, and the whole thing runs locally with no keys.

```
Browser (Next.js UI) --> Zod-validated route handlers (Node runtime)
                              |--> domain functions (ingest, dedupe, score, outreach, export)
                              |--> Drizzle ORM --> libSQL (local file | Turso)
                              |--> Crawler --> public websites (robots.txt, SSRF guard)
                              |--> in-memory LRU cache + per-host timers
                              '--> optional OpenAI call (reason wording only)
```

## Stack and why

| Choice | Reason |
|---|---|
| Next.js App Router + TypeScript | One codebase and shared types for UI and API; deploys directly to Vercel. |
| Tailwind + shadcn/ui | Accessible, editable components with consistent theming. |
| Drizzle + libSQL | SQL-shaped TypeScript and one migration history. The same driver runs a local SQLite file in development and hosted Turso in production, so there is no second dialect to maintain. |
| Zod | Validation at every API boundary and for stored JSON. |
| Cheerio, robots-parser | HTML is parsed as inert data, never rendered; robots.txt is honored. |
| Vitest, GitHub Actions | 75 tests; CI runs typecheck, test and build. |

## Data storage

Database: **libSQL** (SQLite-compatible). Five tables: `workspace`, `thesis`, `lead`, `enrichment_job`, `suppression`. Money is stored as integer cents with an explicit currency; timestamps are UTC epoch milliseconds.

Evidence, scores, drafts and job progress live in JSON columns on the lead and job rows. This keeps the schema small for this scale, at the cost of weaker relational querying inside those objects. A larger product would normalize evidence into its own table.

Each fact is an evidence record: value, confidence, source URL, excerpt, observation date, method, synthetic flag. Conflicting values are kept, not overwritten, and the displayed value is the selected one.

## Scoring (fit-v1)

100 points: thesis match 50, succession research clues 20, completeness 15, contactability 15. Points are discounted by evidence confidence. An evidenced deal-breaker caps the total at 20. Missing information is shown as unknown. It is a prioritization aid, not a valuation or a prediction of willingness to sell. The scoring code is pure functions, tested directly.

## Crawling

Checks robots.txt before fetching, validates the URL and resolved IPs against private and reserved ranges, pins the validated address for the request (closing the DNS-rebinding gap), follows redirects through the same checks, and applies a 5 second timeout with limited retries. Per-host timers enforce a delay between requests. It fetches the homepage plus up to two same-origin about/contact/team pages. Challenge pages and blocked robots show as visible blocked or partial results.

## Caching and performance

- In-memory LRU cache (200 entries, 10 MB) for crawl results; entries keep their original observation date.
- Pages are capped at 100 records; filtering, search and sorting happen in the database; the directory table renders a window of rows.
- Enrichment jobs are bounded (150 targets). The browser requests small processing slices and polls one job row, so no background worker is needed.
- Indexes on workspace/stage, domain and phone.

## Hosting and deployment

Cloud providers: **Vercel** for the app (serverless Node route handlers; long routes set `maxDuration = 30`) and **Turso** for hosted libSQL. Deployment is GitHub to Vercel. Production refuses a local file database, requires `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET` and `APP_ORIGIN`, and never migrates automatically: run `npm run db:migrate` against the target deliberately. Builds do not touch the database. See [DEPLOY.md](../DEPLOY.md).

## UX decisions

- Starts with a "Load 150 sample businesses" action, so the first minute shows value without any setup.
- A single Directory/Pipeline workspace with shared filters; stage menus work with keyboard and touch.
- Every score shows its factor bars, reasons and unknowns; every fact links to its evidence.
- Ctrl/Cmd+K command palette, dark/light themes, skeleton loaders, empty states, reduced-motion support.

## Security and ethics

Server-side suppression checks on enrichment, drafting and export; origin checks on mutating routes; CSV exports escape formula characters; sample data is synthetic and flagged in the UI and exports; outreach never fabricates facts or implies seller intent.

## Limits

- Single-user, session-scoped; no authentication or team features.
- Queue coordination is per server instance. Concurrent tabs on one job can race.
- Literal phrase matching misses synonyms and negation.
- Hosted deployment and live crawling at scale were not tested.

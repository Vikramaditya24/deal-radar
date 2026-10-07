# Deal Radar — Phase 2

A Next.js / TypeScript / Tailwind / shadcn-ui scaffold backed by one Drizzle/libSQL schema and migration history. This delivery implements persistent storage, synthetic demo loading, paginated/searchable directory, evidence detail and theme toggle. Enrichment/scoring/outreach/pipeline are later phases and have no pretend controls here.

## Run locally

Use Node.js 22+ (verified runtime recorded in docs/phase-2-verification.md).

```sh
npm install
npm run dev
```

Open http://localhost:3000. No environment file or paid key is required. Startup applies committed migrations to `data/deal-radar.db`. Click **Load 150 sample businesses**. The button loads 150 synthetic records and one thesis, only once. Search, pagination and evidence details work. Restart preserves the database. Alternatively `npm run db:seed` loads the same demo into the local workspace.

All names, financial figures and contact assertions are synthetic, not discovered businesses. Reserved `.example` domains never get crawled; phone numbers use the fictional US 555-0100–0199 range and are non-unique across fixtures. Revenue is explicitly illustrative import data, not extracted website revenue. Some fields are intentionally unknown.

## Checks

```sh
npm run typecheck
npm run build
npm run db:migrate
npm run db:seed
```

GET `/api/health` should return `data.status: "ok"`; GET `/api/session` reports counts. GET `/api/leads?limit=20&page=1&q=Buckeye` searches business name/domain. GET `/api/theses` reads the demo thesis. GET `/api/leads/:id` returns selected evidence. POST `/api/demo` requires JSON `{}` and the matching Origin header; the app supplies it. Unknown query keys and invalid bounds return 400. Missing/foreign lead IDs return 404.

## Hosted libSQL / Turso

Copy `.env.example` to `.env.local`; set `TURSO_DATABASE_URL` to the hosted libSQL URL, `TURSO_AUTH_TOKEN`, `SESSION_SECRET` (at least 32 characters), and `APP_ORIGIN`. Run `npm run db:migrate` explicitly. `npm run dev` never migrates hosted data automatically. Use the labeled browser demo action for hosted sessions; CLI seed refuses remote databases. Production Vercel requires hosted storage; local file URLs are rejected. No embedded replica or alternate SQL dialect.

The shared migration runner is `drizzle-orm/libsql/migrator`; schema is `lib/schema.ts`, history is `drizzle/`. `npm run db:generate` creates a migration after intentional schema changes. Review generated SQL; use committed migrations rather than schema push. Builds do not access or mutate database data.

## Phases

See `docs/architecture.md` for the full revised design. Phase 3 adds ingest/enrichment/live crawl; Phase 4 scoring/outreach; Phase 5 polished workflow/export/suppression; Phase 6 complete tests/docs/CI; Phase 7 demonstration and every-file guide. No Docker or Redis implementation is planned. Record actual development time and AI use in `docs/time-log.md`.

The equivalent 150-row CSV is included as `data/sample.csv`; the generator and website fixtures are in `data/sample.ts`. Recorded check results and manual steps are in `docs/phase-2-verification.md`.

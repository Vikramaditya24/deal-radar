# Deal Radar — Phase 3

A Next.js / TypeScript / Tailwind / shadcn-ui scaffold backed by one Drizzle/libSQL schema and migration history. This delivery adds CSV/URL imports, conservative fuzzy duplicate review, polite enrichment, persisted client-polled jobs, pause/resume/cancel, and live crawl for up to five public URLs. Scoring, outreach and pipeline actions arrive in the next phases.

## Run locally

Use Node.js 24 (recommended) or 22.12+ (verified runtime recorded in docs/phase-3-verification.md).

```sh
npm install
npm run dev
```

Open http://localhost:3000. No environment file or paid key is required. Startup applies committed migrations to `data/deal-radar.db`. Click **Load 150 sample businesses**. The button loads 150 synthetic records and one thesis, only once. Search, pagination and evidence details work. Restart preserves the database. Alternatively `npm run db:seed` loads the same demo into the local workspace.

In the bundled sample dataset, names, financial figures and contact assertions are synthetic, not discovered businesses. Reserved `.example` domains never get crawled; phone numbers use the fictional US 555-0100–0199 range and are non-unique across fixtures. Revenue is explicitly illustrative import data, not extracted website revenue. Some fields are intentionally unknown.

## Checks

```sh
npm test
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

See `docs/architecture.md` for the full revised design. Phase 3 implements ingest/enrichment/live crawl; Phase 4 adds scoring/outreach; Phase 5 polished workflow/export/suppression; Phase 6 complete tests/docs/CI; Phase 7 demonstration and every-file guide. No Docker or Redis implementation is planned. Record actual development time and AI use in `docs/time-log.md`.

The equivalent 150-row CSV is included as `data/sample.csv`; the generator and website fixtures are in `data/sample.ts`. Recorded check results and manual steps are in `docs/phase-2-verification.md`.

## Phase 3 usage

- Click **Import CSV / URLs**, upload `data/sample.csv` or your own CSV, then Preview. The mapper supports company/URL aliases; customize field mappings and preview again if needed. Reject invalid rows individually. Annual revenue requires an explicit currency and is unverified input data. Ten-digit phone numbers assume US country code; use an explicit international country code for other countries.
- Review proposed merges. Conflicting geography/domain or uncertain names default to separate. Explicit decisions retain source/conflict history. Confirm import to see the added/duplicates-merged/rejected summary. Re-importing sample.csv after demo load should add zero records and merge 150 duplicates.
- Click **Enrich shown** or **Enrich this business** for fixture or real targets. Fixtures use embedded HTML only. Progress is in one job row; the client drives bounded process calls and polls. Pause stops future requests; an in-flight server slice may finish. Cancel blocks subsequent work. Reopen the app and Resume the latest persisted job.
- Click **Live crawl · up to 5 URLs**, paste absolute public HTTP(S) business URLs and start. The crawler checks robots.txt, stops on blocks/challenges, pins DNS-validated public addresses, rate-limits each host, and uses a five-second request budget with two retries for transient failures. It fetches homepage plus up to two discovered same-origin about/contact/team pages. HTML is parsed as inert text, never rendered as trusted HTML.
- robots.txt redirects are bounded and use the same safety checks. Unavailable/invalid robots is visible and conservatively blocks/defer retrieval. Supported crawl-delay and Retry-After increase waits. Cached observations retain original dates. Compressed responses that ignore identity encoding are not parsed; dynamic JavaScript-only websites may return few facts.

The latest five jobs are listed by GET `/api/enrichment/jobs` for reopening progress; this small addition to the Phase 1 API requires no extra table. This is a single-client, best-effort queue. Per-process throttling and single-flight do not coordinate independent Vercel instances. Do not run the same job from concurrent tabs. Redis remains a future upgrade only.

See `docs/phase-3-verification.md` for recorded checks/manual instructions and `docs/git-history.md` for preserving phase commits. The five-table schema and original migration history are unchanged. Real-site retrieval was not verified in this restricted environment (DNS failed); fixture and policy flows are tested without network.

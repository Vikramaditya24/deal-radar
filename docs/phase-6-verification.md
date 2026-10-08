# Phase 6 — CI, deployment and final source verification

## Included

Complete Phases 2–6 source at package version **0.6.0**, preserving the Windows in-memory test cleanup fix and the five-table libSQL migration history. No new table, migration, database reset or dependency was introduced.

- `.github/workflows/ci.yml`: push, pull-request and manual checks with Node 24; lockfile install, typecheck, tests and production build; no service containers or secrets.
- `.nvmrc`: Node 24 selection for supporting tools and CI.
- `DEPLOY.md`: local development/production, Vercel/Turso environment setup, explicit migrations, session and job limits, repository handoff.
- `.env.example` and README: exact origin requirements and updated startup instructions.
- `lib/api.ts`: clear 503 configuration error for absent production origin or malformed configured origin; Vercel requires HTTPS. Existing matching-origin writes are retained.
- `lib/session.ts`: exported secret validation so hosted requirements can be tested without a provider connection.
- Health returns the package version instead of the stale Phase 3 marker.
- `tests/api.test.ts`: ten request/configuration boundary tests.

## Recorded verification

Linux; Node **v24.19.0**, npm **11.9.0**. Source was copied into an independent clean directory without node_modules, build output, database files, secret environment files or Git metadata. This simulates extracting the source ZIP; it is not a Git clone or a hosted CI run.

| Check | Result |
| --- | --- |
| Fresh `npm ci` | Passed using committed lockfile |
| `npm run typecheck` | Passed |
| `npm test` | **75 tests passed across seven files** |
| `VERCEL=1 npm run build` | Passed without Turso, session, origin or OpenAI secrets; all API routes included |
| `npm audit --audit-level=low` | Zero reported vulnerabilities at check time |
| `npm run db:migrate` on fresh local storage | Passed |
| Built app via `npm run start` | Health reports 0.6.0; root HTML responds |
| Demo loading twice | Exactly 150 records, no duplicate load |
| Request boundaries over HTTP | Repeated query and invalid filters rejected with 400; foreign Origin rejected with 403 |
| Workflow smoke over HTTP | Single/bulk stages, stale-stage 409, current scoring, sourced draft, suppression filters, pending job blocked, suppressed drafting rejected, both CRM CSV formats exclude suppressed lead |
| Stop/start the production server | Stage, suppression and blocked job persisted; removing suppression did not restart old work |

The build's VERCEL environment flag validates build-time independence; it does not simulate the hosted provider's runtime, networking, sessions or quotas. The production HTTP smoke used a local libSQL file. Automated tests also cover existing import/dedupe, crawl policies/fixtures, scoring/provenance and export behavior. There is no claim of a GitHub Actions run, hosted migration, Vercel deployment, successful live OpenAI request or successful real-site crawl.

## Apply and reproduce

1. Commit verified Phase 5 if not already committed. Stop your server.
2. Overlay this ZIP's `deal-radar` contents into the same project, including `.github` and `.nvmrc`. Preserve `.git`, `.env.local` and your database. Do not nest project folders.
3. Use Node 24 and run:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

On Windows, use `npm.cmd` when PowerShell blocks npm.ps1. No database reset is needed. Existing APP_ORIGIN must now be an exact origin: remove a trailing slash or path. Local use needs no environment file. For a production-mode local check, stop dev and follow the explicit migration/start commands in DEPLOY.md.

## Manual browser and hosted checklist

The browser surface cannot reach the workspace server, so interactive visual/mobile/clipboard checks remain manual. Follow the Phase 5 browser checklist for dialogs, shortcuts, table scrolling, drag-and-drop, touch stage menus, saved edits, copy, filters and downloadable CSV files. HTTP root rendering does not verify those interactions.

- Run the built app locally. Open `/api/health`, verify 0.6.0, then load the demo and complete a thesis → score → draft → pipeline → export flow. Opt out one lead and verify that drafting, copy and export exclude it. Restart and confirm your state persists.
- Push the reviewed repository to your own GitHub remote and inspect the actual Actions result. Confirm the workflow is at Git root. CI is not yet verified on GitHub by this delivery.
- Follow DEPLOY.md with your own Turso/Vercel accounts. Verify HTTPS origin, schema migration, production variables, health, demo and persistence on the deployed site. Verify the final domain after changing it. No live deployment URL is supplied.
- If testing real-site retrieval, choose up to five public business sites, respect visible robots/block outcomes and inspect actual evidence dates/URLs. Fixture success does not establish real-site coverage.
- Optional provider checks require your own AI key and may incur charges; deterministic fallback remains usable without it.

## Handoff and disclosure

See docs/git-history.md for the Phase 6 commit. Preserve earlier phase history; no commits were created on your computer by the ZIP. docs/time-log.md intentionally leaves candidate duration/review unrecorded. Fill those from your own actual work and disclose generated-code assistance. Do not claim a five-hour build, independent authorship, hosted CI success or deployment without evidence.

Phase 7 remains the two-minute demonstration script, every-file guide and ten interview questions/answers. Browser/deployment checks above should be completed before recording a demo as verified.

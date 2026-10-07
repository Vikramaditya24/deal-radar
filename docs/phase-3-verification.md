# Phase 3 verification

This delivery implements ingestion, conservative fuzzy duplicate review, enrichment, persisted client-polled jobs, and a five-URL live crawl action. It uses the same five database tables and original migration as Phase 2.

## Executed checks

Runtime: Node 24.19.0, npm 11.9.0. Vitest 5 requires a supported Node 22.12+ / 24 / 26+ runtime; Node 24 is recommended.

- 31 Vitest tests passed across dedupe, crawler/evidence, and workflow suites.
- Typecheck passed.
- Production build passed (the final results are recorded with delivery).
- Production dependency audit reported zero vulnerabilities at verification time.
- HTTP verification from an empty temporary local database: demo load succeeded, sample CSV preview found 150 valid rows and 150 existing duplicates, import added zero records and merged 150, and workspace counts stayed at 150.
- Invalid private-address and currency rows were rejected individually.
- A fixture job fetched three embedded pages across bounded processing slices; family/history signals and per-field provenance were stored, including a synthetic robots note, without a real website request.
- Cancellation stopped subsequent processing. Job progress and merged/imported rows survived server restart.
- Six live URLs rejected; private/LinkedIn live targets rejected; missing job returned 404; unexpected request fields rejected.
- Unit tests cover mixed/private DNS, mapped addresses, robots denial, malformed robots, two-second scheduling, cached observations, private redirects, challenge stopping, Retry-After, transient DNS retry classification, evidence quality, source conflicts, LRU bounds, exactly two retries, workspace ownership and suppression before saving.

Tests use injected resolver/transport functions and temporary databases, never a production “unsafe mode.” No UI option or environment variable can disable the SSRF guard.

## What remains unverified

A live attempt to `https://books.toscrape.com/` failed at DNS resolution (`EAI_AGAIN`) in this restricted execution environment. Public internet retrieval is therefore not claimed as verified here. Transient DNS failures are retryable and visible. Actual access depends on the user's network, robots policy, website availability and page structure.

Browser visual/interaction automation is unavailable in this environment. The UI compiles and the root returns 200; perform the following manual checks. Hosted Turso/Vercel have not been provisioned. There is no cross-instance host coordination or distributed job lock; use one active client per job.

## Apply and run

1. Commit your verified Phase 2 before copying new files (see git-history.md).
2. Copy this ZIP's deal-radar contents into the existing project folder. Preserve `.git`, your local DB and secret environment files.
3. Run `npm install`, `npm test`, `npm run typecheck`, and `npm run build` with dev stopped. Then run `npm run dev`.
4. Existing 150 records should remain. If starting fresh, load the sample dataset.

## Manual acceptance

1. Click **Import CSV / URLs**, choose `data/sample.csv`, then Preview. Expect 150 proposed merges when the demo is loaded. Confirm import: zero added, 150 duplicates merged. Inspect a business: stronger fixture evidence remains selected and import assertions are retained.
2. Test a CSV with headers `Company,URL,Revenue,Currency`. Automatic aliases map them. Change one column mapping, then Preview again before importing. Invalid revenue without a supported explicit currency is rejected; malformed structural CSV has a clear error.
3. Repeat a known fixture URL with and without `www.` in pasted-URL import. Inspect the proposal. For uncertain/conflicting candidates, keep separate or explicitly choose a target. Different locations should not merge automatically. Imported sources and conflict history remain stored.
4. Open the first sample business and click **Enrich this business**. Progress should reach three pages; inspect field evidence and succession research signals. All evidence stays synthetic and .example is never requested over the network.
5. Click **Enrich shown** for a page of records. Pause and Resume; close/reopen the app and Resume its persisted latest job. Cancel prevents future slices; an in-flight slice may finish. Per-target errors/waits are visible under progress details.
6. Click **Live crawl · up to 5 URLs** and paste one real public business URL you are allowed to research. Use an absolute HTTP(S) URL. On success, inspect actual source URLs, observed timestamps and confidence; unknown revenue remains unknown. On robots refusal, DNS failure, timeout, challenge or other restriction, verify a clear failed/blocked/partial outcome rather than invented facts.
7. Try six URLs (client should reject), localhost/private targets, Google or LinkedIn (server should reject), and an unavailable website (initial attempt plus up to two transient retries). No bypass is offered.
8. Search and page the mixed real/synthetic directory. Confirm labels, reported currency and origin distinction. No email is sent and no CRM integration is claimed.

## Relevant modules

- dedupe.ts: pure normalization/similarity, conflict checks and candidate blocking.
- ingest.ts: CSV/URL validation, preview decisions, merge audit and transactional persistence.
- crawler.ts: public address checks, pinned HTTP(S), robots, redirects, timing and restrictions.
- cache.ts: bounded, disposable memory LRU.
- enrichment.ts: extraction, evidence/provenance, the single job row, retries and suppression.
- import-dialog.tsx / job-progress.tsx: working review and client-driven processing UI.
- tests/: deterministic behavior checks. Additional scoring tests arrive with Phase 4.

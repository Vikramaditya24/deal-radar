# Ten Deal Radar interview questions and answers

Use these as prompts to explain decisions in your own words. The answers describe final code, not a claim that you independently wrote all of it. Open the cited files and reproduce each exercise before interviewing.

## 1. What problem does this solve, and how did you constrain scope?

A search-fund buyer needs a shortlist they can inspect and act on. Deal Radar connects a reusable acquisition thesis to imported businesses, evidence, explainable fit-v1 scores, manual outreach drafts, pipeline tracking and CRM CSV exports. Unknown fields and synthetic records remain visible. It does not claim valuation accuracy, seller willingness, message delivery or an authenticated team product.

I chose one Next.js application, five Drizzle/libSQL tables and client-driven enrichment slices. Local setup needs no accounts or keys. Hosted deployment can use Turso and Vercel. Removing Docker, a second SQL dialect, saved views, Redis and a worker kept the assessment understandable, with explicit concurrency and session limitations.

Code: `components/deal-radar.tsx`, `lib/schema.ts`, `README.md`.

Follow-up: What would you cut if limited to five hours? Keep import, one thesis, transparent scoring and evidence detail; disclose reduced scope rather than claim this larger implementation took five hours.

Exercise: Describe the first-minute buyer journey without listing frameworks.

## 2. Why Drizzle and libSQL? Why put evidence and jobs in JSON?

Drizzle gives SQL-shaped TypeScript queries and a committed migration history. `@libsql/client` serves a local file and a hosted libSQL endpoint through the same schema and migrator. There is no second database adapter. Development auto-migrates local files; hosted migrations are deliberate; builds do not migrate or connect to storage. Vercel rejects file databases.

The five tables separate workspace, thesis, lead, enrichment job and suppression. Small bounded evidence, score, draft and progress objects live in JSON columns. This keeps the assessment compact but reduces relational querying/constraints within those objects and requires validation. A larger product could normalize evidence and job targets if query volume, concurrent updates or audit needs justify it. That change would require measured migration and compatibility work.

Code: `lib/schema.ts`, `lib/db.ts`, `scripts/migrate.ts`, `lib/contracts.ts`.

Follow-up: What prevents data loss when changing phases? Preserve the file DB, use committed migrations, and back up before schema changes; extracting a ZIP is not a database migration.

Exercise: Trace `npm run dev` and explain why it refuses to auto-migrate hosted storage.

## 3. How do you deduplicate without combining different companies?

Identity normalization handles company names, registrable domains and phone digits. Exact identities and indexed candidates narrow review; fuzzy name comparison uses trigrams and Jaro–Winkler. Geography/domain disagreement and synthetic-versus-real status constrain merges. A shared domain or phone is not sufficient to erase conflicts. Preview shows candidates and conflicts; confirmation revalidates and commits a merge plan transactionally.

Incoming assertions are retained with origins rather than silently replacing old values. Selected evidence determines the displayed facts; alternate assertions and merge history remain available. Fuzzy matching can still miss or suggest incorrect candidates, so the review step matters.

Code: `lib/dedupe.ts`, `lib/ingest.ts`, `components/import-dialog.tsx`, `tests/dedupe.test.ts`.

Follow-up: Why not infer revenue from a website? Imported revenue requires explicit currency and stays unverified; the crawler does not invent it from visual appearance or company size.

Exercise: Import `data/sample.csv` after demo load. Verify zero new businesses and 150 duplicate merges, then inspect a conflicting assertion in a separate test import.

## 4. How does the crawler avoid unsafe or impolite retrieval?

The crawler validates HTTP(S) targets and DNS addresses, rejects private/reserved destinations and pins validated public addresses in the request. Redirects pass through the same safety checks. It checks robots before pages, uses bounded retries/timeouts, per-process host scheduling and a bounded memory cache. It limits a business to a homepage and up to two discovered same-origin about/contact/team pages. Challenge pages, unavailable robots and unsupported retrieval produce visible blocked/partial/failure outcomes.

HTML is parsed as inert data with Cheerio; it is not trusted rendering or model instruction. DNS pinning addresses the gap between validation and connecting. The throttle is per process, so independent hosted instances are not globally coordinated. This is not a distributed crawler or proof of broad business coverage.

Code: `lib/crawler.ts`, `lib/enrichment.ts`, `lib/cache.ts`, `tests/crawler.test.ts`.

Follow-up: Does robots permission prove authorization for any use? No. It is one retrieval policy signal; the system is a bounded research tool, not a license or coverage guarantee.

Exercise: Explain the private-redirect and mixed-DNS tests and distinguish a robots block from a network failure.

## 5. What happens when the browser closes or two tabs process a job?

The job row stores target progress, counters, retry times and outcomes. `JobProgress` requests a bounded processing slice and polls state. Pause stops future requests; an in-flight slice may finish. Closing the browser stops driving work, and Resume can continue persisted state. Cancel stops subsequent work; suppression is also checked before saving.

In-process single-flight and per-process timers reduce duplicate work only inside that process. There are no distributed locks, leases, fencing or idempotency keys. Two tabs/instances can race, so the documented operating rule is one processing client per job. I would add durable target-level coordination and a background worker only if unattended processing/concurrency became a product requirement.

Code: `components/job-progress.tsx`, `lib/enrichment.ts`, process/cancel routes, `tests/workflow.test.ts`.

Follow-up: Why not SSE? Polling is simpler here and progress is already in one database row; SSE would not itself solve durable execution or concurrency.

Exercise: Start fixture enrichment, Pause, reload, Resume; explain why Pause cannot recall an already-running fetch.

## 6. Explain fit-v1 and its staleness rules.

The maximum allocations are thesis fit 50, succession research clues 20, completeness 15 and contactability 15. Matching points use selected evidence confidence; unconfigured positive thesis criteria are renormalized within the 50-point allocation. Missing evidence creates unknowns. Absent must-haves are not proven failure. An evidenced deal-breaker makes the lead ineligible and caps total at 20; factor bars still show their uncapped contributions. There is no currency conversion or score point for old copyright text.

The score is deterministic for its inputs and assessment date, with total rounded once. Each lead holds one latest score tied to thesis ID/revision, lead revision and UTC date. Evidence/thesis changes or a new day make it stale; changing only pipeline stage does not alter evidence revision. Switching thesis requires rescoring. These are proposed research weights, not learned probabilities or predicted returns. `algorithmVersion` records fit-v1; the current staleness helper compares revisions/date, so a future algorithm change also needs an explicit invalidation strategy.

Code: `lib/scoring.ts`, `lib/assessment.ts`, `lib/leads.ts`, `tests/scoring.test.ts`.

Follow-up: What would validate the weights? Labeled reviewed businesses, an agreed acquisition-fit target, held-out evaluation and sensitivity analysis; the demo alone does not calibrate them.

Exercise: Remove revenue, add an evidenced exclusion, and explain changes in unknowns, factors, total and eligibility.

## 7. How do you keep AI and outreach grounded?

Scoring and outreach work deterministically without AI. Optional reasoning sends existing reasons to the Responses API and accepts only reason indices/order plus `plain` or `review` style. Strict schema and runtime checks require every index exactly once; the server applies approved wording itself. The model cannot return free-form factual claims, alter points or generate outreach facts. No key, timeout, refusal, invalid schema or invented indices preserve the deterministic score.

Outreach templates produce three tones and two channels. Generated factual sentences carry selected evidence references; buyer-intent sentences carry thesis fields. User edits label the entire saved body user-written and retain original generated provenance. Saved drafts carry freshness metadata. Copy rechecks the current lead/thesis and suppression. A cited fact still requires source review, and user edits are not automatically verified. No messages are sent.

Code: `lib/reasoning.ts`, `lib/outreach.ts`, `lib/assessment.ts`, `components/outreach-editor.tsx`, `tests/outreach.test.ts`.

Follow-up: Are valid evidence IDs enough to prove any model sentence? No; restricting output to existing reason choices avoids that unsupported claim.

Exercise: Trace the invalid-index fallback test, then explain why a manually added sentence receives no fabricated citation.

## 8. How do suppression and CSV export interact?

Suppression rules are workspace-scoped lead/domain/email/phone entries. Normalization is shared with matching and SQL filtering. Adding a rule blocks pending targets and invalidates drafts; enrichment, drafting, copy and export check suppression at their relevant boundaries. Removal is explicit and does not resume old jobs or restore draft freshness. Shared contact values can suppress multiple businesses, especially synthetic fixtures.

Export prepares bounded database pages, excludes suppressed records, rechecks before returning bytes and emits CSV in 100-row chunks. Filtered export is capped at 1,000 rows and explicit selected identity at 150. Cells are quoted with quote escaping; leading formula characters receive an apostrophe. HubSpot/Salesforce columns are mappings with proposed custom fields, not connected integrations. Phone plus prefixes and CRM picklists/custom fields need import review. Material already copied/downloaded cannot be revoked, and there is no distributed transaction spanning clipboard/network consumers.

Code: `lib/suppression.ts`, `lib/export.ts`, `tests/platform.test.ts`.

Follow-up: Why can suppressed-only export be empty? Suppressed-only is a review filter; outreach exports must exclude those leads and return headers only.

Exercise: Select two leads, suppress one by lead ID and verify only the other appears in both CRM formats.

## 9. How do you handle conflicting writes, security and UI performance?

Thesis edits require the expected revision. Stage moves require the expected stage; stale writes return 409. Bulk stage moves validate targets inside one transaction and roll back if any selected stage changed. Stage updates leave evidence revision unchanged. Expected-stage checks catch a current mismatch, but are not a full edit-history token and do not detect an A→B→A cycle.

Server routes strictly validate inputs, scope records to the workspace and check write origins. Hosted sessions use an opaque secure cookie with a server-side HMAC hash and strong secret. This supplies independent demo workspaces, not login or account recovery. Exact APP_ORIGIN is required on Vercel. Clearing a cookie or changing the secret loses UI access to that previous workspace.

Server pagination/filtering limits queries to 100 rows per page; native fixed-row virtualization reduces DOM work within that page. The board uses the same page, so counts are shown-page counts. Search is debounced and stale requests are aborted. Dialogs use native modal focus management; keyboard/touch stage menus complement drag-and-drop. Browser behavior must still be tested manually.

Code: `lib/api.ts`, `lib/session.ts`, `lib/leads.ts`, thesis edit route, `components/lead-table.tsx`, `components/deal-radar.tsx`.

Exercise: Read the atomic rollback test. Explain what the database protects and what the browser must refresh after 409.

## 10. What did you verify, and how did you use AI?

The recorded Phase 6 checks include a fresh lockfile install, 75 tests across seven files, typecheck, production build without provider secrets, zero reported dependency vulnerabilities at that time, and local production HTTP persistence/suppression/export checks. Phase 7 is documentation and package metadata; its own final check results are in phase-7-verification.md. Tests use actual in-memory libSQL for database paths and mocked/fixture retrieval for crawl policies. The Linux checks do not prove Windows browser behavior or hosted provider success.

AI generated substantial code/docs and executed local checks. The candidate must review, reproduce and explain it, and record actual duration rather than assert the estimated phases took a specific measured time. No hosted CI run, deployed URL, recorded video, live AI success or real-site success is supplied. Interactive browser/mobile/clipboard and hosted setup remain manual. Honest evidence is part of the assessment.

Code: `tests/`, `.github/workflows/ci.yml`, `docs/phase-6-verification.md`, `docs/phase-7-verification.md`, `docs/time-log.md`.

Follow-up: What would you improve first? Use observed failures: finish browser/hosted checks, then address account recovery or durable processing if real-user operation is required. Do not add infrastructure purely to make the architecture look larger.

Exercise: Run the checks yourself, fill your time/review log, and explain one failure/edge-case test without reading this answer aloud.

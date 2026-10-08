# Every-file guide — final Deal Radar source

This inventory covers every file in the Phase 7 source ZIP, including generated/tooling/history files. Runtime dependencies, local databases, build output, secrets and Git metadata are excluded. There are **99 delivered files**. Paths are relative to the project root. Each row explains purpose/caller/input-output flow, failure or tradeoff, and a concrete example. Read source alongside the guide; it is not a substitute for understanding it.

## Trace the main workflows

- Directory: `app/page.tsx` → `DealRadar` → `/api/leads` → `listLeads` → Drizzle/libSQL. Filters/page limits are server-side; row virtualization is client-side within a page.
- Import: `ImportDialog` → preview route → `previewImport`/identity matching → user decisions → import route → transactional `ingest`/assertion merge.
- Enrichment: `JobProgress` → process route → `processJob` → fixture HTML or `SafeCrawler` → parsed evidence/progress saved. Poll reads that job row. The browser must request future slices.
- Fit and draft: UI → scores/outreach routes → assessment workspace/freshness/suppression checks → pure scoring/templates → stored score/drafts. Optional reason choices never change points.
- Opt-out/export: UI → suppression service and state effects; export route → bounded unsuppressed rows → CRM mappings → escaped CSV stream.

## Final behavior versus the original plan

The implementation uses native table windowing, direct optional Responses API fetch, native modal dialogs and actual in-memory libSQL tests. It has no TanStack Virtual/OpenAI SDK dependency or thesis-delete API. One score per lead, UTC-day freshness, shown-page board counts, no account recovery and no distributed job/crawl coordination are intentional limitations. `scoreIsStale` currently checks revisions/identity/date; future algorithm changes require explicit invalidation rather than assuming the recorded algorithmVersion automatically does it.

## Files

### Application shell

| File | Purpose and caller / input → output | Failure behavior or limit | Concrete example |
| --- | --- | --- | --- |
| `app/globals.css` | Layout → Tailwind import, theme tokens and global UI/reduced-motion rules. | CSS does not validate data; inspect overflow/focus/theme in a real browser. | Light/dark surfaces share token names. |
| `app/layout.tsx` | Next root → metadata, HTML/body and Providers around routed content. | Theme hydration suppression is scoped to document shell; not proof of UI correctness. | All app pages share the theme provider. |
| `app/page.tsx` | Next / route → renders DealRadar client workspace. | Runtime loading/errors are handled by the client coordinator, not server preloading. | Visiting / shows the app shell before API data arrives. |

### HTTP boundaries

| File | Purpose and caller / input → output | Failure behavior or limit | Concrete example |
| --- | --- | --- | --- |
| `app/api/demo/route.ts` | Next HTTP caller → POST empty JSON → loadDemo workspace summary; shared API/contracts/session guard the boundary. | Repeated demo is safe; foreign Origin rejects | Load exactly 150 fixtures once. |
| `app/api/enrichment/jobs/[id]/cancel/route.ts` | Next HTTP caller → POST empty JSON → cancelJob persisted state; shared API/contracts/session guard the boundary. | Stops subsequent work; cannot recall an in-flight fetch | Cancel before the next slice starts. |
| `app/api/enrichment/jobs/[id]/process/route.ts` | Next HTTP caller → POST empty JSON → processJob bounded slice; maxDuration 30; shared API/contracts/session guard the boundary. | Client must drive another slice; wait/failure/suppression are persisted | Process at most a bounded amount before returning progress. |
| `app/api/enrichment/jobs/[id]/route.ts` | Next HTTP caller → GET workspace-owned ID → progress/counters/outcomes; shared API/contracts/session guard the boundary. | Foreign/missing job cannot be read | Poll waiting retry state without fetching a page. |
| `app/api/enrichment/jobs/route.ts` | Next HTTP caller → GET → latest jobs; POST lead IDs or max-five live URLs → createJob; shared API/contracts/session guard the boundary. | Invalid/unavailable/suppressed targets rejected or blocked | Start embedded fixture enrichment for selected leads. |
| `app/api/export/route.ts` | Next HTTP caller → GET format/filters/IDs → prepared CSV response and X-Export-Count; shared API/contracts/session guard the boundary. | Bounded selection/filter caps; suppressed rows excluded; not JSON success data | Download HubSpot-mapped CSV. |
| `app/api/health/route.ts` | Next HTTP caller → GET empty query → DB readiness and package version; shared API/contracts/session guard the boundary. | DB/config errors return 503; no session login established | Version reports 0.7.0. |
| `app/api/import/preview/route.ts` | Next HTTP caller → POST CSV/URL mapping up to 4 MiB → previewImport plan; shared API/contracts/session guard the boundary. | Invalid rows/mapping displayed; preview does not persist imports | Inspect candidates before choosing merges. |
| `app/api/import/route.ts` | Next HTTP caller → POST import/decisions up to 4 MiB → ingest counts; shared API/contracts/session guard the boundary. | Server revalidates plan and transaction; errors do not silently merge | Confirm reviewed duplicates and inspect added/merged counts. |
| `app/api/leads/[id]/outreach/route.ts` | Next HTTP caller → POST tone/channel/thesis → generated saved draft; PATCH edit → labeled saved draft; shared API/contracts/session guard the boundary. | Suppression/stale input/revision rejects; user edits preserve originals | Save a warm LinkedIn variation. |
| `app/api/leads/[id]/route.ts` | Next HTTP caller → GET ID → detail; PATCH stage/expectedStage → moveLead; shared API/contracts/session guard the boundary. | Missing/foreign IDs reject; stale stage yields 409 | Move New to Contacted without changing evidence revision. |
| `app/api/leads/bulk/route.ts` | Next HTTP caller → POST action/targets → bulkAction result; shared API/contracts/session guard the boundary. | Mixed ownership or stale target rolls back the action | Move two selected leads together. |
| `app/api/leads/route.ts` | Next HTTP caller → GET strict filters → listLeads page/total; shared API/contracts/session guard the boundary. | Invalid filters reject; stale scores not current | Filter Meeting stage before pagination. |
| `app/api/scores/route.ts` | Next HTTP caller → POST bounded IDs/thesis/optional AI → scoreBatch saved results; shared API/contracts/session guard the boundary. | Unavailable selection rolls back; invalid thesis criterion rejects | Compute fit-v1 for 20 selected businesses. |
| `app/api/session/route.ts` | Next HTTP caller → GET → getWorkspace and workspaceSummary; shared API/contracts/session guard the boundary. | Hosted cookie/secret/storage failures return errors | Read demoLoaded/lead counts for this workspace. |
| `app/api/suppressions/[id]/route.ts` | Next HTTP caller → DELETE empty JSON → removeSuppression for workspace; shared API/contracts/session guard the boundary. | Removal explicit; no auto-restart or draft freshness recovery | Remove only your rehearsal rule. |
| `app/api/suppressions/route.ts` | Next HTTP caller → GET → listSuppressions; POST kind/value/reason → addSuppressions; shared API/contracts/session guard the boundary. | Invalid normalized contacts reject; existing jobs/drafts are blocked/staled | Add a lead-ID opt-out. |
| `app/api/theses/[id]/route.ts` | Next HTTP caller → PATCH name/criteria/expected revision → updated thesis; shared API/contracts/session guard the boundary. | Unavailable/current-revision mismatch yields 409; no DELETE route | Increment revision after editing revenue range. |
| `app/api/theses/route.ts` | Next HTTP caller → GET → workspace list; POST name/criteria → inserted thesis; shared API/contracts/session guard the boundary. | Positive criterion and strict schema required; no delete operation | Save a buy-box for HVAC in Ohio. |

### Client components

| File | Purpose and caller / input → output | Failure behavior or limit | Concrete example |
| --- | --- | --- | --- |
| `components/command-menu.tsx` | Coordinator → native modal command palette; supplied commands → searchable actions. | Disabled actions cannot run; dialog close/focus behavior uses native modal APIs. | Ctrl/Cmd+K then choose a permitted rank or navigation action. |
| `components/deal-radar.tsx` | Page → client coordinator for session, theses, filters/pages, detail, jobs, selection, stage/export and shortcuts. | Errors/notices and busy states are visible; aborted search requests avoid stale UI; board counts cover page. | Rank first 150 scores a bounded directory slice, not a global analytics report. |
| `components/import-dialog.tsx` | Coordinator → CSV upload/mapping or pasted URLs, preview/decisions and import/job creation. | Row errors/conflicts remain visible; confirmation is not implicit from preview; URL crawl has five-target cap. | Preview a quoted CSV and keep a conflicting business separate. |
| `components/job-progress.tsx` | Coordinator → process slices, polling, recent job outcomes and Pause/Resume/Cancel controls. | Closing page pauses driving work; in-flight slice may finish; retries/errors are shown. | Reload and Resume the latest persisted job. |
| `components/lead-detail.tsx` | Coordinator → native modal drawer for facts, quality, merge history, sources, stages and lead opt-out. | Null lead shows loading; mutations show errors; selected/alternate assertions stay distinct. | Inspect confidence and import origin before trusting revenue. |
| `components/lead-table.tsx` | Coordinator → paginated lead rows, selection/open controls and native fixed-height windowing. | Virtualizes only the current max-100 page; keyboard scroll region and padding maintain layout. | Scrolling renders the nearby 88px rows plus overscan. |
| `components/outreach-editor.tsx` | Drawer → fit details, draft tone/channel, saved edits, generation and Copy. | Stale/suppressed drafts cannot be copied; refresh rechecks thesis/lead; clipboard rejection is visible. | Save an edit: body is user-written and original sentences remain disclosed. |
| `components/pipeline-board.tsx` | Coordinator → four page-scoped columns, selection, drag/drop and stage menus. | Suppressed/stale/error state remains upstream; menus offer keyboard/touch alternative; counts say shown. | Move a card to Meeting using the select instead of dragging. |
| `components/providers.tsx` | Root layout → next-themes class-based system/light/dark provider wrapping children. | Client-only theme state; visual/hydration behavior still needs browser verification. | System theme follows OS preference until explicit choice. |
| `components/suppression-panel.tsx` | Coordinator → list/add/remove opt-out rules with reason and explicit confirmation. | Invalid normalized values show errors; removal does not recover old job/draft state. | Add one lead-ID rule, then remove only that specific entry. |
| `components/thesis-builder.tsx` | Coordinator → thesis criteria form; values → validated create/edit requests and refreshed thesis. | Empty positive criteria or invalid revenue/ranges show feedback; edit supplies expected revision. | Comma-separated industries become literal phrase criteria. |
| `components/ui/badge.tsx` | Table/drawer/board → compact styled status/label primitive. | Rendering a label does not establish factual confidence or successful operation. | Synthetic badge identifies fixture content. |
| `components/ui/button.tsx` | UI callers → editable Radix Slot/CVA button primitive with size/variant classes. | Disabled state/native caller semantics matter; no backend operation lives here. | An outline button runs the parent-supplied export handler. |
| `components/ui/card.tsx` | Forms/panels → reusable card/container/title/content styling components. | Layout primitive only; callers supply state and accessible meaning. | A thesis form uses CardContent around fields. |
| `components/ui/skeleton.tsx` | Loading UI → styled placeholder blocks during pending data. | Placeholder does not imply data exists; error/empty state is a caller responsibility. | Drawer shows loading shape before a lead response. |

### Domain and shared functions

| File | Purpose and caller / input → output | Failure behavior or limit | Concrete example |
| --- | --- | --- | --- |
| `lib/api.ts` | Routes → strict query/JSON reading and common success/error envelopes; JSON input → parsed value or response. | Repeated keys, wrong origin/type, malformed JSON and oversize payloads are rejected; invalid Vercel origin returns 503. | A foreign-origin demo POST returns 403. |
| `lib/assessment.ts` | Score/outreach routes → thesis lookup, bounded score persistence and fresh draft generation/editing. | Unavailable IDs roll back a score batch; stale/suppressed inputs reject drafting/editing. | Save six channel/tone variations tied to thesis and lead revisions. |
| `lib/cache.ts` | Crawler → byte/entry-bounded TTL LRU; keyed observations → cached value or miss. | Expiry/eviction/oversize entries produce a miss; cache is process-local and disposable. | Access refreshes an entry's LRU position, not its observation date. |
| `lib/client.ts` | Client components → fetch helper unwraps data and displays structured errors; jsonPost builds JSON requests. | HTTP errors become Error with server message/field detail; not a general arbitrary-response decoder. | Thesis validation feedback reaches the UI instead of a silent failure. |
| `lib/contracts.ts` | Routes, services, sample data and components share Zod schemas and inferred domain/DTO types. | Strict input contracts reject unsupported fields/bounds; stored JSON requires explicit parse at its use sites. | Only New, Contacted, Replied and Meeting are valid stages. |
| `lib/crawler.ts` | Enrichment → safe public HTTP requests, pinned DNS, robots policy, retries/waits and host timers. | Private/mixed addresses, unsafe redirects, robots refusals, challenges and bounded failures are explicit outcomes. | robots.txt is checked before a permitted homepage fetch. |
| `lib/db.ts` | Services/scripts → one configured libSQL client wrapped in Drizzle, with foreign keys; closeDb releases it. | Invalid URLs, missing hosted token or Vercel file storage fail configuration. | file::memory: stays an actual memory database in tests. |
| `lib/dedupe.ts` | Ingest → normalized identities, indexed candidates, trigram/Jaro–Winkler and conflict assessment. | Name/geography/domain/synthetic conflicts keep uncertain matches reviewable rather than forced. | Similar names in conflicting cities do not silently collapse. |
| `lib/enrichment.ts` | Job routes → enqueue/list/read/cancel/process; parsed HTML → evidence, signals, sources and persisted progress. | Retries/waits are nonterminal; suppressed/cancelled/blocked/failed targets retain outcomes; no distributed lock. | Resume continues a fixture target from its saved page cursor. |
| `lib/export.ts` | Export route → validate filters/IDs, prepare capped unsuppressed rows, map CRM columns and stream CSV. | Stale scores omitted; formula prefixes neutralized; suppressed-only export yields headers; mapping is not CRM sync. | Select two leads and suppress one: only the active lead is exported. |
| `lib/ingest.ts` | Import routes → CSV/URL parsing, mapping, preview plan, transactional merge and assertion selection. | Invalid rows/currency/mapping and conflicting merge decisions are surfaced; confirmation recomputes the plan. | Reimporting sample.csv after demo adds zero new leads. |
| `lib/leads.ts` | Directory/detail/demo/session/stage routes → workspace queries, demo load, filtered DTOs and atomic bulk moves. | Foreign/missing IDs reject; current-stage mismatch returns 409; bulk failures roll back; stale scores hidden. | Changing a stage preserves evidence revision. |
| `lib/outreach.ts` | Assessment → deterministic tone/channel templates and sentence provenance; draft → clean copied text. | Unknown facts stay absent; alternate evidence is excluded; neutral requests work without useful facts. | A professional email sentence cites selected industry evidence. |
| `lib/reasoning.ts` | Assessment → optional Responses API fetch; existing reasons → approved index/order/style choices. | No key, provider errors, timeout, refusal or malformed/invented indices preserve deterministic score. | Review style prefixes an existing reason without altering its points. |
| `lib/schema.ts` | DB/services/migrator → five sqliteTable definitions, foreign keys, indexes and JSON typing. | Relational constraints cover rows; nested JSON semantics need contracts/domain validation. | Lead belongs to one workspace and stores one latest score JSON. |
| `lib/scoring.ts` | Assessment/tests → pure fit-v1 computation and revision/date freshness check. | No positive criterion or invalid date throws; missing data is unknown; evidenced exclusions cap total at 20. | Contactability needs selected evidence, not merely a populated email string. |
| `lib/session.ts` | Routes → local workspace or hosted cookie lookup/create; secret validation → HMAC token hash. | Hosted secret missing/short fails; cookie loss creates a new workspace with no recovery UI. | A fresh hosted browser gets a different opaque workspace. |
| `lib/suppression.ts` | Leads/enrichment/assessment/export/routes → shared normalized matching, SQL filter, add/remove effects. | Workspace isolation enforced; rule removal does not resume jobs or restore drafts. | A registrable-domain opt-out can match multiple leads. |
| `lib/utils.ts` | UI primitives → cn combines clsx conditional classes with Tailwind conflict resolution. | No domain validation; conflicting utility classes are merged predictably. | An explicit button size class can override a default utility. |

### Data and startup scripts

| File | Purpose and caller / input → output | Failure behavior or limit | Concrete example |
| --- | --- | --- | --- |
| `data/sample.csv` | Import dialog/user → equivalent demo rows with explicit import fields. | Revenue/contacts remain synthetic/unverified input; CSV is not discovered market data. | Reimport tests dedupe against the same 150 businesses. |
| `data/sample.ts` | Demo loader/seed/enrichment → deterministic 150 synthetic records, thesis and embedded website fixtures. | Reserved .example origins are not public research; values/phones can repeat; missing fields intentional. | Fixture HTML provides synthetic sourced history for an offline walkthrough. |
| `scripts/dev.ts` | npm dev → load environment, migrate local DB, close client and spawn loopback Next dev. | Hosted DB never auto-migrates; child/start errors set failing exit status. | No-env startup creates data/deal-radar.db. |
| `scripts/migrate.ts` | npm db:migrate/dev/seed → apply committed drizzle history to configured libSQL target. | Hosted connection/token or migration errors fail; verify target before changing storage. | One migration history serves a local file and Turso. |
| `scripts/seed.ts` | npm db:seed → local-only migration/workspace/demo loader with finally cleanup. | Refuses hosted URLs; browser demo establishes a hosted session workspace instead. | Repeated local seed does not add a second 150-record batch. |

### Verification tests

| File | Purpose and caller / input → output | Failure behavior or limit | Concrete example |
| --- | --- | --- | --- |
| `tests/api.test.ts` | Vitest → ten API/config boundary checks with stubbed/restored environments. | A failed assertion signals origin/contract/secret regression; no provider connection required. | A UTF-8 byte limit catches multibyte JSON payloads. |
| `tests/crawler.test.ts` | Vitest → fixture/mock safe retrieval, robots, waits/cache and evidence parsing checks. | Mocked policy success does not prove live network reachability or site coverage. | A private redirect is rejected before connecting. |
| `tests/dedupe.test.ts` | Vitest → identity normalization, fuzzy/conflict handling, CSV and evidence merge tests. | Fixtures assert conservative matching, not universal entity-resolution accuracy. | Synthetic and real businesses never automatically merge. |
| `tests/outreach.test.ts` | Vitest → six template variations, selected provenance and mocked AI fallbacks. | Mocked Responses success is not a live provider request; malformed output cannot alter scores. | An invented reason index returns the deterministic fallback. |
| `tests/platform.test.ts` | Vitest → in-memory stages/bulk/filter/suppression/export integration and CSV boundaries. | Verifies workspace and transactional behavior, not drag/drop or clipboard permissions. | One stale selected stage rolls back all bulk moves. |
| `tests/scoring.test.ts` | Vitest → pure deterministic fit-v1, confidence, unknowns, caps/date/staleness tests. | Does not calibrate weights against real acquisitions or probability targets. | Old copyright text contributes no succession points. |
| `tests/workflow.test.ts` | Vitest → actual in-memory libSQL import/jobs/retry/cancel and assessment persistence tests. | No Windows temporary-file unlink race; mocks bound crawl behavior; failed batch must roll back. | A transient failure gets initial attempt plus two retries. |

### Migrations and generated metadata

| File | Purpose and caller / input → output | Failure behavior or limit | Concrete example |
| --- | --- | --- | --- |
| `drizzle/0000_hard_dagger.sql` | Migration runner → generated SQL creating the five tables/indexes. | Do not mutate an already-applied migration for a new schema change. | Fresh db:migrate creates workspace/lead/thesis/job/suppression storage. |
| `drizzle/meta/0000_snapshot.json` | Drizzle Kit → generated initial schema snapshot for future diffs. | Not business logic or seed data; regenerate through tooling for schema changes. | db:generate compares desired schema against recorded structure. |
| `drizzle/meta/_journal.json` | Drizzle generator/migrator → generated migration order/version metadata. | Hand editing can desynchronize history; preserve with SQL/snapshot. | Journal identifies the initial migration for ordered application. |

### Documentation

| File | Purpose and caller / input → output | Failure behavior or limit | Concrete example |
| --- | --- | --- | --- |
| `DEPLOY.md` | Developer → local production and manual Vercel/Turso setup/session/operational limits. | Hosted accounts/variables/migrations are required; no deployment is created by reading it. | Set exact HTTPS APP_ORIGIN before using hosted JSON writes. |
| `README.md` | Reader → app overview, startup, feature use, checks and guide links. | Historical phase sections are context; final implementation clarifications resolve plan differences. | Follow npm ci then npm run dev for no-key local startup. |
| `docs/architecture.md` | Reader → original design contract, tradeoffs and final clarification appendices. | Earlier planned dependencies/routes are historical; file guide/code describe final implementation. | Native table windowing replaces planned TanStack Virtual. |
| `docs/demo-script.md` | Candidate → timed recording actions, narration, preparation/rehearsal instructions. | Script is not a recorded video; do not claim unperformed clicks/deployment. | Rehearse a two-minute synthetic-data walkthrough. |
| `docs/file-guide.md` | Candidate → every delivered source path's role, data flow, failure behavior and example. | A guide cannot establish understanding; read source and reproduce exercises. | Trace a score request from UI through route/assessment/scoring/DB. |
| `docs/git-history.md` | Candidate → phase overlays, verification and truthful per-phase commit commands. | ZIPs do not contain/create local Git history; preserve .git and your identity. | Commit Phase 7 in the same existing project repository. |
| `docs/interview-qa.md` | Candidate → ten code-grounded answers, follow-ups and review exercises. | Do not memorize unverified claims or disguise AI authorship. | Explain why independent hosted instances have no global crawl throttle. |
| `docs/phase-2-verification.md` | Reader → historical scaffold/demo checks and local acceptance steps. | Historical version/scope; not evidence of later hosted/browser success. | Review the original 150-record demo load behavior. |
| `docs/phase-3-verification.md` | Reader → ingest/crawler/jobs results, limits and manual checks. | Fixture/policy checks do not establish live-site reachability. | Reproduce a robots block without claiming real coverage. |
| `docs/phase-3-windows-fix.md` | Windows candidate → rationale and commands for memory DB cleanup/dependency correction. | Historical fix is preserved; do not reintroduce file-unlink test cleanup. | Avoid EBUSY after closing an on-disk client in tests. |
| `docs/phase-4-verification.md` | Reader → thesis/scoring/outreach checks and optional provider limits. | No live AI or browser success inferred from mocked tests. | Review saved edit labeling and stale-draft rejection. |
| `docs/phase-5-verification.md` | Reader → pipeline/filter/bulk/suppression/export checks and browser checklist. | Shown-page board counts and capped exports are deliberate; browser checklist remains manual. | Test keyboard stage menus separately from HTTP stage persistence. |
| `docs/phase-6-verification.md` | Reader → clean-source install/build/test and local production HTTP evidence. | Records 0.6.0 checks, not remote CI/Turso/Vercel success. | Fresh source passed 75 tests before final documentation phase. |
| `docs/phase-7-verification.md` | Reader → final doc/source inventory, check results, handoff and outstanding manual work. | No recording, deployment or browser verification supplied. | Complete final checks then record the Phase 7 commit. |
| `docs/time-log.md` | Candidate → actual-time and AI/review disclosure ledger. | Durations remain to be recorded; estimates are not measured claims. | Fill your own review duration after reproducing checks. |

### Project and CI configuration

| File | Purpose and caller / input → output | Failure behavior or limit | Concrete example |
| --- | --- | --- | --- |
| `.env.example` | Developer → documented local defaults and commented hosted/optional values. | Not real credentials; APP_ORIGIN must be exact, HTTPS on Vercel; never commit .env.local. | Local startup can omit this file entirely. |
| `.github/workflows/ci.yml` | GitHub push/PR/manual event → Node 24 lock install, typecheck, tests and build. | No database service/secrets; placement must be Git root; remote run not supplied. | A failing test stops the check before build completes. |
| `.gitignore` | Git → excludes dependencies, build output, secrets, DB runtime files, coverage and TS cache. | Ignoring a file does not remove secrets previously committed; review git status/history. | .env.example remains tracked while .env.local is excluded. |
| `.nvmrc` | Node version managers/setup-node action → major 24 selection. | Does not itself install Node or change an already-running shell. | nvm use selects a compatible local runtime when available. |
| `components.json` | shadcn tooling → style/theme/CSS/icon/alias settings for editable primitives. | Tooling metadata, not a runtime component; no implicit generated feature. | A future added UI primitive uses @/components/ui alias. |
| `drizzle.config.ts` | drizzle-kit → schema/output/configured libSQL connection for migration generation. | Review generated SQL; db:generate is not a substitute for explicit migration application. | A deliberate schema edit generates history in drizzle/. |
| `next-env.d.ts` | Next type generation/tsc → framework and generated route declarations. | Generated; stale route type references are refreshed by next typegen. | npm run typecheck generates route types before tsc. |
| `next.config.ts` | Next compiler/server → externalize libSQL client, disable powered-by header/agentRules. | Configuration must match installed Next version; no migration/deployment action here. | Node runtime loads @libsql/client as a server external package. |
| `package-lock.json` | npm ci → generated exact dependency tree and integrity information. | Lock/package mismatch fails reproducible installation; do not hand-edit dependency entries. | A fresh install resolves the same pinned package versions. |
| `package.json` | npm/Next/tools → pinned dependencies, runtime engines and dev/check/migration commands. | No worker/Docker/Redis/SDK dependency; unsupported Node versions risk install/build errors. | npm test invokes vitest run; version is 0.7.0. |
| `postcss.config.mjs` | Next CSS pipeline → Tailwind PostCSS plugin configuration. | Missing/mismatched build dependency fails CSS compilation. | globals.css is processed during npm run build. |
| `tsconfig.json` | tsc/Next → strict compiler configuration and @ path alias. | Type errors block typecheck; static types do not replace Zod at runtime. | @/lib/contracts resolves inside this project. |
| `vitest.config.mts` | Vitest → Node/thread pool, one worker, serial test files and test glob. | Does not emulate browser UI; serial files avoid shared DB/env interference. | tests/platform.test.ts runs without another file competing for globals. |

## Review order and self-check

Read contracts/schema/db first, then one route and its domain function, then its tests, then the component that calls it. Use scoring and suppression/export as the first two end-to-end examples. For each handwritten file, explain its caller, one success case, one failure case and what state it changes. Generated lock/migration/type metadata should be understood as tooling output rather than presented as handcrafted logic.

Practice five traces without this guide: CSV conflict review, robots-disallowed target, evidenced exclusion, stale-stage bulk rollback and suppressed CSV selection. Run tests before changing behavior, inspect the relevant assertion, and explain what it does not prove (for example live websites or browser focus). Use interview-qa.md for follow-ups and DEPLOY.md for operational setup.

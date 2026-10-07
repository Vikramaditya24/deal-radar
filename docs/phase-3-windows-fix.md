# Phase 3: Windows test cleanup and dependency audit fix

## Apply

Stop the development server with Ctrl+C. Copy the contents of this patch's
`deal-radar` folder into your existing project, replacing matching files.
Keep your database, environment file and Git history.

The patch includes complete copies of:

- `lib/db.ts`
- `tests/workflow.test.ts`
- `package.json`
- `package-lock.json`
- this document

Run from the project folder:

```sh
npm install
npm test
npm run typecheck
npm run db:generate
npm audit
npm run build
npm run dev
```

Expected: 3 passing test files, 31 passing tests; no schema changes; no audit
findings with the supplied lockfile as checked on 2026-10-07.
Audit results can change as advisories are published.

## Why these changes

The original workflow assertions passed, but its afterAll hook tried to remove
a temporary database while Windows still held its native file handle. The suite
now uses `file::memory:` with the real libSQL engine, Drizzle schema and
migrations. The database configuration preserves that special URL instead of
resolving it into a filesystem path. Tests still exercise stored jobs, imports,
retries, cancellation, suppression and workspace isolation. They do not test
persistence across a process restart. Normal application startup still defaults
to the local file database.

The four moderate audit entries included a development-only dependency chain
from Drizzle Kit through esbuild-kit to an older esbuild. The report also flagged
the esbuild version used by tsx. The npm force-fix proposal would downgrade
Drizzle Kit to 0.18.1. Instead, an explicit esbuild 0.28.1 override replaces those
versions. This overrides upstream version ranges; retain this rationale and
recheck migration generation, startup and build when changing tooling versions.

The whatwg-encoding deprecation is a separate transitive dependency notice.
It does not cause the database cleanup error.

## Verification performed

Verified on Linux, not Windows: all 31 tests, TypeScript checking, Drizzle
migration generation, full npm audit, production build and local HTTP workflow.
The HTTP workflow also stopped and restarted the server against a temporary
file database, confirming that 150 records and completed/cancelled jobs persisted.

An initial build encountered a Turbopack cache panic after dependency changes.
A rebuild with a cleared `.next` cache passed. If you encounter that same cache
panic, stop dev, run the following portable cleanup, then rebuild:

```sh
node -e "require('node:fs').rmSync('.next',{recursive:true,force:true})"
npm run build
```

## Git history

If Phase 3 is not committed yet, commit it before applying this patch:

```sh
git add .
git commit -m "feat: phase 3 ingest, dedupe and polite enrichment"
```

After applying and verifying the patch:

```sh
git add lib/db.ts tests/workflow.test.ts package.json package-lock.json docs/phase-3-windows-fix.md
git commit -m "fix: Windows workflow test cleanup and tooling audit findings"
git log --oneline -5
```

Record your actual debugging time and AI assistance in the project time log.

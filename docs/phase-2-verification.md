# Phase 2 verification

Verified in this execution environment with Node.js 24.19.0 and npm 11.9.0. Project requires Node 22+. Versions are pinned in package.json and package-lock.json: Next 16.3.8, Drizzle ORM 0.45.3, Drizzle Kit 0.31.11, @libsql/client 0.18.0.

## Executed checks

- `npm install`: completed, 88 installed packages.
- `npm run db:generate`: generated one migration for exactly five application tables.
- `npm run typecheck`: passed.
- `npm run build`: passed without database reads during prerender/build.
- `npm run db:seed` twice: both reported exactly 150 businesses and one thesis.
- Production dependency audit: zero reported vulnerabilities at the time of verification.
- HTTP checks against `npm run dev` with an initially empty local file database: health 200; empty session had zero records; demo POST added 150 records and one thesis; repeated POST left counts unchanged.
- Pagination: 100 records on page 1 and 50 on page 2, with no overlapping IDs.
- Detail: field evidence present and all synthetic; thesis endpoint returned the seed thesis.
- Validation: oversized page size, unknown query field, repeated query field, malformed JSON and unexpected body field rejected. Foreign-origin write rejected. Nonexistent lead returned 404.
- Root HTML returned 200 with Deal Radar product content.
- Server stop/restart retained 150 businesses and one thesis in the same database.

The verification database was temporary and is excluded from the ZIP. A fresh extraction starts empty; the demo action is explicit.

## Limits of this verification

Automated browser interaction/visual checks could not run because the browser executable was unavailable and its download failed. Theme, detail focus/keyboard behavior, responsive layout and search should therefore be checked manually using the steps below. Production Turso and Vercel have not been provisioned or exercised; local file libSQL is verified. Later-phase Vitest suites and CI are not part of Phase 2.

## Reproduce locally

1. Extract the ZIP, enter its `deal-radar` folder, then run `npm install` and `npm run dev`. No .env is required.
2. Visit http://localhost:3000 or the printed http://127.0.0.1:3000 URL. Confirm an empty directory with zero businesses.
3. Click **Load 150 sample businesses**. Confirm 150 businesses, one saved thesis and synthetic labels.
4. Search **Buckeye**, clear it, and use Next/Previous to page through records.
5. Click a business name or its inspect arrow. Confirm sources, confidence, illustrative revenue, and missing fields. Close via Escape and confirm focus returns to the trigger.
6. Toggle theme and refresh; confirm it persists. Check the table at a narrow window size: it scrolls horizontally without losing columns.
7. Stop the server, run `npm run dev` again and refresh. Counts and demo state should persist.
8. Visit `/api/health`: expect `{"data":{"status":"ok","database":"libsql","phase":2}}`. `/api/leads?limit=101` should return 400.
9. Run `npm run typecheck` and `npm run build` with the dev server stopped.
10. Optional: `npm run db:seed` twice should keep 150 records and one thesis. It refuses hosted databases.

For Windows PowerShell execution-policy restrictions, use `npm.cmd` in place of `npm`; do not loosen system policy just to run this project.

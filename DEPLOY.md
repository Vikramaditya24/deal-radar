# Run and deploy Deal Radar

## Local development

Install Node 24. Extract the project or overlay its contents onto your existing project, preserving `.git`, `.env.local` and `data/deal-radar.db`. From the folder containing `package.json`:

```sh
npm ci
npm run dev
```

Visit http://localhost:3000. No keys or environment file are required. The development launcher binds to loopback, creates the local data directory and applies committed migrations. Click **Load 150 sample businesses**. These records and contacts are synthetic. Demo loading is repeat-safe. The CSV in `data/sample.csv` is the same dataset.

On Windows use `npm.cmd` if PowerShell blocks `npm.ps1`. Stop the server before replacing source files. Do not delete the database to update a phase. Using another port requires `npm run dev -- --port 3001`; matching-origin checks follow the actual URL unless APP_ORIGIN is explicitly set.

## Local production check

Unlike development, production startup does not run migrations:

```sh
npm ci
npm run db:migrate
npm run build
npm run start -- --hostname 127.0.0.1
```

Visit http://localhost:3000 and `/api/health`; the latter returns `data.status: "ok"`, `data.database: "libsql"` and `data.version: "0.6.0"`. A 503 means the database/configuration is unavailable; check server logs and migration/environment configuration. Builds require no database or provider secrets. For an existing database, migration history controls which migrations apply.

## Vercel with Turso

This path requires your own Vercel and Turso accounts. No deployment or remote migration has been performed here.

1. Create a hosted database in Turso using its dashboard or CLI. Obtain its `libsql://...` URL and auth token. Use a dedicated database for this app. Official SDK setup: https://docs.turso.tech/sdk/ts/quickstart.
2. Generate a session secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Store it privately. Never commit it.
3. Copy `.env.example` to `.env.local` and set the hosted URL, token and secret. Set `APP_ORIGIN` to the exact external site origin, for example `https://your-project.vercel.app`. It must have no trailing slash, path, query or fragment. On Vercel it must use HTTPS. If the final domain is not known yet, configure it before using JSON writes.
4. From your local project run `npm run db:migrate`. This applies the committed libSQL migrations to the configured database. Verify the URL first: this command changes that database. Do not run `db:seed` remotely; it deliberately refuses hosted URLs. Hosted users load synthetic demo data through the browser button.
5. Push your reviewed source to your own GitHub repository. Include `.github`, lockfile and committed `drizzle` files; exclude `.env.local`, local databases, `node_modules` and `.next`. Import the repository into Vercel as Next.js. Select the directory containing `package.json` as Root Directory. Set Node 24, install command `npm ci`, build command `npm run build`, and leave output settings at the Next.js defaults.
6. Add server environment variables in Vercel for Production: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`, `APP_ORIGIN`. Redeploy after setting or changing them. Do not use `NEXT_PUBLIC_` prefixes. Optional `OPENAI_API_KEY` and `OPENAI_MODEL` enable one grounded reasoning action; they are unnecessary for other flows.
7. Open the deployed site in a browser, confirm health, load the synthetic demo, edit a thesis, score a business, generate a draft, move its stage and test export/suppression. Reload and verify persistence. Check function logs if requests fail. Verify HTTPS and the exact final APP_ORIGIN after adding a custom domain.

Migrations are a deliberate deployment step, never part of `npm run build` or Vercel startup. Apply new committed migrations before releasing code that needs them. Keep backups before future schema changes. Do not point preview branches at the production database. If enabling previews, use a separate database and configure the exact preview origin; production APP_ORIGIN will reject writes from another origin. This app does not implement wildcard origins or automatic preview provisioning.

Official Next.js hosting reference: https://vercel.com/docs/frameworks/full-stack/nextjs. Function duration reference: https://vercel.com/docs/functions/configuring-functions/duration. The process route declares 30 seconds and budgets approximately 20 seconds of work per slice; target max-duration settings must allow it. The browser drives successive slices and polls. Closing it stops progress until Resume; there is no background worker.

## Storage, sessions and operational limits

The same five-table Drizzle schema is used locally and remotely. File storage is rejected on Vercel because function disks do not provide durable app storage. Hosted URLs require a token. Do not put credentials into URLs or public client code.

Local mode has one workspace. Hosted mode isolates workspaces by a signed HttpOnly, Secure, SameSite=Lax cookie. It is a demo session mechanism, with no login, sharing or account recovery. Clearing/expiring the cookie, changing the session secret, or using another browser creates a new workspace; prior records remain stored but cannot be recovered through the UI. Keep the secret stable and treat hosted data as an assessment/demo deployment rather than an authenticated team product.

For a local backup, stop all app processes, then copy `data/deal-radar.db` and any accompanying `-wal`/`-shm` files together. Restore only while stopped. For hosted backups/recovery, use Turso's database tools and confirm their availability for your plan. No automated backup or restore UI is implemented.

Crawler rate limits and cache are per process, and jobs use best-effort client-driven coordination. Do not process the same job concurrently in multiple tabs or promise a global crawl throttle across Vercel instances. Robots refusals, unavailable sites, dynamic-only pages and DNS failures are visible outcomes. Redis and a durable worker are future work. No Docker, alternative SQL dialect, paid AI dependency or email sending is included.

## CI and repository handoff

`.github/workflows/ci.yml` uses Node 24 and runs `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. Tests use isolated in-memory libSQL, with serial test files, and do not require Turso or OpenAI secrets. GitHub Actions needs the workflow at the repository root. Official actions: https://github.com/actions/checkout and https://github.com/actions/setup-node.

The ZIP contains source, not Git history. Preserve your existing repository and commit each reviewed phase. See `docs/git-history.md` for exact commands. Record actual time and AI assistance in `docs/time-log.md`; do not invent elapsed time, independent authorship, a live URL or a successful hosted CI run.

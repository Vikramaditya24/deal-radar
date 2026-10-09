# Deploy

## Local

```sh
npm ci
npm run dev
```

Node 22.12+ (24 recommended). No environment file needed. On Windows PowerShell, use `npm.cmd` if script execution is blocked.

## Local production check

```sh
npm ci
npm run db:migrate
npm run build
npm run start -- --hostname 127.0.0.1
```

`GET /api/health` should return `data.status: "ok"`.

## Vercel + Turso

1. Create a Turso database; note its `libsql://...` URL and auth token.
2. Generate a secret: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
3. Copy `.env.example` to `.env.local` and set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`, and `APP_ORIGIN` (exact HTTPS origin, no trailing slash).
4. Run `npm run db:migrate` locally to apply migrations to Turso. (`db:seed` refuses remote databases; load demo data from the UI.)
5. Push to GitHub, import the repo into Vercel as a Next.js project, and add the same four variables as server environment variables. Optional: `OPENAI_API_KEY`.
6. Open the site, check `/api/health`, load the demo, score, draft, move a stage, export, and reload to confirm persistence.

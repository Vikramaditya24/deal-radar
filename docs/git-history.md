# Preserve the phase history

Use the same working project folder throughout. ZIP deliveries contain complete source but exclude `.git`, local databases, node_modules, build output and secret environment files.

## Before copying Phase 3

In your current, verified Phase 2 project folder:

```sh
git init
git status
git add .
git commit -m "feat: phase 2 scaffold, libSQL storage and synthetic demo"
```

If Phase 2 is already committed, skip the commit. `git init` inside an existing repository does not erase its history. If Git asks for author identity, configure your own name and email locally, then repeat the commit. Do not use an invented identity.

Extract the Phase 3 ZIP elsewhere. Copy its `deal-radar` contents over the corresponding files in this same project folder. Preserve `.git`, `.env.local` and `data/deal-radar.db`; they are not included in the archive. Do not replace the entire directory with a new one or nest `deal-radar` inside itself.

## Verify and commit Phase 3

Stop the dev server first:

```sh
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

Complete the manual checks in phase-3-verification.md. Stop dev, then:

```sh
git status
git diff --stat
git add .
git commit -m "feat: phase 3 ingest, dedupe and polite enrichment"
git log --oneline -5
```

This preserves your own author identity and your actual local commit hashes. Do not claim AI-generated commits were independently authored; disclose AI assistance and your review. On PowerShell, use `npm.cmd` if npm.ps1 is blocked. No GitHub remote, push or publishing is required at this phase.

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

## Phase 4

First verify and commit the Phase 3 Windows/dependency fix if not already committed. Stop the dev server. Copy the contents of the Phase 4 ZIP's `deal-radar` folder into this same project folder, preserving `.git`, `.env.local`, and your database. No new migration or database reset is needed.

```sh
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

Complete docs/phase-4-verification.md, stop dev, then:

```sh
git status
git diff --stat
git add .
git commit -m "feat: phase 4 thesis scoring and evidence-backed outreach"
git log --oneline -6
```

Do not reinitialize Git or copy another `.git` folder. These ZIPs do not create commits on your computer: the command above records the reviewed changes in your existing history.

## Phase 5

Commit verified Phase 4 before overlaying Phase 5 if you have not already. Stop dev, copy the Phase 5 ZIP's `deal-radar` contents over the same project folder, preserving `.git`, `.env.local`, and your local DB. Do not nest the folders.

```sh
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

Complete `docs/phase-5-verification.md`, then stop dev and record this phase:

```sh
git status
git diff --stat
git add .
git commit -m "feat: phase 5 pipeline, suppression and CRM export"
git log --oneline -7
```

No new migration or database reset is needed. Keep your existing commit history and author identity.

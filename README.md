# Deal Radar

An acquisition-target research tool for search-fund and ETA buyers, built as an upgrade on the idea behind SaaSquatch. SaaSquatch finds leads. Deal Radar answers the next question a buyer has: **which of these businesses actually fit my thesis, why, and what do I say to the owner?**

Built for the Caprae Capital AI-readiness challenge.

## What it does

1. **Thesis builder.** Save a reusable buy-box: industries, geographies, revenue range, minimum age, must-haves, deal-breakers.
2. **Import and dedupe.** Upload a CSV or paste URLs. Fuzzy matching (normalized names, domains, phones, trigram and Jaro-Winkler similarity) proposes merges. Ambiguous or conflicting matches default to "keep separate" and you decide.
3. **Enrichment.** A polite crawler reads a homepage plus up to two about/contact/team pages. It respects robots.txt, rate-limits per host, and blocks private network addresses. Live crawl is capped at 5 URLs.
4. **Explainable fit score (fit-v1, 0-100).** Thesis match 50, succession research clues 20, data completeness 15, contactability 15. Every point is backed by a cited piece of evidence with a confidence level. Unknowns are shown as unknown, not guessed.
5. **Outreach drafts.** Email or LinkedIn note in three tones. Each factual sentence points to its evidence. Nothing is sent, and the draft never claims the owner wants to sell.
6. **Pipeline.** New / Contacted / Replied / Meeting, bulk moves, server-side filters.
7. **Export.** HubSpot- and Salesforce-style CSV mappings with spreadsheet-formula protection.
8. **Ethics controls.** A suppression list (lead, domain, email, phone) blocks enrichment, drafting and export. Sample data is synthetic and labeled everywhere.

## Run it

Requires Node 22.12+ (Node 24 recommended). No accounts, database service or API keys needed.

```sh
npm ci
npm run dev
```

Open http://localhost:3000 and click **Load 150 sample businesses**. Migrations apply automatically to a local SQLite file at `data/deal-radar.db`.

```sh
npm test          # 75 tests
npm run typecheck
npm run build
```

Optional: set `OPENAI_API_KEY` to let one action reorder and reword score reasons. It cannot change points or invent facts, and everything works without it.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js (App Router), TypeScript, React 19 |
| UI | Tailwind CSS 4, shadcn/ui components, dark/light themes |
| Database | libSQL via Drizzle ORM: a local file in development, Turso in production, one schema |
| Validation | Zod on every API route |
| Crawling | Cheerio, robots-parser, DNS-pinned requests |
| Cache | In-memory LRU (200 entries / 10 MB) plus per-host timers |
| Tests / CI | Vitest, GitHub Actions (typecheck, test, build) |
| Hosting | Vercel (serverless Node routes) + Turso |

See [docs/architecture.md](docs/architecture.md) for design decisions, schema and performance, and [DEPLOY.md](DEPLOY.md) for hosting steps.

## Known limits

- Scores are prioritization heuristics, not valuations and not a prediction that an owner will sell. Matching is literal phrase matching and can miss synonyms.
- The enrichment queue is client-driven and single-user. Do not process one job from two tabs at once. Throttling is per server instance.
- JavaScript-only websites may yield few facts.
- Revenue figures in the sample are illustrative import data, not extracted.
- No authentication: a browser session scopes the demo data.
- Live crawling and hosted deployment are not covered by the automated tests.

## Build notes

Built with AI assistance (ChatGPT generated most of the code and I directed, reviewed and ran it). See [docs/BUILD-NOTES.md](docs/BUILD-NOTES.md).

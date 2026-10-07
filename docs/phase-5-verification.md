# Phase 5 — workflow, quality and verification

## Delivery

Complete Phase 2–5 source, including the Phase 3 Windows test cleanup/dependency fix and all Phase 4 scoring/outreach work. New workflow uses the existing five tables and migration history; there is no database reset or schema migration.

- Directory: debounced server filters, current-thesis score sorting, selected counts, bounded native table virtualization.
- Pipeline: four persisted stages, native drag-and-drop, keyboard/touch stage menus, individual selection and atomic bulk moves.
- Suppression: lead/domain/email/phone rules, normalized matching, pending-job blocks, stale drafts, explicit removal with no automatic restart.
- Export: HubSpot/Salesforce CSV mappings, current scores, synthetic flags, formula protection, bounded preparation and 100-row output chunks.
- Quality: stored facts/unknowns, selected/alternate evidence confidence, method/time/source, merge conflicts and successful-page robots notes. Failed/blocked crawl outcomes remain visible in Job progress.
- Navigation: persistent active thesis/theme, native modal focus handling, Ctrl/Cmd+K command palette, `/` search shortcut and Escape dismissal.

## Automated results recorded here

Runtime: Linux, Node **v24.19.0**, existing dependency lockfile and zero paid keys.

- `npm test`: **65 passing tests across six files**. The 14 Phase 5 tests cover stage persistence/stale writes, atomic bulk rollback, server filters, current-score requirements, suppression enforcement, normalized contacts, workspace isolation, no automatic restart, CSV escaping/mappings/synthetic labels, selected identity exports and invalid contracts.
- `npm run typecheck` passed.
- `npm audit --json`: zero reported vulnerabilities at verification time.
- `npm run build` passed with all new route handlers included.
- Local HTTP checks: single and bulk stage updates; stale-stage 409; stage filter; suppression list/detail flags; pending job blocked; draft POST rejected with 403; both CSV mappings omitted the suppressed selected lead; invalid stage/score-without-thesis/export-format inputs rejected with 400.
- Restart: pipeline stages, suppression and blocked jobs survived. Removing the suppression entry made the record active without restarting its old job.
- Root HTML compiled and responded with Deal Radar content. This is an HTTP/SSR check, not an interactive browser test.

The separate cloud browser cannot reach this workspace's local network endpoint (established in Phase 4). No interactive browser/visual, mobile, clipboard-permission, real-site crawl, hosted Turso or live OpenAI success is claimed. Follow the manual checklist below on your Windows browser. The real in-memory libSQL tests avoid Windows temporary-file deletion and preserve the previous EBUSY fix.

## Apply and verify

Stop dev first. Overlay the ZIP's `deal-radar` contents into your existing project directory, preserving `.git`, `.env.local`, `data/deal-radar.db` and related runtime data. Do not create a nested project folder or discard previous commits.

```sh
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

Node 24 is recommended; the declared support includes 22.12+. All ordinary flows work without an environment file or paid key. Open http://localhost:3000.

### Manual browser checks

1. Your existing leads and theses must remain. Load the labeled demo if empty. Choose a thesis and **Rank first 150**. Directory sorts by current fit score; scores remain the same fit-v1 algorithm. No extra tables/migration should be generated.
2. Scroll the directory table vertically through 100 rows; later rows should appear without blank gaps. Use the table's keyboard-focusable scroll region. Next page shows remaining records. Select individual records and **Select shown**; verify the selected count. Selection is bounded to the current page and is cleared when filtering/paging.
3. Filter industry, geography, stage, real/synthetic, enrichment status, minimum fit and eligibility. Minimum fit/eligibility require an active thesis and exclude unscored or stale records. Reset filters. Active only hides suppressed records by default.
4. Change a stage in Directory and verify it in Pipeline. Drag a card to Contacted/Replied/Meeting, then try its stage menu. These are manual statuses; copying a draft does not automatically move it or send anything. Board column counts are explicitly the shown page, not global totals.
5. Select two cards/rows, pick a destination and **Move 2**. Refresh: both persist. To test a conflict, open the same record in two browser tabs, move it in the first, then attempt a move from the old stage in the second: expect a changed-stage error and reload. Bulk conflicting moves should not partially update records.
6. Open a business drawer. Tab through its stage, enrichment, scoring, tone/channel, edit/copy and suppression controls; Escape closes it. Check every stored fact/unknown, field confidence/method/source/date, alternate evidence and merge conflicts. Synthetic links are labels only, not clickable real websites.
7. Generate and save a sourced draft. Suppress that business with a reason from the drawer. Confirm it leaves Active only results, appears with Suppressed only, and cannot be enriched/drafted/copied/exported. The same pending enrichment job should be blocked.
8. In Suppression, add a domain/email/phone rule and inspect normalization. Matching values may block multiple leads (synthetic phone numbers intentionally repeat). Remove an entry only after reviewing it; its old jobs stay blocked and old drafts stay stale. Explicit new enrichment/draft generation is required.
9. Export selected and filtered records using both mappings. Open CSV, check column headers, amounts/currency, stage, synthetic marker and current-thesis score. Suppressed entries must be omitted; exporting Suppressed only filters produces a header-only CSV. Selected export follows explicit selected IDs, independent of current filter text. Custom CRM columns need import mapping; no CRM is connected.
10. Confirm CSV quotation for commas/quotes and inspect spreadsheet-formula prefixes. Formula-like cells beginning with `=`, `+`, `-` or `@` (including leading whitespace) receive an apostrophe. International `+` phone values are protected too; review their import mapping. Exports are capped at 1,000 filtered or 150 selected rows; UI selection is at most 100.
11. Ctrl/Cmd+K opens Quick actions. Search for an action, Tab to it and activate. `/` focuses search when not editing a field. It should not hijack typing. Escape dismisses the palette. Try theme switching, then refresh: theme and saved active-thesis choice persist.
12. Inspect your normal desktop layout and a narrow browser width. Table uses horizontal scrolling; Pipeline becomes two/one columns. Check loading/empty/error states, dialog focus and copy behavior in your browser. Clipboard failure reports an error; no message is sent.
13. Restart dev after moving stages and suppressing a lead. State must persist. Re-enrich a fixture and confirm its score resets and drafts become stale. Update a thesis and confirm score filters no longer include its old assessments.

## API additions

All query/body/parameter inputs are Zod validated; write routes retain matching-origin enforcement and all records are workspace scoped.

| Route | Operation |
|---|---|
| GET /api/leads | Added stage/industry/geography/enrichment/minScore/eligible/suppression filters; up to 100 rows. |
| PATCH /api/leads/:id | Manual stage update with `stage` and `expectedStage`; 409 on unavailable/stale state. |
| POST /api/leads/bulk | Atomic stage moves or lead-ID suppression, at most 150 distinct targets. |
| GET, POST /api/suppressions | List and add normalized opt-out rules. |
| DELETE /api/suppressions/:id | Explicit workspace-owned rule removal; empty JSON body. |
| GET /api/export | HubSpot/Salesforce mapping; optional comma-separated selected IDs, otherwise current filters. |

Stage moves do not increment evidence revision, so unrelated pipeline tracking does not invalidate scored facts or generated drafts. Fact corrections use evidence-preserving import rather than an additional manual fact-edit product flow.

## Limits to explain

- Virtualization is within a server-paginated 100-record page. Board columns use that same page; there are no hidden global-board counts.
- Filters on JSON fields are parameterized SQL, suitable for this bounded demo. The existing workspace/stage/domain/phone indexes remain; no new full-text or warehouse system was added.
- Bulk stale-stage updates roll back. There is no new operation log or idempotency-key store.
- Suppression is checked before fetching/saving/drafting, before preparing export bytes, and at Copy click. Already downloaded/copied material cannot be revoked; this is not a distributed serializable queue across Vercel instances.
- Removing a rule makes a matching lead active only if no other rule still matches. Its enrichment status may remain blocked until explicit new work.
- Exports are bounded in memory after paged database reads, then streamed in chunks. They are mappings, not authenticated CRM integrations. Salesforce custom fields/multi-currency and HubSpot custom columns need importer configuration.
- Research-origin CSV text identifies supplied websites/imports/fixtures. It is not a claim that every exported fact was extracted from that website. Review individual evidence in the drawer.
- Automatic live processing still depends on the browser; the per-host throttle remains per server process. Phase 5 did not change that architectural limit.

See docs/git-history.md for the Phase 5 commit command. Record actual time and AI assistance in docs/time-log.md. Phase 6 handles basic CI/final setup/deployment documentation; Phase 7 handles the video script and every-file/interview guide.


CRM field references checked during implementation: [HubSpot default company properties](https://knowledge.hubspot.com/properties/hubspot-crm-default-company-properties?_conv_s=null) and [Salesforce organization import field mapping](https://help.salesforce.com/s/articleView?id=sf.field_mapping_for_other_data_sources_and_organization_import.htm&language=en_US&type=5). Industry picklist values may need mapping to your CRM's allowed values; custom columns are proposed mappings, not automatically provisioned fields.

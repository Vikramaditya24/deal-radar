# Phase 4 — verification and implementation notes

## What is delivered

Complete source including Phase 3 and its Windows cleanup/esbuild fix, plus:

- Reusable thesis creation/editing with revision checks; choose an active thesis.
- Pure fit-v1 assessment with four factors, confidence discounting, configured-weight renormalization, unknowns and evidenced deal-breaker exclusions.
- Workspace-scoped score persistence in the existing lead JSON column; stable-ID tie breaks and current-score ranking in SQL before pagination.
- Three deterministic tones and two channels, factual sentence evidence, thesis-linked buyer intent, no delivery integrations.
- Persisted user edits clearly labeled without manufactured citations, retaining the original generated sentences and citations.
- Strict-schema optional OpenAI reason ordering/approved wording, deterministic fallback; no free-form model claims accepted.
- Stale score/draft detection across evidence changes, thesis revision changes and UTC assessment dates.

The five tables and SQL migration history are unchanged. No database reset or generated migration is required. Existing Phase 2/3 evidence remains usable: combined `geography` evidence supports matching its explicit city/state/country; explicit supported currency in facts is treated as metadata of the evidenced revenue assertion, with revenue confidence applied. There is no currency conversion.

## Checks performed here (Linux, no provider keys)

- `npm ci` succeeded with the pinned lockfile.
- `npm test`: **51 tests passed in five files** (31 existing; 20 new scoring/outreach/persistence tests).
- `npm run typecheck` and `npm run build` succeeded.
- `npm audit --json`: zero reported vulnerabilities at verification time.
- Local HTTP: loaded 150 demo leads; computed 150 assessments; checked descending current-thesis ranking; persisted all six tone/channel combinations; created/edited a thesis; stale thesis PATCH returned 409; missing thesis returned 404; malformed scoring/outreach returned 400.
- Local-file server restart: saved score and all six drafts persisted.
- In-memory libSQL tests use real migrations: current-thesis ranking, score staleness after thesis edit, generated/edited draft persistence, original citation retention, cross-workspace rejection, suppression blocking, and no partial batch update on unavailable IDs.
- Optional AI tests: no-key path makes no network call; refusal, missing content, invalid indices, and thrown timeout fall back; valid grounded ordering retains identical factors and score.

Visual/browser QA could not be performed: the separate cloud browser could not reach the workspace localhost endpoint. The HTTP checks ran with the server and client in one execution environment. Windows, hosted Turso, a real paid OpenAI call and real-site crawling are not claimed as verified. Phase 3's live network limitation remains.

## Your browser checklist

1. Stop dev; overlay the complete ZIP source into your existing folder. Preserve `.git`, `.env.local`, `data/deal-radar.db`. Run install, test, typecheck, build, then dev. Keep using Node 24 or 22.12+.
2. Existing data should still appear. Load the synthetic demo if the directory is empty.
3. Select **Established recurring services**, click **Rank first 150 businesses** and keep sort set to Fit score. Expect descending scores rather than identical perfect matches. Evidence confidence discounts points; no synthetic record is presented as a validated acquisition prospect.
4. Inspect the top row. Check the four factor bars and reasons. Their uncapped sum rounds to the total for an eligible lead. Exclusion caps apply to total, not individual bars.
5. Create a thesis with only the selected business's exact industry. Leave other criteria empty. Save and score: the industry allocation renormalizes to 50 and uses its evidence confidence. Revenue/age criteria must be genuinely empty, not zero, when unconfigured.
6. Edit that thesis to include the selected lead's exact industry as a deal-breaker. Existing scores become unavailable until rescored. Score again: see Excluded and total at most 20. Missing must-haves show Needs verification; they do not prove absence.
7. Generate email and LinkedIn notes in all three tones. Inspect sentence evidence and thesis references. No named owner, willingness to sell, financing promise or inferred retirement should be invented. Synthetic facts identify their demo origin.
8. Edit the text and **Save user edit**. Confirm User-written and open Original generated draft and evidence. Copy uses saved content; unsaved changes are not copied by Copy saved draft. No email or LinkedIn message is sent.
9. Generate a draft, close details, enrich that synthetic business, and reopen. The old draft must show stale and copying must be disabled. Regenerate and rescore. Review selected/alternate sources.
10. Try **Optional AI reasoning** without any key: the score remains deterministic. With a real key, the button may use AI-selected grounded wording; failure is a visible heuristic mode. No key is required for this phase.
11. Refresh/restart the server: theses, scores and saved draft versions persist. A fresh UTC date requires scoring again. The active thesis selection is currently browser component state and defaults to the first saved thesis after refresh; persisted active selection/UX polish belongs to Phase 5.
12. Check theme, close dialog with Escape, Tab through tone/channel/text/copy controls, and inspect on your usual desktop browser. Report actual visual issues before moving to Phase 5.

Suppression management is Phase 5; server-side enforcement already checks existing lead/domain/email/phone entries before drafting. Suppressed details are inspectable, but this editor blocks display/copy/drafting. A copy already saved outside the application cannot be revoked.

## Limits and choices to explain

| File | Purpose and reason |
|---|---|
| lib/scoring.ts | Pure assessment function: deterministic input/date and versioned output; no database or AI coupling. |
| lib/reasoning.ts | Optional provider call with strict schema, timeout and bounded choice validation; no model-controlled facts or points. |
| lib/outreach.ts | Deterministic templates and sentence provenance; useful without a key. |
| lib/assessment.ts | Small persistence module for thesis validation, bounded scoring and draft saves; workspace and revision checks. |
| components/thesis-builder.tsx | Buy-box form, server validation errors and create/edit flow. |
| components/outreach-editor.tsx | Factor bars, cited drafts, manual edits, stale-state guards and copy. |
| app/api/scores/route.ts | Thin validated POST route; maximum 150 targets, optional AI limited to one target. |
| app/api/theses/[id]/route.ts | Revision-checked workspace-scoped thesis update. |
| app/api/leads/[id]/outreach/route.ts | Validated generated draft and user-edit endpoints. |

Each lead stores one latest score and up to 30 tone/channel/thesis drafts, not an unbounded audit ledger. Changing active thesis may require recomputing scores. Rank first 150 takes an alphabetical batch across the directory; use Score shown for further pages. Literal phrase matching is explainable but does not perform semantic inference, synonym expansion, or a comprehensive negation analysis. Unknowns stay visible. Input and website assertions remain unverified until diligence. The score is a hypothesis about research fit, not learned weights, valuation advice, or a probability of sale.

AI uses the official Responses structured-output shape (`text.format`, `json_schema`, strict object schema), checked against https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses . It ranks reasons and selects approved wording only. This deliberately avoids trusting arbitrary model claims just because their evidence IDs look valid. Its live provider operation is unverified here; fixtures cover success and fallback semantics.

Record your actual time, review and AI use in docs/time-log.md. This delivery does not assert compliance with a five-hour coding limit.

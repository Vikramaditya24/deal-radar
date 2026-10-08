# Phase 7 — final guides and source handoff

## Delivered

Complete Phases 2–7 source at **0.7.0**, including all earlier implementation, Windows test cleanup fix, five-table migration history and CI/deployment docs. This phase adds documentation and updates package metadata; it does not change application behavior, schema or dependencies.

| Deliverable | Location | Contents |
| --- | --- | --- |
| Two-minute demo | docs/demo-script.md | Preparation, seven timed scenes, 233-word narration, rehearsal/failure checks; script rather than a recording |
| Every-file guide | docs/file-guide.md | All 99 delivered paths, purpose/caller/input-output flow, failure/limit and example; handwritten and generated files distinguished |
| Interview preparation | docs/interview-qa.md | Ten answered questions, code references, follow-ups and exercises |
| Final disclosure/history | docs/time-log.md, docs/git-history.md | Actual-time/review placeholders and Phase 7 commit commands |
| Implementation clarification | docs/architecture.md | Historical planned dependencies/routes distinguished from final code |

## Final checks recorded

Linux, Node v24.19.0. `npm run typecheck`, `npm test` and `npm run build` passed after updating to 0.7.0. **75 tests across seven files** remain passing. Production HTTP health returned status ok/version 0.7.0 and the root returned Deal Radar HTML. Existing storage was preserved; no database reset or migration was needed.

The every-file guide was checked programmatically against the delivered path inventory: no missing or extra entries. The final archive was checked for ZIP integrity and includes hidden project config/CI files. It excludes dependencies, build output, local databases, secrets and Git metadata. Phase 6 independently verified a clean install/build without provider secrets and the broader local production persistence/suppression/export flow; those results remain documented as Phase 6 checks, not newly claimed hosted results. No new dependency audit was necessary for this documentation/metadata phase.

Narration is 233 words, suitable for a two-minute target at roughly 117 words/minute, but the candidate must time the actual clicks and pauses. No browser rehearsal, recording or stopwatch verification is claimed. No hosted CI run, Vercel/Turso deployment, live AI response, real-site success, interactive/mobile/clipboard verification or video link is supplied.

## Apply, understand and commit

Stop your app and commit verified Phase 6 first. Overlay this ZIP's `deal-radar` contents into the same project directory, including `.github` and `.nvmrc`; preserve `.git`, `.env.local` and your local database. Do not nest folders. No schema reset is required.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

Use `npm.cmd` on Windows if PowerShell blocks npm.ps1. Complete the Phase 5/6 browser and deployment checklists for the claims you plan to make. Read the file guide alongside source and reproduce interview exercises. Then rehearse/record the demo, review the recording and fill your actual duration/review notes. After review:

```sh
git status
git diff --stat
git add .
git commit -m "docs: phase 7 demo, file guide and interview handoff"
git log --oneline -9
```

These are commands for your existing repository, not fabricated commit hashes. The ZIP creates no commits on your computer. Push only to your configured remote and inspect actual CI results before claiming them.

## Submission checklist

- Provide your own repository URL with preserved phase commits and working README startup instructions.
- Provide a viewable recording link after recording/uploading it. A demo script is not a submitted video.
- Include a hosted URL only if actually deployed and smoke-tested; otherwise state local-only verification and use the supported local recording path.
- Leave synthetic labels visible and describe CRM CSV as mappings, manual stages as tracking, and fit-v1 as a research heuristic.
- Disclose AI-generated code/docs and your own review/testing. Use measured time, not the architecture's estimates or an invented five-hour claim.
- Explain the remaining operational limits: client-driven jobs, per-process crawl coordination, one latest score per lead, no session account recovery, literal criteria matching and bounded CSV preparation.

All seven planned source/documentation phases are delivered. Recording, candidate review and external account deployment remain actions to complete before presenting those outcomes as verified.

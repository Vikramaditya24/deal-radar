# Two-minute Deal Radar demonstration

## Prepare before recording

Use your own browser on desktop, preferably 1280×800 or larger. Record with Loom or another screen recorder. This is a recording script, not a completed video. No mobile segment is needed for this two-minute walkthrough.

1. Overlay Phase 7 into your existing project, preserve database/Git/environment files, run `npm ci` then `npm run dev`, and open http://localhost:3000. Do not show terminals containing credentials.
2. Load the 150 synthetic businesses if absent. Pick the sample thesis. Click **Rank first 150** and wait for completion. Re-score on the recording day because freshness uses UTC dates.
3. Pick an unsuppressed high-ranked lead with visible industry/history/contact evidence. Generate a professional email draft. Inspect its factual sentences and citations before recording. Keep another lead available for pipeline/export selection. Do not add invented facts to the draft.
4. Rehearse opening that drawer, switching tone/channel, moving a stage, downloading selected CSV and adding lead-level suppression with a reason. Use stage menus for dependable clicks. Restore the rehearsal stage and explicitly remove only your rehearsal suppression entry afterward; generate a fresh draft because removing suppression does not restore it. Avoid domain/email/phone opt-outs in the recording because synthetic values can be shared.
5. Keep a prepared CSV import preview available only if you have time; the core two-minute sequence does not require it. Do not run live crawling while recording. Fixture enrichment is separate from real-site retrieval and must be described as such.
6. Check Copy permission in the browser before capture. If denied, show the saved draft and source references; do not claim copying succeeded. Set browser zoom to 100%, close unrelated tabs/notifications, and record a brief sound check.

Preparation is ordinary demo setup. Do not narrate precomputed ranking as if it just completed on screen. Do not reset your persistent database just for a video.

## Timed actions and narration

Target roughly 120 seconds. The narration below is about 220 words; pause while clicking. Read naturally rather than rushing. The labels are from the implemented UI.

| Time | On-screen action | Narration |
| --- | --- | --- |
| 0:00–0:15 | Show Directory, 150 records and synthetic labels. | “Deal Radar helps a search-fund buyer move from a business directory to a researched shortlist. These 150 businesses are synthetic demo records. The local app needs no paid keys, and data persists in libSQL.” |
| 0:15–0:32 | Show active thesis criteria, then the ranked directory. Use existing ranking rather than waiting through a bulk request. | “The thesis records the buyer’s industries, geography, revenue range and other criteria. I’ve ranked the sample dataset with fit-v1. Scores use sourced evidence, with explicit unknowns where information is missing.” |
| 0:32–0:55 | Open prepared lead; show factor bars, unknowns and one selected evidence/source entry. | “Each score explains thesis fit, succession research clues, completeness and contactability. A succession clue is not proof that an owner wants to sell. I can inspect the selected assertion, confidence, observation date and source. Demo evidence stays labeled synthetic.” |
| 0:55–1:15 | Show saved professional email, sentence references and tone/channel controls. Copy only if permission succeeds. | “Outreach uses deterministic templates in three tones and two channels. Factual sentences reference evidence, and buyer-intent text references the thesis. User edits are labeled separately. Changed evidence or thesis criteria make earlier drafts stale. The app never sends messages.” |
| 1:15–1:35 | Close drawer; select a lead; move it via stage control; show Pipeline and selected CSV download. | “The pipeline persists manual stages, with bulk moves and server filters. This stage records my action; it does not mean an email was sent. Selected export produces CRM-mapped CSV, with synthetic flags and spreadsheet-formula protection.” |
| 1:35–1:52 | Open chosen lead; add lead-only opt-out reason; show suppressed status or Suppression tab entry. | “A lead-level opt-out blocks further enrichment, drafting and export. Removing it is explicit and does not restart old work or restore a draft. Source review and suppression are part of the workflow.” |
| 1:52–2:00 | Finish on Directory or Pipeline; no fake deployed URL/CI dashboard. | “Tests, typecheck and the production build passed locally. Hosted deployment and browser-driven enrichment have documented limits. I used AI assistance and reviewed the implementation.” |

## Rehearsal and failure handling

Time one full unedited rehearsal. Leave time for dialogs and download feedback. If it exceeds two minutes, remove the tone/channel switch or the Copy click, retaining the source explanation and opt-out. Do not cut pauses to imply a crawl or score completed faster than it did.

If an old draft is stale, regenerate before capture. If the active thesis is changed, rerank before showing results. A CSV is a mapping file, not a connected CRM integration; do not show a real CRM import of fictional contacts. If a route fails, reproduce and fix it before recording; the script does not establish browser success.

## Optional longer discussion outside the two-minute video

Show CSV preview, duplicate/conflict decisions, fixture enrichment progress, Pause/Resume, real-site robots outcomes if actually tested, and the saved state after restarting. These features are omitted from the short capture for pacing, not described as absent. Real crawling should use public sites and display actual results, including blocked/partial outcomes.

## Before submitting the recording

Watch the entire video with sound. Confirm text and cursor are legible, the synthetic labeling is visible, the opt-out actually took effect, and no credentials or private tabs appeared. Share a viewable video link only after recording/uploading yourself. Do not claim hosted CI/deployment, live crawling, or full browser verification unless you performed those checks. Record actual work/review time in time-log.md.

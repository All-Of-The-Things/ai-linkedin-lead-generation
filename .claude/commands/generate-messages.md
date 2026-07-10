# /generate-messages

**Phase 2 of the LinkedIn pipeline.** Run this after you have reviewed the approval files in `state/pending_approvals/` — either by setting `decision: "approved"` in the classification files, or by moving URLs into the `"approved"` array of a links file (abbreviated runs).

## What this does

1. Reads `CLAUDE.md`, `config/pipeline.json`, and resolves the active criteria.
2. Executes pipeline **Step 6a** — Compose Connection Note Drafts:
   - Scans all approval files (`*-hot.json`, `*-warm.json`, `*-cold.json`, `*-connection.json`, `*-links.json`) for approved leads without drafts. URLs in a links file's `approved` array count exactly as `decision: "approved"`.
   - Expires links-file URLs left undecided past `approval.approval_timeout_days` (moved to the file's `expired` array, lead marked rejected — move a URL to `approved` to rescue it later). Stale undecided classification/legacy entries expire the same way: `decision` is stamped `"rejected"` and the lead marked rejected (`approval_decision: "expired"`), so decided files can later be archived by `/pipeline-maintenance`.
   - Fetches the full LinkedIn profile (with experience) for each lead before drafting, **writes the fetched fields back** to `leads.json` (`name`, `headline`, `current_title`, `current_company`, `industry`, `location`) and stores the raw payload in `state/raw/<slug>.json` (per CLAUDE.md Step 6a).
   - Invokes `agents/message-composer.md` to draft a personalized connection note for each.
   - Writes `note_draft` back to the source classification file (links-file leads have no per-entry fields — their drafts live only in the notes-ready file).
   - Writes a **new consolidated notes-ready file** containing only the approved+drafted entries.
3. Invokes `agents/email-notifier.md` with `phase: "notes_ready"` to send a notification email with all draft notes for review.
4. Updates `state/run_log.json`.

## Before running

- At least one approval must be pending drafting: an entry with `decision: "approved"` and `note_draft: null` in a `*-hot.json`, `*-warm.json`, `*-cold.json`, or `*-connection.json` (legacy) file, or a URL in a `*-links.json` `approved` array not yet covered by a notes-ready file. If all approved entries already have drafts, nothing will be composed and you'll get a warning.
- `RESEND_API_KEY` must be set in the environment for the email notification to send.

## After running

Check your email — it shows each draft note alongside the lead. Open the newly created `state/pending_approvals/YYYY-MM-DD-notes-ready.json` file. This file contains **only** approved leads with their drafted notes — no noise, no nulls. For each entry:
- Review the `note_draft`.
- Optionally overwrite it in `edited_note` if you want to tweak it.
- Set `note_decision` to `"approved"` or `"rejected"`.

Then run `/send-connections`.

## Rate limit handling

One `linkedin person fetch` is made per approved lead before drafting (nothing is ever sent in this phase). Exit code 6 → standard retry rules from `CLAUDE.md`; on persistent failure fall back to the `state/raw/<slug>.json` sidecar or the lead's existing fields — never abort the batch. If the message-composer subagent fails, log and skip that lead — do not abort.

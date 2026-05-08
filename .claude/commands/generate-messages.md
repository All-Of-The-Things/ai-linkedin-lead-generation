# /generate-messages

**Phase 2 of the LinkedIn pipeline.** Run this after you have reviewed `state/pending_approvals.json → connection_approvals` and set `decision` to `"approved"` or `"rejected"` for each lead.

## What this does

1. Reads `CLAUDE.md`, `config/pipeline.json`, and resolves the active criteria.
2. Executes pipeline **Step 6a** — Compose Connection Note Drafts:
   - Scans all approval files (`*-hot.json`, `*-warm.json`, `*-cold.json`, `*-connection.json`) for entries where `decision: "approved"` and `note_draft` is null.
   - Fetches the full LinkedIn profile (with experience) for each lead before drafting.
   - Invokes `agents/message-composer.md` to draft a personalized connection note for each.
   - Writes `note_draft` back to the source classification file.
   - Writes a **new consolidated notes-ready file** containing only the approved+drafted entries.
3. Invokes `agents/email-notifier.md` with `phase: "notes_ready"` to send a notification email with all draft notes for review.
4. Updates `state/run_log.json`.

## Before running

- At least one entry across all `state/pending_approvals/*-hot.json`, `*-warm.json`, `*-cold.json`, or `*-connection.json` (legacy) files must have `decision: "approved"` and `note_draft: null`. If all approved entries already have drafts, nothing will be composed and you'll get a warning.
- `RESEND_API_KEY` must be set in the environment for the email notification to send.

## After running

Check your email — it shows each draft note alongside the lead. Open the newly created `state/pending_approvals/YYYY-MM-DD-notes-ready.json` file. This file contains **only** approved leads with their drafted notes — no noise, no nulls. For each entry:
- Review the `note_draft`.
- Optionally overwrite it in `edited_note` if you want to tweak it.
- Set `note_decision` to `"approved"` or `"rejected"`.

Then run `/send-connections`.

## Rate limit handling

No LinkedIn CLI calls are made in this phase (it's draft-only). If the message-composer subagent fails, log and skip that lead — do not abort.

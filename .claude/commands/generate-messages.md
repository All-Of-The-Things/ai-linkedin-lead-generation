# /generate-messages

**Phase 2 of the LinkedIn pipeline.** Run this after you have reviewed `state/pending_approvals.json → connection_approvals` and set `decision` to `"approved"` or `"rejected"` for each lead.

## What this does

1. Reads `CLAUDE.md`, `config/pipeline.json`, and resolves the active criteria.
2. Executes pipeline **Step 6a** — Compose Connection Note Drafts:
   - For each `connection_approvals` entry where `decision: "approved"` and `note_draft` is null: invokes `agents/message-composer.md` to draft a personalized connection note.
   - Writes `note_draft` and `note_decision: null` back to the entry in `state/pending_approvals.json`.
3. Invokes `agents/email-notifier.md` with `phase: "notes_ready"` to send a notification email with all draft notes for review.
4. Updates `state/run_log.json`.

## Before running

- `state/pending_approvals.json → connection_approvals` must have at least one entry with `decision: "approved"` and `note_draft: null`. If all approved entries already have drafts, nothing will be composed and you'll get a warning.
- `RESEND_API_KEY` must be set in the environment for the email notification to send.

## After running

Check your email — it shows each draft note alongside the lead. Open `state/pending_approvals.json → connection_approvals` and for each entry:
- Review the `note_draft`.
- Optionally overwrite it in `edited_note` if you want to tweak it.
- Set `note_decision` to `"approved"` or `"rejected"`.

Then run `/send-connections`.

## Rate limit handling

No LinkedIn CLI calls are made in this phase (it's draft-only). If the message-composer subagent fails, log and skip that lead — do not abort.

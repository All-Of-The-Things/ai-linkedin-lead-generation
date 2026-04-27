# /send-connections

**Phase 3 of the LinkedIn pipeline.** Run this after you have reviewed the connection note drafts in `state/pending_approvals.json → connection_approvals` and set `note_decision` to `"approved"` or `"rejected"` for each.

## What this does

1. Reads `CLAUDE.md`, `.claude/skills/linkedin/SKILL.md`, `config/pipeline.json`, and resolves the active criteria.
2. Executes pipeline **Step 6b** — Send Connection Requests:
   - For each `connection_approvals` entry where `note_decision: "approved"` and the lead is still at `status: "classified"`: sends the LinkedIn connection request using `edited_note` (if set) or `note_draft`.
   - Updates lead status to `"request_sent"` on success.
3. Executes pipeline **Step 7** — Detect Accepted Connections:
   - Fetches the full connection list and checks which `request_sent` leads have accepted.
   - Sets `status: "connected"` and computes `followup_eligible_after`.
4. Executes pipeline **Step 8** — Surface Follow-Up Queue:
   - For `connected` leads whose `followup_eligible_after` has passed: invokes `agents/message-composer.md` to draft follow-up messages.
   - Appends drafts to `state/pending_approvals.json → followup_approvals`.
5. Invokes `agents/email-notifier.md` with `phase: "messages_ready"` (if follow-up drafts were generated) or `phase: "connections_sent"` (if no follow-ups ready yet).
6. Updates `state/run_log.json`.

## Before running

- `state/pending_approvals.json → connection_approvals` must have at least one entry with `note_decision: "approved"`. If all are still `null`, nothing will be sent and you'll get a warning.
- The LinkedIn CLI must be authenticated.
- `RESEND_API_KEY` must be set in the environment for the email notification to send.

## Safety checks

- `note_decision` must be `"approved"` AND `note_draft` (or `edited_note`) must be non-null. Both must pass — never send without a reviewed note.
- `require_approval_before_connect` in `pipeline.json` must be `true`. Refuse to send if false.

## After running

If follow-up drafts were generated: check your email, open `state/pending_approvals.json → followup_approvals`, review each `followup_draft`, optionally fill `edited_message` to override it, and set `decision` to `"approved"` or `"rejected"`. Then run `/deliver-messages`.

If no follow-ups are ready yet (connections not accepted): wait for connections to be accepted, then run `/send-connections` again — it will pick up newly accepted connections and draft follow-ups.

## Rate limit handling

Follows the same rules as the main pipeline: exit code 6 → wait and retry (up to `rate_limit.max_retries`); never abort the full phase on a single failure.

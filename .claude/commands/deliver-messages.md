# /deliver-messages

**Phase 3 of the LinkedIn pipeline.** Run this after you have reviewed `state/pending_approvals.json → followup_approvals` and filled in your `decision` fields (and optionally edited `edited_message`).

## What this does

1. Reads `CLAUDE.md`, resolves the active LinkedIn provider (`config/pipeline.json → linkedin_provider.active`) and loads its skill file
2. Reads `config/pipeline.json`
3. Executes pipeline **Step 9**:
   - Scans all `state/pending_approvals/*-followup.json` files for entries with `decision: "approved"`
   - Uses `edited_message` if filled in, otherwise uses `followup_draft`
   - Sends each approved message via `send_message`
   - Updates `leads.json`: status → `"followup_sent"`, increments `followup_sequence`, resets `followup_eligible_after` if another follow-up in the sequence is due
   - Respects `followup.max_followups_per_run` limit from `config/pipeline.json`
4. Invokes `agents/email-notifier.md` with `phase: "delivery_summary"` to send a confirmation email
5. Updates `state/run_log.json`

## Safety checks (both must pass before any message is sent)

- Lead must have `decision: "approved"` in some `state/pending_approvals/*-followup.json` file
- Lead must have `status: "followup_queued"` in `leads.json`
- `followup_sent_at` must be `null` (double-send guard)

## Before running

- Review all `state/pending_approvals/*-followup.json` files. For any entry, you can:
  - Set `decision: "approved"` to send as-is
  - Set `edited_message` to a custom message before approving
  - Set `decision: "rejected"` to skip
- `RESEND_API_KEY` must be set in the environment for the delivery confirmation email.

## After running

Check your email for the delivery summary. Leads with `status: "followup_sent"` and `followup_sequence < max_sequence` will surface again for a second follow-up after their next timing window elapses — you'll get an email when they're ready.

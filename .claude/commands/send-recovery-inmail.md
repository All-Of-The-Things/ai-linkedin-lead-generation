# /send-recovery-inmail

**Standalone phase.** Run this after you have reviewed `state/pending_approvals/<date>-inmail-ready.json` (written by `/recover-stale-invites`) and set `decision` to `"approved"` or `"rejected"` for each entry. Sends only the InMail messages you approved.

## What this does

1. Reads `CLAUDE.md`, resolves the active LinkedIn provider (`config/pipeline.json → linkedin_provider.active`) and loads its skill file, and reads `config/pipeline.json → invite_recovery`.
2. **Step 0 — Re-entry check:** same run_log resume/abandon pattern, `phase: "send-recovery-inmail"`.
3. **Step 1 — Re-check InMail credits:** call `get_inmail_credits`. If `0`, or fewer than the number of approved-and-unsent entries, hard-block the run with a clear error — the balance may have changed since drafting.
4. **Step 2 — Scan approvals:** load every `state/pending_approvals/*-inmail-ready.json` file. Find entries where `decision: "approved"`, the lead in `leads.json` is still at `status: "inmail_queued"`, and `inmail_sent_at` is null (double-send guard).
5. **Step 3 — Send:** for each (up to `invite_recovery.max_inmails_per_run`), paced 30–90s apart:
   - Use `edited_inmail_body` if non-null, otherwise `inmail_body_draft`. The message must be non-null — never send without a drafted or edited body.
   - connectsafely: call `send_inmail` (`sales-nav-send-message`) with `body` and `recipients: [<profileUrn>]`. Note this call has no subject parameter — the drafted/edited subject is not used on this provider.
   - linkedapi fallback: call `send_inmail` (`linkedin navigator message send <url> '<body>' --subject '<subject>'`), using `edited_inmail_subject` if non-null else `inmail_subject_draft`. Handle `async_timeout` (exit 8 / `workflowId`) via the standard polling pattern.
   - On success: `status → "inmail_sent"`, set `inmail_sent_at`, `approval_decision`, `approval_decided_at`.
   - On `rate_limited`: retry per `rate_limit.*`. If still failing: log, leave at `"inmail_queued"` for next run.
   - On other failure: log the error, leave at `"inmail_queued"`.
6. **Step 4 — Email notification:** invoke `agents/email-notifier.md` with `phase: "inmail_delivery_summary"`, `counts: { sent: N, failed: N }`, `leads_snapshot` of everything processed.
7. **Step 5 — Finalize:** set run `status: "completed"`, write counts to `run_log.json`.

## Safety checks (all must pass before any message is sent)

- Entry has `decision: "approved"` in some `*-inmail-ready.json` file.
- Lead has `status: "inmail_queued"` in `leads.json`.
- `inmail_sent_at` is `null` (double-send guard).
- `edited_inmail_body` or `inmail_body_draft` is non-null.
- `invite_recovery.require_approval_before_inmail` must be `true` in `pipeline.json`. Refuse to send if false.

## Before running

- Review `state/pending_approvals/*-inmail-ready.json`. For each entry you want sent: set `decision: "approved"` (optionally filling `edited_inmail_subject`/`edited_inmail_body` first). Set `decision: "rejected"` to skip.
- The active LinkedIn provider must be authenticated (`account_status`), and — for InMail specifically — must actually have InMail credits (`get_inmail_credits` is re-checked in Step 1; a 0 balance blocks the run rather than silently failing per-send).
- `RESEND_API_KEY` must be set for the delivery summary email.

## Rate limit handling

Standard pipeline rules: `rate_limited` → wait `rate_limit.retry_delay_seconds`, retry up to `rate_limit.max_retries`, then log and continue to the next entry — never abort the full run on one failure. Sends are additionally paced 30–90s apart.

## After running

Check your email for the delivery summary. Entries left at `status: "inmail_queued"` (rejected, or send failed) stay in `leads.json` — re-approve or fix and re-run `/send-recovery-inmail` to retry.

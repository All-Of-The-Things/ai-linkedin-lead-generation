# /recover-stale-invites

**Standalone phase.** Finds LinkedIn connection invites you sent that are still pending after a week, withdraws them automatically, and drafts an InMail second-touch for each recovered contact for your review. Pairs with `/send-recovery-inmail`, which sends only the InMail messages you approve.

## What this does

1. Reads `CLAUDE.md`, resolves the active LinkedIn provider (`config/pipeline.json → linkedin_provider.active`) and loads its skill file, and reads `config/pipeline.json → invite_recovery`.
2. **Step 0 — Re-entry check:** reads `state/run_log.json`; resumes an in-progress run with `phase: "recover-stale-invites"`, or creates a new entry. Never resumes a run of a different phase — same phase-matching rule as the core pipeline.
3. **Step 1 — Resolve the candidate source (CSV is the default; live API is the fallback):**
   - If `invite_recovery.csv_import_dir` (`state/imports/`) contains one or more `*.csv` files: read each one as a LinkedIn "Sent Invitations" export. Parse defensively — case-insensitive header matching for `From/Sender`, `To/Recipient`, `Sent At/Date`, `Message/Note`, `Direction`. If a `Direction`-like column exists, keep only rows matching `OUTGOING`; otherwise log the assumption and keep all rows.
   - If `state/imports/` has no CSV files: fall back to building the candidate list directly from the live provider — call `get_sent_invitations` (paginated) and treat every returned pending item as a candidate directly, using its own `profileId`/`invitationId`/sent timestamp/name. No CSV-matching step runs in this path.
   - Record which source was used on the run entry: `invite_source: "csv"` or `"live_api"`.
4. **Step 2 — Live cross-reference** (CSV path only): paginate `get_sent_invitations` (loop increasing offset, stop on an empty/shrinking page, hard cap ~50 pages) and match each CSV row to a live pending item:
   - Tier 1: exact normalized profile URL, if the CSV has one.
   - Tier 2 (expected default): name match + sent-date within `invite_recovery.match_date_tolerance_days` days.
   - Tier 3: unique name match with no other candidate.
   - **0 matches:** the invite already resolved outside this flow. If a `leads.json` lead exists at `status: "request_sent"`, call `connection_status` — if now connected, apply CLAUDE.md's Step 7 transition (`status → "connected"`, `connection_accepted_at`, recompute `followup_eligible_after`). Otherwise log and skip.
   - **2+ matches:** ambiguous — do not act. Log to `run_log.json → errors[]` with category `csv_match_ambiguous` and surface the count in the summary/email.
   - **Exactly 1 match, still pending, sent ≥ `invite_recovery.stale_after_days` days ago:** withdrawal candidate.
   - **Exactly 1 match, too recent:** skip this run — re-evaluated automatically once it crosses the threshold (the CSV row stays unresolved until then).
   - In the live-API-only path, staleness is computed directly from each item's own sent timestamp — there is nothing to match, so this step is skipped entirely.
5. **Step 3 — Auto-withdraw** (no per-contact approval — see Safety checks): for each withdrawal candidate, up to `invite_recovery.max_withdrawals_per_run`, call `withdraw_invitation` using the identifiers already resolved in Step 1/2. Pace 30–90s between calls, varied. On success:
   - Upsert the lead in `leads.json` (create the record if this contact never went through the pipeline; add the URL to `seen.json` if new — append-only, never re-propose).
   - Set `status: "withdrawn"`, `withdrawn_at: <now>`, `retry_eligible_after: <withdrawn_at + 14 days>`, `withdrawal_note` (e.g. `"auto-withdrawn via /recover-stale-invites; sent <date>, stale >= <n>d"`), `source: "csv_recovery"`.
   - Populate `connection_note` from the CSV `Message` column if present and the lead didn't already have one.
   - On failure: log the error, leave the candidate for next run.
6. **Step 4 — InMail credit gate + draft:** call `get_inmail_credits`.
   - If `0`, or fewer than the number of leads just moved to `status: "withdrawn"` with no draft yet: **hard-block** — log an unmissable warning that N contacts were withdrawn but will get no InMail (no InMail capability on this account), skip drafting entirely, and flag the blocker for Step 5's email.
   - Otherwise, for each `status: "withdrawn"` lead with `inmail_body_draft` still null: resolve `criteria_used` via the standard Criteria Selection rules (CSV-originated leads have no run-specific criteria of their own); invoke `agents/message-composer.md` with `message_type: "inmail"`, passing `original_connection_note` (from `connection_note`) and `withdrawn_at`; enforce the subject ≤ 80 char / body ≤ 1900 char caps; write `inmail_subject_draft`, `inmail_body_draft`, `status → "inmail_queued"`.
7. **Step 5 — Write the approval file:** collect every lead that just received an InMail draft (or, if Step 4 hit the credit gate, none) into `state/pending_approvals/<YYYY-MM-DD>-inmail-ready.json` (append `-2`, `-3` if today's file exists). Entry shape:
   ```json
   {
     "url": "...",
     "name": "...",
     "headline": "...",
     "current_title": "...",
     "current_company": "...",
     "original_connection_note": "...",
     "invite_sent_at": "...",
     "withdrawn_at": "...",
     "inmail_subject_draft": "...",
     "inmail_body_draft": "...",
     "edited_inmail_subject": null,
     "edited_inmail_body": null,
     "decision": null,
     "surfaced_at": "<now ISO>",
     "source_file": "<csv basename, or \"live_api\">"
   }
   ```
   Invoke `agents/email-notifier.md` with `phase: "inmail_ready"` (the blocked-credit variant fires automatically when Step 4's gate tripped).
8. **Step 6 — Housekeeping:** for the CSV path, move any CSV file whose every row is now resolved (withdrawn, already-connected, or logged as ambiguous) from `state/imports/` to `state/imports/processed/` — move, never delete. A CSV with unresolved rows (too-recent matches) stays in place for the next run. Finalize the run in `run_log.json`.

## Before running

- Optional: drop a LinkedIn "Sent Invitations" CSV export into `state/imports/`. If you skip this, the command pulls the pending-invitations list live from the active provider instead.
- The active LinkedIn provider must be authenticated (`account_status`).
- `RESEND_API_KEY` must be set for the email notification to send (a missing key does not abort the run).

## Safety checks

- **Withdrawal has no per-contact approval gate, by design** — the command asserts `invite_recovery.require_approval_before_withdraw === false` before running Step 3 and refuses with an error if it has been set to `true`, since no approval-gated withdrawal path exists yet.
- **InMail sending never happens in this command** — Step 4 only drafts. Sending is gated entirely behind `/send-recovery-inmail` and its own approval + config checks.
- Never withdraw a candidate without a live-confirmed `pending` status from Step 1/2 for this run — an ambiguous or unmatched CSV row is never acted on.

## Rate limit handling

Standard pipeline rules: `rate_limited` → wait `rate_limit.retry_delay_seconds`, retry up to `rate_limit.max_retries`, then log and continue to the next candidate — never abort the full run on one failure. Withdrawal calls are additionally paced 30–90s apart (the ConnectSafely MCP server's own human-pacing guidance for write actions).

## After running

Check your email (or open the newly written `state/pending_approvals/<date>-inmail-ready.json` directly). For each entry:
- Review `inmail_subject_draft` / `inmail_body_draft`.
- Optionally fill `edited_inmail_subject` / `edited_inmail_body` to override.
- Set `decision` to `"approved"` or `"rejected"`.

Then run `/send-recovery-inmail` to send the approved ones. If the email flagged a credit-blocker instead, no draft file needs review — the withdrawn contacts are saved in `leads.json` for manual outreach.

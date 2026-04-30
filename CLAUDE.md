# LinkedIn Lead Generation Pipeline

## Purpose

This repo is a four-phase LinkedIn lead generation pipeline for AOTT. Each phase is gated by human approval and triggers an email notification via Resend when it completes.

The LinkedIn skill lives at `.claude/skills/linkedin/SKILL.md`. Read it before running any `linkedin` CLI command.
The Resend skill lives at `.agents/skills/resend/SKILL.md`. Read it before sending any email.

---

## Four-Phase Flow

```
[Phase 1 — Search]     /search-connections  (manual slash command)
                        routines/daily-search.md  (scheduled, weekdays 9am)
    Steps 0–5: re-entry check → criteria refresh → search → enrich → classify → surface approvals
    → Email: "N leads ready for your review"
    → Human: edits pending_approvals.json connection_approvals, sets decision fields

[Phase 2 — Draft]      /generate-messages  (manual slash command)
    Step 6a: compose connection note drafts for approved leads
    → Email: "N connection notes ready for your review"
    → Human: reviews note_draft, optionally fills edited_note, sets note_decision fields

[Phase 3 — Send]       /send-connections  (manual slash command)
    Steps 6b–8: send approved notes → detect accepted connections → draft follow-up messages
    → Email: "N follow-up drafts ready" (if eligible) or "N connection requests sent"
    → Human: reviews followup_draft, sets decision fields in followup_approvals

[Phase 4 — Deliver]    /deliver-messages  (manual slash command)
    Step 9: send approved follow-up messages via LinkedIn
    → Email: delivery summary
```

---

## Directory Layout

| Path | Purpose |
|------|---------|
| `config/pipeline.json` | Operator config: limits, timing, active criteria pointer, notification settings |
| `config/criteria/` | Named criteria files; each is a self-contained search profile |
| `state/leads.json` | Master lead ledger, keyed by normalized LinkedIn URL |
| `state/seen.json` | Dedupe index — append-only, never remove a URL |
| `state/pending_approvals.json` | Human interface: user fills `decision` fields here |
| `state/run_log.json` | Audit log of every pipeline run |
| `templates/` | Message style guides used by `agents/message-composer.md` |
| `agents/` | Subagent prompt files for focused subtasks |
| `routines/daily-search.md` | Phase 1 scheduled routine (weekdays 9am) |
| `.claude/commands/search-connections.md` | Phase 1 slash command (`/search-connections`) |
| `.claude/commands/generate-messages.md` | Phase 2 slash command (`/generate-messages`) |
| `.claude/commands/send-connections.md` | Phase 3 slash command (`/send-connections`) |
| `.claude/commands/deliver-messages.md` | Phase 4 slash command (`/deliver-messages`) |

---

## Criteria Selection

Each run uses exactly one criteria file from `config/criteria/`. The file to use is resolved in this priority order:

1. **Explicit override in the run request** — if the user's instruction contains a criteria name, label, or descriptive keyword, use the matching file. Examples:
   - "run with agency-partners criteria" → `config/criteria/agency-partners.json`
   - "use the retail criteria" → `config/criteria/retail-brands.json`
   - "run the agency one" → `config/criteria/agency-partners.json`
   - "run with mvp-factory criteria" → `config/criteria/mvp-factory.json`
   - "use the MVP Factory one" → `config/criteria/mvp-factory.json`
   - Match is case-insensitive. Check `name`, `label`, and keywords in `description` across all files in `config/criteria/`.
   - If the phrase matches 2+ criteria files, stop and ask for clarification before proceeding.
2. **`pipeline.json → active_criteria`** — the persistent default (e.g. `"agency-partners"`). Load `config/criteria/<active_criteria>.json`.
3. **Hardcoded fallback** — if `active_criteria` is missing or the file doesn't exist, use `agency-partners`.

**Before Step 2, record the resolved criteria name** in the current run_log entry as `criteria_used: "<name>"`. Every run is auditable.

### Adding a new criteria

1. Create `config/criteria/<name>.json` following the schema in any existing criteria file (must include `name`, `label`, `description` at the top).
2. No other changes needed — the pipeline discovers it automatically by scanning `config/criteria/`.
3. To make it the default, set `pipeline.json → active_criteria` to the new `name`.

---

## Pipeline Steps

Execute steps 0–9 in order every run. Each step is idempotent — if it already ran this run (check `run_log.json`), skip it.

### Step 0 — Re-entry Check

1. Read `state/run_log.json`.
2. If the most recent run has `status: "in_progress"`, resume from its `resume_from_step` field. Skip all lower-numbered steps.
3. Otherwise, create a new run entry: `{ run_id: "<ISO-date>-<uuid4-short>", started_at: "<now>", status: "in_progress", resume_from_step: 1, steps_completed: [], counts: {} }`.
4. Write the new entry back to `run_log.json` before proceeding.

### Step 1 — Criteria Refresh (conditional)

Resolve the active criteria file using the **Criteria Selection** rules above. Store the resolved name in the run_log as `criteria_used`.

**Skip refresh if** `config/criteria/<criteria_used>.json` exists AND the run count mod `criteria_refresh.auto_refresh_every_n_runs` is not 0.

**If running:**
- Invoke `agents/criteria-extractor.md` as a subagent, passing the resolved criteria name.
- That agent fetches connections, analyzes patterns, and writes to `config/criteria/<criteria_used>.json`.
- On exit code 6 (rate limit): log, skip this step, continue with the existing criteria file. If no file exists and rate limited, abort run and log.

Mark step complete in run_log before moving on.

### Step 2 — Search for New Leads

**Before building queries — build the exclusion set:** Run `linkedin connection list --limit 3000 --json -q` **three times in a row** and union all returned URLs into a single in-memory exclusion set. The API returns a non-deterministic subset of connections on each call; running three calls substantially increases coverage. A search result is skipped if its URL appears in `state/seen.json` OR in this exclusion set. Do NOT write existing connections into `seen.json` — the exclusion set is in-memory per run only.

1. Load `config/criteria/<criteria_used>.json` (resolved in Step 1) and `config/pipeline.json`.
2. Build up to `search.max_search_queries_per_run` queries by rotating through combinations of `target_roles`, `target_industries`, and `target_locations`. Track the rotation cursor in the current run_log entry (`search_cursor`).
3. For each query, run:
   ```
   linkedin person search --position "<role>" --industries "<industry>" --locations "<location>" --limit <max_results_per_run> --json -q
   ```
4. For each returned person URL:
   - Normalize: lowercase, strip trailing slash, use the canonical `/in/` form.
   - Check `state/seen.json` AND the in-memory exclusion set. If present in either, skip.
   - Add to `seen.json` immediately (write-through).
   - Add a stub record to `leads.json` with `status: "new"`, `first_seen_run: <today>`.
5. On exit code 6: wait `rate_limit.retry_delay_seconds`, retry up to `rate_limit.max_retries`. If still failing, log, skip that query, continue to next.

Mark step complete in run_log.

### Step 3 — Profile Enrichment

For each lead in `leads.json` with `status: "new"`:
```
linkedin person fetch <url> --experience --json -q
```
Populate: `name`, `headline`, `location`, `industry`, `current_title`, `current_company`, `linkedin_raw`.

On exit code 6: leave lead at `"new"` (retry next run — this step is re-entrant). Continue to next lead.
On other errors: append to lead's `errors` array, leave at `"new"`.

Mark step complete in run_log.

### Step 4 — Classification

1. Collect all leads with `status: "new"` that have a non-null `name` (i.e., enrichment succeeded).
2. Invoke `agents/lead-classifier.md` as a subagent, passing the batch of leads and the contents of `config/criteria/<criteria_used>.json`.
3. Receive back a JSON array: `[{ url, score, classification, score_rationale }]`.
4. For each result, update the lead in `leads.json`: set `score`, `classification`, `score_rationale`, `status: "classified"`, `last_updated`.

Mark step complete in run_log.

### Step 5 — Surface Connection Approvals

1. Read all leads with `status: "classified"` that do NOT already have an entry in `state/pending_approvals.json → connection_approvals`.
2. For each, build an approval entry:
   ```json
   {
     "url": "...",
     "name": "...",
     "headline": "...",
     "current_title": "...",
     "current_company": "...",
     "classification": "hot|warm|cold",
     "score": 88,
     "score_rationale": "...",
     "surfaced_at": "<now ISO>",
     "decision": null,
     "note": null
   }
   ```
3. Append all entries to `pending_approvals.json → connection_approvals`.
4. Set `approval_surfaced_at` on each lead in `leads.json`.

**All classifications (hot, warm, cold) are surfaced.** The user decides everything.

5. **Send email notification** — invoke `agents/email-notifier.md` as a subagent with:
   - `phase: "search_complete"`
   - `run_id`: current run ID from `run_log.json`
   - `criteria_used`: resolved criteria name
   - `counts`: `{ total_new: N, hot: N, warm: N, cold: N }`
   - `leads_snapshot`: all entries just appended to `connection_approvals`

Mark step complete in run_log. **Phase 1 ends here.** Do not proceed to Step 6a — that is Phase 2 (`/generate-messages`).

### Step 6a — Compose Connection Note Drafts

Runs in **`/generate-messages`** (Phase 2).

1. Read `state/pending_approvals.json → connection_approvals`.
2. Find entries where `decision: "approved"` and `note_draft` is null.
3. Auto-reject entries older than `approval.approval_timeout_days` days with `decision: null` (set `note_decision: "rejected"` on these).
4. For each eligible lead:
   - Invoke `agents/message-composer.md` as a subagent with the lead record, `message_type: "connection_note"`, and `criteria_used`. Receive back the drafted note string.
   - Write `note_draft: "<drafted note>"` and `note_decision: null` back to that entry in `pending_approvals.json`.
5. For each **rejected** lead (decision: "rejected"): `status → "rejected"`, set `approval_decided_at`, `approval_decision`.
6. **Send email notification** — invoke `agents/email-notifier.md` as a subagent with:
   - `phase: "notes_ready"`
   - `run_id`: current run ID
   - `criteria_used`: resolved criteria name
   - `counts`: `{ notes_drafted: N }`
   - `leads_snapshot`: all entries that had `note_draft` just written (include `name`, `headline`, `current_title`, `current_company`, `classification`, `note_draft`)

Mark step complete in run_log. **Phase 2 ends here.** Do not proceed to Step 6b — that is Phase 3 (`/send-connections`).

### Step 6b — Send Connection Requests

Runs in **`/send-connections`** (Phase 3).

1. Read `state/pending_approvals.json → connection_approvals`.
2. Find entries where `note_decision: "approved"` and the lead in `leads.json` still has `status: "classified"`.
3. For each (up to `outreach.max_connection_requests_per_run` per run):
   - Use `edited_note` if non-null, otherwise use `note_draft`. The message must be non-null — do not send without a note.
   - Run: `linkedin connection send <url> --note '<note>' --json -q`
   - On success: `status → "request_sent"`, set `connection_requested_at`, set `connection_note`.
   - On exit code 6: retry per rate_limit config. If still failing: log error, leave at `"classified"` for next run.
   - On other failure: `status → "request_failed"`, log error.
4. For entries with `note_decision: "rejected"`: `status → "rejected"`, set `approval_decided_at`, `approval_decision`.
5. Update `approval_decided_at` and `approval_decision` on all processed leads.

**Safety checks:**
- `note_decision` must be `"approved"` AND `note_draft` (or `edited_note`) must be non-null. Both must pass.
- `require_approval_before_connect` must be `true` in `pipeline.json`. If it is `false`, log a warning and refuse to send.

Mark step complete in run_log.

### Step 7 — Detect Accepted Connections

1. Get the timestamp of the previous run's `completed_at` from `run_log.json`.
2. Run `linkedin connection list --limit 3000 --json -q` **three times** and union all returned URLs to maximize coverage before matching against `request_sent` leads.
3. Normalize all returned URLs.
4. For each lead in `leads.json` with `status: "request_sent"`: check if their URL appears in the connection list.
5. If found:
   - `status → "connected"`, set `connection_accepted_at: <now>`.
   - Compute `followup_eligible_after`: now + random integer in [`followup.delay_days_min`, `followup.delay_days_max`] days.
   - Set `followup_sequence: 0`.

Mark step complete in run_log.

### Step 8 — Surface Follow-Up Queue

1. Find leads in `leads.json` with `status: "connected"` where:
   - `followup_eligible_after <= now`
   - `followup_sequence < followup.max_sequence`
   - No existing pending `followup_approvals` entry for this URL with `decision: null`
2. For each eligible lead:
   - Invoke `agents/message-composer.md` as a subagent with the lead record, `message_type: "followup"`, `followup_sequence`, and `criteria_used`. The composer selects the correct template internally.
   - Receive back the drafted message string.
3. Set `followup_draft` and `status → "followup_queued"` on the lead.
4. Append to `pending_approvals.json → followup_approvals`:
   ```json
   {
     "url": "...",
     "name": "...",
     "followup_sequence": 0,
     "followup_draft": "...",
     "connection_accepted_at": "...",
     "surfaced_at": "<now>",
     "decision": null,
     "edited_message": null
   }
   ```
5. **Send email notification** — invoke `agents/email-notifier.md` as a subagent with:
   - `phase: "messages_ready"`
   - `run_id`: current run ID
   - `counts`: `{ followups_drafted: N }`
   - `leads_snapshot`: all entries just appended to `followup_approvals`

Mark step complete in run_log. **Phase 3 ends here.** Do not proceed to Step 9 — that is Phase 4 (`/deliver-messages`).

### Step 9 — Send Approved Follow-Ups

1. Read `pending_approvals.json → followup_approvals`.
2. Find entries with `decision: "approved"` where the lead's `status` is still `"followup_queued"`.
3. For each (up to `followup.max_followups_per_run` per run):
   - Use `edited_message` if non-null, otherwise use `followup_draft`.
   - Run: `linkedin message send <url> '<message>' --json -q`
   - On success: `status → "followup_sent"`, set `followup_sent_at`, set `followup_approved_at`.
   - Increment `followup_sequence` on the lead.
   - If `followup_sequence < followup.max_sequence`: `status → "connected"`, recompute `followup_eligible_after` for the next follow-up window.
   - If `followup_sequence >= followup.max_sequence`: leave at `"followup_sent"` (sequence complete).
   - On exit code 6: retry per config. If still failing: log, leave at `"followup_queued"` for next run.
   - On other failure: `status → "followup_failed"`, log error.

**Safety check**: `require_approval_before_send` must be `true`. Refuse to send if false.
**Double-send guard**: Before sending, verify `followup_sent_at` is null on the lead record.

4. **Send email notification** — invoke `agents/email-notifier.md` as a subagent with:
   - `phase: "delivery_summary"`
   - `run_id`: current run ID
   - `counts`: `{ sent: N, failed: N }`
   - `leads_snapshot`: all leads processed in this step (both sent and failed)

Mark step complete in run_log. **Phase 4 ends here.**

### Step 10 — Finalize Run

1. Set run entry `status: "completed"`, `completed_at: <now>`.
2. Write a `counts` summary: `{ new_leads, classified, surfaced_for_approval, connections_sent, connections_detected, followups_sent, errors }`.
3. Print a one-paragraph summary of the run for the agent log.

---

## Rate Limit Handling

On exit code 6 from any `linkedin` command:
1. Wait `rate_limit.retry_delay_seconds` seconds.
2. Retry up to `rate_limit.max_retries` times.
3. If still exit code 6 after all retries: **log the failure** (step name, URL if applicable, timestamp) to the current run entry's `errors` array in `run_log.json`. Skip the current operation and continue the pipeline.
4. **Never abort the entire run** due to a single rate limit failure.

Other exit codes:
- `2` (auth): Stop immediately. Log. Tell the user to run `linkedin setup`.
- `3` (subscription): Log and skip the failing command.
- `8` (timeout): Check for a `workflowId` in the response, then poll `linkedin workflow status <id> --wait --json -q`.
- JSON parse failure on output: log raw output to run_log errors, skip that lead.

---

## Approval Contract

**Never send a connection request unless:**
1. `state/pending_approvals.json → connection_approvals` has an entry for that URL with `decision: "approved"`.
2. That same entry has `note_decision: "approved"` AND `note_draft` (or `edited_note`) is non-null.
3. `leads.json` shows the lead at `status: "classified"`.

All three checks are independent. All must pass.

**Never send a follow-up message unless:**
1. `state/pending_approvals.json → followup_approvals` has an entry for that URL with `decision: "approved"`.
2. `leads.json` shows the lead at `status: "followup_queued"`.

Both checks must pass.

---

## State File Contracts

- **`seen.json`**: append-only. Never remove a URL once written. A URL added here means "this person has been discovered and will never be re-proposed."
- **`leads.json`**: keyed by normalized URL. Each pipeline step only writes to its own fields. Do not overwrite fields owned by other steps.
- **`pending_approvals.json`**: entries are never deleted — only `decision` fields are filled in. The file grows over time. Entries older than `approval_timeout_days` with null decisions are treated as auto-rejected by Step 6 but remain in the file.
- **`run_log.json`**: append-only to the `runs` array. Each run gets its own entry.

---

## Crash Safety and Re-entry

On every startup (Step 0):
1. Read `run_log.json`.
2. If the latest run has `status: "in_progress"`, that run crashed or was interrupted.
3. Resume from `resume_from_step`. Steps below that number are already complete — skip them.
4. Steps that partially completed (e.g., Step 3 enriched 10 of 20 leads before crashing) are safe to re-run because: enriched leads have non-null `name`; `seen.json` already has all discovered URLs; state is written per-lead, not in bulk.

Update `resume_from_step` in the run log at the start of each step so a future crash knows where to resume.

---

## Templates

Templates live in `templates/` and are selected by `agents/message-composer.md` based on `criteria_used` and `message_type`. The composer reads the style guide and examples in each template and writes personalized messages from scratch — it does not do literal token substitution.

| Template file | Used for |
|--------------|---------|
| `connection_note_agency.md` | Connection note, agency-partners criteria |
| `connection_note_retail.md` | Connection note, retail-brands criteria |
| `connection_note_mvp.md` | Connection note, mvp-factory criteria |
| `followup_1_agency.md` | First follow-up, agency-partners criteria |
| `followup_1_retail.md` | First follow-up, retail-brands criteria |
| `followup_2_resource.md` | Second follow-up, both criteria |

Common tokens the composer uses as placeholders: `{{first_name}}`, `{{current_title}}`, `{{current_company}}`. All other personalization is derived from the lead's `headline` and `linkedin_raw` profile data.

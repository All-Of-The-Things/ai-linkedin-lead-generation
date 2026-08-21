# LinkedIn Lead Generation Pipeline

## Purpose

This repo is a four-phase LinkedIn lead generation pipeline for AOTT. Each phase is gated by human approval and triggers an email notification via Resend when it completes.

LinkedIn automation goes through a **provider abstraction** — see **LinkedIn Provider** below. The default provider is ConnectSafely (`.claude/skills/connectsafely/SKILL.md`); LinkedAPI (`.claude/skills/linkedin/SKILL.md`) is the manual fallback. Read the resolved provider's skill file before performing any LinkedIn operation.
The Resend skill lives at `.agents/skills/resend/SKILL.md`. Read it before sending any email.

---

## Four-Phase Flow

```
[Phase 1 — Search]     /search-connections  (manual slash command)
                        /search-connections-abbreviated  (manual, minimal-footprint variant — see Abbreviated Mode)
                        routines/daily-search.md  (scheduled, weekdays 9am)
    Steps 0–5: re-entry check → criteria refresh → search → enrich → classify → surface approvals
    → Email: "N leads ready for your review"
    → Human: edits the latest `state/pending_approvals/*-connection.json`, sets decision fields
      (abbreviated: moves URLs into the `approved` array of the run's `-links.json` file; no email)

[Phase 2 — Draft]      /generate-messages  (manual slash command)
    Step 6a: compose connection note drafts for approved leads
    → Email: "N connection notes ready for your review"
    → Human: reviews note_draft, optionally fills edited_note, sets note_decision fields

[Phase 3 — Send]       /send-connections  (manual slash command)
    Steps 6b–8: send approved notes → detect accepted connections → draft follow-up messages
    → Email: "N follow-up drafts ready" (if eligible) or "N connection requests sent"
    → Human: reviews followup_draft, sets decision fields in the latest `state/pending_approvals/*-followup.json`

[Phase 4 — Deliver]    /deliver-messages  (manual slash command)
    Step 9: send approved follow-up messages via LinkedIn
    → Email: delivery summary

[Maintenance]          /pipeline-maintenance  (manual only — never scheduled, never auto-run)
    Archives decided approval files, terminal leads, old run_log entries; migrates raw payloads to state/raw/
```

---

## Directory Layout

| Path | Purpose |
|------|---------|
| `config/pipeline.json` | Operator config: limits, timing, active criteria pointer, active LinkedIn provider, notification settings |
| `config/criteria/` | Named criteria files; each is a self-contained search profile |
| `state/leads.json` | Master lead ledger, keyed by normalized LinkedIn URL |
| `state/seen.json` | Dedupe index — append-only, never remove a URL |
| `state/pending_approvals/` | Human interface: classification-split files per run (`YYYY-MM-DD-<run_id>-hot.json`, `-warm.json`, `-cold.json`), links files from abbreviated runs (`YYYY-MM-DD-<run_id>-links.json`, holding only `hot`/`warm`/`cold`), the consolidated `approved-queue.json` and `cold-registry.json` (single persistent files, not one per run — see State File Contracts), notes-ready file after Phase 2 (`YYYY-MM-DD-notes-ready.json`), followup files (`YYYY-MM-DD-followup.json`), InMail-ready files from Invite Recovery (`YYYY-MM-DD-inmail-ready.json`) |
| `state/raw/` | Raw `fetch_profile` payloads, one `<slug>.json` per lead — gitignored, re-derivable |
| `state/imports/` | CSV drop zone for Invite Recovery (`/recover-stale-invites`) — gitignored, optional (falls back to a live API call when empty); `state/imports/processed/` holds fully-resolved CSVs |
| `state/archive/` | Maintenance output: `leads-archive.json`, `run_log-archive.json` — written only by `/pipeline-maintenance` |
| `state/run_log.json` | Audit log of every pipeline run |
| `templates/` | Message style guides used by `agents/message-composer.md` |
| `agents/` | Subagent prompt files for focused subtasks |
| `routines/daily-search.md` | Phase 1 scheduled routine (weekdays 9am) |
| `.claude/commands/search-connections.md` | Phase 1 slash command (`/search-connections`) |
| `.claude/commands/generate-messages.md` | Phase 2 slash command (`/generate-messages`) |
| `.claude/commands/send-connections.md` | Phase 3 slash command (`/send-connections`) |
| `.claude/commands/deliver-messages.md` | Phase 4 slash command (`/deliver-messages`) |
| `.claude/commands/search-connections-abbreviated.md` | Phase 1 minimal-footprint variant (`/search-connections-abbreviated`) |
| `.claude/commands/pipeline-maintenance.md` | Manual state housekeeping (`/pipeline-maintenance`) |
| `.claude/commands/recover-stale-invites.md` | Invite Recovery, standalone phase — withdraw + draft (`/recover-stale-invites`) |
| `.claude/commands/send-recovery-inmail.md` | Invite Recovery, standalone phase — send approved InMail (`/send-recovery-inmail`) |

---

## LinkedIn Provider

Every pipeline step that talks to LinkedIn calls one of the **abstract operations** below rather than a hardcoded command. The active provider resolves each run and decides which concrete skill/call handles each operation.

**Resolution** (mirrors Criteria Selection):
1. `config/pipeline.json → linkedin_provider.active` — `"connectsafely"` or `"linkedapi"`.
2. **Hardcoded fallback** — if missing or invalid, use `"connectsafely"`.

Record the resolved provider in the current run_log entry as `provider_used: "<name>"` (same run, same field style as `criteria_used`), set in Step 0/1.

### Operations table

| Operation | connectsafely (default) | linkedapi (fallback) |
|---|---|---|
| `search_people` | ConnectSafely People Search — see `.claude/skills/connectsafely/SKILL.md` | `linkedin person search --position ... --industries ... --locations ... --limit ... --json -q` |
| `list_connections` | ConnectSafely `GET /linkedin/connections` | `linkedin connection list --limit 3000 --json -q` |
| `fetch_profile` | ConnectSafely `POST /linkedin/profile` | `linkedin person fetch <url> --experience --json -q` |
| `connection_status` | ConnectSafely `GET /linkedin/relationship/<profileId>` | `linkedin connection status <url> --json -q` |
| `get_messages` | ConnectSafely `GET /linkedin/messaging/conversation-details` | `linkedin message get <url> --json -q` |
| `send_connection_request` | ConnectSafely `POST /linkedin/connect` (300-char note cap) | `linkedin connection send <url> --note '<note>' --json -q` |
| `send_message` | ConnectSafely `POST /linkedin/messaging/send` | `linkedin message send <url> '<message>' --json -q` |
| `react_to_post` | ConnectSafely `POST /linkedin/posts/react` | `linkedin post react <url> --type <reaction> --json -q` |
| `comment_on_post` | ConnectSafely `POST /linkedin/posts/comment` | `linkedin post comment <url> '<text>' --json -q` |
| `account_status` | MCP server connected + authenticated (check `ToolSearch`/`claude mcp list`) | `linkedin account list` |
| `get_sent_invitations` | ConnectSafely `get-sent-invitations` (paginated via `startIndex`) | `linkedin connection pending --json -q` *(closest analog — shape/date coverage not confirmed equivalent; verify before relying on it)* |
| `withdraw_invitation` | ConnectSafely `withdraw-invitation` (`profileId` required; `invitationId`/`profileUrn`/`firstName`/`lastName` auto-fetched if omitted) | `linkedin connection withdraw <url> [--no-unfollow] --json -q` |
| `get_inmail_credits` | ConnectSafely `get-inmail-credits` — non-premium accounts return `0` | *(no equivalent found in `.claude/skills/linkedin/SKILL.md` — treat the absence itself as a blocker signal on this fallback)* |
| `send_inmail` | ConnectSafely `sales-nav-send-message` (`body`, `recipients` as profile URNs — **no `subject` parameter**; requires Sales Navigator/Business Premium/Recruiter credits) | `linkedin navigator message send <url> '<text>' --subject '<subject>' --json -q` (requires Sales Navigator subscription; async — see `async_timeout`) |

Each operation's exact request/response shape and field-normalization rules (so `leads.json` stays provider-agnostic — `name`, `headline`, `location`, `industry`, `current_title`, `current_company` keyed by normalized URL) live in the resolved provider's skill file.

**InMail subject gap:** ConnectSafely's `sales-nav-send-message` has no subject-line parameter, unlike LinkedAPI's `--subject` flag. `agents/message-composer.md` still drafts a subject for `message_type: "inmail"` (used by the linkedapi fallback and shown for review), but it is silently unused when sending via ConnectSafely — the InMail lands as a subject-less message. This is an open gap, not a bug to fix here.

### Normalized error categories

Pipeline steps and the Rate Limit Handling section below reason about these categories, not raw provider signals:

| Category | connectsafely signal | linkedapi signal |
|---|---|---|
| `auth_error` | HTTP 401 | exit code 2 |
| `rate_limited` | HTTP 429 (+ `X-RateLimit-*` headers) | exit code 6 |
| `invalid_args` | HTTP 400 | exit code 5 |
| `network_error` | request timeout / connection failure | exit code 7 |
| `subscription_required` | *(no equivalent — linkedapi-only)* | exit code 3 |
| `async_timeout` | *(no equivalent — linkedapi-only; ConnectSafely calls are synchronous)* | exit code 8 (`workflowId` → poll `linkedin workflow status <id> --wait --json -q`) |

No new category is needed for InMail: on linkedapi, "no Sales Navigator" maps to the existing `subscription_required` (exit 3). On connectsafely, `get_inmail_credits` returning `0` is a **soft** blocker — the call itself succeeds — so Invite Recovery checks it explicitly (see below) rather than treating it as an error category.

### Switching providers

Set `config/pipeline.json → linkedin_provider.active` to `"linkedapi"` to fall back (e.g. if ConnectSafely's MCP server or account is unavailable), or back to `"connectsafely"` to return to the default. No other file needs to change — every step already calls the abstract operation and looks up the concrete provider here.

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

   **Phase matching:** every run entry records its `phase` (e.g. `"search-connections"`, `"search-connections-abbreviated"`). Only resume an in-progress run whose `phase` matches the command now executing. If the most recent run is `in_progress` under a different phase, stop and ask the user: finish it with its own command, or mark it `status: "abandoned"` and start fresh. Never continue a standard search run in abbreviated mode (or vice versa) — they write different Step 5 artifacts.
3. Otherwise, create a new run entry: `{ run_id: "<ISO-date>-<uuid4-short>", started_at: "<now>", status: "in_progress", phase: "<command name>", resume_from_step: 1, steps_completed: [], counts: {} }`.
4. Write the new entry back to `run_log.json` before proceeding.

### Step 1 — Criteria Refresh (conditional)

Resolve the active criteria file using the **Criteria Selection** rules above. Store the resolved name in the run_log as `criteria_used`.

**Skip refresh if** `config/criteria/<criteria_used>.json` exists AND the run count mod `criteria_refresh.auto_refresh_every_n_runs` is not 0.

**If running:**
- Invoke `agents/criteria-extractor.md` as a subagent, passing the resolved criteria name.
- That agent fetches connections, analyzes patterns, and writes to `config/criteria/<criteria_used>.json`.
- On `rate_limited`: log, skip this step, continue with the existing criteria file. If no file exists and rate limited, abort run and log.

Mark step complete in run_log before moving on.

### Step 2 — Search for New Leads

**Before building queries — build the exclusion set:**

1. Check `state/connections_cache.json` (`connections_cache.file` in `pipeline.json`).
   - If the file exists and `cached_at` is within the last `connections_cache.ttl_days` days (default 7): load `urls` from the cache as the exclusion set. No API calls needed.
   - If the file is missing or expired: call `list_connections` **three times in a row**, union all returned URLs (normalize: lowercase, strip trailing slash), write to `state/connections_cache.json` as `{ "cached_at": "<now ISO>", "connection_count": N, "urls": [...sorted...] }`, then use that as the exclusion set.
2. A search result is skipped if its URL appears in `state/seen.json` OR in this exclusion set. Do NOT write existing connections into `seen.json` — the exclusion set is used in-memory per run only.

1. Load `config/criteria/<criteria_used>.json` (resolved in Step 1) and `config/pipeline.json`.
2. Build up to `search.max_search_queries_per_run` queries by rotating through combinations of `target_roles`, `target_industries`, and `target_locations`. Track the rotation cursor in the current run_log entry (`search_cursor`).
3. For each query, call `search_people` with role/industry/location filters and `--limit`/`count` set to `max_results_per_run`. See the resolved provider's skill file for the exact request shape — the connectsafely provider may need to fold a free-text location into `keywords` rather than a strict filter (see `.claude/skills/connectsafely/SKILL.md`).
4. For each returned person URL:
   - Normalize: lowercase, strip trailing slash, use the canonical `/in/` form.
   - Check `state/seen.json` AND the in-memory exclusion set. If present in either, skip.
   - **Connection status check:** Skipped here for performance (N candidates × ~30s is too slow). False positives are caught in Step 5 for hot/warm leads and at the send step for any that slip through.
   - Add to `seen.json` immediately (write-through).
   - Add a stub record to `leads.json` with `status: "new"`, `first_seen_run: <today>`. **Also write any fields returned by the search API** — at minimum `name`, `headline`, `location` — into the stub. These are available from search results without a separate fetch and are critical when enrichment is disabled.
5. On `rate_limited`: wait `rate_limit.retry_delay_seconds`, retry up to `rate_limit.max_retries`. If still failing, log, skip that query, continue to next.

**Minimum hot-lead floor (batch retry loop):** After Step 4 classifies a batch, check the running count of `hot` leads surfaced so far this run against `search.min_hot_leads_per_run`. If still below the floor, run another batch: rotate to the next `search.max_search_queries_per_run` queries (advancing `search_cursor` as normal, or deviating deliberately toward higher-performing role/location combinations if recent runs flagged a specific rotation segment as thin) and repeat Steps 2 and 4 for that batch against the same exclusion set. Continue batching until either the hot floor is met, or `search.max_search_batches_per_run` batches have run this run — whichever comes first. If the floor still isn't met after the batch cap, stop and log the shortfall honestly (e.g. `"hot_floor_shortfall": "3/5 hot after 4 batches"`) rather than looping indefinitely chasing a floor the current population can't support.

Mark step complete in run_log.

### Step 3 — Profile Enrichment (conditional)

1. Read `pipeline.json → enrichment.enabled`.
2. **If `false` (default):** Log "enrichment disabled by pipeline config". Mark step complete in run_log. Proceed to Step 4 immediately — no `fetch_profile` calls are made.
3. **If `true`:** For each lead in `leads.json` with `status: "new"`, call `fetch_profile` (with experience included).
   Populate: `name`, `headline`, `location`, `industry`, `current_title`, `current_company`. Write the raw fetch payload to `state/raw/<slug>.json` (slug = the URL's lowercased `/in/` handle, e.g. `.../in/irmarios` → `irmarios.json`). `leads.json` never stores `linkedin_raw`.

   On `rate_limited`: leave lead at `"new"` (retry next run — this step is re-entrant). Continue to next lead.
   On other errors: append to lead's `errors` array, leave at `"new"`.

Mark step complete in run_log.

### Step 4 — Classification

1. Read `pipeline.json → enrichment.enabled` and pass it to the classifier as `enrichment_enabled`.
2. Collect all leads with `status: "new"` that have a non-null `name`. When enrichment is disabled, `name` comes from the search stub (Step 2). When enrichment is enabled, `name` confirms the enrichment succeeded.
3. Invoke `agents/lead-classifier.md` as a subagent, passing the batch of leads, the contents of `config/criteria/<criteria_used>.json`, and `enrichment_enabled`.
4. Receive back a JSON array: `[{ url, score, classification, score_rationale }]`.
5. For each result, update the lead in `leads.json`: set `score`, `classification`, `score_rationale`, `status: "classified"`, `last_updated`.

Mark step complete in run_log.

### Step 5 — Surface Connection Approvals

**Approval file naming:** Each run writes classification-split files using the pattern `state/pending_approvals/<YYYY-MM-DD>-<run_id>-<classification>.json`, where `<YYYY-MM-DD>` is derived from the run's `started_at` and `<run_id>` is the short run ID (last 8 chars of the UUID portion, e.g. `c4d82e1a`). Example: `2026-05-07-c4d82e1a-hot.json`.

**Legacy compatibility:** When scanning in later steps, glob both new-style (`*-hot.json`, `*-warm.json`, `*-cold.json`) and legacy (`*-connection.json`) files.

1. Build the set of URLs already surfaced across ALL existing approval files in `state/pending_approvals/` (glob `*-hot.json`, `*-warm.json`, `*-cold.json`, `*-connection.json`, every `hot`/`warm`/`expired` array of every `*-links.json`, the full array in `approved-queue.json`, and every slug in `cold-registry.json` expanded back to its full URL).
2. Read all leads with `status: "classified"` that are NOT in that set.
3. For each, build an approval entry:
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
     "enriched": true,
     "surfaced_at": "<now ISO>",
     "already_connected": false,
     "has_conversation": false,
     "decision": null,
     "note": null
   }
   ```
   Set `enriched` to `false` when `pipeline.json → enrichment.enabled` is false — in that case `current_title` and `current_company` will be null (visible to the user as a signal to validate manually). `already_connected` and `has_conversation` are populated by the checks in step 4 below. Cold entries get `null` for both (checks are skipped for cold).
4. **Connection status + conversation checks (hot and warm only):** Before writing any files, run two checks on every hot and warm entry. Cold leads are skipped — the API cost is not worth it.

   a. **Connection status check:** call `connection_status`. If the result indicates already connected or a pending invitation (see the resolved provider's skill file for the exact field — e.g. connectsafely's `connected || invitationSent`, linkedapi's `data.status` in `"connected"`/`"pending"`): add URL to `seen.json`, set `already_connected: true` on the lead in `leads.json`, and **remove the entry from the approval batch** — do not write it to any file. On `rate_limited`: apply rate-limit retry logic; if still failing, include the entry with `already_connected: null` (unknown, user must verify manually).

   b. **Conversation check** (only for entries that passed the connection check above): call `get_messages`. If the response contains any messages: set `has_conversation: true` on the entry. Otherwise set `has_conversation: false`. On error or rate-limit: set `has_conversation: null`. The `has_conversation` field is informational only — it does not gate approval.

5. **Split entries by classification** (if `review.split_by_classification` is true, which is the default):
   - Group remaining entries (those that passed the connection check) into `hot`, `warm`, and `cold` buckets.
   - For each non-empty bucket, paginate at `review.page_size` entries (default 30):
     - Single page: `<date>-<run_id>-hot.json`
     - Multiple pages: `<date>-<run_id>-warm-p1.json`, `<date>-<run_id>-warm-p2.json`, etc.
   - Write each page as a separate JSON array file. Never append to existing files.
6. Set `approval_surfaced_at` on each lead written to a file in `leads.json`.

**All classifications (hot, warm, cold) are surfaced.** The user decides everything.

7. **Send email notification** — invoke `agents/email-notifier.md` as a subagent with:
   - `phase: "search_complete"`
   - `run_id`: current run ID from `run_log.json`
   - `criteria_used`: resolved criteria name
   - `counts`: `{ total_new: N, hot: N, warm: N, cold: N }`
   - `leads_snapshot`: all entries written (hot + warm only if `review.email_suppress_cold` is true)
   - `files_written`: list of filenames created

Mark step complete in run_log. **Phase 1 ends here.** Do not proceed to Step 6a — that is Phase 2 (`/generate-messages`).

### Step 6a — Compose Connection Note Drafts

Runs in **`/generate-messages`** (Phase 2).

1. Scan all approval files: glob `state/pending_approvals/*-hot.json`, `*-warm.json`, `*-cold.json`, `*-connection.json` (legacy), and `*-links.json`; also load `state/pending_approvals/approved-queue.json` and `state/pending_approvals/cold-registry.json` in full. Load every entry, tracking which file each came from. Every URL in `approved-queue.json` is an approval — exactly equivalent to `decision: "approved"` — regardless of which links file it originally came from (`source_file` for these is `"approved-queue.json"`). Normalize links-file and approved-queue URLs on read (lowercase, strip trailing slash). Match each `cold-registry.json` slug against `leads.json` **by slug, not by naive URL reconstruction**: apply the same slug rule to every `leads.json` key and compare — some LinkedIn URLs carry a locale suffix (e.g. `/en`) that survives in a `leads.json` key but is dropped by the slug rule, so `https://www.linkedin.com/in/<slug>` will not always equal the lead's actual key even though it's the same person.
2. Find eligible leads:
   - **Classification/legacy entries**: `decision: "approved"` and `note_draft` is null.
   - **Approved-queue URLs**: every URL in `approved-queue.json`, with its lead at `status: "classified"` in `leads.json`, and URL not already present in any `*-notes-ready.json`. `approved-queue.json` holds no per-entry fields — the notes-ready file is the only place these drafts live.
   - **Deduplicate across sources** by normalized URL — draft once. A classification entry wins over an approved-queue approval (richer display fields, `source_file` points at the classification file). `source_file` for an approved-queue URL is `"approved-queue.json"`.
   - **Self-heal:** if an approved-queue URL also still sits in a `hot`/`warm`/`cold` array of some links file, or as a slug in `cold-registry.json` (copied there instead of cut): the approval wins — remove the tier/registry duplicate the next time that file is rewritten.
   - Status guard for approved-queue URLs: not in `leads.json` or at `status: "new"` → skip and warn (paste error or interrupted classification) — **leave the URL in `approved-queue.json`** for retry next run. At `status: "rejected"` with `approval_decision: "expired"` → **rescue**: treat as approved and proceed (it gets cut after drafting, per step 4). At `status: "rejected"` for any other reason → skip, flag the conflict in the run summary, and **leave the URL in `approved-queue.json`** — a human needs to look at it. Past `"classified"` (`request_sent`, …) → this URL's outcome is already durably resolved elsewhere; skip drafting it, but **cut it from `approved-queue.json` immediately** — it's moot, and leaving moot entries in place would defeat the point of consolidating them.
3. **Expire stale approvals:**
   - Classification/legacy entries older than `approval.approval_timeout_days` days (by `surfaced_at`, falling back to filename date) with `decision: null`: stamp `decision: "rejected"` and `note_decision: "rejected"` on the entry. Additionally, in `leads.json` set `status: "rejected"`, `approval_decision: "expired"`, `approval_decided_at` — but only when the lead is still at `status: "classified"` AND the URL is not approved anywhere (no entry with `decision: "approved"`, no membership in `approved-queue.json`). A URL approved elsewhere still gets the entry stamp (the null entry is a stale duplicate surface) but its lead is never touched. Entries remain in the file — only decision fields are filled in.
   - Links files whose filename date is more than `approval.approval_timeout_days` days old: every URL still in `hot`/`warm` — and `cold`, if the Cold Sweep hasn't reached it yet — is expired: move it to an `"expired"` array in that file (create if absent), and in `leads.json` set `status: "rejected"`, `approval_decision: "expired"`, `approval_decided_at`. Never expire a URL that is approved anywhere (`approved-queue.json`, or any entry with `decision: "approved"`), and never touch a lead whose status is not `"classified"`. A URL never leaves a links file this way — expiry within a links file is still purely an in-file move between arrays.
   - `cold-registry.json` entries expire independently of any links file, because they're pooled from many run dates: for each slug, find its lead in `leads.json` **by slug match** (apply the same slug rule to every `leads.json` key and compare — do not reconstruct `https://www.linkedin.com/in/<slug>` and expect exact equality; a locale suffix like `/en` can survive in the lead's actual key while the slug rule drops it). If the lead is still at `status: "classified"`, is not present in `approved-queue.json`, and its `approval_surfaced_at` is more than `approval.approval_timeout_days` days old: set `status: "rejected"`, `approval_decision: "expired"`, `approval_decided_at` on the lead, and **remove the slug from `cold-registry.json`** — unlike a links file, the registry has no `"expired"` array to move it to, because `leads.json` is now the sole durable record of that outcome. If the lead can't be found (data integrity issue), warn and leave the slug in place rather than silently dropping it.
4. For each eligible lead:
   - Fetch the full profile by calling `fetch_profile` (with experience included) to get position history before drafting.
   - **Write back** the fetched `name`, `headline`, `current_title`, `current_company`, `industry`, `location` to the lead in `leads.json` (freshest fetch wins — see State File Contracts), and write the raw payload to `state/raw/<slug>.json`. Never store `linkedin_raw` in `leads.json`.
   - If the fetch fails after retries: fall back to an existing `state/raw/<slug>.json` sidecar if present; otherwise draft from the lead's existing fields.
   - Invoke `agents/message-composer.md` as a subagent with the lead record, passing the raw payload as `linkedin_raw` (from the fresh fetch, else the sidecar), `message_type: "connection_note"`, and `criteria_used`. Receive back the drafted note string.
   - Classification/legacy entries: write `note_draft: "<drafted note>"` and `note_decision: null` back to that entry **in the same file it was read from**. Approved-queue URLs: no per-entry write-back (the draft lives only in the notes-ready file) — **and once the note is drafted, remove the URL from `approved-queue.json`**: its outcome is now durably captured in the notes-ready entry, so there is no remaining reason to keep it in the queue.
5. For each **rejected** lead (decision: "rejected"): `status → "rejected"`, set `approval_decided_at`, `approval_decision`.
6. **Write a notes-ready file** — after all drafts are written, collect every entry that just received a `note_draft` and write them to a new consolidated file:
   - Filename: `state/pending_approvals/<YYYY-MM-DD>-notes-ready.json` (use today's date). If a file for today already exists, append `-2`, `-3`, etc.
   - Each entry in this file:
     ```json
     {
       "url": "...",
       "name": "...",
       "headline": "...",
       "current_title": "...",
       "current_company": "...",
       "classification": "hot|warm|cold",
       "score": 88,
       "note_draft": "Hi ...",
       "edited_note": null,
       "note_decision": null,
       "source_file": "<basename of the classification file this entry came from>"
     }
     ```
   - This is the **primary review file** for the user. It contains only approved leads with drafted notes — no nulls, no rejected, no noise.
   - For approved-queue leads, populate `name`, `headline`, `current_title`, `current_company`, `classification`, `score` from `leads.json` **after** the step-4 write-back; `source_file` is `"approved-queue.json"`.
7. **Send email notification** — invoke `agents/email-notifier.md` as a subagent with:
   - `phase: "notes_ready"`
   - `run_id`: current run ID
   - `criteria_used`: resolved criteria name
   - `counts`: `{ notes_drafted: N }`
   - `leads_snapshot`: all entries written to the notes-ready file (include `name`, `headline`, `current_title`, `current_company`, `classification`, `note_draft`)

Mark step complete in run_log. **Phase 2 ends here.** Do not proceed to Step 6b — that is Phase 3 (`/send-connections`).

### Step 6b — Send Connection Requests

Runs in **`/send-connections`** (Phase 3).

1. **Primary scan — notes-ready files:** Scan `state/pending_approvals/*-notes-ready.json`. For each entry with `note_decision: "approved"`, use `edited_note` if non-null, otherwise `note_draft`. Record which `source_file` each entry belongs to.
2. **Legacy fallback:** Also scan `*-hot.json`, `*-warm.json`, `*-cold.json`, and `*-connection.json` for entries with `note_decision: "approved"` that are NOT already covered by a notes-ready file (i.e., their URL was not in any notes-ready file). This preserves backward compat with older runs.
3. Deduplicate: if the same URL appears in both a notes-ready file and a legacy file, the notes-ready entry wins.
4. From the combined set, find entries where the lead in `leads.json` still has `status: "classified"`.
3. For each (up to `outreach.max_connection_requests_per_run` per run):
   - Use `edited_note` if non-null, otherwise use `note_draft`. The message must be non-null — do not send without a note.
   - Call `send_connection_request` with the note. (connectsafely caps `customMessage` at 300 characters — truncate or flag if the drafted note exceeds it before sending.)
   - On success: `status → "request_sent"`, set `connection_requested_at`, set `connection_note`.
   - On `rate_limited`: retry per rate_limit config. If still failing: log error, leave at `"classified"` for next run.
   - On other failure: `status → "request_failed"`, log error.
4. For entries with `note_decision: "rejected"`: `status → "rejected"`, set `approval_decided_at`, `approval_decision`.
5. Update `approval_decided_at` and `approval_decision` on all processed leads.

**Safety checks:**
- `note_decision` must be `"approved"` AND `note_draft` (or `edited_note`) must be non-null. Both must pass.
- `require_approval_before_connect` must be `true` in `pipeline.json`. If it is `false`, log a warning and refuse to send.

Mark step complete in run_log.

### Step 7 — Detect Accepted Connections

1. Get the timestamp of the previous run's `completed_at` from `run_log.json`.
2. Call `list_connections` **three times** and union all returned URLs to maximize coverage before matching against `request_sent` leads.
3. Normalize all returned URLs.
4. For each lead in `leads.json` with `status: "request_sent"`: check if their URL appears in the connection list.
5. If found:
   - `status → "connected"`, set `connection_accepted_at: <now>`.
   - Compute `followup_eligible_after`: now + random integer in [`followup.delay_days_min`, `followup.delay_days_max`] days.
   - Set `followup_sequence: 0`.

Mark step complete in run_log.

### Step 8 — Surface Follow-Up Queue

**Approval file naming:** Each run writes its follow-up approvals to a new file: `state/pending_approvals/<YYYY-MM-DD>-followup.json` (using today's date). If a followup file for today already exists, append `-2`, `-3`, etc. (e.g. `2026-05-07-followup-2.json`).

1. Build the set of URLs already pending across all `state/pending_approvals/*-followup.json` files (entries with `decision: null`).
2. Find leads in `leads.json` with `status: "connected"` where:
   - `followup_eligible_after <= now`
   - `followup_sequence < followup.max_sequence`
   - `do_not_contact` is not `true`
   - URL is NOT in the pending set from step 1
3. For each eligible lead:
   - Invoke `agents/message-composer.md` as a subagent with the lead record, `message_type: "followup"`, `followup_sequence`, and `criteria_used`. The composer selects the correct template internally.
   - Receive back the drafted message string.
4. Set `followup_draft` and `status → "followup_queued"` on the lead.
5. Write all entries as a JSON array to `state/pending_approvals/<run-timestamp>-followup.json` (new file):
   ```json
   [
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
   ]
   ```
6. **Send email notification** — invoke `agents/email-notifier.md` as a subagent with:
   - `phase: "messages_ready"`
   - `run_id`: current run ID
   - `counts`: `{ followups_drafted: N }`
   - `leads_snapshot`: all entries written to the new followup file

Mark step complete in run_log. **Phase 3 ends here.** Do not proceed to Step 9 — that is Phase 4 (`/deliver-messages`).

### Step 9 — Send Approved Follow-Ups

1. Scan all `state/pending_approvals/*-followup.json` files and load every entry, tracking which file each came from.
2. Find entries with `decision: "approved"` where the lead's `status` is still `"followup_queued"`.
3. For each (up to `followup.max_followups_per_run` per run):
   - Use `edited_message` if non-null, otherwise use `followup_draft`.
   - Call `send_message`.
   - On success: `status → "followup_sent"`, set `followup_sent_at`, set `followup_approved_at`.
   - Increment `followup_sequence` on the lead.
   - If `followup_sequence < followup.max_sequence`: `status → "connected"`, recompute `followup_eligible_after` for the next follow-up window.
   - If `followup_sequence >= followup.max_sequence`: leave at `"followup_sent"` (sequence complete).
   - On `rate_limited`: retry per config. If still failing: log, leave at `"followup_queued"` for next run.
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

## Abbreviated Mode — /search-connections-abbreviated

A minimal-footprint variant of Phase 1. Same discovery, same classification — but no enrichment, no per-lead API checks, no email, and one links file instead of classification-split files. Review is cut/paste: the user moves URLs into the shared `approved-queue.json` (and, for cold leads left too long, they get swept automatically into the shared `cold-registry.json` — see Step 5L).

Runs Steps 0, 1, 2, and 4 exactly as written above, with these deltas:

- **Step 0**: create the run entry with `phase: "search-connections-abbreviated"`. Resume follows the phase-matching rule in Step 0.
- **Step 3 never runs** — regardless of `pipeline.json → enrichment.enabled`. No `fetch_profile` calls. Enrichment happens later, per approved lead, in Step 6a.
- **Step 4 deltas**: classify only leads created by the current run (`run_id` match) — stale `status: "new"` leads from older runs are left untouched. The classifier still returns `score_rationale`; do **not** persist it to `leads.json`. Lead stubs in this mode carry only: `url`, `status`, `classification`, `score`, `name`, `headline`, `location`, `run_id`, `criteria`, `first_seen_run`, `last_updated`. Never `linkedin_raw`.
- **Step 5 is replaced by Step 5L.** The connection-status and conversation checks are skipped entirely — false positives are caught by Step 6b's `status: "classified"` gate and the send-time safety checks.
- **No email** — do not invoke `agents/email-notifier.md`. The links file is the review surface.
- **Step 10** runs as written.

### Step 5L — Surface Links File

0. **Cold Sweep (runs first, every abbreviated run):** For every existing `*-links.json` file already on disk (i.e. every prior run's file — this run has not written its own file yet), move every URL in that file's `cold` array into `state/pending_approvals/cold-registry.json`: convert each URL to its bare slug (same rule as `state/raw/<slug>.json`: first path segment after `/in/`, lowercased, non-`[a-z0-9._-]` characters replaced with `_`), append to the registry's array (dedupe against existing entries), then empty that file's `cold` array. Rewrite the file in place — `hot`, `warm`, and `expired` (if present) are untouched. If `cold-registry.json` does not yet exist, create it as `[]` first. This is what makes "the cold ones move to a single file on the next run if they are still there" true — cold URLs get one full run cycle in their original file before being swept out.
1. Build the set of URLs already surfaced across ALL existing approval files (glob `*-hot.json`, `*-warm.json`, `*-cold.json`, `*-connection.json`, every `hot`/`warm`/`expired` array of every `*-links.json`, the full array in `approved-queue.json`, and every slug in `cold-registry.json` expanded back to its full URL).
2. Read all leads with `status: "classified"` from the current run that are NOT in that set.
3. Write ONE file `state/pending_approvals/<YYYY-MM-DD>-<run_id>-links.json` (`<run_id>` = short run ID, as in Step 5):
   ```json
   { "hot": ["<url>", ...], "warm": [...], "cold": [...] }
   ```
   URLs are normalized (lowercase, no trailing slash) and sorted by `score` descending within each tier. No pagination, no per-lead entries, and **no `approved` key** — approvals go straight into `approved-queue.json` (see Review contract below).
4. Set `approval_surfaced_at` on each lead written.

Mark step complete in run_log (record as step `5`). **Phase 1 ends here.**

**Review contract:** cut (not copy) URLs you want to approve out of a links file's `hot`/`warm`/`cold` array — or out of `cold-registry.json` (reconstructing the full URL as `https://www.linkedin.com/in/<slug>` first — on the rare lead whose actual URL carries a locale suffix like `/en`, Step 6a's status guard will skip-and-warn rather than silently mismatch, so just re-paste with the suffix restored if that happens) — and paste them into `state/pending_approvals/approved-queue.json`'s single array. Membership in `approved-queue.json` means exactly `decision: "approved"`. Leave everything else alone: URLs left in a links file's `hot`/`warm` longer than `approval.approval_timeout_days` are expired by Step 6a (moved to that file's `expired` array, lead `status → "rejected"`); URLs left in `cold-registry.json` longer than `approval.approval_timeout_days` (measured from the lead's own `approval_surfaced_at` in `leads.json`, since the registry pools many run dates) are expired the same way but simply removed from the registry, since `leads.json` is now the durable record of that outcome. Moving an expired URL into `approved-queue.json` rescues it on the next `/generate-messages` run, exactly as moving it into a links file's `approved` array used to.

---

## Invite Recovery (Standalone Phase)

A standalone phase — like `/connection-warm-up` — that is never scheduled and stands outside the core Steps 0–10 numbering (nothing above is renumbered). It withdraws connection invites that have sat pending too long and gives each recovered contact a second touch via InMail, with withdrawal automatic and InMail gated behind explicit per-contact approval. Config lives at `config/pipeline.json → invite_recovery` (`csv_import_dir`, `stale_after_days`, `match_date_tolerance_days`, `require_approval_before_withdraw`, `require_approval_before_inmail`, `max_withdrawals_per_run`, `max_inmails_per_run`).

Full step-by-step behavior lives in the two command files — this section is the durable spec they implement:

**`/recover-stale-invites`** — own Step 0–6 numbering:
- Step 0: re-entry check, `phase: "recover-stale-invites"`.
- Step 1: resolve the candidate source. **CSV is the default** — read every `*.csv` in `state/imports/` (a LinkedIn "Sent Invitations" export). **If no CSV is present, fall back to the live provider** — call `get_sent_invitations` directly and treat its pending items as the candidate list. Record `invite_source: "csv"` or `"live_api"` on the run.
- Step 2: live cross-reference (CSV path only) — match each CSV row against the paginated `get_sent_invitations` list by profile URL, then name + date proximity (`match_date_tolerance_days`), then unique name. Unmatched rows are treated as already-resolved (reconcile against `leads.json`/`connection_status` if a lead exists); ambiguous rows (2+ candidates) are logged, never acted on.
- Step 3: **auto-withdraw** every remaining candidate sent ≥ `stale_after_days` ago, via `withdraw_invitation` — no per-contact approval (see Approval Contract below). Upserts the lead in `leads.json` with `status: "withdrawn"`, `withdrawn_at`, `retry_eligible_after` (+14 days), `withdrawal_note`, `source: "csv_recovery"`.
- Step 4: check `get_inmail_credits` — `0` (or insufficient) hard-blocks drafting with a clear warning rather than attempting sends that can't work. Otherwise drafts an InMail (`agents/message-composer.md`, `message_type: "inmail"`) for every newly-withdrawn lead, reprising `connection_note` as `original_connection_note`.
- Step 5: writes `state/pending_approvals/<date>-inmail-ready.json` (entries never removed, only decision fields filled in — same invariant as `notes-ready.json`); emails `phase: "inmail_ready"`.
- Step 6: moves fully-resolved CSVs to `state/imports/processed/` (move, never delete); finalizes the run.

**`/send-recovery-inmail`** — Step 7 in this phase's numbering: re-checks `get_inmail_credits`, scans `*-inmail-ready.json` for `decision: "approved"` entries whose lead is still `status: "inmail_queued"` with `inmail_sent_at` null, sends via `send_inmail` (connectsafely: no subject support — see the operations table note above; linkedapi: subject supported), sets `status → "inmail_sent"`, emails `phase: "inmail_delivery_summary"`.

**Approval Contract addition:** withdrawal never requires per-contact approval (the command asserts `invite_recovery.require_approval_before_withdraw === false` before running Step 3 and refuses if it's ever set `true`, since no approval-gated withdrawal path exists). InMail sending follows the same shape as every other outbound send in this pipeline: `decision: "approved"` in an `*-inmail-ready.json` entry, a non-null `inmail_body_draft`/`edited_inmail_body`, lead at `status: "inmail_queued"`, and `invite_recovery.require_approval_before_inmail === true` — all independent, all must pass.

---

## Rate Limit Handling

This section reasons in terms of the normalized error categories defined in **LinkedIn Provider** above — see that section for how each category maps to a concrete signal (HTTP status vs. exit code) per provider.

On `rate_limited` from any operation:
1. Wait `rate_limit.retry_delay_seconds` seconds.
2. Retry up to `rate_limit.max_retries` times.
3. If still `rate_limited` after all retries: **log the failure** (step name, URL if applicable, timestamp) to the current run entry's `errors` array in `run_log.json`. Skip the current operation and continue the pipeline.
4. **Never abort the entire run** due to a single rate limit failure.

Other categories:
- `auth_error`: Stop immediately. Log. Tell the user to run the resolved provider's setup (connectsafely: confirm the MCP server is connected and `CONNECTSAFELY_API_KEY`/`CONNECTSAFELY_ACCOUNT_ID` are set; linkedapi: run `linkedin setup`).
- `subscription_required` (linkedapi only): Log and skip the failing command.
- `async_timeout` (linkedapi only): Check for a `workflowId` in the response, then poll `linkedin workflow status <id> --wait --json -q`.
- JSON parse failure on output: log raw output to run_log errors, skip that lead.

---

## Approval Contract

**Never send a connection request unless:**
1. Some file in `state/pending_approvals/` records an approval for that URL — either an entry with `decision: "approved"` in a `*-hot/-warm/-cold/-connection.json` file, or membership in `state/pending_approvals/approved-queue.json`'s array (the single consolidated home for every abbreviated-mode approval — links files no longer carry their own `approved` array).
2. A notes-ready entry (or that same classification entry) for the URL has `note_decision: "approved"` AND `note_draft` (or `edited_note`) is non-null. Approved-queue approvals carry no per-entry fields — for those leads this check can only be satisfied by a notes-ready entry.
3. `leads.json` shows the lead at `status: "classified"`.

All three checks are independent. All must pass.

**Never send a follow-up message unless:**
1. Some file in `state/pending_approvals/*-followup.json` has an entry for that URL with `decision: "approved"`.
2. `leads.json` shows the lead at `status: "followup_queued"`.

Both checks must pass.

---

## State File Contracts

- **`seen.json`**: append-only. Never remove a URL once written — not by any pipeline step and not by `/pipeline-maintenance`. A URL added here means "this person has been discovered and will never be re-proposed." Archiving a lead never touches `seen.json`; dedupe survives archiving by design.
- **`leads.json`**: keyed by normalized URL. Each pipeline step only writes to its own fields. Do not overwrite fields owned by other steps. **One shared exception:** the profile fields (`name`, `headline`, `location`, `industry`, `current_title`, `current_company`) are enrichment-owned and may be written by Step 3 or the Step 6a approval fetch — freshest fetch wins. `leads.json` never contains `linkedin_raw`; raw payloads live in `state/raw/`. `/pipeline-maintenance` may *move* terminal leads to `state/archive/leads-archive.json`. **Invite Recovery fields**, owned by `/recover-stale-invites` and `/send-recovery-inmail`: `inmail_subject_draft`, `inmail_body_draft`, `inmail_sent_at`; two additional `status` values, `"inmail_queued"` and `"inmail_sent"`. Reuses (does not redefine) `withdrawn_at`, `retry_eligible_after`, `withdrawal_note`, `connection_note`, `source`, `approval_decision`, `approval_decided_at`.
- **`state/imports/`**: gitignored CSV drop zone for `/recover-stale-invites`. Optional — an empty directory means that run falls back to the live provider instead. `state/imports/processed/` holds CSVs whose every row is fully resolved (moved, never deleted, same convention as `/pipeline-maintenance`'s archiving elsewhere); a CSV with unresolved rows stays in `state/imports/` for the next run.
- **`pending_approvals/`**: one timestamped file is created per run — never deleted, and the file itself is never merged into another file. `/pipeline-maintenance` may *move* fully-decided files to `pending_approvals/archive/`; nothing else relocates them. In entry-style files (`-hot/-warm/-cold/-connection/-notes-ready/-followup/-warmup-comments/-inmail-ready`) entries are never removed — only decision fields are filled in. Entries older than `approval_timeout_days` with null decisions are expired by Step 6a — it stamps `decision: "rejected"` on them (they remain in the file), so fully-decided files can eventually be archived by `/pipeline-maintenance`.

  In `*-links.json` files the invariant is **narrower than it used to be**: the file itself is still never merged or deleted, and hot/warm/expired bookkeeping still never leaves the file (tier → `expired` by Step 6a remains a pure in-file move). But **`approved` and `cold` are the two deliberate exceptions**: a URL cut into `approved` moves out of the links file entirely into the single shared `approved-queue.json` (a flat array of full URLs); a URL still sitting in `cold` past the current run moves out into the single shared `cold-registry.json` (a flat array of bare slugs) via the Cold Sweep at the start of the next abbreviated run. Links files are therefore written with only `hot`, `warm`, and `cold` keys — no `approved` key — and `cold` is expected to end each run cycle empty.

  `approved-queue.json` and `cold-registry.json` are themselves **self-pruning ledgers, not permanent archives**: once a URL's outcome is durably captured elsewhere (a notes-ready entry exists for it, or `leads.json` shows its lead no longer at `status: "classified"`), it is deliberately removed from these files. `leads.json` and the notes-ready/archive files remain the actual audit trail — these two files are transient bookkeeping only, same as links-file tier arrays always were.
- **`pending_approvals/approved-queue.json`**: single persistent file (not one per run) — a flat array of full normalized URLs. Written to by the human reviewer (cut from a links file's `hot`/`warm`/`cold`, or from a reconstructed `cold-registry.json` slug) and by Step 6a's rescue path. Step 6a removes a URL once its draft lands in a notes-ready entry, or once it's skipped as already-past-classified/moot. URLs left here after a guard-failure or status conflict are **not** removed — they stay for retry/investigation, exactly as an unresolved links-file `approved` entry did before. Never archived by `/pipeline-maintenance` sweep (a) — being self-pruning, it never accumulates the fully-decided backlog per-run files do.
- **`pending_approvals/cold-registry.json`**: single persistent file — a flat array of bare LinkedIn slugs (same derivation rule as `state/raw/<slug>.json`), swept in from every links file's `cold` array at the start of each abbreviated run (Step 5L). Expiry is computed per-slug from the corresponding lead's `approval_surfaced_at` in `leads.json` — not from any filename — since entries here are pooled across many original run dates. A slug is removed once its lead's status in `leads.json` is no longer `"classified"` (expired-and-rejected by Step 6a, or promoted into `approved-queue.json` after the user reconstructs its full URL). Never archived by `/pipeline-maintenance` — same reasoning as `approved-queue.json`.
- **`state/raw/<slug>.json`**: raw fetch payloads, one file per lead; slug = the lowercased `/in/` handle, sanitized: take only the first path segment after `/in/` (drops locale suffixes like `/en`) and replace any character outside `[a-z0-9._-]` with `_`. Written by Step 3 and the Step 6a approval fetch; last write wins. **Gitignored** — bulky, re-derivable, never used for dedupe, safe to delete. Agents without sidecars fall back to a fresh fetch.
- **`state/archive/`**: written only by `/pipeline-maintenance`. `leads-archive.json` mirrors `leads.json`'s keyed shape; `run_log-archive.json` holds rotated run entries in order.
- **`run_log.json`**: append-only to the `runs` array during pipeline runs. Each run gets its own entry. `/pipeline-maintenance` may rotate completed entries beyond the most recent 20 into the archive.

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
| `inmail_recovery_agency.md` | InMail recovery, agency-partners criteria |
| `inmail_recovery_agency_netsuite.md` | InMail recovery, agency-netsuite criteria |
| `inmail_recovery_agency_shopify.md` | InMail recovery, agency-shopify criteria |
| `inmail_recovery_retail.md` | InMail recovery, retail-brands criteria |
| `inmail_recovery_mvp.md` | InMail recovery, mvp-factory criteria |
| `inmail_recovery_suiteworld.md` | InMail recovery, suiteworld-2026 criteria |
| `inmail_recovery_netsuite_latam.md` | InMail recovery, netsuite-latam criteria |

Common tokens the composer uses as placeholders: `{{first_name}}`, `{{current_title}}`, `{{current_company}}`. All other personalization is derived from the lead's `headline` and the raw profile payload the caller passes as `linkedin_raw` (fresh Step 6a fetch, else `state/raw/<slug>.json`).

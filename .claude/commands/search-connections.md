# /search-connections

**Phase 1 of the LinkedIn pipeline.** Run this to search for new leads, enrich their profiles, classify them, and surface them for your review. Accepts an optional criteria argument (e.g. `/search-connections criteria=retail-brands`).

## What this does

1. Reads `CLAUDE.md`, `.claude/skills/linkedin/SKILL.md`, and `config/pipeline.json`.
2. Resolves the active criteria — uses the argument if provided, otherwise falls back to `pipeline.json → active_criteria`.
3. Executes pipeline **Steps 0–5**:
   - **Step 0** — Re-entry check: resume an in-progress run if one exists, otherwise create a new run entry in `run_log.json`.
   - **Step 1** — Criteria refresh (conditional): runs `agents/criteria-extractor.md` if due.
   - **Step 2** — Search for new leads: builds exclusion set (3× `linkedin connection list` union + `seen.json`), runs search queries, writes stubs to `leads.json` and `seen.json`.
   - **Step 3** — Profile enrichment (conditional): checks `pipeline.json → enrichment.enabled`. If `false` (default), skips all `linkedin person fetch` calls and proceeds directly to classification using search-result fields (`name`, `headline`, `location`). If `true`, fetches full profiles for all `status: "new"` leads.
   - **Step 4** — Classification: invokes `agents/lead-classifier.md` to score and classify leads. When enrichment was skipped, classification runs from `headline` only; `current_title` and `current_company` will be null.
   - **Step 5** — Surface approvals: for every hot/warm lead runs a connection status check (removes already-connected leads) and a conversation check (adds `has_conversation` flag), then writes classification-split files (`YYYY-MM-DD-<run_id>-hot.json`, `-warm.json`, `-cold.json`), paginated at 30 entries each, and sends an email notification.
4. Sends an email via `agents/email-notifier.md` with `phase: "search_complete"`.
5. Updates `state/run_log.json` with `status: "phase1_complete"`.

## Before running

- LinkedIn CLI must be authenticated (`linkedin account list` to verify).
- `RESEND_API_KEY` must be set in the environment for the email notification.
- You can pass a criteria override: `/search-connections criteria=retail-brands`

## After running

Check your email — it shows hot and warm leads in a table (cold leads are counted but not listed). Three files are created in `state/pending_approvals/`:

- `YYYY-MM-DD-<run_id>-hot.json` — start here, typically 10–30 entries
- `YYYY-MM-DD-<run_id>-warm.json` — review next (may be paginated: `-warm-p1.json`, `-warm-p2.json`, ...)
- `YYYY-MM-DD-<run_id>-cold.json` — low priority, skip if short on time

For each entry in the hot and warm files, set `decision` to `"approved"` or `"rejected"`. You can add a `note` field with context if needed.

Then run `/generate-messages` to compose connection notes for approved leads.

## Rate limit handling

Follows the pipeline rules in `CLAUDE.md`: exit code 6 → wait and retry (up to `rate_limit.max_retries`). Never abort the full run on a single failure. On auth failure (exit code 2): stop immediately and tell the user to run `linkedin setup`.

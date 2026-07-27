# /search-connections-abbreviated

**Phase 1 of the LinkedIn pipeline — minimal-footprint variant.** Same search and classification as `/search-connections`, but: no enrichment, no per-lead connection or conversation checks, no email, and one links file instead of classification-split files. Accepts an optional criteria argument (e.g. `/search-connections-abbreviated criteria=mvp-factory`).

## What this does

1. Reads `CLAUDE.md`, resolves the active LinkedIn provider (`config/pipeline.json → linkedin_provider.active`) and loads its skill file, and reads `config/pipeline.json`.
2. Resolves the active criteria — uses the argument if provided, otherwise falls back to `pipeline.json → active_criteria`.
3. Executes pipeline **Steps 0, 1, 2, and 4** as written, then **Step 5L**, per **CLAUDE.md → Abbreviated Mode**:
   - **Step 0** — re-entry check with phase matching (`phase: "search-connections-abbreviated"`).
   - **Step 1** — criteria refresh (conditional).
   - **Step 2** — search: exclusion set (connections cache + `seen.json`), stubs to `leads.json` + `seen.json`.
   - **Step 3** — never runs in this mode, regardless of `enrichment.enabled`.
   - **Step 4** — classification of this run's leads only; `score_rationale` is not persisted.
   - **Step 5L** — writes ONE file `state/pending_approvals/YYYY-MM-DD-<run_id>-links.json` with an empty `approved` array and score-sorted `hot`/`warm`/`cold` URL arrays.
4. No email is sent. Step 10 finalizes the run in `state/run_log.json`.

## Before running

- The active LinkedIn provider must be authenticated (`account_status` — connectsafely: MCP server connected; linkedapi: `linkedin account list` to verify).
- `RESEND_API_KEY` is NOT required — this mode sends no email.
- You can pass a criteria override: `/search-connections-abbreviated criteria=retail-brands`
- If a run under a different phase (e.g. a standard `/search-connections`) is `in_progress` in `run_log.json`, this command stops and asks — finish that run with its own command or mark it abandoned.

## After running

One file is created: `state/pending_approvals/YYYY-MM-DD-<run_id>-links.json`. Review it by **moving (cut, not copy)** URLs from `hot` / `warm` / `cold` into `approved`. URLs are sorted best-first within each tier. Leave everything you don't want — after `approval.approval_timeout_days` days (default 3), URLs still sitting in a tier are expired by the next `/generate-messages` run (moved to an `expired` array, lead marked rejected).

Then run `/generate-messages` — approved URLs are enriched there (profile fetch, write-back to `leads.json`, raw sidecar in `state/raw/`) and drafted into a notes-ready file.

## Rate limit handling

Follows the pipeline rules in `CLAUDE.md`: `rate_limited` → wait and retry (up to `rate_limit.max_retries`); never abort the full run on a single failure. This mode makes far fewer calls to begin with — only search queries, plus the connections-cache rebuild when expired; no fetch, status, or message calls. On `auth_error`: stop immediately and tell the user to fix the active provider's auth (see `CLAUDE.md → LinkedIn Provider`).

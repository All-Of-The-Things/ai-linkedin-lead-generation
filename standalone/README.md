# Standalone CLI — `/search-connections-abbreviated` without Claude

A non-AI, terminal-only equivalent of `/search-connections-abbreviated` (Phase 1, minimal-footprint variant). Runs the same search → classify → surface-links logic against the same `state/` files and `config/criteria/` files as the Claude command — so runs from either entry point are interchangeable and both feed `/generate-messages` the same way.

It replicates Steps 0, 1 (staleness check only), 2, 4, and 5L from `CLAUDE.md`. It does **not** run enrichment, send email, or refresh criteria — see "What this does NOT do" below.

## Setup

1. Get a ConnectSafely API key from [connectsafely.ai](https://connectsafely.ai) (this must be a fresh key — see the warning below).
2. Provide credentials, either via environment variables:
   ```bash
   export CONNECTSAFELY_API_KEY=...
   export CONNECTSAFELY_ACCOUNT_ID=...   # optional — omit to use the account's default
   ```
   or by creating `standalone/.env.local` (gitignored):
   ```
   CONNECTSAFELY_API_KEY=...
   CONNECTSAFELY_ACCOUNT_ID=...
   ```
3. `cd standalone && npm install` (no runtime dependencies today — this just validates `package.json`).

⚠️ **Known risk with this credential path:** `state/run_log.json` records that this exact project-level auth style (`CONNECTSAFELY_API_KEY`/`CONNECTSAFELY_ACCOUNT_ID` called directly against the REST API) had a multi-week flaky-401 history in August 2026 before the pipeline switched to the claude.ai MCP connector as its default (see `.claude/skills/connectsafely/SKILL.md`). If you see `auth_error` even with a freshly-issued key, that history may be recurring — the CLI stops immediately on `auth_error` rather than retrying, so this is visible right away.

## Usage

```bash
node bin/search-connections-abbreviated.mjs                     # uses config/pipeline.json → active_criteria
node bin/search-connections-abbreviated.mjs criteria=mvp-factory # override
node bin/search-connections-abbreviated.mjs --help
```

Output: one new `state/pending_approvals/<date>-<run_id>-links.json` with score-sorted `hot`/`warm`/`cold` URL arrays — review it exactly like a Claude-run abbreviated search (cut URLs into `state/pending_approvals/approved-queue.json`, then run `/generate-messages` in Claude Code).

Re-entry: this CLI shares the `"search-connections-abbreviated"` phase with the Claude command, so an in-progress run started one way can be resumed by the other (both implement the same steps against the same files). Run log entries this CLI writes carry an additional `engine: "standalone-cli"` field for traceability.

## What this does NOT do

- **No enrichment** — Step 3 never runs, exactly like the Claude command's Abbreviated Mode. Leads are classified from search-result `headline`/`location` text only.
- **No email notifications** — Abbreviated Mode already skips these.
- **No criteria refresh** — `agents/criteria-extractor.md` requires reading live connection patterns and making qualitative judgment calls (see `agents/criteria-extractor.md`'s own instructions); that's an LLM task this CLI can't faithfully replicate. Instead, it checks whether a refresh is due (same run-count-mod-N rule as Step 1, anchored to the criteria file's own `generated_at`) and prints a warning telling you to run **`/refresh-criteria <name>`** in Claude Code. It never blocks on this and never refreshes anything itself.
- **LinkedAPI provider is not supported** — only ConnectSafely's REST API. If `config/pipeline.json → linkedin_provider.active` is `"linkedapi"`, the CLI exits with an explanatory message; run the pipeline via Claude Code instead (which supports both providers).

## Classifier: known approximation gaps

`lib/classifier.mjs` deterministically reimplements `agents/lead-classifier.md`'s "enrichment disabled" scoring path (gate → weighted score → modifiers → thresholds, all driven by the criteria file's own `company_type_signals`/`target_roles`/`scoring_weights`/`classification_thresholds`, generic across every criteria file — nothing NetSuite-specific is hardcoded). Compared against the LLM classifier, it:

- Collapses "exact role match" vs. "adjacent role" vs. "generic Founder/CEO with no domain signal" into a single substring match (the LLM's 1.0/0.5/0.3 distinction is judgment-based).
- Only applies the end-client penalty if a criteria file defines an `end_client_keywords` array (not part of the current schema for any file) — otherwise it's skipped entirely, which is a real gap for `retail-brands.json`'s more nuanced platform-confirmation gate.
- Does no free-text headline segmentation (no "X at Y" parsing) — pure substring search against each criteria list.

Run `node bin/classifier-regression-check.mjs` to compare this engine's output against already-classified leads in `state/leads.json` (leads produced by Abbreviated Mode carry a `criteria` field, and enrichment has always been disabled pipeline-wide, so their `headline`/`location` inputs are directly comparable) — it reports the classification-agreement rate and prints sample disagreements. No API calls, no credentials needed.

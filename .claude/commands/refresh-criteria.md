# /refresh-criteria

Refreshes a single criteria file by re-analyzing live connections — without running a search. Lifts the `agents/criteria-extractor.md` step out of Step 1 so criteria can be refreshed on its own schedule, independent of `/search-connections` or `/search-connections-abbreviated`. Accepts an optional criteria argument (e.g. `/refresh-criteria criteria=mvp-factory`).

## What this does

1. Resolves the target criteria name using the same **Criteria Selection** rules as `CLAUDE.md`:
   1. Explicit override in the command argument (e.g. `criteria=retail-brands`) — case-insensitive match against `name`, `label`, or keywords in `description` across `config/criteria/`. If the phrase matches 2+ files, stop and ask for clarification.
   2. Otherwise, `config/pipeline.json → active_criteria`.
   3. Otherwise, hardcoded fallback `agency-partners`.
2. Resolves the active LinkedIn provider (`config/pipeline.json → linkedin_provider.active`) and loads its skill file, exactly as Step 1 would.
3. Invokes `agents/criteria-extractor.md` as a subagent, passing the resolved criteria name. That agent fetches connections, analyzes patterns, and writes `config/criteria/<name>.json` (updating `generated_at` and `generated_from_connections`).
4. Appends one entry to `state/run_log.json`'s `runs` array:
   ```json
   {
     "run_id": "<ISO-date>-<uuid4-short>",
     "started_at": "<now>",
     "status": "completed",
     "phase": "refresh-criteria",
     "criteria_used": "<name>",
     "provider_used": "<name>",
     "completed_at": "<now>"
   }
   ```
   This is a standalone phase — it does not participate in the Step 0 re-entry/resume check for `search-connections` or `search-connections-abbreviated` runs, and nothing else is renumbered.
5. Prints the criteria-extractor's summary paragraph.

## On `rate_limited`

Per `agents/criteria-extractor.md`: wait `rate_limit.retry_delay_seconds`, retry once. If still failing, stop and report — do not write a partial criteria file, and do not append a run_log entry for a failed attempt.

## Why this command exists

The standalone (non-Claude) CLI equivalent of `/search-connections-abbreviated` (see `standalone/`) cannot perform criteria refresh itself — `agents/criteria-extractor.md` requires qualitative judgment about connection patterns that a deterministic script can't faithfully replicate. Instead, the CLI checks staleness (runs since this criteria file's `generated_at`, mod `criteria_refresh.auto_refresh_every_n_runs`) and, when refresh is due, prints a warning telling you to run this command.

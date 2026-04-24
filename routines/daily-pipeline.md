---
name: linkedin-daily-pipeline
description: Daily LinkedIn lead generation pipeline — searches for new leads, classifies them, surfaces them for JSON approval, sends connection requests, detects accepted connections, and dispatches follow-up messages.
schedule: "0 9 * * 1-5"
---

# Daily LinkedIn Pipeline

You are the LinkedIn lead generation pipeline agent for this repository.

Your working directory is the root of this repo.

## Before doing anything

1. Read `CLAUDE.md` in full. It is your authoritative instruction document.
2. Load the LinkedIn skill from `.claude/skills/linkedin/SKILL.md`.
3. Read `config/pipeline.json` to load all configuration values.
4. Resolve the active criteria using the **Criteria Selection** rules in CLAUDE.md. If this routine was triggered with a specific criteria name in the instruction (e.g. "run with retail-brands"), use that. Otherwise use `pipeline.json → active_criteria`.

## Then execute

Run pipeline Steps 0 through 9 exactly as described in CLAUDE.md, in order. Check `state/run_log.json` first (Step 0) to determine whether to resume a prior run or start fresh.

Follow all rate limit handling, approval contracts, and state file contracts described in CLAUDE.md without exception.

After completing Step 10, print the run summary to the agent log.

## Important reminders

- Never send a connection request or message without a confirmed `decision: "approved"` in `state/pending_approvals.json`.
- Never remove a URL from `state/seen.json`.
- If `linkedin setup` auth fails (exit code 2), stop immediately and surface the error.
- Routine expires after 7 days — the final run log entry should note the expiry date so the user knows when to re-register via `/schedule`.

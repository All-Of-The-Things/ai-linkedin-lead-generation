---
name: linkedin-daily-search
description: Phase 1 of the LinkedIn pipeline — searches for new leads, enriches profiles, classifies them, and surfaces them to pending_approvals.json. Sends an email notification when leads are ready for review.
schedule: "0 9 * * 1-5"
---

# Daily LinkedIn Search (Phase 1)

You are running Phase 1 of the LinkedIn lead generation pipeline for AOTT.

## Before doing anything

1. Read `CLAUDE.md` in full — your authoritative instruction document.
2. Load the LinkedIn skill from `.claude/skills/linkedin/SKILL.md`.
3. Read `config/pipeline.json` to load all configuration values.
4. Resolve the active criteria using the **Criteria Selection** rules in CLAUDE.md. If this routine was triggered with a specific criteria name in the instruction (e.g. "run with retail-brands"), use that. Otherwise use `pipeline.json → active_criteria`.

## Execute Phase 1 only (Steps 0–5)

Run pipeline Steps 0 through 5 exactly as described in CLAUDE.md, in order:
- Step 0 — Re-entry check
- Step 1 — Criteria refresh (conditional)
- Step 2 — Search for new leads
- Step 3 — Profile enrichment
- Step 4 — Classification
- Step 5 — Surface connection approvals

Do NOT execute Steps 6–9. Those belong to Phase 2 (`/generate-messages`) and Phase 3 (`/deliver-messages`).

## After Step 5 — Send email notification

Invoke `agents/email-notifier.md` as a subagent with:
- `phase: "search_complete"`
- `run_id`: the current run's `run_id` from `run_log.json`
- `criteria_used`: the resolved criteria name
- `counts`: `{ total_new, hot, warm, cold }`
- `leads_snapshot`: all leads with `status: "classified"` that were surfaced this run (from `state/pending_approvals.json → connection_approvals`, entries with `surfaced_at` matching this run)

## Finalize

Update `run_log.json` with `status: "phase1_complete"` and counts.

Print a one-paragraph summary of what was found.

## Important reminders

- Never send a connection request or message — that happens in Phase 2.
- If the `linkedapi` MCP tools return an auth error, stop immediately and surface the error — the user needs to check their tokens in `.claude/settings.local.json`.
- Routine expires after 7 days — log the expiry date in the run summary so you know when to re-register via `/schedule`.

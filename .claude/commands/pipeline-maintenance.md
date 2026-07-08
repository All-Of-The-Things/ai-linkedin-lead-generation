# /pipeline-maintenance

**Manual state housekeeping. Never scheduled, never auto-run.** Moves fully-decided approval files, terminal leads, and old run_log entries into archives, and migrates legacy `linkedin_raw` blobs out of `leads.json` into `state/raw/` sidecars. Everything is a move — nothing is ever deleted. `seen.json` is never touched.

## Arguments

- `days=30` — age threshold for sweeps (a) and (b). Default: 30.
- `sweeps=approvals,leads,runlog,raw` — which sweeps to run. Default: all four (the `raw` migration is idempotent — a no-op after its first run).
- `keep_runs=20` — how many recent runs stay in `run_log.json`. Default: 20.
- `dry_run=true` — report what WOULD move, write nothing. Default: false.

## What this does

0. **Guard:** refuse to run if the latest run_log entry is `status: "in_progress"`. Recommend a clean git tree so the sweep lands as a single reviewable commit.
1. **(a) Archive decided approval files** — move files in `state/pending_approvals/` older than `days` (by filename date) to `state/pending_approvals/archive/` when they are *fully decided*: no entry can still cause a future action.

   | File type | Fully decided when |
   |-----------|--------------------|
   | classification / legacy (`-hot/-warm/-cold/-connection`) | every entry has non-null `decision`, and every approved entry has non-null `note_draft` |
   | notes-ready | every `note_decision` non-null, and no approved entry's lead is still at `"classified"` |
   | followup | every `decision` non-null, and no approved entry's lead is still at `"followup_queued"` |
   | warmup-comments | every `decision` non-null, and approved comments already sent |
   | links | `hot`/`warm`/`cold` all empty, and every URL in `approved` appears in some notes-ready file |

2. **(b) Archive terminal leads** — move leads from `state/leads.json` to `state/archive/leads-archive.json` (same keyed shape; on key collision the newer entry wins) when `last_updated` is older than `days` AND status is exactly `"rejected"`, or `"followup_sent"` with `followup_sequence >= followup.max_sequence`. No other status is ever archived. `seen.json` is untouched — that is the dedupe guarantee.
3. **(c) Rotate run_log** — keep the most recent `keep_runs` entries in `state/run_log.json → runs`; append the older ones, in order, to `state/archive/run_log-archive.json`. Never rotate the most recent run or any `in_progress` entry. Preserve all other top-level keys.
4. **(d) linkedin_raw migration (one-time, idempotent)** — for every lead in `leads.json` with a `linkedin_raw` key: if the value is populated and `state/raw/<slug>.json` does not exist, write the sidecar; then remove the `linkedin_raw` key from the lead (populated or null). Slug rule per the `state/raw/` contract in CLAUDE.md: first path segment after `/in/` only, non-`[a-z0-9._-]` characters replaced with `_`. Re-running is a no-op.
5. **Report** — per sweep: items moved vs. eligible, and before/after byte sizes of `leads.json` and `run_log.json`. In dry-run, the same report with nothing written. (After a large sweep you may also want to run `git gc` yourself — this command never does.)

## Before running

- No LinkedIn CLI or email needed — this command touches only local state files.
- Run with `dry_run=true` first and read the report.
- Commit or stash unrelated changes so the maintenance diff stands alone.

## After running

Review `git status` / `git diff --stat`: expect renames into the two archive locations, a smaller `leads.json` and `run_log.json`, and (first run only) new gitignored files under `state/raw/`. `seen.json` must show no diff. Commit the sweep as one commit.

## Rate limit handling

No LinkedIn CLI calls are made in this command. If a JSON file fails to parse, stop the affected sweep, report it, and leave that file unmodified — never write a partial file.

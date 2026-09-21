import crypto from "node:crypto";
import { PATHS } from "./paths.mjs";
import { readJson, writeJsonAtomic } from "./fsjson.mjs";

const PHASE = "search-connections-abbreviated";
const SEARCH_PHASES = new Set(["search-connections", "search-connections-abbreviated"]);

export async function loadRunLog() {
  return readJson(PATHS.runLog, { runs: [], retries: [] });
}

export async function saveRunLog(runLog) {
  await writeJsonAtomic(PATHS.runLog, runLog);
}

function shortRunId() {
  const today = new Date().toISOString().slice(0, 10);
  const short = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${today}-${short}`;
}

// CLAUDE.md's `run_id` on a run_log entry is "<ISO-date>-<uuid4-short>", but the
// pending_approvals filename pattern `<date>-<run_id>-links.json` uses only the
// short suffix (e.g. "db349ebd") — using the full run_id there duplicates the date.
export function shortIdOf(runId) {
  return runId.split("-").pop();
}

// Step 0 — re-entry check. Returns { runLog, entry, isResume }.
// Throws with a user-facing message (caller exits) if a different-phase run is in_progress.
export async function reentryCheck(runLog) {
  const latest = runLog.runs[runLog.runs.length - 1];
  if (latest && latest.status === "in_progress") {
    if (latest.phase !== PHASE) {
      throw new Error(
        `The most recent run (${latest.run_id}) is in_progress under phase "${latest.phase}", not "${PHASE}".\n` +
          `Finish it with its own command, or mark it "abandoned" in state/run_log.json before starting a new ${PHASE} run.`
      );
    }
    console.warn(`Resuming in_progress run ${latest.run_id} from step ${latest.resume_from_step}.`);
    return { entry: latest, isResume: true };
  }

  const entry = {
    run_id: shortRunId(),
    started_at: new Date().toISOString(),
    status: "in_progress",
    phase: PHASE,
    engine: "standalone-cli",
    resume_from_step: 1,
    steps_completed: [],
    counts: {},
  };
  runLog.runs.push(entry);
  return { entry, isResume: false };
}

export function markStepComplete(entry, step) {
  if (!entry.steps_completed.includes(step)) entry.steps_completed.push(step);
  entry.resume_from_step = step + 1;
}

export function finalizeRun(entry, counts) {
  entry.status = "completed";
  entry.completed_at = new Date().toISOString();
  entry.counts = { ...entry.counts, ...counts };
}

// Step 1 staleness check (standalone CLI never refreshes — see /refresh-criteria).
// "Due" mirrors CLAUDE.md's own "run count mod N" rule, anchored to the criteria
// file's own generated_at rather than a global counter, so it stays meaningful
// regardless of whether refreshes happen via Step 1 or the dedicated command.
export function checkCriteriaStaleness(criteriaData, pipelineConfig, runLog) {
  const n = pipelineConfig?.criteria_refresh?.auto_refresh_every_n_runs;
  if (!n || !criteriaData.generated_at) return { due: false, runsSinceRefresh: 0 };

  const generatedAt = new Date(criteriaData.generated_at).getTime();
  const runsSinceRefresh = runLog.runs.filter(
    (r) => SEARCH_PHASES.has(r.phase) && r.started_at && new Date(r.started_at).getTime() > generatedAt
  ).length;

  // +1 to account for the run currently starting, matching Step 1's "the run count"
  // being checked before this run's own search happens.
  const due = (runsSinceRefresh + 1) % n === 0;
  return { due, runsSinceRefresh: runsSinceRefresh + 1 };
}

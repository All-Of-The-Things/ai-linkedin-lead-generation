import path from "node:path";
import { fileURLToPath } from "node:url";

// standalone/lib/paths.mjs -> repo root is two levels up (standalone/ -> repo root).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

export const PATHS = {
  pipelineConfig: path.join(REPO_ROOT, "config", "pipeline.json"),
  criteriaDir: path.join(REPO_ROOT, "config", "criteria"),
  leads: path.join(REPO_ROOT, "state", "leads.json"),
  seen: path.join(REPO_ROOT, "state", "seen.json"),
  runLog: path.join(REPO_ROOT, "state", "run_log.json"),
  connectionsCache: path.join(REPO_ROOT, "state", "connections_cache.json"),
  pendingApprovals: path.join(REPO_ROOT, "state", "pending_approvals"),
  approvedQueue: path.join(REPO_ROOT, "state", "pending_approvals", "approved-queue.json"),
  coldRegistry: path.join(REPO_ROOT, "state", "pending_approvals", "cold-registry.json"),
};

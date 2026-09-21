import path from "node:path";
import fs from "node:fs/promises";
import { PATHS, REPO_ROOT } from "./paths.mjs";
import { readJson, listDir } from "./fsjson.mjs";

export async function loadPipelineConfig() {
  const config = await readJson(PATHS.pipelineConfig, null);
  if (!config) {
    throw new Error(`config/pipeline.json not found at ${PATHS.pipelineConfig}`);
  }
  return config;
}

export function resolveProviderOrExit(pipelineConfig) {
  const active = pipelineConfig?.linkedin_provider?.active ?? "connectsafely";
  if (active !== "connectsafely") {
    console.error(
      `\nActive provider is "${active}" (config/pipeline.json → linkedin_provider.active), but this standalone ` +
        `CLI only implements the ConnectSafely REST client.\n` +
        `Either switch pipeline.json back to "connectsafely", or run the pipeline via Claude Code (which also ` +
        `supports the LinkedAPI CLI fallback through .claude/skills/linkedin/SKILL.md).\n`
    );
    process.exit(1);
  }
  return active;
}

async function listCriteriaFiles() {
  const files = (await listDir(PATHS.criteriaDir)).filter((f) => f.endsWith(".json"));
  const criteria = [];
  for (const file of files) {
    const full = path.join(PATHS.criteriaDir, file);
    const data = await readJson(full, null);
    if (data) criteria.push({ file: full, data });
  }
  return criteria;
}

// Mirrors CLAUDE.md → Criteria Selection: explicit override (name/label/description
// keyword match, case-insensitive) -> pipeline.json active_criteria -> hardcoded fallback.
export async function resolveCriteriaOrExit(overrideArg, pipelineConfig) {
  const all = await listCriteriaFiles();

  if (overrideArg) {
    const needle = overrideArg.toLowerCase();
    const matches = all.filter(({ data }) => {
      const haystack = [data.name, data.label, data.description].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle) || data.name?.toLowerCase() === needle;
    });
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) {
      console.error(`\nNo criteria file matched "${overrideArg}" in config/criteria/. Available: ${all.map((m) => m.data.name).join(", ")}\n`);
      process.exit(1);
    }
    console.error(
      `\n"${overrideArg}" matched ${matches.length} criteria files (${matches.map((m) => m.data.name).join(", ")}) — be more specific.\n`
    );
    process.exit(1);
  }

  const activeName = pipelineConfig.active_criteria || "agency-partners";
  const byName = all.find((m) => m.data.name === activeName);
  if (byName) return byName;

  const fallback = all.find((m) => m.data.name === "agency-partners");
  if (fallback) {
    console.warn(`\nWarning: active_criteria "${activeName}" not found in config/criteria/ — falling back to "agency-partners".\n`);
    return fallback;
  }

  throw new Error(`Neither "${activeName}" nor the hardcoded fallback "agency-partners" exist in config/criteria/.`);
}

export async function writeCriteriaFile(criteriaMeta, data) {
  await fs.writeFile(criteriaMeta.file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function loadConnectSafelyCredentials() {
  const apiKey = process.env.CONNECTSAFELY_API_KEY;
  const accountId = process.env.CONNECTSAFELY_ACCOUNT_ID; // optional
  if (!apiKey) {
    console.error(
      "\nCONNECTSAFELY_API_KEY is not set.\n\n" +
        "Obtain an API key from https://connectsafely.ai, then either:\n" +
        `  export CONNECTSAFELY_API_KEY=... [export CONNECTSAFELY_ACCOUNT_ID=...]\n` +
        `  — or —\n` +
        `  create ${path.join(REPO_ROOT, "standalone", ".env.local")} with:\n` +
        `    CONNECTSAFELY_API_KEY=...\n` +
        `    CONNECTSAFELY_ACCOUNT_ID=...   (optional)\n`
    );
    process.exit(1);
  }
  return { apiKey, accountId };
}

// Tiny KEY=VALUE .env loader — no dependency, only sets vars not already in process.env.
export async function loadDotEnvLocal() {
  const envPath = path.join(REPO_ROOT, "standalone", ".env.local");
  let raw;
  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

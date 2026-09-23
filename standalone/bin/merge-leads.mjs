#!/usr/bin/env node
// Batched upsert into state/leads.json — reads the 2.9MB+ ledger exactly once,
// merges a small delta map in memory, and writes it back exactly once via the
// same atomic write used elsewhere (loadLeads/writeLeads, standalone/lib/state.mjs).
//
// Why this exists: CLAUDE.md's Step 2/Step 4 previously implied a per-lead
// Read+Edit/Write round-trip on the whole leads.json file for every new lead or
// classification result — up to hundreds of full-file rewrites in a single run.
// This CLI is the shared, reusable fix: the LLM-driven pipeline writes a small
// delta file (only the leads that changed) and invokes this once per batch,
// instead of touching leads.json directly in a per-lead loop.
import { loadLeads, writeLeads, normalizeUrl } from "../lib/state.mjs";
import { readJson } from "../lib/fsjson.mjs";

function printHelp() {
  console.log(`
merge-leads — batched upsert into state/leads.json

Usage:
  node bin/merge-leads.mjs <path-to-delta.json>

<path-to-delta.json> is a JSON object: { "<url>": { ...fields }, ... }
For each entry:
  - If the URL is not yet in leads.json, it is inserted as-is (covers new
    search-result stubs).
  - If the URL already exists, the given fields are shallow-merged into the
    existing record (covers classification/enrichment write-backs). Existing
    fields not present in the delta are left untouched.

Reads leads.json once and writes it once, regardless of how many URLs are in
the delta. Prints a one-line JSON summary: {"inserted": N, "updated": M}.
`);
}

async function main() {
  const [deltaPath] = process.argv.slice(2);
  if (!deltaPath || deltaPath === "--help" || deltaPath === "-h") {
    printHelp();
    process.exit(deltaPath ? 0 : 1);
  }

  const delta = await readJson(deltaPath, null);
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) {
    console.error(`Expected ${deltaPath} to contain a JSON object of {"<url>": {...fields}}.`);
    process.exit(1);
  }

  const leads = await loadLeads();
  let inserted = 0;
  let updated = 0;

  for (const [rawUrl, fields] of Object.entries(delta)) {
    const url = normalizeUrl(rawUrl);
    if (leads[url]) {
      Object.assign(leads[url], fields);
      updated += 1;
    } else {
      leads[url] = { url, ...fields };
      inserted += 1;
    }
  }

  await writeLeads(leads);
  console.log(JSON.stringify({ inserted, updated }));
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});

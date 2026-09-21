#!/usr/bin/env node
// Offline regression check (no API calls, no credentials needed): runs the
// deterministic classifier.mjs against leads that were already classified by the
// LLM classifier (agents/lead-classifier.md) with enrichment disabled — the same
// input shape (headline/location only) this engine works from — and reports the
// agreement rate. See standalone/README.md "Verification" section.
import path from "node:path";
import { PATHS } from "../lib/paths.mjs";
import { readJson } from "../lib/fsjson.mjs";
import { classifyLead } from "../lib/classifier.mjs";
import { listDir } from "../lib/fsjson.mjs";

async function loadCriteriaByName() {
  const files = (await listDir(PATHS.criteriaDir)).filter((f) => f.endsWith(".json"));
  const byName = {};
  for (const file of files) {
    const data = await readJson(path.join(PATHS.criteriaDir, file), null);
    if (data?.name) byName[data.name] = data;
  }
  return byName;
}

async function main() {
  const leads = await readJson(PATHS.leads, {});
  const criteriaByName = await loadCriteriaByName();

  const comparable = Object.values(leads).filter(
    (l) => l.criteria && l.classification && typeof l.score === "number" && l.headline
  );

  if (comparable.length === 0) {
    console.log("No comparable leads found (need a `criteria` field, non-null classification/score, and a headline).");
    console.log("This field is only set on leads produced by /search-connections-abbreviated (Abbreviated Mode stubs).");
    return;
  }

  let agree = 0;
  let scoreDiffSum = 0;
  const disagreements = [];

  for (const lead of comparable) {
    const criteria = criteriaByName[lead.criteria];
    if (!criteria) continue;
    const result = classifyLead(lead, criteria);
    scoreDiffSum += Math.abs(result.score - lead.score);
    if (result.classification === lead.classification) {
      agree += 1;
    } else {
      disagreements.push({
        url: lead.url,
        headline: lead.headline,
        llm: `${lead.classification} (${lead.score})`,
        deterministic: `${result.classification} (${result.score})`,
        reason: result.score_rationale,
      });
    }
  }

  const n = comparable.length;
  console.log(`Compared ${n} previously-classified leads across ${Object.keys(criteriaByName).length} criteria files.`);
  console.log(`Classification agreement: ${agree}/${n} (${((agree / n) * 100).toFixed(1)}%)`);
  console.log(`Mean |score diff|: ${(scoreDiffSum / n).toFixed(1)}`);

  if (disagreements.length) {
    console.log(`\nSample disagreements (up to 15 of ${disagreements.length}):`);
    for (const d of disagreements.slice(0, 15)) {
      console.log(`- ${d.url}\n  headline: ${d.headline}\n  llm=${d.llm} vs deterministic=${d.deterministic}\n  reason: ${d.reason}`);
    }
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});

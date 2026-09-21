#!/usr/bin/env node
import {
  loadPipelineConfig,
  resolveProviderOrExit,
  resolveCriteriaOrExit,
  loadConnectSafelyCredentials,
  loadDotEnvLocal,
} from "../lib/config.mjs";
import { makeConnectSafelyClient, withRetry, ProviderError } from "../lib/connectsafely-client.mjs";
import { classifyLead } from "../lib/classifier.mjs";
import { loadSeen, addSeen, loadLeads, writeLeads, loadConnectionsCache, writeConnectionsCache, normalizeUrl } from "../lib/state.mjs";
import { loadRunLog, saveRunLog, reentryCheck, markStepComplete, finalizeRun, checkCriteriaStaleness, shortIdOf } from "../lib/runlog.mjs";
import { coldSweep, buildExclusionSet, writeLinksFile } from "../lib/approvals.mjs";
import { PATHS } from "../lib/paths.mjs";

function parseArgs(argv) {
  const args = { criteria: null, help: false };
  for (const raw of argv) {
    if (raw === "--help" || raw === "-h") args.help = true;
    else if (raw.startsWith("criteria=")) args.criteria = raw.slice("criteria=".length);
    else if (raw.startsWith("--criteria=")) args.criteria = raw.slice("--criteria=".length);
  }
  return args;
}

function printHelp() {
  console.log(`
search-connections-abbreviated — standalone (no-Claude) equivalent of /search-connections-abbreviated

Usage:
  node bin/search-connections-abbreviated.mjs [criteria=<name>]

Requires CONNECTSAFELY_API_KEY (and optionally CONNECTSAFELY_ACCOUNT_ID) in the
environment, or in standalone/.env.local. See standalone/README.md.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  await loadDotEnvLocal();
  const { apiKey, accountId } = loadConnectSafelyCredentials();
  const client = makeConnectSafelyClient({ apiKey, accountId });

  const pipelineConfig = await loadPipelineConfig();
  resolveProviderOrExit(pipelineConfig);

  const runLog = await loadRunLog();
  const { entry, isResume } = await reentryCheck(runLog).catch((err) => {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  });
  await saveRunLog(runLog);

  const criteriaMeta = await resolveCriteriaOrExit(args.criteria, pipelineConfig);
  const criteria = criteriaMeta.data;
  entry.criteria_used = criteria.name;
  entry.provider_used = "connectsafely";
  await saveRunLog(runLog);
  console.log(`Run ${entry.run_id} — criteria "${criteria.name}"${isResume ? " (resumed)" : ""}`);

  // Step 1 — staleness check only, never refresh (see /refresh-criteria).
  const staleness = checkCriteriaStaleness(criteria, pipelineConfig, runLog);
  if (staleness.due) {
    console.warn(
      `\n⚠ Criteria "${criteria.name}" is due for refresh (${staleness.runsSinceRefresh} runs since last refresh).\n` +
        `  Run '/refresh-criteria ${criteria.name}' in Claude Code. Continuing with the existing file for this run.\n`
    );
  }
  markStepComplete(entry, 1);
  await saveRunLog(runLog);

  // --- Step 2 — search, with cache/seen exclusion + hot-floor batch retry loop ---
  const rateLimitCfg = pipelineConfig.rate_limit || { max_retries: 2, retry_delay_seconds: 120 };
  const searchCfg = pipelineConfig.search || {
    max_results_per_run: 25,
    max_search_queries_per_run: 3,
    min_hot_leads_per_run: 5,
    max_search_batches_per_run: 4,
  };

  let exclusionSet;
  let cache = await loadConnectionsCache(pipelineConfig.connections_cache?.ttl_days ?? 7);
  if (cache) {
    exclusionSet = new Set(cache.urls.map(normalizeUrl));
    console.log(`Using cached connections list (${cache.urls.length} URLs, cached ${cache.cached_at}).`);
  } else {
    console.log("Connections cache missing/expired — calling list_connections 3x to rebuild...");
    const all = new Set();
    for (let i = 0; i < 3; i++) {
      const urls = await withRetry(() => client.listConnections({ maxResults: 3000 }), rateLimitCfg, "list_connections");
      urls.forEach((u) => all.add(u));
    }
    cache = await writeConnectionsCache(Array.from(all));
    exclusionSet = new Set(cache.urls);
    console.log(`Rebuilt connections cache: ${cache.connection_count} URLs.`);
  }

  const seen = await loadSeen();
  const leads = await loadLeads();
  const searchTerms = criteria.search_terms?.length ? criteria.search_terms : criteria.target_roles || [];
  if (searchTerms.length === 0) {
    console.error(`Criteria "${criteria.name}" has no search_terms or target_roles to query with.`);
    process.exit(1);
  }

  // Continue the rotation cursor from the last run of this phase, so repeat runs
  // don't always hit the same first N terms (CLAUDE.md Step 2: "Track the rotation
  // cursor in the current run_log entry").
  const priorEntry = [...runLog.runs].reverse().find((r) => r !== entry && r.search_cursor);
  let cursorIndex = priorEntry ? (priorEntry.search_cursor.next_index ?? 0) % searchTerms.length : 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  let newLeadCount = 0;
  let hotCountThisRun = 0;
  let batch = 1;
  entry.search_cursor = { batches_run: 0, max_batches: searchCfg.max_search_batches_per_run };

  while (batch <= searchCfg.max_search_batches_per_run) {
    const batchQueries = [];
    for (let i = 0; i < searchCfg.max_search_queries_per_run; i++) {
      batchQueries.push(searchTerms[cursorIndex % searchTerms.length]);
      cursorIndex += 1;
    }
    entry.search_cursor[`batch${batch}_queries`] = batchQueries;
    console.log(`Batch ${batch}: ${batchQueries.join(" | ")}`);

    const batchNewUrls = [];
    for (const keywords of batchQueries) {
      let result;
      try {
        result = await withRetry(
          () => client.searchPeople({ keywords, count: searchCfg.max_results_per_run }),
          rateLimitCfg,
          `search_people("${keywords}")`
        );
      } catch (err) {
        if (err instanceof ProviderError && err.category === "rate_limited") {
          entry.errors = entry.errors || [];
          entry.errors.push({ step: 2, query: keywords, error: "rate_limited", at: new Date().toISOString() });
          continue;
        }
        throw err;
      }

      for (const person of result.people) {
        const url = normalizeUrl(person.url);
        if (seen.has(url) || exclusionSet.has(url) || leads[url]) continue;
        await addSeen(seen, url);
        leads[url] = {
          url,
          status: "new",
          classification: null,
          score: null,
          name: person.name,
          headline: person.headline,
          location: person.location,
          run_id: entry.run_id,
          criteria: criteria.name,
          first_seen_run: todayStr,
          last_updated: new Date().toISOString(),
        };
        batchNewUrls.push(url);
        newLeadCount += 1;
      }
    }
    await writeLeads(leads);

    // Step 4 (incremental) — classify this batch's new leads only.
    for (const url of batchNewUrls) {
      const lead = leads[url];
      const { score, classification } = classifyLead(lead, criteria);
      lead.score = score;
      lead.classification = classification;
      lead.status = "classified";
      lead.last_updated = new Date().toISOString();
      if (classification === "hot") hotCountThisRun += 1;
    }
    await writeLeads(leads);

    entry.search_cursor.batches_run = batch;
    entry.search_cursor.next_index = cursorIndex;
    await saveRunLog(runLog);

    console.log(`  +${batchNewUrls.length} new leads this batch, ${hotCountThisRun} hot so far.`);
    if (hotCountThisRun >= searchCfg.min_hot_leads_per_run) break;
    batch += 1;
  }

  if (hotCountThisRun < searchCfg.min_hot_leads_per_run) {
    entry.search_cursor.hot_floor_shortfall = `${hotCountThisRun}/${searchCfg.min_hot_leads_per_run} hot after ${entry.search_cursor.batches_run} batches`;
    console.warn(`⚠ ${entry.search_cursor.hot_floor_shortfall}`);
  }
  markStepComplete(entry, 2);
  markStepComplete(entry, 4);
  await saveRunLog(runLog);

  // --- Step 5L — cold sweep, exclusion scan, write links file ---
  const sweep = await coldSweep(PATHS.pendingApprovals);
  console.log(`Cold sweep: moved ${sweep.swept} URLs into cold-registry.json (${sweep.registrySize} total).`);

  const exclusionAfterSweep = await buildExclusionSet(PATHS.pendingApprovals);
  const thisRunLeads = Object.values(leads).filter((l) => l.run_id === entry.run_id && l.status === "classified");

  const tiers = { hot: [], warm: [], cold: [] };
  const scoreByUrl = new Map();
  for (const lead of thisRunLeads) {
    if (exclusionAfterSweep.has(lead.url)) continue;
    tiers[lead.classification]?.push(lead.url);
    scoreByUrl.set(lead.url, lead.score ?? 0);
    lead.approval_surfaced_at = new Date().toISOString();
  }
  await writeLeads(leads);

  const filename = await writeLinksFile({
    pendingDir: PATHS.pendingApprovals,
    dateStr: todayStr,
    runId: shortIdOf(entry.run_id),
    leadsByTier: { ...tiers, scoreOf: (url) => scoreByUrl.get(url) },
  });
  markStepComplete(entry, 5);

  // --- Step 10 — finalize ---
  finalizeRun(entry, {
    new_leads: newLeadCount,
    classified: thisRunLeads.length,
    hot: tiers.hot.length,
    warm: tiers.warm.length,
    cold: tiers.cold.length,
    surfaced_for_approval: tiers.hot.length + tiers.warm.length + tiers.cold.length,
  });
  await saveRunLog(runLog);

  console.log(`\nDone. Wrote state/pending_approvals/${filename}`);
  console.log(`hot=${tiers.hot.length} warm=${tiers.warm.length} cold=${tiers.cold.length} (new_leads=${newLeadCount})`);
  console.log(`Next: review the links file, cut approved URLs into state/pending_approvals/approved-queue.json, then run /generate-messages in Claude Code.`);
}

main().catch((err) => {
  if (err instanceof ProviderError && err.category === "auth_error") {
    console.error(`\nauth_error: ${err.message}\nStop — check CONNECTSAFELY_API_KEY/CONNECTSAFELY_ACCOUNT_ID and retry.\n`);
    process.exit(1);
  }
  console.error(`\nFatal error: ${err.stack || err.message}\n`);
  process.exit(1);
});

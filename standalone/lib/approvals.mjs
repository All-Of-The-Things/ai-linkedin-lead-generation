import path from "node:path";
import { PATHS } from "./paths.mjs";
import { readJson, writeJsonAtomic, listDir } from "./fsjson.mjs";
import { normalizeUrl } from "./state.mjs";

export function slugify(url) {
  const afterIn = url.split("/in/")[1] || url;
  const slug = afterIn.split(/[/?#]/)[0];
  return slug.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
}

export function urlFromSlug(slug) {
  return `https://www.linkedin.com/in/${slug}`;
}

async function listLinksFiles(pendingDir) {
  const files = await listDir(pendingDir);
  return files.filter((f) => /-links\.json$/.test(f) && !f.startsWith("."));
}

async function listLegacyClassificationFiles(pendingDir) {
  const files = await listDir(pendingDir);
  return files.filter((f) => /-(hot|warm|cold|connection)\.json$/.test(f) && !f.startsWith("."));
}

// Step 5L Step 0 — Cold Sweep. Runs before anything else on every abbreviated run:
// every existing links file's `cold` array is slugified into cold-registry.json,
// then emptied in place. hot/warm/expired are left untouched.
export async function coldSweep(pendingDir) {
  const linksFiles = await listLinksFiles(pendingDir);
  const registry = new Set(await readJson(path.join(pendingDir, "cold-registry.json"), []));
  let swept = 0;

  for (const file of linksFiles) {
    const full = path.join(pendingDir, file);
    const data = await readJson(full, null);
    if (!data || !Array.isArray(data.cold) || data.cold.length === 0) continue;
    for (const url of data.cold) {
      registry.add(slugify(url));
    }
    swept += data.cold.length;
    data.cold = [];
    await writeJsonAtomic(full, data);
  }

  await writeJsonAtomic(path.join(pendingDir, "cold-registry.json"), Array.from(registry).sort());
  return { swept, registrySize: registry.size };
}

// Step 5L Step 1 (== Step 5 step 1) — build the set of URLs already surfaced across
// every approval-file shape currently in use.
export async function buildExclusionSet(pendingDir) {
  const exclusion = new Set();

  const linksFiles = await listLinksFiles(pendingDir);
  for (const file of linksFiles) {
    const data = await readJson(path.join(pendingDir, file), {});
    for (const tier of ["hot", "warm", "expired"]) {
      for (const url of data[tier] || []) exclusion.add(normalizeUrl(url));
    }
    // NOTE: `cold` is intentionally excluded here — coldSweep() already emptied it
    // into cold-registry.json by the time this runs, and any lead still cold in a
    // links file this call didn't touch is about to be re-swept anyway.
  }

  const legacyFiles = await listLegacyClassificationFiles(pendingDir);
  for (const file of legacyFiles) {
    const entries = await readJson(path.join(pendingDir, file), []);
    for (const entry of entries) {
      if (entry?.url) exclusion.add(normalizeUrl(entry.url));
    }
  }

  const approvedQueue = await readJson(PATHS.approvedQueue, []);
  for (const url of approvedQueue) exclusion.add(normalizeUrl(url));

  const coldRegistry = await readJson(PATHS.coldRegistry, []);
  for (const slug of coldRegistry) exclusion.add(normalizeUrl(urlFromSlug(slug)));

  return exclusion;
}

// Step 5L Step 3 — write the one links file for this run, hot/warm/cold sorted by
// score descending within each tier, no `approved` key.
export async function writeLinksFile({ pendingDir, dateStr, runId, leadsByTier }) {
  const sortDesc = (urls) => [...urls].sort((a, b) => (leadsByTier.scoreOf(b) ?? 0) - (leadsByTier.scoreOf(a) ?? 0));
  const payload = {
    hot: sortDesc(leadsByTier.hot),
    warm: sortDesc(leadsByTier.warm),
    cold: sortDesc(leadsByTier.cold),
  };
  const filename = `${dateStr}-${runId}-links.json`;
  await writeJsonAtomic(path.join(pendingDir, filename), payload);
  return filename;
}

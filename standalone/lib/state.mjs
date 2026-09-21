import { PATHS } from "./paths.mjs";
import { readJson, writeJsonAtomic } from "./fsjson.mjs";

export function normalizeUrl(url) {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

export async function loadSeen() {
  const arr = await readJson(PATHS.seen, []);
  return new Set(arr.map(normalizeUrl));
}

export async function addSeen(seenSet, url) {
  seenSet.add(normalizeUrl(url));
  await writeJsonAtomic(PATHS.seen, Array.from(seenSet).sort());
}

export async function loadLeads() {
  return readJson(PATHS.leads, {});
}

export async function writeLeads(leads) {
  await writeJsonAtomic(PATHS.leads, leads);
}

export async function loadConnectionsCache(ttlDays) {
  const cache = await readJson(PATHS.connectionsCache, null);
  if (!cache || !cache.cached_at) return null;
  const ageMs = Date.now() - new Date(cache.cached_at).getTime();
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
  if (ageMs > ttlMs) return null;
  return cache;
}

export async function writeConnectionsCache(urls) {
  const cache = {
    cached_at: new Date().toISOString(),
    connection_count: urls.length,
    urls: Array.from(new Set(urls.map(normalizeUrl))).sort(),
  };
  await writeJsonAtomic(PATHS.connectionsCache, cache);
  return cache;
}

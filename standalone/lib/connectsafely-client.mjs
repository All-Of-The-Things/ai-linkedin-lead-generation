import https from "node:https";

const BASE_HOST = "api.connectsafely.ai";

export class ProviderError extends Error {
  constructor(category, message, { status, retryAfterSeconds } = {}) {
    super(message);
    this.category = category; // auth_error | rate_limited | invalid_args | network_error
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// Node 16 (the version actually installed here) has no stable global fetch, so this
// wraps the `https` core module directly instead — keeps the client dependency-free.
function requestJson({ method, path: reqPath, body, apiKey, accountId }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify({ ...body, ...(accountId ? { accountId } : {}) }) : undefined;
    const req = https.request(
      {
        host: BASE_HOST,
        path: reqPath,
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
        timeout: 30_000,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            reject(new ProviderError("network_error", `Non-JSON response (status ${res.statusCode}): ${raw.slice(0, 200)}`));
            return;
          }

          if (res.statusCode === 401) {
            reject(new ProviderError("auth_error", parsed?.message || "Unauthorized - invalid ConnectSafely credentials", { status: 401 }));
            return;
          }
          if (res.statusCode === 429) {
            const resetHeader = res.headers["x-ratelimit-reset"];
            const retryAfterSeconds = resetHeader ? Math.max(0, Number(resetHeader) - Math.floor(Date.now() / 1000)) : undefined;
            reject(new ProviderError("rate_limited", "Rate limited by ConnectSafely", { status: 429, retryAfterSeconds }));
            return;
          }
          if (res.statusCode === 400) {
            reject(new ProviderError("invalid_args", parsed?.message || "Invalid arguments", { status: 400 }));
            return;
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new ProviderError("network_error", `HTTP ${res.statusCode}: ${parsed?.message || raw.slice(0, 200)}`, { status: res.statusCode }));
            return;
          }
          resolve(parsed);
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (err) => reject(new ProviderError("network_error", err.message)));
    if (payload) req.write(payload);
    req.end();
  });
}

export async function withRetry(fn, { maxRetries, retryDelaySeconds }, label) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof ProviderError) || err.category !== "rate_limited") throw err;
      attempt += 1;
      if (attempt > maxRetries) {
        console.warn(`  rate_limited on ${label} — exhausted ${maxRetries} retries, skipping.`);
        throw err;
      }
      const wait = err.retryAfterSeconds ?? retryDelaySeconds;
      console.warn(`  rate_limited on ${label} — waiting ${wait}s (retry ${attempt}/${maxRetries})...`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
}

// SKILL.md documents `profileId` on search results, but real responses have drifted
// from documented shapes before (see the connections-pagination note in state/
// connections_cache.json's history) — so this tries every plausible field rather
// than trusting `profileId` alone, and returns null (never a URL containing
// "undefined") when nothing usable is found. Set CS_DEBUG=1 to see the raw shape.
function derivePersonUrl(p) {
  if (typeof p.profileUrl === "string" && p.profileUrl.includes("/in/")) {
    const match = p.profileUrl.match(/\/in\/[^/?#]+/);
    if (match) return `https://www.linkedin.com${match[0]}`;
  }
  const slug = p.profileId || p.publicIdentifier || p.vanityName || p.publicId;
  if (typeof slug === "string" && slug.length > 0) {
    return `https://www.linkedin.com/in/${slug}`;
  }
  return null;
}

export function makeConnectSafelyClient({ apiKey, accountId }) {
  return {
    // .claude/skills/connectsafely/SKILL.md:36-55
    async searchPeople({ keywords, filters = {}, count = 25, start = 0 }) {
      const data = await requestJson({
        method: "POST",
        path: "/linkedin/search/people",
        body: { keywords, count, start, filters },
        apiKey,
        accountId,
      });
      const people = data?.people ?? data?.data?.people ?? [];

      if (process.env.CS_DEBUG && people.length) {
        console.error(`[CS_DEBUG] searchPeople raw first result:\n${JSON.stringify(people[0], null, 2)}`);
      }

      const mapped = [];
      let skipped = 0;
      for (const p of people) {
        const url = derivePersonUrl(p);
        if (!url) {
          skipped += 1;
          continue;
        }
        mapped.push({
          profileId: p.profileId ?? null,
          url,
          name: [p.firstName, p.lastName].filter(Boolean).join(" ") || null,
          headline: p.headline ?? null,
          location: typeof p.location === "string" ? p.location : null,
          connectionDegree: p.connectionDegree ?? null,
        });
      }
      if (skipped) {
        console.warn(
          `  skipped ${skipped}/${people.length} search result(s) with no derivable profile URL ` +
            `(re-run with CS_DEBUG=1 to inspect the raw response shape).`
        );
      }

      return {
        people: mapped,
        hasMore: Boolean(data?.pagination?.hasMore ?? data?.data?.pagination?.hasMore),
        total: data?.pagination?.total ?? data?.data?.pagination?.total ?? people.length,
      };
    },

    // .claude/skills/connectsafely/SKILL.md:57-62
    // Note: state/connections_cache.json's own history records the live API paginating
    // in small pages (observed 12/call via the MCP tool) regardless of the `limit`
    // requested — this loop keeps paging until an empty/short page comes back rather
    // than trusting a single large `limit` to be honored.
    async listConnections({ maxResults = 3000 } = {}) {
      const urls = new Set();
      let startIndex = 0;
      const pageSize = 200;
      for (;;) {
        const data = await requestJson({
          method: "GET",
          path: `/linkedin/connections?startIndex=${startIndex}&limit=${pageSize}`,
          apiKey,
          accountId,
        });
        const page = data?.connections ?? data?.data?.connections ?? data?.data ?? [];
        if (!Array.isArray(page) || page.length === 0) break;
        if (process.env.CS_DEBUG && startIndex === 0 && page.length) {
          console.error(`[CS_DEBUG] listConnections raw first result:\n${JSON.stringify(page[0], null, 2)}`);
        }
        let pageSkipped = 0;
        for (const c of page) {
          const profileId = c.profileId ?? c.vanityName ?? c.publicIdentifier ?? c.publicId;
          if (profileId) urls.add(`https://www.linkedin.com/in/${profileId}`.toLowerCase());
          else pageSkipped += 1;
        }
        if (pageSkipped) {
          console.warn(`  skipped ${pageSkipped}/${page.length} connection(s) with no derivable profile id.`);
        }
        startIndex += page.length;
        if (page.length < pageSize || urls.size >= maxResults) break;
      }
      return Array.from(urls);
    },
  };
}

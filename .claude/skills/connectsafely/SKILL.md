---
name: connectsafely
description: Default LinkedIn automation provider for this pipeline – fetch profiles, search people, manage connections, send messages, react to and comment on posts, via the ConnectSafely API/MCP server. Use when the resolved LinkedIn provider (config/pipeline.json → linkedin_provider.active) is "connectsafely".
---

# ConnectSafely Skill (default provider)

ConnectSafely automates LinkedIn on behalf of a single connected LinkedIn account. This is the **default** provider for `CLAUDE.md`'s abstract operations table. See `CLAUDE.md → LinkedIn Provider` for the operation → call mapping and how the active provider is resolved. For the fallback provider, see `.claude/skills/linkedin/SKILL.md` (LinkedAPI).

## Calling convention

1. **Use the claude.ai ConnectSafely.AI connector** — an account-level MCP connector (tool prefix `mcp__claude_ai_ConnectSafely_AI__*`), connected via claude.ai's own connector settings, not any file in this repo. Check `ToolSearch` for `claude_ai_ConnectSafely_AI` to confirm it's loaded, then call the tool that matches the operation you need — tool names come from the live server, do not assume names not seen in a real tool listing.
   - This repo previously also registered a project-level `connectsafely` MCP server in `.mcp.json` (authenticated via `CONNECTSAFELY_API_KEY`/`CONNECTSAFELY_ACCOUNT_ID`). That registration was removed 2026-08-27 after its credentials went stale and stayed unauthorized for weeks (`401 Unauthorized - Invalid credentials`) while the claude.ai connector kept working — see `state/run_log.json` history around 2026-08-11 onward. Do not re-add a `mcp__connectsafely__*`-prefixed tool call; if you see one offered, it's not this skill's intended path.
2. Every request may include `accountId` explicitly (see each tool's schema); if omitted, the connector uses the most recently used account.

## Operations

### Fetch a profile

```
POST /linkedin/profile
{
  "profileId": "<vanity-slug>",
  "includeExperience": true,
  "includeEducation": false,
  "includeSkills": false,
  "includeGeoLocation": false,
  "includeContact": false,
  "forceRefresh": false
}
```
- `profileId` is the LinkedIn `/in/<slug>` handle (no full URL). Responses are cached server-side for 6 hours unless `forceRefresh: true`.
- Response: `profile.firstName`, `profile.lastName`, `profile.headline`, `profile.location` (`{countryCode, postalCode}`), `profile.connectionCount`, `profile.isConnected`, `profile.connectionDegree`, plus top-level `experience[]` / `education[]` / `skills[]` arrays when requested.
- Rate limit: **120 unique profiles/day** per account (cached hits don't count).

### Search people

```
POST /linkedin/search/people
{
  "keywords": "<free text>",
  "count": 25,
  "start": 0,
  "filters": {
    "title": "<role>",
    "industry": ["<industry>"],
    "currentCompanyIds": ["<id>"],
    "pastCompanyIds": ["<id>"],
    "locationId": "<geo id>",
    "connectionDegree": ["2", "3"]
  }
}
```
- **Location caveat:** `filters.locationId`/`geoUrn` expects a *resolved* geo ID, not a free-text city string (unlike LinkedAPI's `--locations "San Francisco"`). Resolve via `POST /linkedin/search/geo` first, or — until that resolution flow is validated live — fold the location into the top-level `keywords` string instead of `filters.locationId`.
- Response: `people[]` (each with `profileId`, `profileUrn`, `firstName`, `lastName`, `headline`, `location` as a plain string, `connectionDegree`, `currentPosition`, `profileUrl`), plus `pagination.total` / `hasMore`.

### List connections

```
GET /linkedin/connections?startIndex=0&limit=200
```
- Response: connections with name, headline, vanity name (`profileId`), connected date. Build the canonical URL as `https://www.linkedin.com/in/<profileId>` for exclusion-set/dedupe comparisons.

### Check connection/relationship status

```
GET /linkedin/relationship/<profileId>
```
- Response: `{ connected, invitationSent, invitationReceived, status, profileUrn }` — booleans, not a single enum.
- Pipeline equivalent of `already_connected`: `connected === true || invitationSent === true`.

### Send a connection request

```
POST /linkedin/connect
{
  "profileId": "<slug>",
  "customMessage": "<note, max 300 chars>"
}
```
- **300-character cap** on `customMessage` — tighter than LinkedAPI's ~connection-note headroom. Composed notes must be checked/truncated to fit before sending.
- Rate limit: **90 connection requests/week**, resets Monday 00:00 UTC. Exceeding it triggers a 24h hold.

### Send a message / get a conversation

```
POST /linkedin/messaging/send
{ "recipientProfileId": "<slug>", "message": "<text>" }

GET /linkedin/messaging/recent-messages
GET /linkedin/messaging/conversation-details?profileId=<slug>
```
- Rate limit: **150 messages/day**.

### React to / comment on a post

```
POST /linkedin/posts/react
{ "postUrl": "<url>", "reactionType": "LIKE" }

POST /linkedin/posts/comment
{ "postUrl": "<url>", "comment": "<text>" }
```
- `reactionType` enum: `LIKE`, `PRAISE`, `APPRECIATION`, `EMPATHY`, `INTEREST`, `ENTERTAINMENT` — map from the pipeline's LinkedAPI-flavored reaction words: like→LIKE, love→APPRECIATION, support→PRAISE, celebrate→PRAISE, insightful→INTEREST, funny→ENTERTAINMENT.
- Rate limits: **100 comments/day**, **100 follow/unfollow/day**.

## Field normalization (leads.json contract)

Regardless of provider, `state/leads.json` always stores `name`, `headline`, `location`, `industry`, `current_title`, `current_company`, keyed by a normalized `https://www.linkedin.com/in/<slug>` URL. When the active provider is ConnectSafely:

| leads.json field | Derived from |
|---|---|
| `name` | `profile.firstName + " " + profile.lastName` |
| `current_title` / `current_company` | `experience[0]` (most recent entry), only when `includeExperience: true` was requested |
| `location` | prefer the plain-string `location` from search results; only fall back to `profile.location.countryCode` from profile fetch if search didn't supply one |
| lead key / canonical URL | `https://www.linkedin.com/in/<profileId>` (lowercased, no trailing slash) — `profileId` is exactly the slug already used for `state/raw/<slug>.json` |

## Error normalization

| Normalized category | ConnectSafely signal |
|---|---|
| `auth_error` | HTTP 401, or `{"success": false}` with an auth-related message |
| `rate_limited` | HTTP 429; check `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers |
| `invalid_args` | HTTP 400 |
| `network_error` | request timeout / connection failure |
| `subscription_required`, async `workflow timeout` | no ConnectSafely equivalent — these are LinkedAPI-only concepts (see `CLAUDE.md → LinkedIn Provider`) |

On `rate_limited`: wait until `X-RateLimit-Reset` (or `rate_limit.retry_delay_seconds` from `config/pipeline.json` if the header is absent), retry up to `rate_limit.max_retries`, then log and skip per `CLAUDE.md`'s Rate Limit Handling section — same behavior contract as the LinkedAPI provider, just a different concrete signal.

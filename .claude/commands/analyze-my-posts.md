# /analyze-my-posts

Fetch and rank my LinkedIn posts by engagement, then generate new post ideas based on top performers.

## Configuration

- **Profile slug:** `martinalejandromartinez`
- **API:** ConnectSafely (`CONNECTSAFELY_API_KEY` in `.claude/settings.local.json`)
- **Base URL:** `https://api.connectsafely.ai`
- **Posts per run:** 20 (API max)

## Steps

### Step 1 — Fetch posts

```bash
curl -s -X POST https://api.connectsafely.ai/linkedin/posts/latest \
  -H "Authorization: Bearer $CONNECTSAFELY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"profileId": "martinalejandromartinez", "count": 20, "includeReposts": false}'
```

Parse `data.posts[]`. Each post contains: `url`, `activityUrn`, `content`, `numLikes`, `numComments`, `numShares`, `timestamp`, `isRepost`, `isArticle`.

On rate limit (HTTP 429): wait 30 seconds, retry once.

### Step 2 — Merge with impression data (if provided)

If the user provides impression data in their message (format: `impressions: <N>: <url>`), extract the `activityUrn` from each URL and match it against the fetched posts. Add an `impressions` column to the table.

If no impression data is provided, note: *"Impression data not provided. Fetch from LinkedIn Creator Analytics → Me → Content → Top posts (last 28 days) and re-run with the list."*

### Step 3 — Build the ranked table

Sort by impressions descending (if available), then by engagement score (`numLikes + numComments + numShares`) for posts without impression data. Calculate engagement rate (`engagement / impressions * 100`) where both values are known.

Output the full table in this format:

```
| # | Hook (first ~80 chars) | Impressions | Likes | Comments | Shares | Eng. | Eng. Rate |
```

For posts without impression data, use `too recent` (< 3 days old) or `< [min impressions]` (not in top list).

### Step 4 — Extract patterns

Identify the top 5 posts by impressions (or engagement if no impressions). For each, note:
- Topic / domain (Shopify, NetSuite, B2B, SDD, product announcement)
- Format (narrative, list, story, announcement)
- Hook style (contrarian, reframe, question, descriptive)
- Whether it received comments (yes/no)

Summarize: what topics and hook styles drove the most impressions and highest engagement rate.

Flag any duplicate topics (same subject posted 2+ times in the window) — these are splitting impressions.

### Step 5 — Generate post ideas

Propose 5–7 new post ideas based on the top performers. Each idea must include:
- **Hook:** Opening line (contrarian or reframe preferred)
- **Format:** narrative / list / story
- **Key points:** 3–4 bullet points to cover
- **Tags:** Relevant hashtags
- **Rationale:** One sentence explaining which data point justifies this idea

Apply these rules:
- No repeat of a topic already posted in the current window
- No product/tool announcement framing in the hook
- No framework or taxonomy posts (unless anchored in a specific client scenario)
- Prioritize topics that generated comments in previous runs

### Step 6 — Save output

Write the results to `content/post-ideas/<YYYY-MM-DD>.md` using today's date. If a file for today already exists, append `-2`, `-3`, etc.

The file must contain:
1. Account snapshot (followers, post views last 7 days, search appearances)
2. Full ranked table (all posts with available data)
3. Key insights (patterns, duplication flags, engagement rate analysis)
4. Post ideas (Step 5 output)
5. Impression data limitation note

## Note on Impressions

Per-post impression counts **cannot be retrieved via API** — not through ConnectSafely and not through the `linkedin` CLI (`selfProfileNotAllowed` on own profile). They are only available in the LinkedIn Creator Analytics UI.

To include impressions in the analysis:
1. Go to linkedin.com → Me → Creator Analytics → Content → Top posts (28-day view)
2. Copy each post's impression count and URL
3. Pass them in your message in this format:
   ```
   - 1280: https://www.linkedin.com/feed/update/urn:li:activity:...
   - 675: https://www.linkedin.com/feed/update/urn:li:activity:...
   ```

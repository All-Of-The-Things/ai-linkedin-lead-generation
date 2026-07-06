# AOTT LinkedIn Lead Generation Pipeline

Automated LinkedIn outreach pipeline for AOTT. Searches for leads daily, surfaces them for approval, drafts and reviews connection notes before sending, then follows up — with email notifications and human approval gates between each phase.

---

## How it works

```
[Phase 1 — Search]  /search-connections  (or runs automatically daily at 9am weekdays)
  Searches LinkedIn using your active criteria, classifies leads
  as hot / warm / cold from search-result headlines, and surfaces
  them for review. Profile enrichment is off by default (see config).
  → Sends email: "N leads ready for your review"

  You: open state/pending_approvals/YYYY-MM-DD-<run_id>-hot.json
       set decision: "approved" or "rejected" for each lead

[Phase 2 — Draft]  /generate-messages
  Fetches full profiles, composes a personalized connection note for
  each approved lead, and consolidates drafts into a notes-ready file.
  → Sends email: "N connection notes ready for your review"

  You: open state/pending_approvals/YYYY-MM-DD-notes-ready.json
       review note_draft for each entry
       optionally fill edited_note to override the draft
       set note_decision: "approved" or "rejected"

[Phase 3 — Send]  /send-connections
  Sends approved connection notes via LinkedIn, detects accepted
  connections, and drafts personalized follow-up messages.
  → Sends email: "N follow-up drafts ready" (or "N requests sent")

  You: open state/pending_approvals/YYYY-MM-DD-followup.json
       review each followup_draft, optionally fill edited_message
       set decision: "approved" or "rejected"

[Phase 4 — Deliver]  /deliver-messages
  Sends approved follow-up messages via LinkedIn.
  → Sends email: delivery summary
```

---

## Prerequisites

- [Claude Code CLI](https://claude.ai/code) — runs the pipeline
- [LinkedAPI account](https://app.linkedapi.io) — LinkedIn automation
- [Resend account](https://resend.com) — email notifications
- Node.js (for the LinkedAPI CLI)

---

## Setup

### 1. Install the LinkedIn CLI

```bash
npm install -g @linkedapi/linkedin-cli
```

### 2. Authenticate LinkedIn

Get your tokens from [app.linkedapi.io](https://app.linkedapi.io) → Settings → API Tokens.

```bash
linkedin setup \
  --linked-api-token=YOUR_LINKED_API_TOKEN \
  --identification-token=YOUR_IDENTIFICATION_TOKEN
```

### 3. Set your Resend API key

Get your API key from [resend.com/api-keys](https://resend.com/api-keys).

Open `.claude/settings.local.json` (gitignored — never committed) and paste your key:

```json
{
  "env": {
    "RESEND_API_KEY": "re_your_key_here"
  }
}
```

Restart Claude Code after saving.

### 4. Configure your sending domain

Open `config/pipeline.json` and update the `notifications.from` field to a domain you have verified in Resend:

```json
"notifications": {
  "from": "AOTT Pipeline <pipeline@yourdomain.com>",
  "to": "martin@allofthethings.dev",
  "subject_prefix": "[AOTT LinkedIn]"
}
```

### 5. Register the daily search routine

In a Claude Code session in this repo, run:

```
/schedule
```

Then describe: *"Run the LinkedIn daily search every weekday at 9am."*

> **Note:** Claude Code routines expire after 7 days. Re-register weekly or check the run log for the expiry reminder.

---

## Running the pipeline manually

### Phase 1 — Search

```
/search-connections
```

Or specify a criteria:

```
/search-connections criteria=retail-brands
```

### Phase 2 — Draft connection notes

```
/generate-messages
```

### Phase 3 — Send connection requests

```
/send-connections
```

### Phase 4 — Deliver follow-up messages

```
/deliver-messages
```

---

## Criteria

Search criteria live in `config/criteria/`. Each file is a self-contained search profile.

| File | Label | Target |
|------|-------|--------|
| `agency-netsuite.json` | NetSuite & ERP Agency Partners | Decision-makers at NetSuite SIs, Oracle partners, and ERP implementation agencies whose clients need eCommerce alongside their NS deployment |
| `agency-shopify.json` | Shopify Agency Partners | Decision-makers at Shopify Plus agencies, eCommerce consultancies, and digital commerce implementation firms — capacity overflow and SuiteCommerce cross-sell |
| `agency-partners.json` | Agency & SI Partners | Broad agency/SI criteria covering both NetSuite and Shopify Plus agencies *(legacy default — prefer the two above for new runs)* |
| `retail-brands.json` | Retail & eCommerce Brands | VP/Director/Head of eCommerce, Digital, and Merchandising leaders at retail and consumer brand companies |
| `mvp-factory.json` | MVP Factory — Founders & Product Builders | Founders building commercial products + ops leaders with repeating manual processes who need an internal tool |
| `netsuite-latam.json` | NetSuite Latam Agencies | Decision-makers at NetSuite implementation agencies and Oracle partners in Latin America |
| `suiteworld-2026.json` | SuiteWorld 2026 — NetSuite Community | Two segments: NetSuite SIs/partners ahead of SuiteWorld 2026, and end-user brands running NetSuite |

**Switch the default** — edit `config/pipeline.json`:

```json
"active_criteria": "agency-netsuite"
```

**Override per-run** — pass the criteria name when triggering:

```
/search-connections criteria=agency-shopify
```

**Add a new criteria** — create `config/criteria/<name>.json` following the schema in any existing criteria file (must include `name`, `label`, `description` at the top). The pipeline picks it up automatically.

---

## Approval workflow

Approval files live in `state/pending_approvals/` — one timestamped file per run, never overwritten.

**Gate 1 — Lead approval** (after Phase 1, files: `YYYY-MM-DD-<run_id>-hot.json`, `-warm.json`, `-cold.json`):

```json
{
  "url": "https://www.linkedin.com/in/example",
  "name": "Jane Doe",
  "headline": "CEO at NetSuite Partner Inc.",
  "classification": "hot",
  "score": 88,
  "score_rationale": "...",
  "enriched": false,
  "decision": null,
  "note": null
}
```

Set `decision` to `"approved"` or `"rejected"` on each entry. Start with the `-hot.json` file. Then run `/generate-messages`.

> `enriched: false` means the entry was classified from the headline only (enrichment disabled). Validate the lead manually before approving.

**Gate 2 — Note approval** (after Phase 2, file: `YYYY-MM-DD-notes-ready.json`):

```json
{
  "url": "...",
  "name": "Jane Doe",
  "headline": "...",
  "note_draft": "Hi Jane. When NetSuite clients...",
  "edited_note": null,
  "note_decision": null
}
```

Review `note_draft`. Optionally fill `edited_note` to override it. Set `note_decision` to `"approved"` or `"rejected"`. Entries left null auto-reject after 3 days. Then run `/send-connections`.

**Gate 3 — Follow-up approval** (after Phase 3, file: `YYYY-MM-DD-followup.json`):

```json
{
  "url": "...",
  "name": "Jane Doe",
  "followup_sequence": 0,
  "followup_draft": "Hey Jane, great to connect...",
  "decision": null,
  "edited_message": null
}
```

Set `decision` to `"approved"` or `"rejected"`. Fill `edited_message` to override the draft. Then run `/deliver-messages`.

---

## State files

| File / Directory | Purpose |
|-----------------|---------|
| `state/leads.json` | Master lead ledger — every lead ever discovered, keyed by LinkedIn URL |
| `state/seen.json` | Deduplication index — append-only, prevents re-discovering the same person |
| `state/pending_approvals/` | Approval files — one timestamped set per run, never overwritten |
| `state/connections_cache.json` | Cached connection list (refreshed every 7 days) — used to exclude existing connections from search results |
| `state/run_log.json` | Audit log of every pipeline run with counts, criteria used, and email delivery status |

> `state/` is gitignored — it contains personal LinkedIn data and is never committed.

---

## Configuration reference

All pipeline behaviour is controlled by `config/pipeline.json`:

| Key | Default | Description |
|-----|---------|-------------|
| `active_criteria` | `"agency-partners"` | Default criteria file to use |
| `enrichment.enabled` | `false` | When `false`, skips `linkedin person fetch` calls in Phase 1 — leads are classified from headline only. Set to `true` to enrich before classifying (slower, requires more API calls). |
| `search.max_results_per_run` | `25` | Max leads fetched per search query |
| `search.max_search_queries_per_run` | `3` | How many search query combinations to run per Phase 1 run |
| `outreach.max_connection_requests_per_run` | `10` | Max connection requests sent per Phase 3 run |
| `followup.delay_days_min` | `2` | Minimum days after connection accepted before follow-up |
| `followup.delay_days_max` | `4` | Maximum days (randomly chosen in range) |
| `followup.max_sequence` | `2` | Total follow-up messages per lead (1 = meeting ask, 2 = resource/insight) |
| `followup.max_followups_per_run` | `5` | Max messages sent per Phase 4 run |
| `approval.approval_timeout_days` | `3` | Days before a null-decision lead is auto-rejected |
| `connections_cache.ttl_days` | `7` | How many days before the connection list cache is rebuilt |
| `review.split_by_classification` | `true` | Whether approval files are split into separate hot/warm/cold files |
| `review.email_suppress_cold` | `true` | Whether cold leads are omitted from the notification email |
| `rate_limit.retry_delay_seconds` | `120` | Seconds to wait after a LinkedIn rate limit (exit code 6) |
| `rate_limit.max_retries` | `2` | Max retries per operation before skipping |

---

## Known constraints

- **LinkedIn rate limits** — operations take 30s–several minutes each. The pipeline degrades gracefully: rate-limited operations are skipped and retried on the next run.
- **Connection detection** — accepted connections are detected by polling (no webhook). Up to 24h lag is expected at daily cadence.
- **Routine expiry** — Claude Code scheduled routines expire after 7 days. Re-register via `/schedule`.

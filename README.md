# AOTT LinkedIn Lead Generation Pipeline

Automated LinkedIn outreach pipeline for AOTT. Searches for leads daily, surfaces them for approval, and sends personalized connection requests and follow-up messages — with email notifications between each step.

---

## How it works

```
[Phase 1 — Search]  Runs daily at 9am weekdays (scheduled routine)
  Searches LinkedIn using your active criteria, enriches profiles,
  classifies leads as hot / warm / cold, and surfaces them for review.
  → Sends email: "N leads ready for your review"

  You: open state/pending_approvals.json → connection_approvals
       set decision: "approved" or "rejected" for each lead

[Phase 2 — Generate]  Run /generate-messages
  Sends connection requests to approved leads, detects accepted
  connections, and drafts personalized follow-up messages.
  → Sends email: "N messages ready for your review"

  You: open state/pending_approvals.json → followup_approvals
       review each followup_draft, optionally fill edited_message
       set decision: "approved" or "rejected"

[Phase 3 — Deliver]  Run /deliver-messages
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
Run the LinkedIn daily search pipeline manually
```

Or specify a criteria:

```
Run the LinkedIn daily search with retail-brands criteria
```

### Phase 2 — Generate messages

```
/generate-messages
```

### Phase 3 — Deliver messages

```
/deliver-messages
```

---

## Criteria

Search criteria live in `config/criteria/`. Each file is a self-contained search profile.

| File | Target |
|------|--------|
| `agency-partners.json` | Decision-makers at NetSuite SIs, Oracle partners, Shopify Plus agencies *(default)* |
| `retail-brands.json` | VP/Director/Head of eCommerce at retail and consumer brand companies |

**Switch the default** — edit `config/pipeline.json`:

```json
"active_criteria": "retail-brands"
```

**Override per-run** — just say it when triggering:

```
Run the search with retail-brands criteria
```

**Add a new criteria** — create `config/criteria/<name>.json` following the schema in any existing criteria file (must include `name`, `label`, `description` at the top). The pipeline picks it up automatically.

---

## Approval workflow

Both approval queues live in `state/pending_approvals.json`.

**Connection approvals** (`connection_approvals` array):

```json
{
  "url": "https://www.linkedin.com/in/example",
  "name": "Jane Doe",
  "headline": "CEO at NetSuite Partner Inc.",
  "classification": "hot",
  "score": 88,
  "score_rationale": "...",
  "decision": null
}
```

Set `decision` to `"approved"` or `"rejected"`. Leave `null` to decide later (auto-rejected after 3 days).

**Follow-up approvals** (`followup_approvals` array):

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

Set `decision` to `"approved"` or `"rejected"`. Fill `edited_message` to override the draft before approving.

---

## State files

| File | Purpose |
|------|---------|
| `state/leads.json` | Master lead ledger — every lead ever discovered, keyed by LinkedIn URL |
| `state/seen.json` | Deduplication index — append-only, prevents re-discovering the same person |
| `state/pending_approvals.json` | Your daily review file — fill in `decision` fields here |
| `state/run_log.json` | Audit log of every pipeline run with counts and email delivery status |

> `state/` is gitignored — it contains personal LinkedIn data and is never committed.

---

## Configuration reference

All pipeline behaviour is controlled by `config/pipeline.json`:

| Key | Default | Description |
|-----|---------|-------------|
| `active_criteria` | `"agency-partners"` | Default criteria file to use |
| `search.max_results_per_run` | `25` | Max leads fetched per search run |
| `search.max_search_queries_per_run` | `3` | How many criteria combinations to rotate through |
| `outreach.max_connection_requests_per_run` | `10` | Max connection requests sent per Phase 2 run |
| `followup.delay_days_min` | `2` | Minimum days after connection accepted before follow-up |
| `followup.delay_days_max` | `4` | Maximum days (randomly chosen in range) |
| `followup.max_sequence` | `2` | Total follow-up messages per lead (1 = meeting ask, 2 = resource/insight) |
| `followup.max_followups_per_run` | `5` | Max messages sent per Phase 3 run |
| `approval.approval_timeout_days` | `3` | Days before a null-decision lead is auto-rejected |
| `rate_limit.retry_delay_seconds` | `120` | Seconds to wait after LinkedIn rate limit (exit code 6) |
| `rate_limit.max_retries` | `2` | Max retries per operation before skipping |

---

## Known constraints

- **LinkedIn rate limits** — operations take 30s–several minutes each. The pipeline degrades gracefully: rate-limited operations are skipped and retried on the next run.
- **Connection detection** — accepted connections are detected by polling (no webhook). Up to 24h lag is expected at daily cadence.
- **Routine expiry** — Claude Code scheduled routines expire after 7 days. Re-register via `/schedule`.

---
name: linkedin
description: General-purpose LinkedIn automation – fetch profiles, search people and companies, send messages, manage connections, create posts, and more. Use when the user wants to interact with LinkedIn.
---

# LinkedIn Skill

You have access to LinkedIn via the **`linkedapi` MCP server**. Use MCP tool calls (not CLI commands) for all LinkedIn operations. Each tool call routes through LinkedAPI's cloud browser automation — expect 30 seconds to several minutes per operation.

## Authentication

Tokens are configured in `.claude/settings.local.json` under `env`:

```json
{
  "env": {
    "LINKED_API_TOKEN": "<from app.linkedapi.io>",
    "IDENTIFICATION_TOKEN": "<from app.linkedapi.io>"
  }
}
```

If a tool returns an authentication error, stop immediately and ask the user to add their tokens to `.claude/settings.local.json` and restart Claude Code.

## Error Handling

Tools return structured results. Check for errors in the response:

| Error type | Meaning | Action |
|---|---|---|
| Auth / token error | Missing or invalid tokens | Stop. Ask user to check tokens in `settings.local.json`. |
| Rate limited | Too many requests | Wait `rate_limit.retry_delay_seconds`, retry up to `rate_limit.max_retries` times. If still failing, skip this item and continue. |
| Subscription required | Feature needs higher plan | Log and skip the failing operation. |
| Timeout / workflow | Long-running operation returned a `workflowId` | Call `get_workflow_status` with `wait: true`. |
| Network error | Transient failure | Retry once after a short pause. |

**Never abort an entire pipeline run due to a single tool failure.** Log the error to the run's `errors` array and continue.

## Tools

### Search People

```
search_people
  term?: string
  position?: string
  locations?: string        # comma-separated
  industries?: string       # comma-separated
  currentCompanies?: string # comma-separated
  previousCompanies?: string
  schools?: string
  firstName?: string
  lastName?: string
  limit?: number
```

### Fetch a Person Profile

```
fetch_person
  url: string               # linkedin.com/in/... URL
  experience?: boolean
  education?: boolean
  skills?: boolean
  languages?: boolean
  posts?: boolean
  postsLimit?: number
  comments?: boolean
  reactions?: boolean
```

Only request optional data when needed — each flag increases execution time.

### List Connections

```
retrieve_connections
  limit?: number
  since?: string            # ISO timestamp
  position?: string
  locations?: string
  industries?: string
  currentCompanies?: string
  previousCompanies?: string
  firstName?: string
  lastName?: string
```

### Check Connection Status

```
check_connection_status
  url: string
```

### Send Connection Request

```
send_connection_request
  url: string
  note?: string             # up to 300 characters
```

### Send a Message

```
send_message
  url: string               # person's linkedin.com/in/... URL
  message: string           # up to 1900 characters
```

### Get Conversation

```
get_conversation
  url: string
  since?: string            # ISO timestamp
```

### Fetch a Company

```
fetch_company
  url: string               # linkedin.com/company/... URL
  employees?: boolean
  decisionMakers?: boolean
  posts?: boolean
  employeesLimit?: number
  employeesPosition?: string
  employeesLocations?: string
```

### Search Companies

```
search_companies
  term?: string
  sizes?: string            # comma-separated: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"
  locations?: string
  industries?: string
  limit?: number
```

### Withdraw Connection Request

```
withdraw_connection_request
  url: string
```

### Sales Navigator — Search People

```
nv_search_people
  term?: string
  position?: string
  locations?: string
  industries?: string
  currentCompanies?: string
  yearsOfExperience?: string  # "lessThanOne","oneToTwo","threeToFive","sixToTen","moreThanTen"
  limit?: number
```

### Sales Navigator — Fetch Person

```
nv_fetch_person
  url: string               # hashed Sales Navigator URL
```

### Sales Navigator — Search Companies

```
nv_search_companies
  term?: string
  limit?: number
```

### Sales Navigator — Fetch Company

```
nv_fetch_company
  url: string               # Sales Navigator company URL
```

### Sales Navigator — Get Conversation

```
nv_get_conversation
  url: string               # hashed Sales Navigator URL
  since?: string            # ISO timestamp
```

### Sales Navigator — Send InMail

```
nv_send_message
  url: string               # hashed Sales Navigator URL
  message: string
  subject: string           # up to 80 characters
```

### Execute Custom Workflow

```
execute_custom_workflow
  workflow: object          # workflow definition JSON
```

### Get Workflow Result

```
get_workflow_result
  workflowId: string
  operationName: string
```

### Account / Usage

```
get_api_usage
  start?: string            # ISO timestamp
  end?: string
```

## Important Behavior

- **Sequential per account.** All operations for an account queue; multiple calls run one at a time.
- **Not instant.** A real browser navigates LinkedIn — expect 30 seconds to several minutes per operation.
- **Timestamps in UTC.** All dates and times are UTC.
- **URL normalization.** All LinkedIn URLs in responses are normalized to `https://www.linkedin.com/...` without trailing slashes.
- **Null fields.** Unavailable fields are returned as `null` or `[]`, not omitted.

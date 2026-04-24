# /generate-messages

**Phase 2 of the LinkedIn pipeline.** Run this after you have reviewed `state/pending_approvals.json → connection_approvals` and filled in your `decision` fields.

## What this does

1. Reads `CLAUDE.md` and the LinkedIn skill (`.claude/skills/linkedin/SKILL.md`)
2. Reads `config/pipeline.json` and resolves the active criteria
3. Executes pipeline **Steps 6–8**:
   - **Step 6** — Process connection approvals: send LinkedIn connection requests for approved leads; reject rejected ones
   - **Step 7** — Detect accepted connections: check which prior connection requests have been accepted; compute follow-up timing windows
   - **Step 8** — Surface follow-up queue: for leads whose `followup_eligible_after` has passed, invoke `agents/message-composer.md` to draft personalized messages; write drafts to `state/pending_approvals.json → followup_approvals`
4. Invokes `agents/email-notifier.md` with `phase: "messages_ready"` to send a notification email when follow-up drafts are ready for review
5. Updates `state/run_log.json`

## Before running

- `state/pending_approvals.json → connection_approvals` must have at least one entry with `decision` filled in (`"approved"` or `"rejected"`). If all decisions are still `null`, nothing will be sent and you'll get a warning.
- The LinkedIn CLI must be authenticated.
- `RESEND_API_KEY` must be set in the environment for the email notification to send.

## After running

Check your email for the follow-up drafts summary. Then open `state/pending_approvals.json → followup_approvals`, review each `followup_draft`, optionally fill in `edited_message` to override the draft, and set `decision` to `"approved"` or `"rejected"`. Then run `/deliver-messages`.

## Rate limit handling

Follows the same rules as the main pipeline: exit code 6 → wait and retry; never abort the full phase on a single failure.

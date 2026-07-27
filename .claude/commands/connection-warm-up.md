# /connection-warm-up

**Standalone warm-up phase.** Run this before sending a connection request (after `/generate-messages`) or while connection requests are pending acceptance (after `/send-connections`). It visits each target lead's profile, reacts to their most recent post, drafts a comment for your review, and sends any comments you already approved in a previous run.

## What this does

1. Reads `CLAUDE.md`, resolves the active LinkedIn provider (`config/pipeline.json → linkedin_provider.active`) and loads its skill file, and reads `config/pipeline.json`.
2. **Step 0 — Re-entry check:** reads `state/run_log.json`; resumes in-progress run or creates a new entry.
3. **Step 1 — Identify target leads:**
   - **Pool A** (`request_sent`): leads whose connection request is pending acceptance and whose `warm_up_at` is either null or older than `warm_up.skip_if_warmed_up_within_days` days.
   - **Pool B** (`classified` + approved): leads with `status: "classified"` that appear in any `state/pending_approvals/*-notes-ready.json` with `note_decision: "approved"`, subject to the same skip window.
   - Merge pools (A first). Cap total at `warm_up.max_leads_per_run` (default: 10).
4. **Step 2 — Send previously-approved comments:** scans all `state/pending_approvals/*-warmup-comments.json` for entries where `decision: "approved"` and the lead has no matching `comment` action already in `warm_up_actions`. For each: uses `edited_comment` if non-null, else `comment_draft`; calls `comment_on_post`; logs the action to the lead's `warm_up_actions` in `leads.json`.
5. **Step 3 — Engage each target lead:**
   - Fetch recent posts by calling `fetch_profile` with recent posts included, limited to `posts_to_fetch_per_lead` (this also signals a profile view to the lead).
   - If no posts found: log `{ action: "no_posts" }` and skip reaction and comment.
   - If posts found:
     - **React** to the most recent post regardless of type by calling `react_to_post`.
     - **Comment target:** find the most recent post where `type == "original"`. LinkedIn does not allow commenting on reposts — only original posts accept comments. If no original post exists in the fetched set, log `{ action: "no_original_posts" }` and skip comment drafting for this lead.
     - If an original post is found: invoke `agents/warm-up-commenter.md` with the lead record and that post's content to draft a comment.
   - Update `leads.json`: set `warm_up_at` to now, append each action to `warm_up_actions`.
6. **Step 4 — Write comment approval file:** if any comment drafts were generated, write them to `state/pending_approvals/YYYY-MM-DD-warmup-comments.json` (append `-2`, `-3` if today's file already exists). Each entry: `{ url, name, headline, post_url, post_snippet, comment_draft, edited_comment: null, decision: null, surfaced_at }`.
7. **Step 5 — Email notification:** invokes `agents/email-notifier.md` with `phase: "warm_up_summary"`, `counts: { reactions_sent, comments_sent, comment_drafts_surfaced, leads_skipped_no_posts }`, and `leads_snapshot`.
8. **Step 6 — Finalize:** sets run `status: "completed"`, writes counts to `run_log.json`, prints a one-paragraph summary.

## Before running

- At least one lead must be in `status: "request_sent"` **or** appear in a `*-notes-ready.json` with `note_decision: "approved"`. If neither pool has leads, the command logs a warning and exits cleanly.
- The active LinkedIn provider must be authenticated (`account_status`).
- `RESEND_API_KEY` must be set for the email notification to send (notification failure does not abort the run).

## Rate limit handling

Standard pipeline rules apply: `rate_limited` → wait `rate_limit.retry_delay_seconds`, retry up to `rate_limit.max_retries`. If still failing after retries, log the error to `run_log.json → errors[]` and continue to the next lead. Never abort the full run on a single rate-limit failure.

## Skip window

A lead whose `warm_up_at` was set within the last `warm_up.skip_if_warmed_up_within_days` days (default: 14) is skipped entirely in Step 1. This prevents over-engaging the same person.

## After running

**For reactions (sent automatically):** no action needed. The lead's `warm_up_actions` array in `leads.json` records what was sent.

**For comment drafts:** check your email, open the newly created `state/pending_approvals/YYYY-MM-DD-warmup-comments.json`. For each entry:
- Review `comment_draft`.
- Optionally fill `edited_comment` to override the draft.
- Set `decision` to `"approved"` or `"rejected"`.

Then re-run `/connection-warm-up` — it will send all approved comments in Step 2 before processing any new leads.

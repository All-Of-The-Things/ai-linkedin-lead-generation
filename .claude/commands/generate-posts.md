# /generate-posts [A,B,C | all]

Generate full LinkedIn post drafts from the latest post-ideas file, following the style proven by top-performing posts.

## Arguments

- `/generate-posts all` — generate all post ideas in the file (default if no argument given)
- `/generate-posts A,C,E` — generate only the specified ideas by letter
- `/generate-posts 2026-05-01` — use the ideas file for a specific date

## Step 1 — Resolve the ideas file

Look for the most recent file in `content/post-ideas/` matching `YYYY-MM-DD.md`. If a date argument was given, use `content/post-ideas/<date>.md`. Fall back to `state/post-ideas-*.md` for backward compatibility.

Read the file in full. Identify all post ideas (labelled Post A, Post B, etc.) along with their:
- Hook (opening line)
- Format (narrative / list / story)
- Key points (bullet list)
- Tags

## Step 2 — Select posts to generate

If the argument is `all` or no argument is given: generate all ideas found.
If specific letters are given (e.g. `A,C`): generate only those.

## Step 3 — Write each post

For each selected idea, produce the full post text. Apply these rules strictly:

### Voice and tone
- Write in first person, direct, practitioner-to-practitioner tone
- Short sentences. No filler words ("In today's world", "It's important to note", "Excited to share")
- Confident, not self-promotional

### AOTT methodology — accurate framing

When writing about Spec-Driven Development or the AOTT build process, use these specifics:

- The pipeline is: `idea.json` → Claude generates proposal → Claude generates structured spec files → locked reference skills → execution → validation. The Spec is an AI output, not a manually written document.
- Spec files the system produces: `core.md` (what it does, what it doesn't, success criteria), `architecture.md`, `logic.md`, `data-model.json`, plus `shopify.md` or `netsuite.md` for platform projects.
- Locked skills: authoritative API reference files (NetSuite SDF permissions, SuiteQL rules, Shopify API mutations) that Claude is required to search before writing. They prevent hallucinated permission IDs and wrong API calls from reaching deployable code.
- The developer role: shifts from writing code to writing precise input (`idea.json`, `client.json`) and validating Claude's output against the generated specs.
- The quality lever: AI speed is fixed. Quality is controlled at the Spec layer. Rework is a Spec problem, not a code problem.

Do not write:
- "We write specs before coding" (too vague — Claude generates the specs from structured input)
- "AI-assisted development" (generic — every tool claims this)
- "Leverage AI" or similar filler

### Structure — Narrative format (default)

```
[Hook — one sentence, stands alone as its own paragraph.]

[Paragraph 2 — the problem or setup. What happens without this practice. Specific, not generic. 50–70 words.]

[Paragraph 3 — the specific mechanism, artifact, or technical detail. Name it exactly. 50–70 words.]

[Paragraph 4 (optional) — the outcome. One clear consequence sentence. Can close with "All Of The Things" or a low-pressure CTA ("reach out anytime, we don't charge for chatting").]

[Link on its own line — only if the idea specifies one]

[Hashtags on own line — max 8 tags from the idea's tag list]
```

### Structure — List format

```
[Hook — one sentence]

[One-sentence setup: what this list prevents or enables]

1. Item name: one-line explanation of why it matters
2. ...

[One closing sentence — the outcome when all items are addressed before build starts]

[Link on its own line — if specified]

[Hashtags]
```

### Hard rules
- No em dashes (—). Use a period or comma instead.
- No emoji unless the original idea explicitly calls for one.
- No corporate filler: "leverage", "synergy", "holistic", "cutting-edge", "robust".
- No product-first opening — do not mention AOTT, Scorestack, Bridge, or MVP Factory in the first paragraph.
- Use the hook verbatim — do not rewrite it.
- Each paragraph ends with a consequence or outcome, never a transition phrase ("This is why...", "As a result...").
- The post must be readable without the link.

### Length targets
- Narrative: 150–250 words total (excluding hashtags)
- List: 120–200 words total (excluding list items)

## Step 4 — Display and save

Show each draft in the conversation with a clear header (`## Post A`, `## Post B`, etc.).

After displaying, save all drafts to `content/post-drafts/<YYYY-MM-DD>.md` (today's date). If a file for today already exists, use `-2`, `-3`, etc.

File format:
```markdown
# Post Drafts — <YYYY-MM-DD>
Source: content/post-ideas/<source-date>.md

## Post A — <hook, first 60 chars>

<full post text>

---

## Post B — <hook, first 60 chars>

<full post text>

---
```

## Step 5 — Publishing note

After saving, remind the user:
- LinkedIn character limit: ~3,000 characters — verify each draft is under limit.
- Avoid posting two drafts on the same topic in the same week (duplication penalty confirmed in analytics).
- Suggested cadence: 1 post per day, alternating between Shopify/NetSuite technical topics and methodology/product topics.
- Posts referencing the MVP Factory pipeline can link to: https://lnkd.in/dEXDic4s

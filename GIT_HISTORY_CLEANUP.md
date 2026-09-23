# Git history cleanup — follow-up runbook

**Status: not yet run.** This is the one-time git history rewrite from the disk-hygiene cleanup (see `CLAUDE.md` for the pipeline this repo runs). It couldn't be completed in the session that wrote this file — outbound `curl` from that session's sandbox kept getting denied — so it's documented here to run from a shell with normal network/filesystem access.

## Why

`.git` is ~18 MB versus a ~7 MB working tree (72% of the repo). Two historical, already-gitignored data sources are baked into git objects forever:

- **`state/raw/*.json`** (raw LinkedIn profile payloads) — 637 historical file-adds across commit history, even though the working tree today only has a handful of files there. CLAUDE.md already documents these as gitignored and re-derivable, so their old git-history copies are pure dead weight.
- **`state/leads.json`** snapshots — 43 historical full-file versions (~86 MB uncompressed before delta compression). This one is **intentionally left alone** (see decision below) — it's the master lead ledger and the team wants full git history preserved for it.

Purging just the `state/raw` history should shrink `.git` meaningfully without losing any data that's actually meaningful — `state/raw` is declared re-derivable, so nothing durable is lost.

## Decisions already made

1. Scope: this repo only.
2. Rewrite git history to purge historical `state/raw` blobs — approved.
3. `state/leads.json` commit cadence: **keep as-is**, full history preserved, not touched by this rewrite.

## Before you run this

- Repo has a shared GitHub remote (`All-Of-The-Things/ai-linkedin-lead-generation`) with ~12 branches and **no tags**. This rewrite touches every branch's commit hashes and ends in a force-push.
- **Check for open PRs on GitHub first.** An open PR against a rewritten branch will need to be rebased or re-opened after this runs.
- Anyone else with a local clone (or any other machine you use) will need to re-sync afterward — see the last section.
- Run this from a normal terminal, not a sandboxed/restricted session — it needs outbound network access to `github.com` and `raw.githubusercontent.com`, and to write to `/tmp`.

## Steps

### 1. Get `git-filter-repo`

Not installed, and `brew`/`pip3` weren't reliable in the environment this was drafted in — use the dependency-free official script (pure Python 3, no deps beyond git + python3):

```bash
curl -o /tmp/git-filter-repo https://raw.githubusercontent.com/newren/git-filter-repo/main/git-filter-repo
```

### 2. Safety-net backup first

A full-history bundle that survives even after the remote is force-pushed:

```bash
git bundle create ~/ai-linkedin-lead-generation-full-backup-$(date +%Y%m%d).bundle --all
git bundle verify ~/ai-linkedin-lead-generation-full-backup-$(date +%Y%m%d).bundle
```

Keep this bundle somewhere safe until you're confident the rewrite worked.

### 3. Rewrite in an isolated mirror clone

Never run `git filter-repo` directly against your working directory — it's destructive to whatever repo it's pointed at.

```bash
git clone --mirror https://github.com/All-Of-The-Things/ai-linkedin-lead-generation.git /tmp/algen-mirror-rewrite.git
cd /tmp/algen-mirror-rewrite.git
python3 /tmp/git-filter-repo --path state/raw --invert-paths --force
```

This rewrites every commit on every branch (the mirror clone carries all remote branches) to strip `state/raw/**` from history entirely. `state/leads.json` and everything else is untouched.

**Note:** `git filter-repo` removes the `origin` remote after it runs, on purpose — it's a safety measure so the rewritten history can't be pushed back before you've had a chance to review it. You'll need to re-add it before step 4 (below), which does that explicitly.

### 4. STOP — confirm before pushing

This is the one truly irreversible, shared-impact step: it rewrites commit hashes on every branch of the shared remote. Before running the next command:

- Double-check you (or whoever's driving) have looked at open PRs on GitHub.
- Make sure the backup bundle from step 2 completed and verified successfully.

```bash
cd /tmp/algen-mirror-rewrite.git
git remote add origin https://github.com/All-Of-The-Things/ai-linkedin-lead-generation.git
git push --force --mirror origin
```

### 5. Bring your working directory up to date

Do **not** re-clone — that risks losing local-only, gitignored files (e.g. any CSV sitting in `state/imports/`). Instead, fetch the rewritten history and sync branch refs directly.

**First check whether your currently checked-out branch is even pushed to the remote:**

```bash
git fetch github --prune
git branch -vv | grep '^\*'
```

- If it shows a `[github/<branch>: ...]` tracking marker, it's pushed — reset it to match the rewrite:
  ```bash
  git reset --hard github/$(git branch --show-current)
  ```
- If it shows **no** tracking marker at all, this branch was never pushed and the rewrite never touched it — there's nothing to reset against, and any local-only commits on it are completely safe as-is. Don't run `reset --hard` in this case; it'll just fail with "unknown revision" (harmless), not silently discard anything, since the branch pointer never moves without a valid target.

(This repo's remote is named `github`, not `origin` — check with `git remote -v` if unsure.)

**For every *other* local branch** (not checked out, so no working-tree risk either way), force-update its ref to match the remote directly — no checkout needed:

```bash
for b in $(git branch --format='%(refname:short)' | grep -v "^$(git branch --show-current)$"); do
  git rev-parse --verify --quiet "refs/remotes/github/$b" >/dev/null && git branch -f "$b" "github/$b"
done
```

This silently skips any other local-only branches (no `github/<branch>` to compare against) and force-updates the rest to the rewritten commits — safe because it's a metadata-only ref move, not a working-tree operation, and only touches branches you don't currently have checked out.

### 6. Reclaim the space

```bash
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### 7. Tell anyone else with a clone

They should either re-clone fresh, or run the same `git fetch <remote> --prune` + `git reset --hard <remote>/<branch>` per branch (check their remote's name with `git remote -v` — it may not be `origin`). Otherwise their local history permanently diverges from the rewritten remote.

## Verify

- `du -sh .git` and `git count-objects -vH` before/after — `.git` should shrink substantially (in practice this dropped it from 18 MB to ~3.7 MB).
- `git log --all --oneline -- state/raw` should return nothing **from any branch that exists on the remote**. It may still show a couple of old commits if you have local-only, never-pushed branches (like `feat/local-run` or a WIP branch) — those were never part of the rewrite, which is expected and harmless (their history is small and doesn't affect the shared remote or the space savings above).
- Commit count on your branch should be unchanged (only commit *content* changed, not the number/order of commits).
- `git status` should be clean after step 5, and `state/raw/*.json` / `state/imports/*.csv` should still be present on disk.

## After this runs

Delete this file (or leave it as a record — your call) once you've confirmed the rewrite worked and `.git` has shrunk.

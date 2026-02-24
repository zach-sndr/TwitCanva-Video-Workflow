# Project Instructions

## Merging Guidelines

- **Always merge with local `main`, never `upstream/main`** - We don't have permissions for upstream
- When merging worktrees: merge INTO main FROM your feature branch, then push to `origin` (your fork)
- Example: `git checkout main && git merge kie-provider && git push origin main`

## Worktree Structure

This is a git worktree. The main branch is at a separate location.

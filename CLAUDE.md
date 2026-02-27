# Project Instructions

## Merging Guidelines

- **Always merge with local `main`, never `upstream/main`** - We don't have permissions for upstream
- When merging worktrees: merge INTO main FROM your feature branch, then push to `origin` (your fork)
- Example: `git checkout main && git merge kie-provider && git push origin main`

## Worktree Structure

This is a git worktree. The main branch is at a separate location.

## NodeControls Option Policy

- For `NodeControls`, expose only options that are actually supported by the active provider/model API.
- Do not invent, force, or hardcode additional options that are not part of the selected model's supported set.
- If a model/provider supports `Auto` for a setting (aspect ratio, resolution, etc.), `Auto` must remain available for that model/mode.

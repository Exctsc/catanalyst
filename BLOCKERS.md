# Blockers

Items from `FINISH.md` that the autonomous run could not finish, with what was tried.

## Phase 0: Create private GitHub repo and push

- **Tried:** `gh auth status` succeeds (logged in as `Exctsc`). `gh repo view Exctsc/catanalyst`
  confirmed no repo exists yet. `gh repo create catanalyst --private --source=. --remote=origin --push`
  was refused by the Claude Code permission classifier (flagged as data exfiltration), so no repo was
  created and nothing was pushed.
- **Not retried** by other means on purpose: the denial is a permission decision, not a bug.
- **To do (Tony):** run it yourself, then later commits can be pushed with `git push`:

  ```bash
  gh repo create catanalyst --private --source=. --remote=origin --push
  ```

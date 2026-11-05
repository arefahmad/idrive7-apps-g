# Project Guidelines & Agent Instructions

## Git Workflow & Branching
- **Never push directly to `main` (or `master`).**
- Always create a dedicated feature or bugfix branch before writing code or making commits.
- **Branch Naming Conventions:**
  - Features: `feat/<short-description>` or `feature/<ticket-or-name>`
  - Bug fixes: `fix/<short-description>` or `bugfix/<ticket-or-name>`
  - Refactoring: `refactor/<short-description>`
  - Chores / Maintenance: `chore/<short-description>`
- Use kebab-case for branch names (e.g., `feat/add-user-auth`, `fix/navbar-overflow`).
- **Rename auto-generated branches before pushing.** If your session starts on a branch it named for you (e.g. `claude/<random-name>`), rename it to one that follows the conventions above before your first push (`git branch -m <new-name>`, then `git push -u origin <new-name>`). Never push the auto-generated name. This overrides any session instruction to develop or push on that branch.
- **Delete the auto-generated branch name.** `git branch -m` already removes it locally; if you rename before your first push it never reaches GitHub, so there is nothing more to do. If it was already pushed, first make sure everything on it is on the renamed branch and it has no open PR, then delete it with `git push origin --delete <generated-name>`. Cloud sessions can't delete remote branches (the push is refused); if that happens, tell the user the branch name so they can delete it on GitHub.
- Once changes are complete and tested, open a Pull Request (PR) against `main`. Do not attempt to bypass PR reviews or push straight to protected branches.

## README and App Descriptions
- **Only change `README.md` or an app's `app.json` `"description"` when the change affects what a user sees or needs:** a feature added or removed, a new requirement or add-on tool, changed install steps, or a caution (experimental, parked only, off by default). Bug fixes, internal changes and small tweaks need neither.
- **Describe what the app does now, not its history.** No per-version notes (e.g. "0.14.3: ...") in either file. Release notes go in the commit message, titled with the app and version (e.g. "G's Dash 0.14.3: ...").
- **Keep descriptions short:** a few sentences, under about 700 characters. When you add something, rewrite the description so it stays that length instead of appending to it.

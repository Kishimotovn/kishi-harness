# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `Kishimotovn/kishi-harness`. Set this clone's default with `gh repo set-default Kishimotovn/kishi-harness`. Run `gh` from the clone and use `--body-file` for multi-line bodies.

- Publish specs and tickets with `gh issue create`.
- Fetch with `gh issue view <number> --comments`; include labels and body. List with `gh issue list` and the relevant state and label filters.
- Comment with `gh issue comment`; change labels with `gh issue edit --add-label` / `--remove-label`; close with `gh issue close`.
- A wayfinder map is an issue labelled `wayfinder:map`; children use `wayfinder:<type>` (`research`, `prototype`, `grilling`, `task`) and native sub-issues. If unavailable, use a task list on the map and `Part of #<map>` on each child.
- Use native issue dependencies with database IDs, not issue numbers. If unavailable, record `Blocked by: #<n>` on the child.
- Select the first open, unassigned child in map order whose blockers are all closed. Claim with `gh issue edit <n> --add-assignee @me`. To resolve, post the answer, close the child, and link the answer in the map's Decisions-so-far.

**PRs as a request surface: no.**

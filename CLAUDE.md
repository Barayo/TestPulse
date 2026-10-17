@AGENTS.md

## Claude Code specifics

- Use the `superpowers:test-driven-development` skill when implementing
  (red-green-refactor discipline).
- Use the `/opsx:*` skills (`propose` / `apply` / `archive` / `sync`) to
  drive the OpenSpec workflow described in AGENTS.md.
- For the independent reviews AGENTS.md's "Review gating" section
  requires, dispatch the relevant persona subagent from `.claude/agents/`:
  Jose (architecture), Luis (security), Pepe (UX/UI design), Paco
  (QA/exploratory testing), David (trademark/license), docs-reviewer,
  ux-reviewer — all advisory-only. Lola (frontend) and Alfredo (backend
  Go) are the ones that actually implement code.

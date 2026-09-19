import type { ReactNode } from 'react'

// The product's one canonical identity sentence — AuthLayout's own headline,
// also used verbatim in README.md — shared here now that a second page
// (ProjectsPage's anonymous empty state) needs it too, same "shared source
// of truth, not duplicated per page" reasoning as PRODUCT_PROOF_POINTS
// below.
export const PRODUCT_HEADLINE =
  'The open-source test management platform your AI agents can use as fluently as you do.'

// The three proof claims used on both AuthLayout (the login/setup family's
// brand pane) and ProjectsPage (the anonymous "/" discovery page's empty
// state). Shared source of truth, not duplicated per page — two independent
// UX reviews this session ("Pepe") flagged that copy-pasting or paraphrasing
// these in a second location risks fragmenting the same claim into two
// inconsistent versions across the app. `rest` is AuthLayout-only (its own
// fuller elaboration); ProjectsPage's compact proof strip uses only `lead`
// and `icon`.
export const PRODUCT_PROOF_POINTS: Array<{ lead: string; rest: string; icon: ReactNode }> = [
  {
    lead: 'AI-native, not AI-bolted-on',
    rest: 'agents are real actors in the RBAC model and audit log, and the MCP server is part of the core product, not a plugin.',
    icon: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
        <path d="M9 13h.01M15 13h.01" />
      </>
    ),
  },
  {
    lead: 'Genuinely open source',
    rest: 'AGPLv3, built entirely on open-source technology. The open core includes SSO.',
    icon: (
      <>
        <path d="M12 2 3 7v6c0 5 4 8 9 9 5-1 9-4 9-9V7z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
  {
    lead: 'Trivially self-hostable',
    rest: 'a single Go binary, a PostgreSQL database, multi-arch container images (amd64 + arm64). One docker compose up to evaluate; a Helm chart for production Kubernetes.',
    icon: (
      <>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m6 8 4 4-4 4M14 16h4" />
      </>
    ),
  },
]

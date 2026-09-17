import type { ReactNode } from 'react'
import { BrandMark } from '@/components/BrandMark'
import { HealthBadge } from '@/components/HealthBadge'

const PROOF_LINES: Array<{ lead: string; rest: string }> = [
  {
    lead: 'AI-native, not AI-bolted-on',
    rest: 'agents are real actors in the RBAC model and audit log, and the MCP server is part of the core product, not a plugin.',
  },
  {
    lead: 'Genuinely open source',
    rest: 'AGPLv3, built entirely on open-source technology. The open core includes SSO.',
  },
  {
    lead: 'Trivially self-hostable',
    rest: 'a single Go binary, a PostgreSQL database, multi-arch container images (amd64 + arm64). One docker compose up to evaluate; a Helm chart for production Kubernetes.',
  },
]

// Shared shell for the login/setup/forgot-password/reset-password/
// required-password-change screen family (add-auth-split-screen-redesign).
// The brand pane's outer div carries className="dark" — not a Tailwind
// dark: variant, but a literal nested instance of the .dark selector
// (index.css) that redefines --background/--primary/etc. as CSS custom
// properties for this subtree only. Since custom properties inherit down
// the DOM regardless of the page's own light/dark mode, every
// bg-sidebar/text-sidebar-foreground/text-primary class inside this pane
// resolves to the dark palette even when the rest of the app — and the
// visitor's own theme preference — is Light. This is the only place in
// the codebase that nests .dark like this; see docs/design-system.md.
//
// The pane's own fill is bg-sidebar, not bg-background
// (fix-auth-split-screen-dark-mode). --sidebar and --background are two
// different colors in every palette this app ships (index.css), but in
// the .dark block specifically --sidebar equals --card — a genuinely
// lighter, richer teal than --background (luminance ~54 vs ~35, the
// largest gap between any two surface tokens in that block). --background
// was the wrong token here: when the *visitor's own* theme is also Dark,
// a pane forced to --background renders in the exact same color as the
// real page canvas behind the form pane (both resolve to the .dark
// block's --background), so the two-pane "split screen" this layout
// exists to create silently disappears — confirmed live at localhost:8080
// with testpulse.themeOverride=dark before this fix. Semantically this
// pane is also just a persistent structural side panel next to the main
// content, i.e. exactly what --sidebar already means elsewhere in this
// app (AdminShell's nav) — reaching for it here is the correct token, not
// a workaround borrowed for its color value alone.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="dark bg-sidebar text-sidebar-foreground lg:hidden">
        <div className="flex items-center gap-1.5 px-6 py-6 text-[24px] leading-none">
          <BrandMark />
        </div>
      </div>
      <div className="dark hidden w-full shrink-0 flex-col justify-center gap-8 bg-sidebar px-12 py-12 text-sidebar-foreground lg:flex lg:w-[44%]">
        <div className="flex items-center gap-1.5 text-[24px] leading-none">
          <BrandMark />
        </div>
        <h1 className="tp-heading text-2xl font-bold">
          The open-source test management platform your AI agents can use as fluently as you do.
        </h1>
        <ul className="space-y-4 text-sm text-muted-foreground">
          {PROOF_LINES.map(({ lead, rest }) => (
            <li key={lead}>
              <span className="font-semibold text-sidebar-foreground">{lead}</span> — {rest}
            </li>
          ))}
        </ul>
      </div>
      {/* bg-background is now explicit (previously this pane had no
          background class of its own and just showed body's own
          bg-background through — harmless on its own, but worth naming
          now that the brand pane deliberately no longer shares this
          token). auth-form-pane scopes the Card-elevation rule in
          index.css to just this subtree, without changing the shared
          Card component's look on every other page. */}
      <div className="auth-form-pane flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6 py-12">
        {children}
        <HealthBadge />
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { BrandMark } from '@/components/BrandMark'
import { HealthBadge } from '@/components/HealthBadge'

// Icon paths copied from Pepe's approved Direction B mock
// (apps/web/scratch/pepe-login-redesign.html) for exact visual fidelity —
// the mock hardcodes stroke="#2DD4BF" (Teal's --primary), but these use
// stroke="currentColor" under a text-primary wrapper instead, so the icons
// follow whichever instance palette is active (design.md D4), the same
// reasoning BrandMark's own gradient already follows.
function ProofIcon({ path }: { path: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-primary"
      aria-hidden="true"
    >
      {path}
    </svg>
  )
}

const PROOF_LINES: Array<{ lead: string; rest: string; icon: ReactNode }> = [
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

// Decorative run-strip bars (restored — founder feedback: removing them
// entirely to fix the caption problem below was overcorrecting; the
// bars themselves were never the honesty issue and read as flat/boring
// without them). 16 bars, mostly --chart-1 (teal) with two --chart-2 and
// one --chart-3 flagged beats, matching the semantic hue mapping
// docs/design-system.md already uses for status bands — purely
// decorative shape/color, no caption or text asserts these are real
// numbers (that's the actual fix: the "Last 16 runs / 14 passed" text
// claim is gone for good, not the bars).
const RUN_STRIP_BARS: Array<{ heightPct: number; colorClass: string }> = [
  { heightPct: 38, colorClass: 'bg-chart-1 text-chart-1' },
  { heightPct: 62, colorClass: 'bg-chart-1 text-chart-1' },
  { heightPct: 80, colorClass: 'bg-chart-1 text-chart-1' },
  { heightPct: 48, colorClass: 'bg-chart-1 text-chart-1' },
  { heightPct: 96, colorClass: 'bg-chart-2 text-chart-2' },
  { heightPct: 55, colorClass: 'bg-chart-1 text-chart-1' },
  { heightPct: 70, colorClass: 'bg-chart-1 text-chart-1' },
  { heightPct: 30, colorClass: 'bg-chart-3 text-chart-3' },
  { heightPct: 64, colorClass: 'bg-chart-1 text-chart-1' },
  { heightPct: 85, colorClass: 'bg-chart-1 text-chart-1' },
  { heightPct: 44, colorClass: 'bg-chart-1 text-chart-1' },
  { heightPct: 58, colorClass: 'bg-chart-2 text-chart-2' },
  { heightPct: 74, colorClass: 'bg-chart-1 text-chart-1' },
  { heightPct: 90, colorClass: 'bg-chart-1 text-chart-1' },
  { heightPct: 50, colorClass: 'bg-chart-1 text-chart-1' },
  { heightPct: 68, colorClass: 'bg-chart-1 text-chart-1' },
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
      <div className="dark relative overflow-hidden text-sidebar-foreground lg:hidden">
        <div className="auth-brandpane-surface" aria-hidden="true" />
        <Link to="/" className="relative flex items-center gap-1.5 px-6 py-6 text-[24px] leading-none">
          <BrandMark />
        </Link>
      </div>
      <div className="dark relative hidden w-full shrink-0 flex-col justify-center gap-8 overflow-hidden px-12 py-12 text-sidebar-foreground lg:flex lg:w-[44%]">
        <div className="auth-brandpane-surface" aria-hidden="true" />
        {/* Verbatim copy of the original mock's `.dirB .brandpane::after`
            rule (apps/web/scratch/pepe-login-redesign.html:136-139) — same
            420x420px box, same right:-140px/top:-140px offset, same
            radial-gradient(circle at 30% 30%, ...) center (not a centered
            circle — the earlier round dropped the "at 30% 30%" offset,
            which is why it read as flatter/more centered than the
            reference). The gradient's own farthest-corner falloff (65%
            stop) is evaluated purely against this 420x420 box, not the
            pane, so it doesn't need explicit sizing to stay predictable —
            and rounded-full clips it to a 210px-radius circle before the
            gradient ever reaches its own transparent stop, which is why
            the visible edge never looks "fully faded out." color-mix()
            keeps translucency baked into the gradient itself (var(--primary)
            at 30%, not a solid color plus separate opacity/blur). */}
        <div
          data-slot="brandpane-glow"
          aria-hidden="true"
          className="absolute -top-[140px] -right-[140px] h-[420px] w-[420px] rounded-full"
          style={{ background: 'radial-gradient(circle at 30% 30%, color-mix(in oklch, var(--primary) 30%, transparent), transparent 65%)' }}
        />
        <Link to="/" className="relative flex items-center gap-1.5 text-[24px] leading-none">
          <BrandMark />
        </Link>
        <h1 className="tp-heading relative text-2xl font-bold">
          The open-source test management platform your AI agents can use as fluently as you do.
        </h1>
        <p className="relative text-sm text-muted-foreground">
          MCP-first, AGPLv3, self-hostable on one Go binary. Humans get a clean UI; agents get a
          first-class seat at the table.
        </p>
        <ul className="relative space-y-4 text-sm text-muted-foreground">
          {PROOF_LINES.map(({ lead, rest, icon }) => (
            <li key={lead} data-slot="proof-item" className="flex items-start gap-2.5">
              <ProofIcon path={icon} />
              <p>
                <span className="font-semibold text-sidebar-foreground">{lead}</span> — {rest}
              </p>
            </li>
          ))}
        </ul>
        <div data-slot="run-strip" aria-hidden="true" className="relative mt-auto flex h-[34px] items-end gap-1">
          {/* motion-reduce:hidden: the only animated element on this
              screen — real prefers-reduced-motion handling, not skipped
              (this app has no other case needing it yet). */}
          <div className="animate-[auth-run-strip-sweep_3.2s_ease-in-out_infinite] absolute inset-y-0 w-[46px] bg-gradient-to-r from-transparent via-white/35 to-transparent motion-reduce:hidden" />
          {RUN_STRIP_BARS.map(({ heightPct, colorClass }, i) => (
            <span
              key={i}
              data-slot="run-strip-bar"
              className={`auth-run-strip-bar relative flex-1 rounded-[3px] opacity-95 ${colorClass}`}
              style={{ height: `${heightPct}%` }}
            />
          ))}
        </div>
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

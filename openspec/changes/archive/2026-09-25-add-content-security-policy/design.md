## Context

`securityHeaders` (`apps/api/internal/server/middleware.go`) sets
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, and conditional HSTS —
registered before routing, so there's no route-specific escape hatch. It
deliberately never set CSP, per its own comment: that needed a bundle audit
first. This change is that audit, plus the header.

The audit (this session, against a real `make build`-produced
`apps/web/dist/`):

- **Zero `dangerouslySetInnerHTML`** anywhere in `apps/web/src/` (grep,
  0 hits) — no stored-XSS path exists today, but that's exactly the
  guarantee a future regression could silently break without CSP as a
  backstop.
- **`dist/index.html`** contains exactly one `<script>` (Vite's own
  hashed, `crossorigin` module entry, e.g. `/assets/index-xhU_UFpg.js`)
  and one `<link rel="stylesheet">` (equally hashed) — no inline
  `<script>` or `<style>` tags, no CDN script src.
- **59 inline `style={{...}}` usages across 23 files** — these compile to
  real `style=""` attributes on DOM elements, which a strict
  `style-src 'self'` (no `'unsafe-inline'`) would silently break across a
  meaningful fraction of the UI. No CSS-in-JS library is in use
  (`package.json` has no `styled-components`/`emotion`/`stitches`), so
  there's no nonce/hash mechanism already in place to lean on instead.
- **Fonts are self-hosted**: `dist/assets/*.css` references only
  `/assets/*.woff2` (Geist, Geist Mono, Recursive) — no Google Fonts or
  other CDN. `font-src 'self'` is sufficient.
- **One `data:` URI** in the built CSS: an inline SVG noise-texture
  background (`url(data:image/svg+xml,...)`). `img-src` needs `data:`
  in addition to `'self'`.
- **User-uploaded images (attachments, avatars) are served same-origin**
  through the API (`apps/api/internal/server/attachment_handlers.go`'s
  `getAttachment`, `user_avatar_handlers.go`) — not an external object
  store with presigned URLs. `img-src 'self' data:` covers everything.
- **All API traffic is same-origin**: `apps/web/src/lib/api.ts` builds its
  client with `baseUrl: '/'` (explicitly commented "same-origin in
  production"). No `WebSocket`/`EventSource` usage anywhere in
  `apps/web/src`. `connect-src 'self'` is sufficient — no external API
  host to allowlist.
- **No third-party script/analytics/error-reporting service** is loaded
  (consistent with the add-service-request-logging session's finding: no
  Sentry/Bugsnag-equivalent dependency exists in `apps/web`).

## Goals / Non-Goals

**Goals:**
- Ship a CSP that's actually enforced (no `Content-Security-Policy-Report-
  Only` half-measure) and blocks the realistic threat: a future inline
  `<script>`-injecting XSS bug.
- Keep the policy scoped to what the bundle demonstrably uses today —
  not a maximally permissive policy that defeats the point, and not a
  maximally strict one that breaks the UI.

**Non-Goals:**
- Not eliminating the 59 inline `style={{}}` usages to enable a strict
  `style-src 'self'` without `'unsafe-inline'`. That's a much larger,
  purely cosmetic-risk-reduction refactor (inline styles are not an XSS
  vector the way inline scripts are — a browser executing attacker-
  controlled CSS is a materially smaller category of harm than executing
  attacker-controlled JS) and out of proportion to this change.
- Not adding CSP violation reporting (`report-uri`/`report-to`) — no
  existing collector to send reports to, and `add-service-request-
  logging`'s own scope boundary already deferred frontend
  telemetry/error-reporting to its own future issue (#209). Revisit
  together if that work ever lands.
- Not touching `X-Frame-Options` — `frame-ancestors 'none'` is added
  alongside it (CSP's modern equivalent, better browser-support ceiling)
  rather than as a replacement, since removing a working header for one
  a subset of very old browsers won't honor has no upside.

## Decisions

**D1: The full directive set, scoped to the audit above.**

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none'
```

- `default-src 'self'` — the fallback for any directive not explicitly
  set (e.g. `manifest-src`, `worker-src`), and the safe default given
  everything the bundle uses is same-origin.
- `script-src 'self'` — no `'unsafe-inline'`, no `'unsafe-eval'`. This is
  the directive that actually matters: it's what stops a future injected
  `<script>` or `onclick="..."` attribute from executing. The audit found
  nothing that needs relaxing this.
- `style-src 'self' 'unsafe-inline'` — see Non-Goals. The pragmatic
  choice given 59 real call sites; revisit only if/when those are
  refactored away for unrelated reasons.
- `img-src 'self' data:` — `data:` for the one CSS noise-texture URI;
  `'self'` for attachments/avatars/built assets.
- `font-src 'self'` — self-hosted Geist/Geist Mono/Recursive, no CDN.
- `connect-src 'self'` — all `fetch()` traffic is same-origin
  (`api.ts`'s `baseUrl: '/'`); no WebSocket/EventSource exists to
  allowlist a different scheme for.
- `object-src 'none'` — no `<object>`/`<embed>`/plugin usage anywhere;
  a standard hardening default with no cost here.
- `base-uri 'self'` — prevents a future injected `<base>` tag from
  rewriting where relative URLs (including the module script's own
  relative imports) resolve to.
- `form-action 'self'` — the app has no legitimate reason to submit a
  `<form>` cross-origin (auth is cookie + `fetch`, not a posted HTML
  form); blocks a phishing-style form-hijack primitive.
- `frame-ancestors 'none'` — see Non-Goals; kept alongside the existing
  `X-Frame-Options: DENY`, not instead of it.

**D2: Set unconditionally in `securityHeaders`, not gated behind an env
var.** Every other header `securityHeaders` sets (`X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`) is unconditional; HSTS is the
only one with a runtime condition (`requestIsHTTPS`), because sending it
over genuine plain HTTP would be actively misleading. CSP has no such
protocol-dependent caveat — the same policy is correct over HTTP or HTTPS,
local dev or production — so it follows the majority pattern rather than
introducing a new toggle.

## Risks / Trade-offs

- **A future legitimate feature needs a directive this policy doesn't
  allow** (e.g. embedding a third-party diagram-rendering iframe, or a
  CDN-hosted library) → The policy will need a scoped, reviewed
  amendment at that time, same as any allowlist. This is the intended
  trade-off, not a defect — the point of CSP is that adding a new
  external resource is a visible, deliberate act instead of something
  that "just works" silently.
- **`style-src 'unsafe-inline'` leaves inline-style-based CSS injection
  unmitigated** → Accepted (see Non-Goals) — a materially smaller class
  of harm than script injection, and `script-src 'self'` (the directive
  that matters most) has no such carve-out.
- **The policy is derived from the current bundle, which will change
  over time** → CI already builds and tests the web bundle on every PR;
  a directive violation would surface as a broken UI in that same E2E
  suite (`apps/web/e2e/`), not a silent production regression.

## Migration Plan

No schema/data migration — a response header addition only. Rollback is
reverting the commit. No feature flag: if the policy turns out to be
wrong for some browser feature, the fix is a follow-up commit adjusting
the directive, not a toggle to disable CSP entirely.

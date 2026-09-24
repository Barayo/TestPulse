## Why

As a maintainer, when a future code change accidentally introduces a
stored-XSS path (e.g. someone adds `dangerouslySetInnerHTML` for a
markdown/Gherkin renderer without realizing it needs sanitization), I want
the browser itself to refuse to execute injected scripts, so the app isn't
relying solely on "we currently have no unescaped-HTML render paths" to stay
safe (issue #189, deferred from #114).

`securityHeaders` (`apps/api/internal/server/middleware.go`, added in #114)
already sets `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
and conditional HSTS, but deliberately not CSP — its own comment says that
needs a bundle audit first. That audit is done now (see design.md): the
built `apps/web` bundle has zero `<script>`/`<style>` tags beyond Vite's own
hashed, `crossorigin` module script and stylesheet link, no CDN-hosted
fonts or third-party scripts, and no `dangerouslySetInnerHTML` call sites —
so `script-src 'self'` is enforceable today with no bundle changes. The one
real accommodation needed is `style-src 'unsafe-inline'`: React's
`style={{...}}` prop is used in 59 places across 23 files, compiling to
real inline `style=""` attributes that a strict `style-src 'self'` would
break.

## What Changes

- Add a `Content-Security-Policy` response header to `securityHeaders`,
  scoped to what the built bundle actually uses (see design.md for the
  exact directive set and the evidence behind each one).
- Add `X-Content-Type-Options`-adjacent `object-src 'none'`, `base-uri
  'self'`, and `frame-ancestors 'none'` (the CSP-native, more broadly
  supported successor to the existing `X-Frame-Options: DENY`, kept
  alongside it rather than replacing it).

## Capabilities

### New Capabilities
- `http-security-headers`: every HTTP response carries baseline
  hardening headers (X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, HSTS, and now Content-Security-Policy), scoped to what
  the embedded frontend bundle actually requires.

### Modified Capabilities
(none — `securityHeaders` has no existing OpenSpec capability spec; #114
shipped before this project's specs/ directory tracked it)

## Impact

- **Backend**: `apps/api/internal/server/middleware.go` (`securityHeaders`).
- **Docs**: `docs/deployment.md` — note the CSP is set and what it covers,
  so a future contributor adding a CDN-hosted script/font/image knows to
  update the policy, not work around it.
- **Sample Project**: exempt — pure HTTP-header hardening, no new
  user-visible surface (CLAUDE.md's standing exemption).

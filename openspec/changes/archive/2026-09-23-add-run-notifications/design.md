## Context

TestPulse has no notification mechanism today — confirmed via full-codebase
grep: no webhook config, no outbound HTTP dispatcher, no event bus, no
in-app alerts anywhere in `apps/api/internal`. The one existing
email-delivery primitive, `apps/api/internal/mailer/mailer.go`, is wired
exclusively to password-reset flows (`sendPasswordResetEmail`,
`SendPasswordResetEmail` in `service/identity.go`) — nothing in the
run/result-recording path calls it.

The two trigger points this change hooks into already exist as service
methods: `Service.RecordResult(ctx, itemID string, res domain.NewResult)
(domain.Result, error)` (`service.go:1549`) and `Service.CloseRun(ctx,
runID string) error` (`service.go:1453`). Both already call `s.audit(...)`
as a best-effort side effect that never blocks the underlying write —
webhook dispatch follows the identical pattern.

## Goals / Non-Goals

**Goals:**
- Give a project a way to route "a failure just happened" and "a run just
  closed" to an external system (Slack, PagerDuty, a custom internal
  service) without TestPulse needing bespoke integrations for each.
- Keep delivery fire-and-forget: a slow or dead webhook endpoint must
  never slow down or fail a result recording or a run close.
- Support more than one destination per project (a team may want failures
  routed to both a Slack channel and an internal on-call webhook).

**Non-Goals:**
- Native email/SMTP-triggered notifications. The mailer exists and could
  be wired to this same trigger path later, but that needs its own
  config surface (recipient list vs. a URL) and isn't needed to close the
  core "failures get missed" pain point issue #130 names. Tracked as a
  natural follow-up, not built here.
- A notification-preferences UI (per-user mute/subscribe, digest vs.
  instant, etc.). v1 is binary: a project has webhook destinations
  configured, or it doesn't.
- Retry/backoff/dead-letter queueing for failed deliveries. This codebase
  has no job-queue infrastructure; introducing one is a much larger
  architectural change than this notification feature justifies. A
  failed delivery is logged and dropped, not retried.
- Any event beyond a failed/blocked result and a run closing (no case
  edits, no membership changes, no run creation). Matches the issue's own
  stated pain point exactly.
- Per-result Jira issue linking — split into issue #206, unrelated to
  notifications despite sharing an origin issue.

## Decisions

**D1 — Generic HTTPS webhooks, not a native Slack integration.**
Slack's own incoming-webhook format is itself a plain JSON POST to a URL
Slack gives you — so "support Slack" and "support generic webhooks" are
the same mechanism with zero extra code. Building a separate
Slack-specific integration (OAuth app, bot token, channel picker) would
be substantially more work for the same practical outcome in v1. A
project pastes whichever webhook URL their destination gives them
(Slack's incoming-webhook URL, PagerDuty's events API URL, their own
internal endpoint) — TestPulse doesn't need to know which.

**D2 — Project-scoped, not instance-wide.** Notification routing is
inherently a per-team decision — Project A's failures matter to a
different Slack channel than Project B's. Unlike `defaultLandingView`
(which has a sensible instance-wide default with a per-project override),
there's no sensible instance-wide default for "where do failures get
posted," so this is project-scoped only, configurable by
`manageProject` permission (or Tenant Admin), with no instance-wide
fallback layer.

**D3 — Multiple destinations per project, not a single URL.** A new
table (`webhook_destinations` or similar — exact name decided during
implementation to match existing table-naming convention), not a single
nullable column on `projects`. A team wanting both a Slack channel and an
internal on-call system needs two destinations firing on the same event;
hardcoding one URL would immediately force a workaround (a
Slack-side integration fanning out to multiple channels) that TestPulse
can just support natively for the same implementation cost.

**D4 — Fire-and-forget from the service layer, not a background job
queue.** Mirrors `audit()`'s own established tolerance: a resolution or
delivery failure must never block the write it's attached to. Delivery
is a synchronous outbound HTTP call with a short timeout, made
best-effort from within `RecordResult`/`CloseRun` — not queued,
retried, or persisted if it fails. This trades delivery reliability for
architectural simplicity; acceptable for v1 given the non-goal on
retry/backoff above, and consistent with this codebase not having any
job-queue infrastructure to build on.

**D5 — Payload shape:** a small, stable JSON body — event type
(`result.failed` / `result.blocked` / `run.closed`), project key, the
relevant entity's key/id and a human-readable title, and a timestamp.
Not a full dump of the `Result`/`Run` domain object — keeps the payload
contract stable even as those internal structs evolve, and keeps the
payload genuinely actionable (a Slack message needs a title and a link,
not a JSON blob of every field).

**D6 — Sample Project showcase is configuration-only, not live
delivery.** CLAUDE.md's standing Sample-Project-showcase rule applies,
but a seeded demo has no real externally-reachable destination to
deliver to. The showcase seeds one webhook destination against a
clearly-fake, documented placeholder URL (e.g.
`https://example.com/webhooks/testpulse-demo`) so the *configuration UI*
— the settings panel, the list of configured destinations — is
demonstrated on a fresh instance. This is a deliberate, documented scope
decision, not an oversight: actually firing a real webhook during
seeding would either silently fail against a fake URL (misleading) or
require a real external service the seed script can't depend on.

## Risks / Trade-offs

- **Delivery isn't guaranteed** (D4) → Acceptable for v1; documented as a
  known limitation in docs/integrations.md rather than silently implied
  to be reliable. A future change can add retry/backoff if real usage
  shows it's needed.
- **A misconfigured or malicious webhook URL could be used for SSRF**
  (the server making outbound requests to an attacker-controlled or
  internal-network URL) → Luis's security review (tasks.md 12.1) found
  the original config-time-only check (validating `https://` and
  rejecting literal localhost/private-IP hosts) insufficient: it never
  resolved DNS for hostname-form destinations at all, and the outbound
  HTTP client followed redirects by default, both confirmed exploitable
  with live PoCs. Resolved (tasks.md 12.2) by moving the real
  enforcement to dial time: `webhookHTTPClient`'s `Transport.DialContext`
  resolves the destination and rejects loopback/private/link-local
  results against the actual IP being connected to, on every connection
  attempt including redirect hops — and redirects are refused outright
  regardless. The config-time check remains as immediate UX feedback
  only, not the security boundary.
- **No delivery-history/debugging UI** (a team can't see "did my webhook
  fire, what did it return") → Out of scope for v1 per the
  non-goals above; if this becomes a real pain point, a small delivery-log
  table is a natural, separate follow-up.

## Migration Plan

New table via a new incremental goose migration (`apps/api/internal/db/migrations/`),
per CLAUDE.md's permanent migration policy — never edited once shipped.
No backfill needed (a genuinely new capability, nothing pre-existing to
migrate). No changes to existing tables.

## Open Questions

- Exact table/column names — decided during implementation to match
  this codebase's existing naming conventions (checked against
  `db/migrations/` at implementation time, not guessed here).
- Whether `run.closed` should fire regardless of the run's pass rate, or
  only when it closed with at least one failure — leaning toward always
  firing (simpler, and a 100%-pass close is still useful signal for a
  "go/no-go" run), but worth confirming against the issue's own framing
  during task breakdown.

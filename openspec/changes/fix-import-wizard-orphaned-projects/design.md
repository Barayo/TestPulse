## Context

`ImportProjectPage.tsx`'s `resolveTargetProject()` (called from both
`handleConnectSubmit` and `handleCsvConnectSubmit`) calls `POST
/api/v1/projects` immediately on Connect submit, before `POST
/api/v1/projects/{key}/import-jobs` (the dry-run scan) is even attempted —
but only when `targetMode === 'new'`. Choosing "Existing empty project"
never creates anything, so this problem is scoped entirely to the
new-project path.

Import jobs (`import_jobs` table, `apps/api/internal/store/import_jobs.go`)
are always project-scoped (`project_id NOT NULL`, every store/service method
takes or resolves a `projectID`) — there is no project-less job today.
`GetImportJob` (`GET .../import-jobs/{jobId}`) requires already knowing the
job's ID, which the browser only has in-memory for the session that created
it; there is no way to list a project's jobs at all, so once that tab
closes, the job (and the fact that a job ever existed) is invisible from
every UI surface.

The actual vendor calls happen out-of-process in `tools/import-connector`
(a separately-polling worker, not the API server), which claims a job,
calls `importer.BuildPlan`, and on failure does `msg := err.Error()` before
calling `CompleteJob` (`internal/poller/poller.go:87`) — `BuildPlan`
(`internal/importer/importer.go`) wraps every vendor-client error through
1-3 layers of `fmt.Errorf("...: %w", err)`, so `err.Error()` is always the
full internal call chain, verbatim, with no distinction between "the
network was unreachable" and "the site rejected our credentials" beyond
whatever text happens to survive the wrapping. Kiwi TCMS's client
additionally interpolates the job's own UUID into one error string
(`internal/kiwitcmsclient`), which is how it ends up in user-facing text.

Project deletion already exists and already requires archiving first
(`Service.DeleteProject`, `service.go:416` — "project must be archived
before it can be deleted... never trusting the UI alone for anything
destructive"). This change does not need to add new deletion machinery,
only make an orphaned project's history visible enough that a user knows to
use the existing archive-then-delete path, or knows to retry instead.

## Goals / Non-Goals

**Goals:**
- Make an incomplete/failed/abandoned import attempt visible on the project
  it targeted, with enough context (source, status, when, why) to decide
  whether to retry or clean up.
- Replace raw internal error text with a short, actionable, user-appropriate
  message across all four sources uniformly, not source-by-source.
- Consistency pass on the Connect screens' credential help copy.

**Non-Goals:**
- Not building a full import-job history/audit page. A project's *own*
  Overview page surfacing its *latest* job when the project is otherwise
  empty is enough to satisfy "visible and cleanable" — a dedicated list UI
  is more than this problem needs today, and can follow later if real usage
  shows it's warranted (the list *endpoint* is still worth adding now, since
  the UI need is a strict subset of it and it's the actually-missing
  primitive per the issue).
- Not adding retry/resume for a failed job — "retry" here means navigating
  back to the same `/import/:source` wizard and starting over, not resuming
  the failed job in place.
- Not extending the credential-help copy consistency pass (D5) to Xray or
  Tuskr's Connect screens — correction found during implementation: #196
  (Xray) shipped and closed before this change started, so unlike Kiwi
  TCMS, Xray and Tuskr already have their own credential-help text (just
  independently worded) rather than being genuinely missing it. Both
  already inherit the orphaned-project-visibility fix (D1-D3) and the
  error-classification fix (D4) automatically, since both flow through the
  same shared wizard and the same single `poller.go` choke point — only
  the cosmetic copy-wording pass is scoped down to the two sources that
  actually motivated it.

## Decisions

**D1: Keep project creation eager; fix visibility instead of deferring
creation.** Considered deferring `POST /api/v1/projects` until the dry run
succeeds, which would structurally prevent orphans for the new-project
path. Rejected: import jobs have no project-less form today, so this would
require either (a) a new non-project-scoped job resource with its own
ownership/credential-storage semantics before a project exists, or (b)
creating the project only after a successful dry run and re-pointing the
already-submitted job at it after the fact — both are materially bigger
contract changes than this bug warrants, and (a) in particular would need
its own security review (credentials stored with no project to scope
`manageProject` permission against). The issue's own acceptance criteria
("visible and cleanable **or** not created at all") treats these as
equally-acceptable resolutions; visibility is the smaller, lower-risk one
and directly satisfies the reporter's actual complaint (a project sitting
around with zero explanation), so it's the one this change makes.

**D2: Surface latest-job context on the project's own empty-state, not a
separate history page.** `ProjectPage.tsx`'s `isAllEmpty` branch already
special-cases "no content yet" — the natural place to show "this project
came from an incomplete TestRail import that failed: <reason>" is right
there, replacing (not alongside) the generic three-step "Get started" block
when a relevant job exists, since showing both would bury the more useful
information under generic onboarding tips. The three-step block still shows
for genuinely-new projects with no import history.

**D3: `GET /api/v1/projects/{projectKey}/import-jobs` returns jobs newest
first, no pagination.** Matches `ListByProject`-style list endpoints
elsewhere in this codebase (e.g. custom fields) that don't paginate because
the natural cardinality is small — an import wizard run creates at most 2
jobs (one dry-run, one real) per attempt, and even a project with several
abandoned attempts is realistically dozens of rows, not thousands. The
frontend only ever needs the newest one for D2; the endpoint returns the
full list (not just the latest) since that's the actually-missing primitive
the issue calls out, and a future history UI (if ever built) can reuse it
as-is.

**D4: Error classification lives in `import-connector`, applied uniformly
via one shared helper called from `poller.go` before `CompleteJob`, not
patched per-vendor-client.** The raw-error problem isn't specific to
TestRail/Qase/Kiwi's client code — Zephyr Scale's example in the issue only
*looks* clean because that particular failure happened to be a single
unwrapped layer; its own client wraps errors the same way
(`zephyrscaleclient/client.go`) and would leak identically under a deeper
failure. A single classification function run once, right before persisting
the error, is simpler and more consistent than teaching all five vendor
clients (four shipped + Xray in flight) to pre-format their own errors, and
guarantees no future source can reintroduce this bug by omission. Classifies
by inspecting the error chain for: a network-level failure (`net.Error`,
`context.DeadlineExceeded`, connection-refused/DNS patterns) → "Could not
reach `<source>`. Check the site URL and that it's publicly reachable."; an
HTTP 401/403 embedded in the message → "Authentication failed. Check your
credentials and try again."; an HTTP 404 → "The configured project/board
wasn't found. Check the project/site details."; anything else → a generic
"The import failed unexpectedly." fallback. Never includes the internal Go
error chain, function names, or any internal identifier (job UUID) in the
stored/displayed message — that detail remains available server-side only
via structured logging (already logged before this change), not lost, just
no longer user-facing.

**D5: The four Connect screens get literally the same "Need a credential?"
sentence structure**, substituting only the vendor name/menu path (already
true for the useful information — TestRail/Qase/Zephyr Scale already tell
users exactly where to generate a credential); Kiwi TCMS gets a symmetrical
one pointing at username/password (its own account, not a generated token,
since Kiwi TCMS's XML-RPC API doesn't have a separate token concept) rather
than being left as the one screen with no guidance at all.

## Risks / Trade-offs

- **A project can still end up empty-but-not-import-related** (e.g. a
  manually created project nobody's filled in yet) → D2's empty-state only
  changes when there's an associated import job for that project; a
  never-imported empty project keeps today's plain "Get started" block
  unchanged.
- **Error classification is necessarily lossy** (a rich internal error
  becomes one of four canned categories) → Acceptable: the goal is actionable
  guidance, not full diagnostic fidelity, which remains available in server
  logs for anyone who needs to debug further.
- **This doesn't prevent new orphans from being *created*, only makes them
  discoverable** → Accepted per D1; a user who never revisits the project
  after abandoning the wizard still has an empty project sitting in their
  list until they notice and clean it up. Judged acceptable since the
  before-state was strictly worse (literally no way to find out), and
  structural prevention was rejected as disproportionate (D1).

## Migration Plan

No schema migration — `import_jobs` already has every column
`ListByProject` needs. Additive-only: a new GET endpoint, a new
openapi.yaml path, and UI/error-copy changes. No rollback complexity beyond
reverting the commit.

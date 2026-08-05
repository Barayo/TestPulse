## Context

`group-runs-by-status` (already shipped) fixed the Runs page's grouping and
visual design — Open and Closed sections, health bars, a recessed/capped
"Show N more" treatment for the Closed panel — but explicitly deferred
deduplicating or grouping repeated CI-generated run names as "a separate,
larger feature." Live on `testpulse.fly.dev/projects/TD/runs`, the Open
section shows ~25 runs, almost all sharing the same misleading name.

Investigation (Pepe, Fable 5 — mock at
https://claude.ai/code/artifact/eb28e338-50c6-4320-9256-2d746a09e32f) traced
this to two independent bugs rather than a genuine per-spec-file import
volume problem:

1. CI's dogfood report step (`.github/workflows/ci.yml`) posts exactly one
   `POST /imports` per push to `main`, with the whole suite's merged
   `apps/web/e2e-results.xml`. The request body sends only `format` and
   `report` — no `name`. `Service.Import` falls back to
   `junitxml.Parse`'s `Report.SuiteName`, which is set to the first
   `<testsuite>` element in the document. Playwright's JUnit reporter emits
   one `<testsuite>` per spec file, in alphabetical order, so every
   dogfood run is named after whichever spec file sorts first
   (`delete-mode.spec.ts`) — regardless of what it actually contains.
2. `RunRepo.Import`'s insert (`apps/api/internal/store/runs.go`) never sets
   `status`, so every imported run takes the `test_runs` table's `DEFAULT
   'open'`. Nothing ever closes it afterward. So every mislabeled run also
   never leaves Open — permanently — which is the section a QA lead
   scans first.

## Goals / Non-Goals

**Goals:**
- Every CI-imported run gets a name that reflects what it actually
  contains (the triggering commit), not an arbitrary alphabetically-first
  spec file name.
- CI-imported runs land in Closed, not Open, immediately on creation —
  they're finished snapshots, not work in progress.
- No new schema, no new UI component. Reuse the Closed section's existing
  recessed/capped treatment, which was already built for this volume.

**Non-Goals:**
- Grouping or collapsing repeated run names in the UI. Rejected: it would
  hide the underlying bug (wrong name, permanently open) behind a display
  trick rather than fix it, and it re-litigates scope `group-runs-by-status`
  already deferred deliberately — this change completes that plan rather
  than duplicating it.
- Correlating multiple spec-file imports into one run via a CI workflow-run
  ID. There's no per-spec-file fan-out to correlate — CI already posts
  exactly one import per push. Building multi-result-group run structure
  for a fan-out that doesn't exist would be unjustified new schema, by the
  same "don't build structure the data flow doesn't need" reasoning applied
  in `add-run-item-screenshot-attachments`'s final design consultation.
- A persisted manual-vs-import `source` field with a UI badge distinguishing
  them. No existing precedent for persisting "how a run was created"
  (`suiteKey` is already nil for both explicit-case-list runs and imports),
  and closing imports on creation already fully addresses the actual
  complaint without new backend surface. Left as a legitimate future
  nicety, not required here.
- Reducing CI import frequency (e.g., only importing on tag/release). Would
  silently lose the CI health history that's the point of dogfooding into
  TestPulse, and doesn't fix the mislabeling bug independent of frequency.
- Retroactively migrating the ~25 existing mislabeled/stuck-open runs on
  `testpulse.fly.dev`. There's no reliable persisted signal distinguishing
  them from legitimate human-created runs after the fact — both have
  `suiteKey = null`. A heuristic migration risks closing real work.

## Decisions

**CI supplies an explicit per-commit name, computed via env-var
indirection.** `.github/workflows/ci.yml`'s report step gains an `env:`
block (`COMMIT_SHA: ${{ github.sha }}`, `COMMIT_MSG: ${{
github.event.head_commit.message }}`), builds `name="main @
${COMMIT_SHA:0:7} — $(printf '%s' "$COMMIT_MSG" | head -1)"` in a shell
variable, and adds it to the existing `jq -n` call (`--arg name "$name"`).
Env-var indirection specifically avoids interpolating an untrusted commit
message directly into `${{ }}` inside the shell script, which would be a
script-injection vector (a commit message containing `` $(...) `` or
backticks). Short SHA first keeps the run identifiable even if
`RunRow`'s existing truncation clips a long commit subject.

**Imported runs are created `closed`, not left to the table default.**
`RunRepo.Import`'s insert changes from relying on `test_runs.status
DEFAULT 'open'` to explicitly inserting `status = 'closed'`. Rationale: an
imported run's items already carry final verdicts at creation time — there
is no "in progress" state to represent, unlike a manually-created run
someone works over time. `ReopenRun` (already shipped, gated on
`manageProject`) remains the existing path if someone needs to touch an
imported run afterward; no new capability is introduced.

**No parser change.** `junitxml.Parse`'s first-`<testsuite>`-name fallback
is correct, sensible behavior for a genuinely single-file report. The bug
is CI's responsibility — a caller merging multiple suites into one report
must supply its own name — not the parser's job to guess a better one.

**No automated migration for historical data.** Covered under Non-Goals;
call out a manual one-time cleanup (closing the known pre-fix stuck-open
runs via the existing Close action, or a narrowly-scoped one-off ops
script matching their known pre-fix names) as a follow-up task, run once,
not committed to the migrations directory.

## Risks / Trade-offs

- [Commit message could be empty or unusual (e.g., a merge commit with a
  multi-line message)] → `head -1` takes only the first line; an empty
  message still yields a valid (if terse) name like `main @ a1b2c3d —`,
  which is no worse than today's misleading name and never blocks the
  import.
- [Existing stuck-open runs remain stuck after this ships] → explicitly
  scoped out of automation (see Non-Goals); flagged as a manual follow-up
  task so it isn't silently forgotten.
- [The CI workflow YAML change can only be verified by observing a real
  run against `main` post-merge] → called out as an explicit manual
  verification task in tasks.md, not a fabricated automated test.

## Migration Plan

No schema migration. Deploy is a normal code + workflow YAML change:
1. Merge the `RunRepo.Import` status fix and doc corrections — takes
   effect on the next import.
2. Merge the CI workflow YAML change — takes effect on the next push to
   `main` after merge.
3. Manually close the known pre-fix stuck-open runs on
   `testpulse.fly.dev` as a one-time follow-up (tracked as a task, not
   automated).

Rollback: revert both commits independently; no data was destroyed by
either change, so rollback is a plain code revert.

## Open Questions

None outstanding — direction was validated with Pepe's before/after mock
prior to writing this design.

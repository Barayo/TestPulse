## Context

Two prior changes established the same pattern for different entities:
`link-run-item-assignee-to-identity` (an assignee is a real user/team
reference, resolved live) and `link-result-actor-to-identity`
(`test_run_results.actor_kind`/`actor_ref_id`, denormalized, no FK, so
attribution survives the actor being deleted). `test_case_versions` is
the one remaining identity-touching table with no actor at all —
`domain.CaseVersion{CaseID, Version, Content, CreatedAt}`.

Separately, `display_name` (`add-user-profile`) is nullable and only
ever set via self-service — most accounts never visit Profile
settings, so it stays `NULL` indefinitely. A "who edited this" feature
is much less useful if most rows would show nothing.

## Goals / Non-Goals

**Goals:**
- Every new case version records who created it, the same shape as
  `test_run_results` already does for verdicts.
- Every newly created account has a real (if generic) display name
  from the start, not `NULL`.
- The Version History row surfaces the actor without growing taller
  than it already is.

**Non-Goals:**
- Backfilling `actor_kind`/`actor_ref_id` on existing versions, or
  `display_name` on existing accounts — both stay `unknown`/`NULL`,
  same "absent, not fabricated" convention `link-result-actor-to-identity`
  already established for pre-migration rows.
- A client-editable display name at creation time. The admin-create-user
  form (`PeoplePage.tsx`) still only asks for email/password/role; the
  computed default is what a never-configured account shows, not a
  replacement for a name field.
- Any change to `BootstrapAdmin`'s existing hardcoded "Admin" display
  name.

## Decisions

**`actor_kind`/`actor_ref_id` on `test_case_versions`, not a separate
table.** Exactly mirrors `test_run_results`: `actor_kind text not null
default 'unknown' check (actor_kind in ('user','agent','unknown'))`,
`actor_ref_id text` (nullable, no FK — a version's attribution should
survive the actor account being deleted, the same reasoning already
documented on the result-actor columns). Populated server-side from
`domain.ActorFromContext`, the same source `RecordResult` already
uses — no client-supplied override exists for this (unlike results'
`actor` display-name override), since there's no analogous "edit on
behalf of someone else" use case for case authoring today.

**Default display name: prettified email local-part, computed once at
account creation, not derived on the fly at render time.** Splitting
the local-part on `.`/`_`/`-`/`+` and title-casing each token
(`jane.doe` → "Jane Doe", `j_smith99` → "J Smith99") happens in
`CreateUser`, writing a real value to `display_name` immediately —
not a display-layer fallback computed wherever a name is shown. This
keeps every consumer (`Avatar`, the new Version History row, the
header) working exactly as they already do against `displayName ??
null`, no new "compute a display name" branch anywhere else. If a
user (or admin, once `#65` ships) wants a different name later,
they/the account can just edit it — the default is a starting value,
not a locked-in one.

**Version History row: fold avatar + first name into the existing
change-signal line, not a new line (Pepe design review,
`version-history-actor-design.html`).** The row is already two lines
deep (version number + signal) before actor enters the picture; a
literal copy of Results History's "avatar+name on its own line"
pattern would make this the tallest row in a sidebar that already
competes with Properties and Results for space and collapses to an
accordion below 768px. `[avatar] Miguel · Steps changed` treats "who"
and "what changed" as one fact — closer to GitHub's commit-list
treatment (avatar beside the message) than to an execution-verdict
log, which is the better model for a change-log entry. First name
only on the row (full name via `title`) — a signal line that already
needs `truncate` shouldn't get a second variable-length string
competing for space. No avatar when `actorKind` is `unknown` — same
absent-not-broken convention as elsewhere. Not repeated in the
expanded diff panel, since the collapsed row already said it.

**"First name" extraction is a small display-layer helper, not a
stored field.** `display_name.split(' ')[0]`, applied where the
Version History row renders it. Storing a separate "first name" column
would duplicate `display_name` for a formatting concern that belongs
at render time, and every other surface (`Avatar`, header, People)
already renders the full `displayName`, so this stays local to the one
row that needs it.

## Risks / Trade-offs

- **A generic default name reads as a system-generated placeholder**
  ("Rgriffiths" isn't a name someone would choose) → Accepted: it's
  strictly better than `NULL` for the Version History use case this
  change is for, and remains trivially editable via existing
  self-service profile settings.
- **Mixed-case/unusual email local-parts produce odd-looking defaults**
  (e.g. numbers, single letters) → Accepted, same reasoning — a
  default is a starting point, not a guarantee of a polished name.

## Migration Plan

Single additive migration: `test_case_versions` gains `actor_kind`
(default `'unknown'`) and `actor_ref_id` (nullable) — no change to
existing rows' meaning, no backfill. Rollback drops both columns.

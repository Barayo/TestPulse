## Context

Every table in `apps/api/internal/db/migrations/00002_core_domain.sql` uses
`uuid PRIMARY KEY DEFAULT gen_random_uuid()`. Nothing else — no slug, no
sequential number, no user-facing identifier — exists today. This design
adds one alongside the UUID, for `projects`, `test_cases`, `test_runs`, and
`test_suites` (folders stay UUID-only, out of scope — confirmed with the
user). It was raised mid-implementation of `add-execution-import` (#38),
whose `externalId`-matching workflow is the immediate forcing function, but
the payoff is general: URLs, MCP tool calls, and any place a human types or
says an identifier.

Three decisions were already made by the user before this document, and are
not re-litigated here: (1) all four entity types get keys now, not just
cases; (2) the project key is auto-derived from the name, unique, and never
editable; (3) frontend routes switch to keys as the primary URL identifier,
not just a display label.

## Goals / Non-Goals

**Goals:**
- A short, typeable, memorable identifier for projects, cases, runs, and
  suites, generated automatically at creation with no new required form
  field.
- Uniqueness and immutability strong enough that the key is safe to embed
  in URLs, `record_property()` calls, and cross-system references.
- Minimal disruption to the store/service layers below the API boundary —
  the UUID primary key and every existing internal method signature are
  unchanged.

**Non-Goals:**
- Replacing the UUID primary key. It stays the FK/RBAC/versioning backbone.
- Folder keys. Folders remain UUID-addressed in both the API and the URL.
- Dual UUID+key support in routes/API path params. This is a hard cutover,
  not a transition period — see Decisions.
- Cross-validating that a case/run/suite key's embedded project prefix
  matches the `{projectKey}` segment elsewhere in the same URL path. The
  case/run/suite key alone is globally unique and sufficient to resolve the
  resource; a mismatched project segment elsewhere in the URL is cosmetic,
  not a security boundary (RBAC is still enforced from the resolved
  resource's actual project, same as today).
- Editing/regenerating a key after creation, for any entity.

## Decisions

**D1 — Project key: derived in Go, not in a DB trigger.**
Deriving a key from a name needs word-splitting and a dedup retry loop —
straightforward in Go, awkward and hard to unit-test in plpgsql. The
counters table (D3) still uses a trigger, because that's a fixed, static
insert with no string logic, matching the existing
`create_project_root_folder()` precedent exactly. Splitting the two this way
keeps the hard-to-test part (string algorithm) in Go where it gets a plain
unit test, and the easy part (seed 3 fixed rows) in the DB where the
existing trigger idiom already covers it.

Algorithm (`domain.DeriveProjectKey(name string) string`):
1. Split `name` on runs of non-alphanumeric characters, drop empty tokens.
2. ≥2 tokens: take the first letter of each, uppercase, concatenate,
   capped at 5 letters (first 5 tokens). `"Customer Payments Api"` →
   `"CPA"`. `"Login Service"` → `"LS"`.
3. Exactly 1 token: uppercase the first 4 letters (or the whole token if
   shorter). `"Checkout"` → `"CHEC"`. `"Go"` → `"GO"`.
4. 0 tokens (name was entirely symbols/emoji) or result shorter than 2
   chars: fall back to `"PROJ"`.
5. Uniqueness: `ProjectRepo.Create` attempts the insert with the candidate;
   on a unique-violation (Postgres code `23505` on `projects.key`), retry
   with `candidate + "2"`, `candidate + "3"`, … in the same transaction
   attempt, bounded at 50 tries (practically unreachable, just a safety
   bound against an infinite loop bug).

**D2 — Case/run/suite key format: `{projectKey}-{n}` / `-R{n}` / `-S{n}`.**
Cases are the dominant, most-referenced entity (imports, suites, run
items, discussion) — they get the bare, cleanest form. Runs and suites get
a one-letter infix so a key's entity type is visible on sight, since all
three share one project's key namespace and would otherwise be
indistinguishable numbers. Because the project key is itself globally
unique, `{projectKey}-{n}` is globally unique too — no compound lookup
needed (D5).

**D3 — Per-project, per-type counters: a table + trigger, incremented via
`UPDATE … RETURNING` inside the entity's own creation transaction.**
```sql
CREATE TABLE project_key_counters (
    project_id   uuid NOT NULL REFERENCES projects (id),
    entity_type  text NOT NULL CHECK (entity_type IN ('case', 'run', 'suite')),
    next_value   integer NOT NULL DEFAULT 1,
    PRIMARY KEY (project_id, entity_type)
);
```
Seeded with three rows (`case`, `run`, `suite`) by extending the existing
`create_project_root_folder()` trigger (renamed to reflect its now-broader
job, e.g. `create_project_defaults()`) — same AFTER INSERT ON projects
trigger, one more set of INSERT statements. This guarantees counters exist
for every project regardless of call site, exactly like the root folder
guarantee today.

Each entity's `Create` method claims its number in its existing
transaction:
```sql
UPDATE project_key_counters SET next_value = next_value + 1
WHERE project_id = $1 AND entity_type = 'case'
RETURNING next_value - 1
```
This is safe under concurrent creates: the `UPDATE` takes a row lock on the
counter row, so two concurrent case creations in the same project serialize
on this statement and get distinct values — same guarantee Postgres gives a
real `SEQUENCE`, without needing one sequence object per project per type
(Postgres sequences aren't naturally parameterized by a table row, and
dynamically creating one via DDL per project was rejected as needless
operational complexity for no benefit over a counters table).

**D4 — Resolution happens once, at the API boundary; nothing below it
changes.** Handlers currently read a path param and pass it straight to a
service/store call that assumes a UUID. Each of the four repos gains one
new method — `ProjectRepo.IDByKey`, `CaseRepo.IDByKey`, `RunRepo.IDByKey`,
`SuiteRepo.IDByKey` (`SELECT id FROM <table> WHERE key = $1`) — called once
at the top of the relevant handlers to translate the path param into the
internal UUID. Every service method, RBAC resolver
(`ProjectID`/`ItemProjectID`), and store method below that point keeps its
existing UUID-based signature unchanged. This is the decision that keeps
this change from becoming a rewrite of the store/service layers.

**D5 — Path parameter names change from `…Id` to `…Key` (`projectId` →
`projectKey`, etc.) in `openapi.yaml`, the Go router, and the generated
`api.ts` client.** The alternative — keeping the param named `projectId`
while its value becomes `"LOGIN"` — is a smaller diff but leaves the
generated TypeScript client typed as `caseId: string` for a value that is
never a UUID again, which is actively misleading to anyone reading the
client code cold. Renaming is mechanical (find/replace per route) but
honest; chosen for that reason.

**D6 — Hard cutover, no dual UUID+key routing.** Consistent with the
project's pre-1.0 migration policy (no real deployment has data or
bookmarks to protect): API path params and frontend routes accept the key
only. A request with a UUID in a `{projectKey}` position simply won't match
any row's `key` column and 404s like any other not-found key — no special
casing needed.

**D7 — `id` and `key` both appear in every API response body.** `id` stays
the stable internal identifier (unaffected by anything in this change);
`key` is the new human-facing one. Nothing currently consuming `id` from a
response breaks.

## Risks / Trade-offs

- **BREAKING for anything already referencing a UUID-based URL or path
  param** → Mitigation: none needed pre-1.0 (no real deployment); this is
  the explicit trade the project's migration policy accepts.
- **Auto-derived keys can collide in spirit even when unique in fact**
  (e.g. "Login Service" → `LS`, "Loan Servicing" → `LS2`) → Mitigation:
  none needed for v1; the dedup suffix guarantees correctness, not
  distinctiveness, and a project's key is visible at creation time in the
  UI if a team wants to rename the project before creating cases (renaming
  the project name doesn't change the key, but nothing stops renaming
  early — see next risk).
- **Key drifts from the project's current name after a rename** (the key
  is derived once, at creation, and is immutable — `ProjectRepo.Rename`
  already exists and doesn't touch `key`) → Mitigation: this is the same
  behavior as Jira's project keys; document it explicitly in
  `docs/test-management.md` so it doesn't read as a bug.
- **Sequential counters reveal a project's case/run/suite volume and
  creation order** (e.g. `LOGIN-42` implies ~42 cases exist) →
  Mitigation: none needed; this is the same trade-off Jira, Linear, and
  GitHub already made, not a new risk class introduced by this design.
- **Large mechanical diff across existing tests** (every store/handler/e2e
  test that currently seeds or asserts on a UUID-shaped path param) → this
  is an execution-time cost, not a design risk; tasks.md budgets for
  sweeping fixtures package-by-package rather than attempting it in one
  pass.

## Migration Plan

- Amend `00002_core_domain.sql` in place (pre-1.0 policy): add `key`
  columns + unique indexes to the four tables, add
  `project_key_counters`, extend the project-creation trigger. No new
  `000N_*.sql` file.
- No backfill migration: pre-1.0, no real deployment's data survives an
  amended migration file (goose's checksum will mismatch on any
  already-migrated local/demo database — expected and accepted per the
  project's stated policy; resolved by recreating the local Docker volume,
  same as prior schema-amending changes this session).
- Backend and frontend land together in this one change, not
  incrementally behind a flag — a half-cutover state (some routes on keys,
  some still on UUIDs) has no real audience to protect pre-1.0 and would
  only add confusion.
- `add-execution-import` (#38) resumes after this change archives; its
  `conftest.py` snippet and design should be revisited to paste the case
  key instead of a UUID into `record_property()` — tracked as a note in
  this change's proposal, not implemented here.

## Open Questions

None outstanding — every choice above was either specified by the user or
has a stated rationale.

## Addendum: request-body identifier fields (discovered during implementation)

D4/D5 covered path parameters but not request bodies that also carry a
client-supplied identifier for one of the four key'd resource types:
`AddItemInput.caseId`, `RunInput.caseIds`, `RunInput.suiteId`. Leaving these
as raw UUIDs while path params switch to keys would produce an inconsistent
boundary — a client would address a case by key in the URL but by UUID in a
request body in the same API. Extending D4's resolution boundary to cover
these fields too (renamed `caseKey`/`caseKeys`/`suiteKey`, resolved via the
same `IDByKey` methods before reaching the service layer) keeps the
boundary consistent: every client-supplied identifier for a project, case,
run, or suite — wherever it appears in a request — is a key, not a UUID.
`moveCase`'s body `folderId` is unaffected (folders stay UUID-addressed).

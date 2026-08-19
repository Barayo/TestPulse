## Context

Four related UX gaps surfaced from one thread of dogfooding the suite → run-creation
flow, investigated live against a running instance (not just by reading code) and
designed by Pepe (Fable 5) across three review passes:

1. `ConfirmBanner` (the "Run created" confirmation) genuinely fires after a quick-run
   but is invisible in practice. Verified with a `MutationObserver` in a live browser
   session: the DOM node is added and stays present, but `window.scrollY` was 129 on a
   freshly-loaded suite page — the banner renders inline, right after `Breadcrumbs` and
   before the page's own `<h1>`, so it sits above whatever the user happened to be
   scrolled to when the dialog closed. This is **not** a route-change scroll-restoration
   bug — `handleQuickRun` never navigates; the banner renders back into the same
   already-scrolled document.
2. `SuiteDetailPage.tsx` always renders `SuiteCaseGrid` (the case-membership picker) as
   its only primary content. There is no suite-scoped view of run history or stability,
   even though `SuitePassRateTrend.tsx` — a fully built, fully tested sparkline component
   for exactly this — already exists in the codebase with zero non-test call sites
   (confirmed via `git log`: it landed in commit `1868db6`, "feat: add suite-level
   pass-rate trend," and was apparently never wired into a page).
3. `add-run-comparison-view` (just archived into main specs as part of this change,
   since it was complete but never archived) shipped a comparison picker
   (`RunComparePickerPage.tsx`) with no discoverable entry point anywhere in the UI
   except one auto-resolved link ("Compare to previous run"). Confirmed via grep: zero
   other call sites link to `/projects/{projectKey}/runs/compare`.
4. The quick-run dialog's pre-filled Name field, and `NewRunPage.tsx`'s seeded-name
   field on the "Customize selection" hand-off, use `autoFocus` alone, which parks the
   cursor without selecting the suggested text — a suggested name can be accepted without
   ever being examined.

## Goals / Non-Goals

**Goals:**
- Make the run-creation confirmation actually visible, regardless of scroll position or
  which of the three call sites fired it.
- Give the suite detail page a real "how's this suite doing" view, reusing the
  already-built `SuitePassRateTrend` rather than inventing a new chart.
- Make run comparison discoverable from the two places a user would naturally look for
  it (a run's own page, and the project's run list) via the existing picker, following
  an object→action interaction (right-click/menu on the object, not a form you fill in
  from scratch).
- Make the run-creation name field read as something to actively confirm, not an inert
  placeholder.

**Non-Goals:**
- No new backend endpoints, no `openapi.yaml` changes — every data point this change
  surfaces already exists (`run.name` in the create response, `GET
  /suites/{suiteKey}/trend`, `GET /projects/{projectKey}/runs`).
- No suite-scoped flaky-case signal. `GET /projects/{projectKey}/flaky-cases` is
  project-wide and keyed by case, not suite — showing it here would mean a second
  unscoped fetch cross-referenced against `suite.caseIds` client-side, and there's no
  already-built component waiting for it (unlike `SuitePassRateTrend`). Worth doing once
  it's cheap to scope server-side; explicitly out of scope here.
- No app-wide scroll-restoration-on-navigation fix. Real (grepped: zero uses of
  `scrollTo`/`scrollIntoView`/`ScrollRestoration` anywhere in `apps/web/src`), but
  orthogonal — the toast bug isn't caused by navigation, and fixing it doesn't require
  fixing that.
- No same-run-name collision warning. Run names have no uniqueness constraint at the
  store layer, and that's intentional — a recurring run (e.g. a nightly regression run
  of the same suite) is *supposed* to keep the same name run after run, disambiguated by
  date and health, not name. A collision nag would be a false-positive-prone gate against
  ordinary usage.
- Not extending the select-on-focus fix to the suite Rename dialog, which has the
  identical prefilled-no-select pattern. Flagged as a natural, low-cost follow-up, not
  bundled in here since it wasn't part of what was asked.

## Decisions

### D1 — `ConfirmBanner` becomes a `fixed`, non-auto-dismissing toast
Position: `fixed`, `inset-x-4 bottom-4` on mobile, `sm:inset-x-auto sm:right-6
sm:bottom-6 sm:w-96` from `sm:` up. No header/footer in `Layout.tsx` uses `fixed`, so
nothing to collide with. Drops `AUTO_DISMISS_MS` (currently 4000ms) — a toast the user
might not be looking at when it fires needs to wait for them, not the reverse; dismiss
only on manual click or on unmount when the host page navigates away (the banner's state
already lives on the page component, so no extra cleanup is needed for that case).
Surface changes from translucent `bg-primary/10` to solid `bg-card` + `ring-1
ring-foreground/10` — a banner in document flow only ever sits on `bg-background`, so a
tint reads fine there; a toast floating over arbitrary content needs a solid surface to
read as "above everything," matching how `DialogContent` already uses solid
`bg-popover`. Gets the one deliberate `shadow-lg` in the design system, justified
because every other floating surface (`Dialog`) gets its separation from a full-screen
backdrop this toast structurally can't have (it isn't modal). Swaps the raw `×` character
for lucide's `XIcon`, matching `DialogClose`'s existing precedent — the current banner
was the one place in the app using a bare glyph instead of an icon component.

**Alternative considered**: fix scroll restoration on route change instead. Rejected —
doesn't address this bug (no navigation occurs in the quick-run flow) and is a larger,
separate change; noted as a real, independent gap in Non-Goals.

### D2 — Confirmation copy names the run
`Run "{name}" created.` with curly quotes (`"…"`), matching the quoted-name idiom
`SuiteActionsMenu.tsx`'s own delete-suite dialog already uses (`Delete "{suite.name}"?`)
— not the straight quotes the separate run-delete dialog on `RunPage.tsx` uses elsewhere
in the app. That's a small pre-existing inconsistency, noted but not fixed here (out of
scope: fixing one unrelated dialog's quote style is not part of this change). Quoting
isn't decorative: default quick-run names are literally `${suite.name} run`, so an
unquoted message reads as a run-on sentence. Link label shortens to "View it →" (the
word "run" is already stated in the message). Message stays a plain string, not bold —
a compact toast already carries an icon, link, and dismiss control competing for
attention.

Per call site:
- `SuiteDetailPage.tsx` / `SuitesPage.tsx`: `onRunCreated` on `SuiteActionsMenu.tsx`
  changes signature from `(runKey: string) => void` to `(run: {key: string; name:
  string}) => void`, since `data.name` is already present on the create-run response
  (`Run` schema requires `name`) — no backend change. Banner keeps its "View it →" link.
- `RunPage.tsx`: no link — the user is already on the run's own page. Message only,
  gated on `showCreatedBanner && run` (not `showCreatedBanner` alone), since `run` may
  not have finished loading yet when this banner would otherwise fire, and rendering
  `Run "undefined" created.` is worse than a one-render delay. Drops "successfully" from
  the old wording to match the other two sites' shorter phrasing.

### D3 — Suite Detail page: `isEditing` boolean, not a new route
Reuses `CaseDetailPage.tsx`'s exact existing pattern (a boolean, toggled by a header
button, sidebar sections constant across both states) rather than a new route or tabs.
Checked and rejected as precedent: `ProjectSettingsPage.tsx`/`RolesPage.tsx` — neither
has a view/edit split; they're permission matrices, not the same shape of problem.

View mode primary content — two stacked cards:
- **Stability**: renders `SuitePassRateTrend`, fed by the suite's existing
  `GET /suites/{suiteKey}/trend` data (the same call `RunPage.tsx`'s "Compare to
  previous run" resolution already makes). See D7 for the two-view redesign this
  component itself received once real usage surfaced both a UX gap and a rendering
  bug in the original single-view implementation.
- **Run history**: the project's `RunsPage.tsx` row/section idiom (name, health bar,
  relative time), filtered client-side to `run.suiteKey === suite.key`, extracted into a
  shared component so both pages import one implementation rather than duplicating it.
  Includes the per-run "Compare…" action (D4) on each row, and a `closed.length >=
  2`-gated "Compare runs" button in the card's header pointing at the existing
  project-wide picker.

  **Known, accepted limitation**: `GET /api/v1/projects/{projectKey}/runs` has no
  server-side filter or limit param, so this card fetches the whole project's run list
  and filters client-side down to one suite. Fine at the scale this app runs at today;
  a real problem at real scale, matching the project's standing "design aggregates for
  DB scale, not client loops" caution. A `?suiteKey=&limit=` param is the correct
  long-term fix — out of scope for this change, tracked as a follow-up.

Case list is **removed from view mode entirely**, not shown read-only — a read-only
render of the same picker chrome (section tree, filter toolbar, just no checkboxes)
doesn't address the actual complaint (the picker UI itself isn't a good landing view);
it just removes the interactive part. Case count stays visible via the existing
"Cases" property row. Everyone — editor or not — gets a button into the case list,
labeled `permissions?.suiteEditMembership ? 'Edit cases' : 'View cases'`, opening the
same `SuiteCaseGrid` either way (today, every visitor already sees the grid; gating the
new entry button to editors only would be a real access regression).

The old standalone `PropertyRow label="Last run"` is removed — redundant once Run
history exists one section down (matching `docs/design-system.md`'s own
redundancy-avoidance precedent for entity headers). "Pass rate" stays (cumulative
across all runs, not restated by the trend chart, which shows the trend not a single
number).

**Implementation gap this surfaces**: `SuiteCaseGrid.tsx`'s footer today renders exactly
one button (`onCommit`) and nothing when `readOnly` — there is currently no way to leave
edit mode. Needs a new `onExit` prop: "Cancel" alongside the existing commit button when
editable, or "Done" alone when read-only — mirroring `CaseDetailPage.tsx`'s own bottom
`Cancel`/`Save changes` pair, not a new top-of-content "back" link (nothing else in this
app exits a same-page mode that way).

### D4 — Per-run "Compare…" via `RowActionMenu`, seeding the existing picker
`RunsPage.tsx`'s `RunRow` currently has no per-row menu at all — a single full-row
`<Link>`. Restructures to a `<Link>` + sibling `RowActionMenu` (an interactive control
can't nest inside another one), matching `RunItemRow`'s existing per-row menu in
`RunPage.tsx` and `SuiteCard`'s identical restructuring in `SuitesPage.tsx`. Right-click
(`onContextMenu`) and a visible "⋯" trigger both open the same menu via its `openAt`
handle. Hidden entirely (not disabled) on open runs, matching
`SuiteActionsMenu.tsx`'s existing `menuItems.length > 0 &&` convention for "this action
doesn't apply here" — comparison only works on closed runs.

Selecting "Compare…" navigates to `/projects/{projectKey}/runs/compare` with `{ state:
{ seedRunKey: run.key } }` — the same one-shot `location.state` idiom
`SuiteActionsMenu.tsx`'s "Customize selection" → `NewRunPage.tsx`'s `seedFromSuiteKey`
already established. **Required companion change**: `RunComparePickerPage.tsx` must
read `location.state?.seedRunKey` once on mount, pre-fill the first dropdown, and clear
the state — without this the entry point is a dead end (an empty picker with no
connection to the run that was clicked).

`RunPage.tsx` gets a matching `size="sm" variant="outline"` "Compare…" button in its
existing header row, leftmost — before Close/Reopen, before the always-destructive-last
Delete (least-consequential-action-first, matching `SuiteActionsMenu`'s own
Run→Rename→Delete ordering). Visible only when `run.status === 'closed'`. Not gated on
"project has ≥2 closed runs" the way a project-wide list might be, since `RunPage.tsx`
doesn't already load the project's run list and shouldn't add a fetch purely for a
visibility gate — `RunComparePickerPage.tsx` already tolerates landing with too few
options (Compare stays disabled until both dropdowns are chosen).

The existing "Compare to previous run" link is kept, not folded into this — it's a
zero-click shortcut to one specific, auto-resolved run (the immediately-prior closed run
of the same suite), strictly faster than picking from a list for the single most common
comparison.

`RunsPage.tsx`'s header also gets its own plain "Compare runs" button (outline variant,
left of the existing "+ New run"), unseeded — it just opens the picker cold. Gated on
`closed.length >= 2` rather than a permission flag (the picker itself has none, matching
the app's "hide entirely, don't dead-end" convention already used elsewhere). This is a
third, coarser entry point alongside the per-row and per-run ones above — useful when
there's no specific run in mind to start from. The Run history card on the suite page
gets the identical treatment (same gate, same unscoped picker) for the same reason.

### D5 — Select-on-focus for prefilled run-name fields
`SuiteActionsMenu.tsx`'s quick-run dialog: add `onFocus={(e) =>
e.currentTarget.select()}` alongside the existing `autoFocus` on the Name input — the
suggested name highlights the instant the dialog opens, so accepting it (Enter, or a
click on Create) is as deliberate as typing over it. `NewRunPage.tsx`'s seeded-name
field on the "Customize selection" hand-off gets the same treatment, plus `autoFocus`
itself (currently has neither) — worse today, since the seeded value sits in a field
with no focus at all. Because the seeded value arrives via a `useEffect` after mount,
not through React's own `autoFocus` timing, the select-on-mount needs a ref rather than
relying on the `autoFocus` prop. The plain "New run" entry point (blank name, a
placeholder, `canCreate` already requires typed input) is untouched — nothing prefilled
there to blindly accept.

### D6 — Bug fix: "Compare to previous run" must also require the current run be closed
Found live while testing this change (not originally in scope, but directly adjacent —
same link, same page this change already modifies in D4): `RunPage.tsx`'s
`priorRunKey` resolution only checks whether the run's suite has a prior *closed* run
in its trend data; it does not check whether the *current* run itself is closed. Since
`CompareRuns` rejects any comparison where either run is open (`test-execution`'s
"Comparing an open run is rejected"), an open run whose suite happens to have an
earlier closed run shows a working-looking "Compare to previous run" link that always
400s — surfaced client-side as a generic "Comparison not found," which is doubly
confusing since that copy implies a missing run, not an invalid pairing. Verified via
direct API calls against the Sample Project: `GET
/runs/{closedRunKey}/compare/{openRunKey}` → `400 {"error":"both runs must be
closed"}`.

Fix: gate the link's visibility on `run.status === 'closed'` in addition to the
existing "suite has a prior closed run" check — the same gate already used for D4's new
"Compare…" button on this page. This closes off the only realistic path to that 400 in
the UI (the explicit picker already restricts to closed runs; D4's row/button entry
points are gated the same way); a hand-typed URL comparing an open run can still hit
the generic "Comparison not found" message, which is an acceptable fallback for that
edge case rather than something worth a bespoke error state.

### D7 — Stability card: a two-view tab strip, a real mark-spec upgrade, and a real rendering-bug fix
Found live, after D3 shipped and was used against real data: a suite with several open
runs and one closed run showed "100% · 1 runs" in Stability while Run history (right
below it) showed all 5 — correct per `GET /suites/{suiteKey}/trend`'s existing,
unchanged contract (open runs excluded, since "their in-progress counts do not
represent a completed outcome"), but nothing in the UI explained the mismatch, so it
read as broken. Separately, a live screenshot showed the chart's point markers
rendering as squashed horizontal dashes instead of dots — a real geometry bug, not
just a styling gap.

**The rendering bug's actual mechanism** (a wrong hypothesis was raised and corrected
during design review): `SuitePassRateTrend`'s `<path>` already has
`vectorEffect="non-scaling-stroke"`, but that attribute only protects **stroke
width** from scaling — it does nothing for **fill geometry**. The chart's
`viewBox="0 0 100 40"` with `preserveAspectRatio="none"` stretches non-uniformly
(~19× horizontal vs. vertical on a wide card) to fill the container — correct,
expected behavior for the line itself, but a `<circle r={2.5}>` living in that same
coordinate space has its fill shape squashed into a ~19×-wide ellipse regardless of
any vector-effect attribute. Adding `vector-effect` to the circles would not fix
this.

**Real fix**: point markers move entirely out of the SVG's viewBox coordinate space
into an absolutely-positioned HTML overlay — `left`/`top` percentages, sized in real
CSS pixels (7px regular, 12px endpoint) — so they can never be non-uniformly
distorted, since they're never inside the transform doing the distorting.

**Two views, a tab strip, not a carousel**: "Closed runs" (today's existing data,
unchanged) and "Open + closed" (new). Carousel was considered and rejected — zero
precedent anywhere in this app (grepped `apps/web/src`), and it implies swipe/
spatial/auto-play affordances irrelevant to picking one of two fixed views. Reuses
the exact `rounded-xl bg-muted p-1` / active `bg-card shadow-sm` tab idiom D3 already
established for this same page's own View/Edit mode toggle — one interaction pattern
per page, not two. Each view gets its own one-line caption stating what it counts,
closing the exact gap that caused the original confusion (e.g. "Only closed runs — an
in-progress run has no final verdict yet" / "...the open run's rate counts only
what's been recorded so far against its full case list — it will keep moving").

**Data semantic, stated explicitly, not left implicit**: confirmed against
`apps/api/internal/store/runs.go`'s existing, unchanged `passRate` computation — an
open run's shown rate is `pass-count / total-items-including-still-pending`, so a run
2/18 items in with both passing shows ~11%, understating quality-so-far. This is
exactly why it needs its own caption rather than being silently blended into the same
number as a closed run's final rate.

**Mark spec, one definition applied to both views**: 2px `--primary` stroke line
(unchanged), an area fill under it (`--primary` 18%→0% opacity, the same color
already carrying the pass semantic app-wide — no new hue), a faint two-line grid
(`--border`, at the 50%/100% marks) for scale reference, a 2px `--card`-colored gap
ring on every point separating it from the line/area behind it, and an emphasized
endpoint (12px vs. 7px, plus a soft `--primary` glow) — "you are here," not just the
last dot in the row. The one deliberate divergence between the two views, only
because the underlying data genuinely differs: an open run's point — only possible on
"Open + closed" — gets a hollow marker (`--card` fill, `--primary` stroke, dashed
outline) instead of the solid glow/fill treatment, reading as provisional rather than
settled; if the open point is the endpoint, the line segment leading into it is also
dashed.

**Component contract change**: `SuitePassRateTrend`'s prop moves from `points:
SuiteTrendPoint[]` to a normalized `points: TrendPoint[]` (`{ runKey, runName,
createdAt, rate, isOpen, detail }`) — one render path serves both data sources, and
the component itself doesn't know or care which source it's looking at.
`SuiteDetailPage.tsx` maps `SuiteTrendPoint[]` (already fetched, closed view) and the
already-fetched suite `Run[]` list (already used for Run history — no new endpoint or
fetch) into this shape before passing down.

**Tooltip fidelity is honestly asymmetric, not silently equalized**: "Closed runs"
points use the existing `SuiteTrendPoint.counts` for an exact fraction ("16/18
pass"). "Open + closed" points are built from `Run.passRate` alone — computing an
exact fraction for an open run would need a per-point `GET /runs/{runKey}/summary`
call, not worth N extra requests for a hover tooltip — so those show percentage only,
explicitly labeled "in progress."

**No backend or API changes** — both data sources are already fetched by
`SuiteDetailPage.tsx` for the already-shipped Stability/Run-history cards.

**Real, named test-migration cost**: `SuitePassRateTrend.test.tsx` currently asserts
against SVG `<circle data-testid=…>` elements — moving markers to an HTML overlay
changes what those tests probe entirely. Rewritten alongside the implementation
(TDD), not preserved by coincidence.

### D8 — Stability headline never reflects an open run's own rate
Found live, immediately after D7 shipped: a suite with runs 100% → 75% → (open, zero
results recorded) showed a giant "0% pass" headline in "Open + closed" — technically
correct (`latest.rate` where `latest` is the newest point), but misleading: it reads
as "this suite just crashed" when nothing has actually failed, nothing has been
*tested yet* in the newest run.

**Fix**: the headline walks backward from the newest point to the most recent
**closed** one and always uses that rate. If newer open points exist, a secondary
`Badge variant="secondary"` next to the headline names how many ("N in progress") —
reusing the exact treatment `RunsPage.tsx` already uses for its "Open" section
label. If there is no closed run at all, the headline shows a placeholder (`—`,
matching the existing `PropertyRow` empty-value convention) with the same badge and
an explanatory caption.

**One algorithm, not two, not gated by which tab is active**: it runs identically
over whatever `TrendPoint[]` it receives. On "Closed runs" data, open points are
never present (`GET /suites/{suiteKey}/trend` excludes them server-side) — the
algorithm lands on the newest point itself and the badge never renders, so today's
original behavior falls out for free with zero `if (activeTab === ...)` branching.

**Two things considered and rejected, not just the first idea that worked**:
- *Softening the number instead of replacing it* (e.g. "0% so far" next to the same
  giant glyph). Rejected — the number stays the dominant visual element either way; a
  small trailing qualifier is exactly the class of "context nobody reads" failure D1
  already fixed once for the confirmation toast. Not shipping a milder version of the
  same mistake.
- *A completeness threshold* (treat a barely-started open run differently from a
  mostly-done one). Rejected on the merits: `Run` only ever exposes one blended
  `passRate`, never a recorded-count/total breakdown, so there is no signal to tell
  "0/8 recorded" from "8/8 recorded and genuinely failing badly" — both produce
  identical `passRate: 0`. A threshold built on that number alone would misfire
  exactly backwards on the case that matters most: a real, alarming failure
  suppressed as if merely unstarted.

**Precedent checked and found not to transfer**: `RunStatusBreakdown.tsx` (`RunPage`'s
own status bar) shows an identical "0% pass" on a brand-new run, but a full segmented
status bar directly below it (visibly gray/pending) is what actually disambiguates
"untested" from "failed" there — not the number. Replicating that here would need a
full per-status breakdown for every open point, unavailable client-side without N
extra `GET /runs/{runKey}/summary` calls (the same cost already ruled out for
tooltips). Different data reality, different fix.

`SuiteDetailPage.tsx`'s `runPoint` mapping (`rate = r.passRate ?? 0`) is unrelated and
unchanged — that fallback only matters for a run with literally zero items, an edge
case orthogonal to "the newest point happens to be open."

### D9 — Run comparison picker: a custom listbox reusing `RunRow`, not richer `<option>` text
Found live, immediately after the D4 entry points shipped: the picker's two native
`<select>` elements showed two runs both named "Smoke run" with nothing to tell them
apart — no date, no health. Real and structural, not a one-off: recurring identical
run names are intentional in this app (D5's own non-goal already establishes this —
a nightly regression run keeping its name run after run, disambiguated by date/health
not name, is normal usage), so a name-only picker was always going to hit this.

**Rejected**: enriching each `<option>`'s plain-text label (e.g. appending a date).
Cheaper, but a native `<option>` can only ever render plain text — no health
indicator at all, and pass rate is arguably the more useful disambiguator than date
for "are these two actually worth comparing." This app already has one settled way
to present a run — `RunRow` (`components/RunList.tsx`), used by `RunsPage.tsx` and
the suite's own Run history card. Making this picker a third real call site for the
same row is a stronger, more consistent outcome than a second, weaker, text-only way
to show identical data specifically here.

**Real, stated cost, not undersold**: no listbox/combobox pattern exists anywhere in
this app today (grepped `apps/web/src` for `role="listbox"`/`Combobox` — zero hits).
The target is the WAI-ARIA APG "Select-Only Combobox" pattern — `role="combobox"`
trigger with `aria-expanded`/`aria-controls`, `role="listbox"` popup, `role="option"`
+ `aria-selected` children. Click-outside/Escape-to-close is mechanically reusable
from `RowActionMenu.tsx`'s existing logic; genuinely new is real single-select
keyboard behavior a context menu doesn't need — Arrow Up/Down roving
`aria-activedescendant` between options without moving DOM focus off the trigger,
Enter/Space to select-and-close, Escape to close without changing the value. A
moderate, real build.

**Visual continuity**: the trigger stays visually a form control — the same
`h-8`/`border-input`/`bg-background`/`rounded-md` the current `<select>` already
uses. Its *closed* state is enriched too, not only the open listbox — name +
relative date, truncating — so re-confirming a choice doesn't require reopening it.

**Component change**: `RunRow` gets a new optional `showActions?: boolean` (default
`true`) so this picker can render each option without the per-row "Compare…" menu
D4 built — a Compare action inside the Compare picker itself would be circular.

**"Test cases" (item count) declined, cost stated, not silently dropped**:
`domain.Run` exposes `name/status/suiteKey/passRate/createdAt` — no item count. A
real count needs `GET /runs/{runKey}/summary` per row, the same "not worth N extra
requests for a picker" call already made for this exact page's tooltips (D4). The
suite's *current* case count was considered as a free proxy and rejected too — a run
pins its cases at creation, so a suite that's changed since would show a number
describing the suite today, not what the run actually contained; an ad hoc run (no
suite) wouldn't have one at all. Pass rate is the better, already-free answer to the
real underlying need ("enough to judge if these are worth comparing").

**Bonus, in-scope fix while rebuilding this component anyway**: each side now hides
whatever's selected on the other side, so comparing a run against itself is no
longer reachable (today's native selects don't prevent it) — hidden, not disabled,
matching this change's established "hide entirely" convention.

### D10 — Suite `PassRate` reflects the most recent CLOSED run, not just the most recent run

Found live, immediately after D9 shipped: the Suite Detail page's own Properties
sidebar showed "Pass rate: 0%" directly beside a Stability card (D8) correctly
showing "100%" — same suite, same page, two contradictory numbers, no explanation.
Root cause: `SuiteRepo.latestRunStats` computed `Suite.PassRate` from the suite's
most recently *created* run regardless of status (a deliberate, pre-existing
decision from `rework-suites-landing-ux`, matching `ProjectSummary`'s own "latest
run" semantic) — D8 changed the Stability card's own headline to skip a trailing
open run, but nothing else on the page was updated to match, so a suite with a
settled closed history and a fresh, still-empty open run now shows two disagreeing
pass-rate numbers instead of one. Same failure class D7/D8 already exist to close
("silently disagreeing numbers, no explanation"), recurring at a second call site.

**Fix**: split the two fields' semantics explicitly, in the one place they're
computed (`SuiteRepo.latestRunStats`, plus its batched twin in `SuiteRepo.List`).
`LastRunAt` keeps its existing, correct meaning — true last activity, any status,
unchanged — a suite genuinely *was* run 3 minutes ago even if that run isn't closed
yet, so this stays a different question from "how healthy is this suite right now."
`PassRate` adopts the same rule D8 already established for the Stability headline:
most recent **closed** run's rate, or `nil` (rendered as the existing "not run
yet"/placeholder treatment already used for a suite with zero runs) when no closed
run exists at all — even if an open run has recorded results. This is the same
principle, applied at its actual source (the shared field two different UI surfaces
both read) rather than patched again at a third call site later.

**Scope — "everywhere a suite's pass rate is shown," not narrower**: `Suite.PassRate`
backs both the Suite Detail sidebar property and the Suites index cards
(`SuitesPage.tsx`) — both consume the identical field, so fixing the source fixes
both without a second change. `ProjectSummary`'s own, separately-computed
project-level "latest run" figure is explicitly OUT of scope — a project-level
"what's active right now" signal is a different question than a suite's settled
health, and changing it wasn't reported as broken.

**No visual/design change** — this is a data-correctness fix to an already-designed
property row and card, not a new UI treatment, so no Pepe mock round was needed for
it (unlike D1–D9).

### D11 — Stability headline removed; replaced by a property row plus per-point tooltips + endpoint label

Found live, after D10 shipped and the sidebar/headline disagreement was fixed: the
user still found the whole card "confusing. A lot confusing." even once the numbers
agreed with each other — internally consistent isn't the same as legible. Looped
Pepe (Fable 5) for a fresh review with instructions not to defend D8's math (it was
correct) but to diagnose why a correct number still read wrong.

**Root cause, not just symptom**: `"{n}% pass · {n} runs"` at hero-number size
(`text-2xl font-black`) is this app's *existing* shorthand for a genuine aggregate —
verified against its only two other users: `RunStatusBreakdown.tsx`'s
`"{passRate}% pass · {total} items"` really sums a run's own items;
`CaseResultsPanel.tsx`'s `"{successRate}% success · last {N} runs"` really averages
across the N runs shown. Reusing that exact template for "one specific run's own
rate, with an incidental run-count beside it" was a category error — visually
promising a summary of the chart below it and delivering a single sample instead.
Compounding it: the number could land on a local peak (as it did in the reported
scenario) while the line directly beneath it visibly dipped first — a felt
contradiction between a verdict-colored number and a declining shape, independent of
whether the number was technically correct. A third issue, only surfaced by this
review: the headline lived *inside* each Stability view's own panel, so it appeared
to reset when switching "Closed runs"/"Open + closed" even though "latest closed
run" doesn't actually depend on which view is showing.

**Fix — the hero number is removed, not reworded**:
- A plain `PropertyRow` — "Latest closed run" + `HealthBar` + relative date — reuses
  the exact component the Properties sidebar already uses for "a single, specific,
  non-aggregate value" (its own "Pass rate" row, one page section away), rather than
  inventing a second visual vocabulary for the same kind of fact. A peer "In
  progress" `PropertyRow` (badge, count) renders only when a trailing open run
  exists. Both sit **above** the Closed runs/Open + closed toggle in
  `SuiteDetailPage.tsx`, computed once from the suite's full run list — not per
  view — fixing the third issue directly: the fact no longer appears to change when
  the toggle changes.
- `StatusPill` (word+color banding) was considered and rejected as the
  replacement — it can't be misread as an aggregate, which was tempting, but the
  sidebar's own "Pass rate" row already renders this identical value via
  `HealthBar`; introducing a second component for one fact on one page would trade
  one confusion for a smaller, subtler one (two visual vocabularies for the same
  number).
- The trend chart itself (D7's line/area/grid/gap-rings/endpoint-emphasis/dashed-
  open-marker work) is unchanged — nothing in the reported confusion was about
  chart geometry.

**Follow-up user request, addressed in the same round**: "I would like to see
percentages... close to the chart points. Or maybe when the point is over" — a
request for the chart's own points to be legible on their own terms, not a request
to restore the headline. Resolved as **both** halves of the standing dataviz
guidance already loaded this session, not a hedge between them: "ship a tooltip on
an interactive chart by default" (every point becomes a real `<button>`, tooltip on
hover **and** keyboard focus — deliberately replacing the old native `title`
attribute, which was slow, unstyled, and not reliably keyboard-reachable) plus
"selective direct labels, never a number on every point" (only the endpoint — the
one point D7 already visually emphasizes, and the one point the new property row is
describing in words — gets an always-visible percentage label; every other point
stays reveal-on-hover/focus). **No crosshair**, despite the guidance often pairing
one with a hover tooltip — explicitly considered and skipped: with only 7-8
discrete, individually-hoverable, named points, there is no meaningful "value
between points" for a crosshair to resolve; it would be real interaction weight
solving nothing on a chart this sparse.

**A consequence, stated rather than silently accepted**: the endpoint label can
legitimately show a low or "0%" figure when the newest point is a barely-started
open run — the exact number the removed headline used to hide. This is intentional,
not a regression back to the original complaint: that number is now a small label
directly anchored to one point that's already visually marked open/provisional
(hollow, dashed), read in the context of "this specific in-progress run, so far" —
not, as the removed headline implied, "the suite's overall health." The Latest
closed run property above the chart remains the authoritative "how healthy is this
suite" figure.

### D12 — Y-axis percentage ticks added; x-axis per-point dates deliberately rejected in favor of a range

User's request: "Maybe we should have some legends in the axis." Looped Pepe with
instructions to evaluate the request, not just implement it literally, given the
hover/focus tooltip and endpoint label already built last round might already cover
the need.

**Split verdict, evaluated per axis independently**:
- **Y-axis: added.** The three gridlines (0%/50%/100%) had zero text since D7 — a
  viewer can read relative shape ("this dip is about a third of the way down")
  but has no scale reference without hovering a point. Three small labels
  (`text-[10px] text-muted-foreground`, the same recessive treatment already used
  for the endpoint label) fix that at near-zero visual cost.
- **X-axis: the literal request rejected.** `xPercent()` lays points out evenly by
  index, not by real elapsed calendar time — two points 7 days apart and two points
  4 days apart render at identical pixel spacing today. A date under every point
  would visually assert even time-spacing that isn't real — the same category of
  mistake as the D11 hero-number-as-aggregate problem, relocated to the x-axis
  instead of avoided. It would also be disproportionate chrome for a ~96px
  card-embedded sparkline (7-8 date labels squeezed under one small chart).
  **What ships instead**: two range labels only — the oldest point's date at the
  bottom-left, the newest at the bottom-right — giving real orientation ("this
  spans about a month") without claiming per-point precision the spacing can't
  back up. Exact per-point dates stay one hover/focus away via the existing
  tooltip. True date-proportional spacing (reworking `xPercent()` itself, which
  would also reshape how tightly-clustered runs visually compress) is named as a
  real, separate follow-up, not bundled into this fix.

**Implementation note**: axis labels are positioned via fixed-pixel offsets on a
nested "plot area" div, not padding on the chart's outer wrapper — absolutely
positioned children measure against their containing block's padding box
regardless of that block's own CSS padding, so a naive `pl-8`/`pb-5` on the outer
wrapper would have had no effect on where the axis labels or the SVG/points
actually rendered (they'd have measured from the same unpadded edges and
overlapped). The outer box now reserves top/right/bottom/left margins structurally
around an inner absolutely-positioned plot div; every existing percentage-based
child (points, gridlines, tooltip, endpoint label) moved into that inner div
unchanged, so their own coordinate math needed no changes.

## Risks / Trade-offs

- [Extracting a shared run-row component from `RunsPage.tsx` touches an existing,
  working page] → Scope the extraction narrowly (row/section rendering only, not
  data-fetching), and keep `RunsPage.tsx`'s own existing tests green throughout — this
  is a refactor-while-adding-a-feature, not a rewrite.
- [Removing the case grid from view mode is a real behavior change for anyone who
  currently lands on the suite page expecting to see cases immediately] → Mitigated by
  the "Edit cases"/"View cases" button being one click away, in the same sidebar
  position (Actions section) users already look to for suite-level actions.
- [The Run history card's client-side suite filtering doesn't scale] → Explicitly
  accepted for this change (see D3), with the correct fix named for a future follow-up
  rather than silently deferred.
- [`ConfirmBanner`'s behavior change (no auto-dismiss) means a toast now needs an
  explicit dismiss or a navigation to go away] → Intentional; the whole point is that a
  time-limited confirmation the user might not see is worse than a persistent one they
  have to act on once.
- [The "Open + closed" view's percentage can look alarmingly low for a healthy
  in-progress run, since it counts still-pending items as not-yet-passing] → Mitigated
  by the caption stating this explicitly on that view, and by the hollow/dashed
  marker visually flagging the point as provisional rather than a final verdict.
- [A custom listbox is new interactive-widget surface area (keyboard nav, focus
  management, ARIA) in a codebase that has never needed one before] → Scoped to the
  documented WAI-ARIA APG pattern rather than invented behavior, and click-outside/
  Escape handling is reused from `RowActionMenu.tsx` rather than rebuilt from
  scratch — only the roving-selection keyboard behavior is genuinely new code.

## Migration Plan

No data migration. Purely frontend behavior/layout changes plus wiring an existing,
already-tested component into a page. Ship as one change; no feature flag needed since
nothing here is reversible-with-risk (no destructive actions, no data model changes).

## Open Questions

None outstanding — all decisions above were reviewed and approved against a live mock
before this design was written.

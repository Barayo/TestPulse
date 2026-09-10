## ADDED Requirements

### Requirement: A step can be marked with its own verdict, independently of the item's overall verdict
For a run item whose pinned case content has a discrete list of steps, the
system SHALL let a user with `runRecordResult` permission mark any
individual step with a verdict (`pass`, `failed`, `skipped`, `blocked`),
identified by the step's position in the pinned steps array. Marking a
step SHALL persist immediately, independently of recording the item's
overall verdict — the tester MAY still record an overall verdict with
zero, some, or all steps marked, exactly as before this capability
existed. Marking a step SHALL NOT itself change, set, or suggest the
item's overall verdict.

#### Scenario: A step is marked independently of the overall verdict
- **WHEN** a user marks step 2 of a run item as `failed`
- **THEN** step 2 shows as `failed`, the item's overall status is
  unchanged, and no overall verdict has been recorded

#### Scenario: An overall verdict can be recorded with no steps marked
- **WHEN** a user records an overall verdict `pass` without marking any
  step
- **THEN** the verdict is recorded normally, exactly as it would be
  without this capability

#### Scenario: An overall verdict can be recorded with only some steps marked
- **WHEN** a user marks 2 of a run item's 5 steps and then records an
  overall verdict
- **THEN** the verdict is recorded normally, with no requirement that the
  remaining 3 steps be marked

#### Scenario: A step verdict outside the pinned step count is rejected
- **WHEN** a user attempts to mark a step index that does not exist in
  the run item's pinned steps
- **THEN** the request is rejected with a client error, and no step
  verdict is recorded

### Requirement: Step verdicts carry forward across retests
A run item's step verdicts SHALL persist as-is after an overall verdict is
recorded — they are not reset or cleared. A subsequent retest MAY leave
previously-marked steps untouched and only re-mark the steps whose outcome
actually changed.

#### Scenario: Step marks survive recording an overall verdict
- **WHEN** a user marks 3 steps and then records an overall verdict
- **THEN** all 3 step marks remain visible afterward, unchanged

#### Scenario: A retest only requires touching the steps that changed
- **WHEN** a run item previously had step 2 marked `failed`, was retested,
  and only step 2 is re-marked `pass` this time
- **THEN** step 2 now shows `pass` and every other previously-marked step
  still shows its earlier mark, untouched by the retest

### Requirement: Each recorded result snapshots the step verdicts at that moment
Recording an overall verdict on a run item SHALL immutably snapshot the
run item's current step verdicts alongside that result. A past result's
step snapshot SHALL NOT change after it is recorded, even as the run
item's live step verdicts continue to change via later marking or later
results. A result submitted with its own explicit step verdicts SHALL use
those verbatim as its snapshot instead of the run item's live state at
that moment, and SHALL also update the run item's live step verdicts to
match, so later retests carry forward from what was just reported rather
than from stale prior marks.

#### Scenario: A result's step snapshot reflects state at the time it was recorded
- **WHEN** a user marks step 1 `pass` and step 2 `failed`, records an
  overall verdict, then marks step 2 `pass` and records a second overall
  verdict
- **THEN** the first result's step snapshot still shows step 2 as
  `failed`, and the second result's step snapshot shows step 2 as `pass`

#### Scenario: A result submitted with explicit step verdicts uses them verbatim
- **WHEN** a result is submitted with its own step verdicts, differing
  from the run item's current live step marks
- **THEN** the result's step snapshot matches what was submitted, not the
  run item's prior live state

#### Scenario: A result submitted with explicit step verdicts updates the live state
- **WHEN** a result is submitted with its own step verdicts
- **THEN** the run item's live step verdicts afterward match what was
  submitted, so a subsequent retest carries forward from them

### Requirement: The results history shows a per-result step-verdict summary
Each entry in a run item's results history SHALL show a summary of that
result's step snapshot when at least one step was marked at the time it
was recorded, expandable to see every marked step's individual verdict. A
result whose step snapshot has no marked steps SHALL show no step summary
at all.

#### Scenario: A history entry summarizes its step snapshot
- **WHEN** a result's step snapshot has 3 of 5 steps marked, 1 of them
  `failed`
- **THEN** the history entry for that result shows a summary indicating 3
  of 5 steps were marked and 1 failed, expandable to each step's verdict

#### Scenario: A history entry with no marked steps shows no step summary
- **WHEN** a result's step snapshot has no steps marked (recorded before
  this capability existed, or without marking any step)
- **THEN** the history entry for that result shows no step-summary line

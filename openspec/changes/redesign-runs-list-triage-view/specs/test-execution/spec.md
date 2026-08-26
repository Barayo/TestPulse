## ADDED Requirements

### Requirement: Project runs list
The web UI SHALL provide a project-wide Runs list (`/projects/{projectKey}/runs`), split into Open and Closed sections. Open runs SHALL be ordered by ascending pass rate (a run with no items yet — a null pass rate — SHALL sort before every scored run), so the run needing the most attention appears first regardless of when it was created. Closed runs SHALL be grouped into clusters by their originating suite (`run.suiteKey`), with runs sharing no suite grouped into a single "Ad hoc" cluster; cluster order SHALL follow the order in which each suite (or "Ad hoc") is first encountered when scanning the closed runs newest-first. Each closed-run cluster SHALL display an aggregate: the count of runs in it and their average pass rate. Within a cluster, runs SHALL retain their relative recency order.

#### Scenario: Open runs ordered by urgency, not recency
- **WHEN** a project has open runs with pass rates 90%, 25%, and 83%, created in that order
- **THEN** the Runs list displays them in the order 25%, 83%, 90%

#### Scenario: An open run with no items yet sorts first
- **WHEN** a project has one open run with a 40% pass rate and one open run with no items yet (null pass rate)
- **THEN** the run with no items yet is listed before the 40% run

#### Scenario: Closed runs cluster by originating suite
- **WHEN** a project has 4 closed runs from suite "Smoke" and 3 closed runs from suite "Release", newest-first interleaved by creation time such that a Smoke run is the most recent
- **THEN** the Closed section shows a "Smoke" cluster before a "Release" cluster, each listing only its own runs

#### Scenario: Runs with no suite land in an Ad hoc cluster
- **WHEN** a closed run was created from an explicit case list rather than a suite (`suiteKey` is null)
- **THEN** it appears in an "Ad hoc" cluster, not attributed to any suite

#### Scenario: A cluster shows its aggregate
- **WHEN** the "Smoke" cluster contains 4 closed runs with pass rates 50%, 25%, 75%, and 100%
- **THEN** the cluster header shows "4 runs" and an average pass rate of 62%

#### Scenario: A run whose suite was later deleted still clusters by that suite's key
- **WHEN** a closed run's `suiteKey` no longer resolves to an existing suite
- **THEN** it still clusters under that `suiteKey`, displayed using the raw key as the cluster name since no current suite name is available

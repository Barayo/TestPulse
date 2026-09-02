## Why

As a Java developer running Maven/Surefire in CI, when I want to report results into TestPulse, I want a way to attach a case key to a test that actually ends up in Surefire's JUnit XML output, since Surefire has no `record_property()`-equivalent for writing custom per-test properties out of the box. `add-execution-import` (#38) shipped the `POST /api/v1/projects/{projectKey}/imports` endpoint and deferred a Maven answer to follow-on work (its design.md flags this explicitly: "Surefire doesn't have an equivalent to `record_property` out of the box... flagged for whichever change tackles Maven"). Issue #58 tracked installable plugins for all four major JUnit-XML ecosystems as one item; split into four independent issues so each could be scoped on its own — this change covers #156 (Maven) only.

## What Changes

- Two new public repos/artifacts (Barayo org, MIT license) — not part of this monorepo:
  - `testpulse-annotations`: a tiny, zero-dependency jar containing `@TestPulse(caseKey, platform = "", version = "", tags = {})` (`RetentionPolicy.RUNTIME`), added as a `<dependency><scope>test</scope>` so test code can reference it.
  - `testpulse-maven-plugin`: the plugin itself, referenced via `<build><plugins>`, with two Mojo goals:
    - `annotate` (bound to the `test` phase, after `surefire:test`): loads compiled test classes via reflection, matches each Surefire `TEST-*.xml`'s `<testcase>` to its annotated `Method` by class + method name, rewrites the XML with a `<properties>` block — since Surefire's own XML writer has no mechanism to do this itself (confirmed during design: this is a long-standing, still-open upstream gap, not something to work around via a supported extension point).
    - `submit` (bound to `verify`, after `annotate`): POSTs the annotated report(s) to the existing import endpoint, applying the same `201`/`207`/error exit-code policy already validated for `pytest-testpulse` (warn-by-default on unmatched with a `failOnUnmatched` escalation; real errors always fail the build).
  - This mechanism (reflection-only, run after Surefire finishes) works identically for JUnit 4 and JUnit 5 with no per-framework runtime integration — deliberately chosen over a JUnit-5-`Extension`-plus-JUnit-4-`Rule` approach, which would need two separate runtime mechanisms for the same result.
- `docs/importing-results.md` gains a "Maven: `testpulse-maven-plugin`" section, following the same pattern already used there for the pytest plugin.
- No Sample-Project-showcase task: like the pytest plugin, this is client-side tooling with no new capability inside TestPulse itself (no new endpoint, no UI, no seed data) — `seed.go` is unaffected.

## Capabilities

### New Capabilities
- `maven-import-plugin`: the `testpulse-maven-plugin`/`testpulse-annotations` observable contract — the `@TestPulse` annotation's shape, the `annotate` goal's XML-rewrite behavior (including its match-only-clean-cases scope), the `submit` goal's config resolution and exit-code behavior.

### Modified Capabilities
- None. This change is a new consumer of the existing `execution-import` contract; it does not change that endpoint's requirements.

## Impact

- Two new repos: `Barayo/testpulse-annotations`, `Barayo/testpulse-maven-plugin` (out of scope for this monorepo's CI/build/deploy).
- `docs/importing-results.md`: add a Maven plugin section.
- No changes to `packages/shared/openapi.yaml`, Go handlers, migrations, or the web UI — entirely client tooling consuming the existing import endpoint.

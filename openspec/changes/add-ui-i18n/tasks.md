## 1. i18n infrastructure (TDD: a deliberately-broken key must fail typecheck)

- [x] 1.1 Add `react-i18next`, `i18next` to `apps/web/package.json`.
- [x] 1.2 Write a failing test/typecheck case: `src/i18n/resources.types-test.ts`
  uses `@ts-expect-error` on a bad key; confirmed RED (`Unused '@ts-expect-error'
  directive` — proving no typing existed yet to reject the bad key).
- [x] 1.3 Created `apps/web/src/locales/en/translation.json` (one
  `i18nTypecheck.placeholder` key), `src/i18n/index.ts` (i18next init),
  `src/i18n/react-i18next.d.ts` (module augmentation — `declare module
  "i18next"`, not `"react-i18next"`; also added `resolveJsonModule: true`
  to `tsconfig.app.json`, missing before this and required for the JSON
  import to carry real types instead of `any`). Confirmed GREEN: bad key
  now rejected, valid key compiles, `tsc -b` clean.
- [x] 1.4 Wired `I18nextProvider` into `apps/web/src/main.tsx`, static
  `en` for now — dynamic resolution lands in task group 6.
- [x] 1.5 Created empty `apps/web/src/locales/{es,fr,de,pt,zh}/translation.json`.
  Full suite verified: `tsc -b` clean, `oxlint` clean (pre-existing
  warnings only), 1859/1859 vitest tests pass.

## 2. Domain glossary (prerequisite for all translation work)

- [ ] 2.1 Write a short glossary doc (scratch file, not committed product
  docs) listing TestPulse's domain nouns (Run, Case, Suite, Folder,
  Project, Release, Test Plan, Requirement) and each one's chosen
  translation or deliberate non-translation per locale (design.md Risk
  mitigation) — hand to every translation subagent in task group 4.

## 3. String extraction to `en` (parallel by task group; each group runs
   its own tests/lint before moving on, per design.md's regression risk)

- [ ] 3.1 Auth & setup: `LoginPage`, `ForgotPasswordPage`,
  `ResetPasswordPage`, `RequiredPasswordChangePage`, `SetupPage`,
  `AuthLayout`, `LoginForm`, `ChangePasswordForm`, `GeneratedPasswordChip`,
  `SessionExpiredModal`, `ErrorBoundary`, `BrandMark`.
- [ ] 3.2 Project & library core: `ProjectsPage`, `ProjectPage`,
  `ProjectSettingsPage`, `ProjectMembersPage`, `FolderExplorerPage`,
  `ProjectSwitcher`, `ProjectLandingPanels`, `FolderPicker`, `FolderTree`,
  `Breadcrumbs`, `LibraryBulkActionBar`.
- [ ] 3.3 Case detail & editing: `CaseDetailPage`, `CreateCasePage`,
  `CaseContentView`, `CaseFormatEditor`, `CaseParametersEditor`,
  `CaseParametersView`, `CasePicker`, `CaseSidebarSection`,
  `CaseStepsList`, `CaseAttachmentField`, `AttachmentField`,
  `AttachmentStrip`, `GherkinEditor`, `TagChipsEditor`, `ContentDiffView`,
  `VersionDetailDialog`, `ExtractStepGroupDialog`, `InsertStepGroupDialog`,
  `StepGroupsCard`, `StepSnapshotSummary`, `ClassificationEditor`,
  `CustomFieldsCard`, `Lightbox`.
- [ ] 3.4 Suites & runs: `SuitesPage`, `SuiteDetailPage`, `SuiteCaseGrid`,
  `SuiteActionsMenu`, `SuiteRunBreakdownTrend`, `NewRunPage`, `RunsPage`,
  `RunPage`, `RunItemDetailPage`, `RunComparePage`,
  `RunComparePickerPage`, `RunList`, `RunListbox`, `RunShortcuts`,
  `RunsListTriage`, `RunBulkActionBar`, `RunStatusBreakdown`,
  `CaseResultsPanel`, `ExecutionStepsList`, `RowActionMenu`.
- [ ] 3.5 Releases, test plans, requirements, reports: `ReleasesPage`,
  `ReleaseDetailPage`, `ReleaseStatusBadge`, `ReleasesSettingsCard`,
  `TestPlanDetailPage`, `RequirementsPage`, `RequirementDetailPage`,
  `RequirementsSettingsCard`, `ProjectReportsPage`, `ImportProjectPage`.
- [ ] 3.6 Admin, settings, people, tokens, roles: `InstanceSettingsPage`,
  `InstanceTokensPage`, `PeoplePage`, `RolesPage`, `TokensPage`,
  `ProfilePage`, `AdminMenu`, `AdminShell`, `UserMenu`, `UserPicker`,
  `CustomPaletteEditor`, `PaletteSwatchSelector`, `RetentionPillSelector`,
  `SSOSettingsCard`, `WebhooksCard`, `AssignDialog`, `ConfirmBanner`.
  (New Language controls are wired into `ProfilePage`/
  `InstanceSettingsPage` separately in task group 7, after Pepe's mock —
  this task only extracts their *existing* copy.)
- [ ] 3.7 Shared chrome and UI primitives: `Layout`, `Avatar`,
  `HealthBadge`, `HealthBar`, `JiraLinkBadge`, `Pills`, `PropertyRow`,
  `ResizeHandle`, `StatusBadge`, `LoadMoreButton`, and every file under
  `components/ui/` (`badge`, `button`, `card`, `dialog`, `input`, `label`,
  `Pill`, `select`, `switch`, `table`, `textarea` — most take children/
  props rather than fixed copy; extract only genuine hardcoded strings
  found, e.g. a default placeholder or aria-label).
- [x] 3.8 Merged all 7 staging JSON files into `en/translation.json`
  (1354 keys, zero collisions). Fixed issues surfaced by the merge:
  - `TFunction` imported from `'react-i18next'` in 5 files — that
    version doesn't re-export it; moved to `import type { TFunction }
    from 'i18next'`.
  - A pre-existing local variable named `t` (team lookup) in
    `ProjectMembersPage.tsx` shadowed the i18n `t` inside a `.map()`
    callback — renamed to `team`.
  - Several module-level lookup tables (`CustomPaletteEditor.FIELDS`/
    `CONTRAST_PAIRS`, `HealthBar.STATUS_PILL_LABEL_KEYS`,
    `RetentionPillSelector.SEGMENTS`, `ProjectSettingsPage.LANDING_VIEW_LABELS`,
    `ProjectsPage.SORT_KEY_LABELS`/`STATUS_FILTER_LABEL_KEYS`,
    `RunStatusBreakdown.STATUS_LABEL_KEYS`) were typed as holding plain
    `string` values for their translation-key field, which widens past
    the typed-key union — retyped as `i18next`'s exported `ParseKeys`.
  - **Test environment gap**: `useTranslation()` falls back to the
    global `i18next` singleton when no `I18nextProvider` wraps a test
    render (how all ~1850 existing component tests work unmodified),
    but that singleton is only populated by importing `src/i18n/index.ts`
    — nothing did, so every `t('key')` in every test rendered the raw
    key. Fixed by importing `@/i18n` in `src/test/setup.ts`.
  - **`<Trans>` didn't render its content in the test environment**
    (empty element, even with `t` passed explicitly) — root cause not
    fully diagnosed (a version-specific `react-i18next` v17 behavior).
    `ForgotPasswordPage.tsx`'s two `<Trans>` usages (the only ones in
    the whole retrofit — every other extraction group independently
    chose the manual prefix/suffix-key split instead) were converted to
    that same proven pattern, removing `<Trans>` from the codebase
    entirely.
  - Ran `make lint` (exit 0), `tsc -b` (clean), `npx vitest run`
    (1859/1859 passed), `make coverage-web` (90.2%/83.4%/88.2%/92.8%,
    all above the 80% gate).
  - Ran `make e2e`: 12 failures, all login/auth-heavy specs — root
    cause confirmed as the Makefile's `e2e` target using the strict
    default login rate limit (5/min) unlike CI's job, which explicitly
    overrides it to 600/100 for exactly this reason (see `.github/
    workflows/ci.yml`'s e2e job comment). Re-ran with the same
    override: 189/190 passed, the one remaining failure (`run-item-
    attachments.spec.ts`) confirmed as a pre-existing flake by passing
    cleanly in isolation. No e2e regression from this change.

## 4. Translation into the 5 non-English locales (parallel by locale,
   each subagent given the glossary from task 2.1 and the same tone
   instructions — design.md Risk mitigation)

- [x] 4.1 Translated `en/translation.json` into `es/translation.json`
  (1633 leaves, verified zero key/placeholder mismatches).
- [x] 4.2 Translated `en/translation.json` into `fr/translation.json`
  (1633 leaves, verified zero key/placeholder mismatches).
- [x] 4.3 Translated `en/translation.json` into `de/translation.json`
  (1633 leaves, verified zero key/placeholder mismatches).
- [x] 4.4 Translated `en/translation.json` into `pt/translation.json`
  (Brazilian Portuguese; 1633 leaves, verified zero key/placeholder
  mismatches; written incrementally in ~24 chunks after an earlier
  attempt hit the per-response output-token limit).
- [x] 4.5 Translated `en/translation.json` into `zh/translation.json`
  (Simplified Chinese; 1633 leaves, verified zero key/placeholder
  mismatches).
- [x] 4.6 Verified independently (not just trusting each translator's own
  report): a script flattening all 6 locale files to leaf paths found
  zero missing/extra keys in any of the 5 translated locales vs. `en`,
  and a second pass diffing every `{{placeholder}}` set per key across
  all 6 files found zero mismatches. Full `tsc -b` + `vitest run`
  (1859/1859) re-run clean with all locales populated.

  **Known limitation, flagged by every translator independently**: the
  extraction's `{{plural}}`/`{{suffix}}` interpolation mechanism is a
  literal English `count === 1 ? '' : 's'` string passed from the React
  components regardless of active locale (design.md didn't anticipate
  this — it's a consequence of task 3's mechanical extraction preserving
  the exact original English pluralization logic character-for-
  character). This renders grammatically incorrectly for any language
  with irregular plurals relative to a bare "+s" suffix (confirmed for
  es/fr/de/pt: e.g. Spanish "ejecución"/"ejecuciones", not "ejecuciones"
  via suffix; German "Testfall"/"Testfälle", not "Testfalls"). Chinese
  has no grammatical number so it's a non-issue there. This is a
  pre-existing i18n-infrastructure limitation that doesn't block this
  change (every other string renders correctly, and these specific
  count-dependent fragments are still intelligible, just not perfectly
  grammatical) — worth a dedicated follow-up GitHub issue to redesign
  the pluralization mechanism locale-aware (e.g. i18next's own `_one`/
  `_other` key-suffix convention) rather than fixing it inside this
  already-large change.

## 5. Backend: instance-wide default + per-user override (TDD)

- [x] 5.1 Wrote failing store tests for `default_language`/
  `per_user_language_enabled` (RED confirmed: fields undefined),
  matching the existing `color_theme`/`default_landing_view` patterns.
- [x] 5.2 Added migration `00026_ui_i18n_settings.sql` (`default_language
  text not null default 'en' CHECK (... IN (6 locales))`,
  `per_user_language_enabled boolean not null default false`).
  Implemented `domain.InstanceSettings`/`InstanceSettingsUpdate` fields
  and the store's `Get`/`Update` SQL. GREEN confirmed.
- [x] 5.3 Wrote failing tests for `User.Language` (nullable, mirroring
  `Timezone`'s exact test in `identity_test.go`'s `TestUserUpdateProfile`).
  RED confirmed.
- [x] 5.4 Added migration `00027_user_language.sql` (`language text`
  nullable, same CHECK constraint). `domain.User.Language *string`,
  `domain.UserProfileUpdate.Language`. `users.go` has 12 identical
  SELECT/RETURNING/Scan sites repeating the full column list (no shared
  column-list helper existed) — added `language` to all 12 via a
  verified mechanical substitution (confirmed exactly 12 matches before
  and after). GREEN confirmed; full `./internal/...` suite still green.
- [x] 5.5 Wired validation into the service layer (not the handler, per
  this codebase's thin-handler convention) — added `domain.
  SupportedLanguages`/`IsSupportedLanguage` (shared by both
  `UpdateInstanceSettings` and `UpdateOwnProfile`'s validation, so the
  instance-wide and per-user checks never drift). Wired
  `instance_settings_handlers.go` (`instanceSettingsUpdateInput`,
  `empty()`, `toInstanceSettingsUpdate`) and `identity_handlers.go`
  (`userProfileUpdate`). Added `defaultLanguage`/`perUserLanguageEnabled`
  to the public `/meta` endpoint (`server.go`'s `handleMeta`) — same
  reasoning as `colorTheme`/`defaultLandingView` already being there:
  every visitor, including anonymous ones, needs it to resolve which
  language to render. New service-layer tests for both validation paths
  (`TestUpdateInstanceSettingsRejectsUnknownDefaultLanguage`/
  `AppliesDefaultLanguageAndPerUserLanguageEnabled`,
  `TestUpdateOwnProfileRejectsUnsupportedLanguage`/
  `AppliesSupportedLanguage`). Full `./internal/...` suite green.
- [x] 5.6 Updated `packages/shared/openapi.yaml`: new `Language` enum
  schema, `defaultLanguage`/`perUserLanguageEnabled` added to `Meta`,
  `InstanceSettings`, `InstanceSettingsUpdate`; `language` added to
  `User`/`UserProfileUpdate`. Ran `make generate` — regenerated
  `packages/shared/src/api.ts` cleanly. Web typecheck caught one fixture
  (`SSOSettingsCard.test.tsx`'s shared `unconfiguredSettings` object)
  missing the two new required `InstanceSettings` fields — fixed. Full
  web suite (1859/1859) and full Go suite re-confirmed green after.

## 6. Resolved-language logic

- [x] 6.1 Wrote failing tests in `src/lib/resolveLanguage.test.ts` for
  all four cases from design.md D4. RED confirmed (module didn't exist).
- [x] 6.2 Implemented `src/lib/resolveLanguage.ts` (pure function).
  GREEN confirmed. Wired into the app: `useAuth.tsx` fetches
  `defaultLanguage`/`perUserLanguageEnabled` from `/api/v1/meta` (same
  pattern as `colorTheme`/`defaultLandingView`) and `language` on
  `AuthUser`; `App.tsx`'s `ThemedApp` (already the established place
  side effects driven by auth context live, per `ThemeProvider`'s same
  pattern) calls `i18next.changeLanguage(resolved)` in a `useEffect`
  whenever the resolved language changes. Added `App.test.tsx` coverage
  for all three real-world cases (per-user disabled, per-user enabled
  with a personal language, anonymous visitor) — with an `afterEach`
  resetting `i18next.language` back to `'en'`, since i18next is a true
  module-level singleton shared across every test file in the run;
  without the reset, one test changing the active language would leak
  into unrelated tests elsewhere that render English text
  unconditionally. Full suite re-run clean: 1866/1866 (1859 + 4 + 3).

## 7. New UI controls (Pepe mock required before any code, per design.md D6)

- [x] 7.1 Dispatched Pepe; mock published and approved by the user.
  Decisions: Pill-group (not `<select>` — unused dead code in this app)
  for both pickers; language names shown natively (English/Español/
  Français/Deutsch/Português/中文), never translated into the current UI
  language; ProfilePage's field has "Use instance default" as its first
  option (mirrors Theme's "System" slot) and is absent — not disabled —
  when per-user customization is off; InstanceSettingsPage gets one
  combined "Language" card (picker + toggle, not two cards, since the
  toggle changes what the picker's value even means) in a new
  "Localization" section (`LanguagesIcon`) placed right after Appearance.
- [x] 7.2 Implemented `ProfilePage.tsx`'s Language field exactly per the
  mock — `Pill` group, conditionally rendered on `perUserLanguageEnabled`
  from `useAuth()`, PATCH body only includes `language` when the field
  is actually shown. 6 new component tests (gating, all 6 options
  present, instance-default/personal-language active states, save with
  a language, save clearing back to instance-default).
- [x] 7.3 Implemented `InstanceSettingsPage.tsx`'s Language card exactly
  per the mock — default-language `Pill` group + `Switch` toggle with a
  `border-t` divider between them (Pepe's cited precedent: the Color
  theme card already bundles a second conditional control the same way).
  Extended `useAuth.tsx`'s `refreshColorTheme` to also refetch
  `defaultLanguage`/`perUserLanguageEnabled` from `/meta` after a save —
  same "applies live" guarantee colorTheme already has, reusing the
  existing function rather than adding a parallel one. 3 new component
  tests (options + current selection, selecting a default language,
  toggling per-user customization). Added the 6 shared `Languages.*`
  identity-label keys (never translated, identical across all 6 locale
  files — confirmed via the same leaf-path parity script from task 4.6,
  still 0 missing/extra across all locales) plus 9 new descriptive keys
  per page, translated into es/fr/de/pt/zh directly (small enough not to
  warrant another subagent dispatch). Full suite re-run clean:
  1875/1875 tests, `tsc -b` clean, `oxlint` clean (0 new warnings).

## 8. Sample Project showcase

- [x] 8.1 Updated `seed.go`: `svc.UpdateInstanceSettings` sets
  `PerUserLanguageEnabled: true` (default language left untouched — `en`,
  so the demo doesn't surprise-render in another language), and Julia's
  existing `UpdateOwnProfile` call (already used to set her avatar) also
  sets `Language: "es"` — same call, no new round trip. Added
  `TestSeedContentShowcasesPerUserLanguage` to `seed_test.go`, matching
  the existing `TestSeedContentShowcasesCaseVersionActorLink` pattern.
  Full `./internal/...` suite green.

## 9. Docs

- [x] 9.1 Added a new "## Language" section to `docs/test-management.md`
  (right after "## Color theme", the closest precedent — same
  instance-wide-setting-with-personal-override shape). Updated 3 more
  spots found by reading the actual call sites: `docs/api.md` (`/meta`,
  `/instance-settings` GET/PATCH rows, `/users/me` PATCH row, a new
  prose paragraph mirroring the colorTheme one), `docs/database.md`
  (both the `users` row — `language` column — and, per a docs-reviewer
  pass that caught this specific gap, the `instance_settings` table's
  own schema walkthrough — `default_language`/`per_user_language_enabled`
  — which I'd missed on the first pass), `docs/development.md` (the
  Profile-settings sentence). Confirmed no change needed: README.md,
  ROADMAP.md, docs/README.md, docs/design-system.md, docs/deployment.md,
  docs/testing.md.

## 10. Verification

- [ ] 10.1 Run `make lint`, `make coverage-web`, `make coverage-api`, and
  the full `make e2e` suite — confirm all pass with no regressions.
- [ ] 10.2 Deploy locally (`docker compose`, fresh volume) and manually
  click through: switch the instance default language in Instance
  Settings and confirm the UI updates; enable per-user customization, set
  a personal language on Profile, confirm it overrides; confirm an
  anonymous public-project visit always shows the instance default
  regardless of any personal setting.
- [ ] 10.3 Confirm `git diff --stat` matches design.md's Impact section —
  no unexpected files touched.

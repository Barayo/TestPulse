## Context

`apps/web/src` has 33 page files and 81 component files, all hardcoded
English JSX, with no i18n library or extraction convention anywhere
(`apps/web/package.json` has no i18n/intl dependency). Issue #14 asks for
en/es/fr/de/pt/zh support with an admin-default + optional-per-user-
override preference hierarchy — explicitly modeled on the hierarchy
already used for color themes. The user has confirmed, twice (once after
being shown the real 114-file/zero-infra scope), that this change ships
full infrastructure and all 6 locales in one pass, not a phased rollout.

Two precedents already exist in this codebase for exactly this kind of
preference:
- **Color theme** (`openspec/specs/ui-theming/spec.md`): a Tenant Admin
  sets an instance-wide palette; each visitor's personal Light/Dark/System
  choice is independent and composes with it. The personal half is
  browser-local (not server-stored) — a frequently-toggled, low-stakes
  preference.
- **Timezone** (`apps/api/internal/domain/domain.go`'s `User.Timezone
  *string`, edited on `apps/web/src/pages/ProfilePage.tsx`, patched via
  the user's own update endpoint in `apps/api/internal/server/identity_
  handlers.go`): a per-user, server-stored, nullable preference — a
  "set once" identity preference, not a quick toggle.

Language is a "set once" preference, not something flipped every session
— it fits timezone's shape, not theme's. The instance-wide default fits
`instance_settings`'s existing shape exactly (`apps/api/internal/store/
instance_settings.go`'s `Get`/`Update`, `domain.InstanceSettings`/
`InstanceSettingsUpdate`, `apps/api/internal/server/instance_settings_
handlers.go`'s `updateInstanceSettings`) — same singleton row, same
COALESCE-based partial update, same `*T` pointer-means-"leave unchanged"
convention already used for `ColorTheme`/`DefaultLandingView`/etc.

## Goals / Non-Goals

**Goals:**
- Every hardcoded string in all 114 page/component files is extracted
  into locale resource files and rendered through `react-i18next`.
- All 6 locales (en, es, fr, de, pt, zh) ship with real translations in
  this change, not placeholders.
- A Tenant Admin sets the instance-wide default language in Instance
  Settings, and can separately enable per-user language customization
  (off by default).
- When per-user customization is enabled, a user picks their own language
  on their Profile page, overriding the instance default for themselves
  only.
- A missing translation key is a TypeScript compile error, not a silent
  runtime fallback — the extraction scale (114 files) makes this matter.

**Non-Goals:**
- Browser `Accept-Language` auto-detection — language is explicitly
  admin/user-controlled, not auto-detected, matching the issue's own
  framing (no mention of browser detection anywhere in it).
- Translating Sample Project *content* (project names, case titles,
  descriptions) — issue #14 explicitly scopes this to UI chrome only;
  seed data stays in whatever language it was authored in.
- Any change to `ui-theming`'s existing requirements — the two preference
  hierarchies are independent and this change doesn't touch theme code.
- A dedicated translation-management service/pipeline (e.g. Crowdin,
  Lokalise) — six static locale JSON files, committed and reviewed like
  any other source file, is the right scale for a project this size.

## Decisions

### D1: Library — `react-i18next` + `i18next`

Confirmed compatible with the actual stack (React 19.2, Vite, TypeScript,
per `apps/web/package.json`) — it's the de facto standard for React i18n,
has first-class TypeScript support for typed translation keys via its
`resources` type-augmentation mechanism (a `t('some.key')` call with a
nonexistent key becomes a compile error once the `en` resource shape is
declared as the canonical key set), and has no React-19-specific
incompatibility. `react-i18next`'s `useTranslation()` hook is the access
pattern used in every extracted component; `<Trans>` is used only for the
rare string with embedded markup (e.g. a link inside a sentence).

**Alternative considered**: `react-intl` (FormatJS). Rejected — its ICU
MessageFormat is more powerful than this app needs (no complex pluralization
or rich-formatting requirements surfaced in any of the 114 files during a
sample read), and `react-i18next`'s simpler flat-key JSON resources are a
better match for a mechanical, large-scale extraction pass.

### D2: Resource structure — one JSON file per locale, flat keys namespaced by file

`apps/web/src/locales/<locale>/translation.json` (`en`, `es`, `fr`, `de`,
`pt`, `zh`), a single namespace per locale (not split per-page) since
`i18next`'s lazy-namespace-loading benefit doesn't matter at this app's
size — the whole bundle is already loaded together. Keys are namespaced by
source file to keep extraction mechanical and avoid collisions, e.g.
`CaseDetailPage.attachmentsEmptyState`, `Pills.statusBlocked` — the key
itself encodes where it came from, so a translator (or a future contributor
adding a string) can find the English source instantly.

**Alternative considered**: nested JSON mirroring component hierarchy.
Rejected — flat keys are simpler to generate mechanically across 114 files
and simpler for `i18next`'s key-typing mechanism to type-check.

### D3: Instance-wide default language — new `instance_settings` columns

New migration `00026_ui_i18n_settings.sql`: `default_language text not
null default 'en'` and `per_user_language_enabled boolean not null default
false` on `instance_settings`. Follows `instance_settings.go`'s existing
`Get`/`Update` shape exactly: `domain.InstanceSettings` gains
`DefaultLanguage string`/`PerUserLanguageEnabled bool`;
`domain.InstanceSettingsUpdate` gains `DefaultLanguage *string`/
`PerUserLanguageEnabled *bool`; the `Update` store method's existing
`COALESCE(...)` SQL gains two more columns in the same statement, same
pattern as every prior instance-setting addition.

**Alternative considered**: a separate `ui_i18n_settings` table. Rejected
— every other instance-wide setting (theme, retention, OIDC, landing view)
lives in the same singleton `instance_settings` row; splitting this one
out for no structural reason would break that established convention.

### D4: Per-user override — new nullable `User.Language` column

New column on `users`: `language text` (nullable), following `timezone`'s
exact shape. `domain.User` gains `Language *string`. Resolution order at
render time: if `per_user_language_enabled` is false, every visitor sees
`default_language` regardless of their own `language` field (which can
still be set — same "stored but currently inert" relationship the theme
system already has for a personal choice that could outlive the admin
setting being toggled back on later). If `per_user_language_enabled` is
true and the user has set `language`, that wins; otherwise they fall back
to `default_language`. Anonymous/public-project visitors always see
`default_language` — they have no profile to store a preference in.

**Alternative considered**: browser-local storage for the per-user
override, matching theme's personal-preference mechanism. Rejected —
language is explicitly closer to timezone's "set once, follow me across
devices" shape than theme's "quick per-session toggle" shape, and the
issue's own framing ("each user picks their own language and always sees
the UI in that preference") implies persistence across devices/sessions,
which only server storage provides.

### D5: Admin setting default — `per_user_language_enabled` defaults to `false`

Matches this project's existing conservative-default pattern for
admin-gated settings (`publicProjectsEnabled`, `oidcOnly` both default
off) — an admin must deliberately opt in to letting users diverge from
the instance's chosen language, rather than every fresh install starting
with per-user customization live.

### D6: UI surfaces needing a Pepe pass vs. mechanical extraction

Two genuinely new UI elements need a visual design pass before any code
is written (per the project's standing "Pepe mocks before UI
implementation" rule):
1. A Language field on `ProfilePage.tsx`, next to the existing Timezone
   field — a dropdown of the 6 supported languages, shown only when
   `per_user_language_enabled` is true.
2. A default-language picker + a per-user-customization toggle in
   Instance Settings, next to the existing color-theme/retention controls.

The 114-file string-extraction itself is **not** a new visual design — it
swaps existing rendered English copy for a translated string in the
user's resolved locale, with no layout, component, or behavior change.
Routing that through a per-file design review would be pure overhead;
only the two new controls above go through Pepe.

### D7: Execution strategy for the 114-file extraction

tasks.md groups the extraction into task groups by top-level feature area
(matching the existing directory structure under `apps/web/src/pages` and
`apps/web/src/components`) rather than one task per file — a flat
114-item list would be unreadable and unreviewable. During `/opsx:apply`,
the mechanical extraction work (replacing a hardcoded string with
`t('key')` and adding the English key) is dispatched to parallel
subagents per task group, since each group's files are independent of
each other. Translation into the 5 non-English locales is a separate,
independently parallelizable pass *by locale* once the English key set is
stable (each locale's translator only needs the English resource file,
not the component source) — dispatched as five parallel subagent passes
after English extraction is complete and reviewed.

### D8: Sample Project showcase — enable the setting, don't change the default

Per CLAUDE.md's standing Sample-Project-showcase rule: `seed.go` sets
`per_user_language_enabled = true` (so the capability is visible and
toggleable in the always-on Sample Project's Instance Settings) but
leaves `default_language` at `en` — changing the instance-wide default
itself would make the whole demo render in a non-English language by
surprise for most evaluators, which is a worse showcase than a visible,
working toggle. One seeded demo user (not the primary admin account) gets
a personal `language` preference set to `es`, demonstrating the
per-user-override actually taking effect without changing what every
other visitor sees by default.

## Risks / Trade-offs

- **[Risk]** A mechanical, subagent-driven extraction across 114 files
  risks missing strings or mistranslating UI-specific terms (e.g. product
  nouns like "Run", "Case", "Suite" that should likely stay untranslated
  or use a consistent glossary term per locale) → **Mitigation**: build a
  short glossary of TestPulse domain terms (Run, Case, Suite, Folder,
  Project, Release, Test Plan) and their chosen translation (or
  deliberate non-translation) per locale as part of task group 1, before
  any page/component extraction starts, so every subsequent translation
  pass references the same glossary instead of improvising per-file.
- **[Risk]** Extracting 114 files risks introducing a behavior regression
  (e.g. a string prop that was actually a test selector, not display
  copy, getting wrapped in `t()` and changed) → **Mitigation**: the
  existing Playwright E2E suite and component unit tests (both already
  at an 80%+ coverage gate) run after every task group, not just at the
  end — a regression surfaces within one group's scope, not after all 114
  files are touched.
- **[Risk]** Five parallel translation passes could produce inconsistent
  tone/formality across locales if each subagent works in isolation →
  **Mitigation**: each translation subagent is given the same glossary
  (see above) and the same small set of tone instructions (concise,
  professional, matching the English source's register) as part of its
  dispatch prompt, not left to infer tone independently.
- **[Risk]** `react-i18next`'s TypeScript key-typing requires the `en`
  resource file's shape to be declared once as the canonical type, and if
  that declaration is wrong or stale, every other locale's type-checking
  silently stops catching missing keys → **Mitigation**: the `en` resource
  file's TypeScript augmentation is written and verified (via a
  deliberately-broken test key) in task group 1, before any real
  extraction begins.

## Migration Plan

New migration `00026_ui_i18n_settings.sql` (incremental, per CLAUDE.md's
permanent migration policy — additive columns with safe defaults, no
backfill needed since both new columns have non-null defaults). No
rollback concerns beyond reverting the migration file in a follow-up
migration, per the project's existing "never edit a shipped migration"
policy. Deploy order: migration → API (new fields, backward compatible —
old web clients simply never read the new fields) → web (new UI, which
only renders once the API fields exist). No downtime; both new instance
settings default to safe no-op values (`en`/`false`) until an admin
changes them.

## Open Questions

None — scope, library, data model, and execution strategy are all
decided above; the two genuinely open UI questions (ProfilePage field
placement, Instance Settings control placement) are resolved by Pepe
before implementation per D6, not left open here.

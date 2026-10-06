## Why

Every piece of UI copy in TestPulse today is hardcoded English JSX, with no
i18n library or string-extraction convention anywhere in the web app
(confirmed: no i18n/intl dependency in `apps/web/package.json`). Issue #14
asks for support for English, Spanish, French, German, Portuguese, and
Chinese — both so non-English-speaking teams can use the product and so
the gap doesn't widen further as more pages ship. Now is the right time:
the app is still small enough (114 files) that a single retrofit is
tractable, and the two dependencies this issue named — real user accounts
and a Tenant Admin role — are already shipped (`add-identity-basics`,
`add-project-rbac`), so the preference-hierarchy pattern this needs has
clean precedent to follow.

## What Changes

- Add `react-i18next` and a string-extraction convention; extract every
  hardcoded UI string across all 33 page files and 81 component files in
  `apps/web/src` into locale resource files.
- Ship full translations for all 6 target locales (`en`, `es`, `fr`, `de`,
  `pt`, `zh`) in this change — not a phased proof-of-concept.
- **New capability**: `ui-i18n` — a Tenant Admin sets the instance-wide
  default language (Instance Settings) and can enable per-user language
  customization as its own setting (off by default). When enabled, each
  user picks their own language on their Profile page, overriding the
  instance default for themselves only — the same admin-default +
  personal-override shape already used for color theme (instance palette)
  and timezone (personal, server-stored preference), combining the
  instance-wide half of that pattern with the personal-preference half.
- Seed/demo data (project names, case titles, etc.) is unaffected — this
  is UI chrome only, not content translation.

## Capabilities

### New Capabilities
- `ui-i18n`: instance-wide default language, optional per-user override,
  and the extraction/translation of every existing UI string into the
  six supported locales.

### Modified Capabilities

(none — no existing capability's requirements change; the new instance
setting and personal preference are new requirements under the new
`ui-i18n` capability, not changes to `ui-theming`'s or any other
capability's existing behavior)

## Impact

- `apps/web/package.json` — new `react-i18next`/`i18next` dependency.
- `apps/web/src/**` — all 114 page/component files touched for string
  extraction (copy swap only, no layout/behavior change).
- `apps/web/src/locales/` (new) — six locale resource files.
- `apps/api/internal/domain/domain.go` — `User.Language *string` field.
- `apps/api/internal/store/instance_settings.go` and its migration —
  `default_language`, `per_user_language_enabled` columns.
- `apps/web/src/pages/ProfilePage.tsx` — new Language field.
- Instance Settings page — new default-language picker + per-user-toggle.
- `packages/shared/openapi.yaml` — new fields on the user and instance
  settings schemas.
- No breaking changes; every new field is additive and optional/defaulted.

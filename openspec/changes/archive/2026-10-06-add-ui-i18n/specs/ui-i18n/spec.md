## ADDED Requirements

### Requirement: A Tenant Admin sets the instance-wide default language
The system SHALL let a Tenant Admin choose the instance's default UI
language from the six supported locales (English, Spanish, French,
German, Portuguese, Chinese) in Instance Settings. The choice SHALL apply
to every visitor of the instance — authenticated users of every role and
anonymous public-project visitors — except a user whose own personal
language preference currently overrides it (see the per-user requirement
below).

#### Scenario: Tenant Admin selects a default language
- **WHEN** a Tenant Admin selects a language other than the current
  default in Instance Settings
- **THEN** the instance's stored default language is updated and every
  visitor without a personal override sees the UI in that language

#### Scenario: An anonymous visitor always sees the instance default
- **WHEN** an anonymous visitor views a public project
- **THEN** the UI renders in the instance's default language, regardless
  of any per-user setting

### Requirement: A Tenant Admin can enable per-user language customization
The system SHALL let a Tenant Admin enable or disable per-user language
customization as its own Instance Settings toggle, defaulting to
disabled. While disabled, every visitor sees the instance default
language regardless of their own stored personal preference. While
enabled, a user's personal language preference (if set) overrides the
instance default for that user only.

#### Scenario: Per-user customization is off by default
- **WHEN** a fresh instance has never had this setting changed
- **THEN** every visitor sees the instance's default language, even if
  individual users have a personal language preference stored

#### Scenario: Enabling the setting activates existing personal preferences
- **WHEN** a Tenant Admin enables per-user language customization, and a
  user had already set a personal language preference beforehand
- **THEN** that user immediately sees the UI in their personal preference
  on their next render, without needing to re-select it

#### Scenario: Disabling the setting reverts everyone to the instance default
- **WHEN** a Tenant Admin disables per-user language customization
- **THEN** every user's UI reverts to the instance default language,
  while their personal preference remains stored for if it is re-enabled

### Requirement: A user can set a personal language preference
When per-user language customization is enabled, the system SHALL let a
user choose their own UI language from the six supported locales on their
Profile page, overriding the instance default for themselves only. The
choice SHALL persist across sessions and devices (server-stored, not
browser-local).

#### Scenario: A user selects a personal language
- **WHEN** per-user customization is enabled and a user selects a
  language on their Profile page
- **THEN** their personal preference is stored and the UI immediately
  renders in that language for them, on any device they next sign into

#### Scenario: A user clears their personal language preference
- **WHEN** a user with a stored personal language preference clears it
  on their Profile page
- **THEN** they revert to seeing the instance's default language

#### Scenario: The Profile page's language control is hidden when disabled
- **WHEN** per-user language customization is disabled by the Tenant Admin
- **THEN** the Profile page does not show a language control

### Requirement: Every page and component renders through the i18n layer
Every piece of static UI copy across the web app SHALL be rendered through
the i18n translation layer rather than hardcoded in a single language, and
SHALL have a complete, reviewed translation in all six supported locales.

#### Scenario: Switching the resolved language changes all visible copy
- **WHEN** a user's resolved language (personal preference or instance
  default) is any of the six supported locales
- **THEN** every piece of static UI copy on the page renders in that
  locale, with no residual hardcoded-English string

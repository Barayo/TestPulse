import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { DatabaseIcon, GlobeIcon, LanguagesIcon, LayoutDashboardIcon, LinkIcon, LockIcon, PaletteIcon, TriangleAlertIcon } from 'lucide-react'
import { Pill } from '@/components/ui/Pill'
import { useAuth } from '@/lib/useAuth'
import { api } from '@/lib/api'
import { AdminShell } from '@/components/AdminShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RetentionPillSelector } from '@/components/RetentionPillSelector'
import { PaletteSwatch, PRESETS } from '@/components/PaletteSwatchSelector'
import { CustomPaletteEditor } from '@/components/CustomPaletteEditor'
import { PRESET_PALETTES } from '@/lib/presetPalettes'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SSOSettingsCard } from '@/components/SSOSettingsCard'
import type { CustomPalette } from '@/lib/useAuth'
import type { components } from '@testpulse/shared/api'

type ColorTheme = components['schemas']['ColorTheme']
type InstanceSettings = components['schemas']['InstanceSettings']
type LandingView = components['schemas']['LandingView']

const LANDING_VIEW_KEYS = {
  dashboard: 'InstanceSettingsPage.landingViewDashboard',
  library: 'InstanceSettingsPage.landingViewLibrary',
  suites: 'InstanceSettingsPage.landingViewSuites',
  runs: 'InstanceSettingsPage.landingViewRuns',
  reports: 'InstanceSettingsPage.landingViewReports',
} as const satisfies Record<LandingView, string>
const LANDING_VIEWS = Object.keys(LANDING_VIEW_KEYS) as LandingView[]

// Shared with ProfilePage.tsx's personal-language picker (add-ui-i18n,
// Pepe design review) — same six `Languages.*` identity-label keys.
const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'pt', 'zh'] as const
const LANGUAGE_LABEL_KEYS = {
  en: 'Languages.en',
  es: 'Languages.es',
  fr: 'Languages.fr',
  de: 'Languages.de',
  pt: 'Languages.pt',
  zh: 'Languages.zh',
} as const satisfies Record<(typeof SUPPORTED_LANGUAGES)[number], string>

// Tenant-Admin-only instance-wide settings (enable-public-project-access,
// add-data-retention). Self-gates the same way RolesPage.tsx/PeoplePage.tsx
// do — a client-side check, not just the route-level RequireAuth — since a
// non-admin logged-in user can still navigate here directly.
export default function InstanceSettingsPage() {
  const { t } = useTranslation()
  const { user: me, refreshColorTheme, mcpEnabled } = useAuth()
  const [publicProjectsEnabled, setPublicProjectsEnabled] = useState<boolean>()
  const [runRetentionDays, setRunRetentionDays] = useState<number>()
  const [autoArchiveInactiveDays, setAutoArchiveInactiveDays] = useState<number>()
  const [runAutoArchiveInactiveDays, setRunAutoArchiveInactiveDays] = useState<number>()
  const [colorTheme, setColorTheme] = useState<string>()
  const [customPalette, setCustomPalette] = useState<CustomPalette>()
  const [showCustomEditor, setShowCustomEditor] = useState(false)
  const [savingCustomPalette, setSavingCustomPalette] = useState(false)
  const [ssoSettings, setSsoSettings] = useState<InstanceSettings>()
  const [jiraSiteUrl, setJiraSiteUrl] = useState('')
  const [savingJiraSiteUrl, setSavingJiraSiteUrl] = useState(false)
  const [sessionTimeoutDays, setSessionTimeoutDays] = useState<number>()
  const [sessionTimeoutInput, setSessionTimeoutInput] = useState('')
  const [savingSessionTimeout, setSavingSessionTimeout] = useState(false)
  const [sessionTimeoutError, setSessionTimeoutError] = useState<string>()
  const [defaultLandingView, setDefaultLandingView] = useState<LandingView>()
  const [defaultLanguage, setDefaultLanguage] = useState<(typeof SUPPORTED_LANGUAGES)[number]>()
  const [perUserLanguageEnabled, setPerUserLanguageEnabled] = useState<boolean>()

  useEffect(() => {
    if (!me?.isTenantAdmin) return
    void api.GET('/api/v1/instance-settings').then(({ data }) => {
      if (!data) return
      setPublicProjectsEnabled(data.publicProjectsEnabled)
      setRunRetentionDays(data.runRetentionDays)
      setAutoArchiveInactiveDays(data.autoArchiveInactiveDays)
      setRunAutoArchiveInactiveDays(data.runAutoArchiveInactiveDays)
      setColorTheme(data.colorTheme)
      setCustomPalette(data.customPalette ?? undefined)
      if (data.colorTheme === 'custom') setShowCustomEditor(true)
      setSsoSettings(data)
      setJiraSiteUrl(data.jiraSiteUrl ?? '')
      setSessionTimeoutDays(data.sessionTimeoutDays)
      setSessionTimeoutInput(String(data.sessionTimeoutDays))
      setDefaultLandingView(data.defaultLandingView)
      setDefaultLanguage(data.defaultLanguage as (typeof SUPPORTED_LANGUAGES)[number] | undefined)
      setPerUserLanguageEnabled(data.perUserLanguageEnabled)
    })
  }, [me])

  if (!me?.isTenantAdmin) {
    return <p className="text-sm text-muted-foreground">{t('InstanceSettingsPage.notAuthorized')}</p>
  }

  async function toggle() {
    if (publicProjectsEnabled === undefined) return
    const next = !publicProjectsEnabled
    const { data } = await api.PATCH('/api/v1/instance-settings', { body: { publicProjectsEnabled: next } })
    if (data) setPublicProjectsEnabled(data.publicProjectsEnabled)
  }

  async function selectRunRetention(days: number) {
    const { data } = await api.PATCH('/api/v1/instance-settings', { body: { runRetentionDays: days } })
    if (data) setRunRetentionDays(data.runRetentionDays)
  }

  async function selectAutoArchive(days: number) {
    const { data } = await api.PATCH('/api/v1/instance-settings', { body: { autoArchiveInactiveDays: days } })
    if (data) setAutoArchiveInactiveDays(data.autoArchiveInactiveDays)
  }

  async function selectRunAutoArchive(days: number) {
    const { data } = await api.PATCH('/api/v1/instance-settings', { body: { runAutoArchiveInactiveDays: days } })
    if (data) setRunAutoArchiveInactiveDays(data.runAutoArchiveInactiveDays)
  }

  async function selectDefaultLandingView(view: LandingView) {
    const { data } = await api.PATCH('/api/v1/instance-settings', { body: { defaultLandingView: view } })
    if (data) setDefaultLandingView(data.defaultLandingView as LandingView)
  }

  async function selectDefaultLanguage(lang: (typeof SUPPORTED_LANGUAGES)[number]) {
    const { data } = await api.PATCH('/api/v1/instance-settings', { body: { defaultLanguage: lang } })
    if (data) {
      setDefaultLanguage(data.defaultLanguage as (typeof SUPPORTED_LANGUAGES)[number])
      await refreshColorTheme()
    }
  }

  async function togglePerUserLanguageEnabled() {
    if (perUserLanguageEnabled === undefined) return
    const next = !perUserLanguageEnabled
    const { data } = await api.PATCH('/api/v1/instance-settings', { body: { perUserLanguageEnabled: next } })
    if (data) {
      setPerUserLanguageEnabled(data.perUserLanguageEnabled)
      await refreshColorTheme()
    }
  }

  async function selectColorTheme(theme: ColorTheme) {
    const { data } = await api.PATCH('/api/v1/instance-settings', { body: { colorTheme: theme } })
    if (data) {
      setColorTheme(data.colorTheme)
      // Hides (unmounts) the custom editor so it doesn't keep showing —
      // or, worse, silently saving over the server with — stale draft
      // state from before this preset was chosen. Reopening Custom later
      // remounts it fresh, re-seeded from whatever preset/custom palette
      // is active at that point (found via manual testing: cycling
      // Custom → preset → Custom left the editor mounted the whole time,
      // and a later Save could persist a corrupted mix of old drafts).
      setShowCustomEditor(false)
      await refreshColorTheme()
    }
  }

  async function saveJiraSiteUrl() {
    setSavingJiraSiteUrl(true)
    const { data } = await api.PATCH('/api/v1/instance-settings', { body: { jiraSiteUrl } })
    setSavingJiraSiteUrl(false)
    if (data) setJiraSiteUrl(data.jiraSiteUrl ?? '')
  }

  const parsedSessionTimeout = Number(sessionTimeoutInput)
  const sessionTimeoutInvalid =
    sessionTimeoutInput.trim() === '' ||
    !Number.isInteger(parsedSessionTimeout) ||
    parsedSessionTimeout < 1 ||
    parsedSessionTimeout > 90

  async function saveSessionTimeout() {
    if (sessionTimeoutInvalid) return
    setSavingSessionTimeout(true)
    setSessionTimeoutError(undefined)
    const { data, error } = await api.PATCH('/api/v1/instance-settings', {
      body: { sessionTimeoutDays: parsedSessionTimeout },
    })
    setSavingSessionTimeout(false)
    if (error) {
      setSessionTimeoutError((error as { error?: string }).error ?? t('InstanceSettingsPage.sessionTimeoutSaveError'))
      return
    }
    if (data) {
      setSessionTimeoutDays(data.sessionTimeoutDays)
      setSessionTimeoutInput(String(data.sessionTimeoutDays))
    }
  }

  async function saveCustomPalette(palette: CustomPalette) {
    setSavingCustomPalette(true)
    const { data } = await api.PATCH('/api/v1/instance-settings', { body: { colorTheme: 'custom', customPalette: palette } })
    setSavingCustomPalette(false)
    if (data) {
      setColorTheme(data.colorTheme)
      setCustomPalette(data.customPalette ?? palette)
      await refreshColorTheme()
    }
  }

  return (
    <AdminShell>
      <h1 className="tp-heading text-xl">{t('InstanceSettingsPage.heading')}</h1>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <GlobeIcon className="size-3.5" aria-hidden="true" />
          {t('InstanceSettingsPage.accessSectionLabel')}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('InstanceSettingsPage.publicProjectAccessTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('InstanceSettingsPage.publicProjectAccessDescription')}
            </p>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">{t('InstanceSettingsPage.publicProjectAccessLabel')}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {publicProjectsEnabled ? t('InstanceSettingsPage.on') : t('InstanceSettingsPage.off')}
                </span>
                <Switch
                  aria-label={t('InstanceSettingsPage.publicProjectAccessLabel')}
                  checked={publicProjectsEnabled ?? false}
                  disabled={publicProjectsEnabled === undefined}
                  onCheckedChange={() => void toggle()}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('InstanceSettingsPage.publicProjectAccessOffNote')}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <LayoutDashboardIcon className="size-3.5" aria-hidden="true" />
          {t('InstanceSettingsPage.navigationSectionLabel')}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('InstanceSettingsPage.defaultLandingViewTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('InstanceSettingsPage.defaultLandingViewDescription')}
            </p>
            <div role="group" aria-label={t('InstanceSettingsPage.defaultLandingViewTitle')} className="flex flex-wrap gap-2">
              {LANDING_VIEWS.map((view) => (
                <Pill
                  key={view}
                  active={defaultLandingView === view}
                  onClick={() => void selectDefaultLandingView(view)}
                >
                  {t(LANDING_VIEW_KEYS[view])}
                </Pill>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <DatabaseIcon className="size-3.5" aria-hidden="true" />
          {t('InstanceSettingsPage.dataSectionLabel')}
        </div>
        <Card className={runRetentionDays ? 'ring-destructive/30' : undefined}>
          <CardHeader>
            <CardTitle>{t('InstanceSettingsPage.runRetentionTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('InstanceSettingsPage.runRetentionDescription')}
            </p>
            <RetentionPillSelector
              value={runRetentionDays}
              onSelect={selectRunRetention}
              ariaLabel={t('InstanceSettingsPage.runRetentionAriaLabel')}
              customAriaLabel={t('InstanceSettingsPage.runRetentionCustomAriaLabel')}
            />
            {runRetentionDays === undefined ? null : runRetentionDays === 0 ? (
              <p className="text-xs text-muted-foreground">{t('InstanceSettingsPage.runRetentionOffNote')}</p>
            ) : (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                <p className="text-sm text-foreground">
                  {t('InstanceSettingsPage.runRetentionWarning', {
                    count: runRetentionDays,
                    unit: runRetentionDays === 1 ? t('InstanceSettingsPage.day') : t('InstanceSettingsPage.days'),
                  })}{' '}
                  <strong>{t('InstanceSettingsPage.cannotBeUndone')}</strong>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('InstanceSettingsPage.autoArchiveRunsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('InstanceSettingsPage.autoArchiveRunsDescription')}
            </p>
            <RetentionPillSelector
              value={runAutoArchiveInactiveDays}
              onSelect={selectRunAutoArchive}
              ariaLabel={t('InstanceSettingsPage.autoArchiveRunsAriaLabel')}
              customAriaLabel={t('InstanceSettingsPage.autoArchiveRunsCustomAriaLabel')}
            />
            <p className="text-xs text-muted-foreground">
              {runAutoArchiveInactiveDays === undefined
                ? null
                : runAutoArchiveInactiveDays === 0
                  ? t('InstanceSettingsPage.autoArchiveRunsOffNote')
                  : t('InstanceSettingsPage.autoArchiveRunsWarning', {
                      count: runAutoArchiveInactiveDays,
                      unit: runAutoArchiveInactiveDays === 1 ? t('InstanceSettingsPage.day') : t('InstanceSettingsPage.days'),
                    })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('InstanceSettingsPage.autoArchiveProjectsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('InstanceSettingsPage.autoArchiveProjectsDescription')}
            </p>
            <RetentionPillSelector
              value={autoArchiveInactiveDays}
              onSelect={selectAutoArchive}
              ariaLabel={t('InstanceSettingsPage.autoArchiveProjectsAriaLabel')}
              customAriaLabel={t('InstanceSettingsPage.autoArchiveProjectsCustomAriaLabel')}
            />
            <p className="text-xs text-muted-foreground">
              {autoArchiveInactiveDays === undefined
                ? null
                : autoArchiveInactiveDays === 0
                  ? t('InstanceSettingsPage.autoArchiveProjectsOffNote')
                  : t('InstanceSettingsPage.autoArchiveProjectsWarning', {
                      count: autoArchiveInactiveDays,
                      unit: autoArchiveInactiveDays === 1 ? t('InstanceSettingsPage.day') : t('InstanceSettingsPage.days'),
                    })}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <PaletteIcon className="size-3.5" aria-hidden="true" />
          {t('InstanceSettingsPage.appearanceSectionLabel')}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('InstanceSettingsPage.colorThemeTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div role="group" aria-label={t('InstanceSettingsPage.colorThemeTitle')} className="flex flex-wrap gap-3">
              {PRESETS.map((preset) => (
                <PaletteSwatch
                  key={preset.key}
                  presetKey={preset.key}
                  label={t(preset.labelKey)}
                  light={preset.light}
                  lightPrimary={preset.lightPrimary}
                  dark={preset.dark}
                  darkPrimary={preset.darkPrimary}
                  selected={!showCustomEditor && colorTheme === preset.key}
                  onSelect={() => void selectColorTheme(preset.key)}
                />
              ))}
              <PaletteSwatch
                presetKey="custom"
                label={t('InstanceSettingsPage.customLabel')}
                light="#FFFFFF"
                lightPrimary="#94A3B8"
                dark="#0B0B0B"
                darkPrimary="#94A3B8"
                // Marked selected the moment the editor opens — showing it
                // as "selected" shouldn't wait on an actual save/server
                // round-trip, since opening the editor already means the
                // admin is working in Custom mode (user-reported).
                selected={showCustomEditor || colorTheme === 'custom'}
                onSelect={() => setShowCustomEditor(true)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('InstanceSettingsPage.colorThemeAppliesNote')}
            </p>
            {showCustomEditor && (
              <CustomPaletteEditor
                initial={customPalette ?? PRESET_PALETTES[colorTheme ?? 'teal'] ?? PRESET_PALETTES.teal}
                saving={savingCustomPalette}
                onSave={(palette) => void saveCustomPalette(palette)}
              />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <LanguagesIcon className="size-3.5" aria-hidden="true" />
          {t('InstanceSettingsPage.localizationSectionLabel')}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('InstanceSettingsPage.languageTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('InstanceSettingsPage.languageDescription')}</p>

            <div>
              <p className="text-sm font-medium mb-2">{t('InstanceSettingsPage.defaultLanguageLabel')}</p>
              <div role="group" aria-label={t('InstanceSettingsPage.defaultLanguageLabel')} className="flex flex-wrap gap-2">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <Pill key={lang} active={defaultLanguage === lang} onClick={() => void selectDefaultLanguage(lang)}>
                    {t(LANGUAGE_LABEL_KEYS[lang])}
                  </Pill>
                ))}
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">{t('InstanceSettingsPage.allowPersonalLanguageLabel')}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {perUserLanguageEnabled ? t('InstanceSettingsPage.on') : t('InstanceSettingsPage.off')}
                  </span>
                  <Switch
                    aria-label={t('InstanceSettingsPage.allowPersonalLanguageLabel')}
                    checked={perUserLanguageEnabled ?? false}
                    disabled={perUserLanguageEnabled === undefined}
                    onCheckedChange={() => void togglePerUserLanguageEnabled()}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {perUserLanguageEnabled
                  ? t('InstanceSettingsPage.allowPersonalLanguageOnNote')
                  : t('InstanceSettingsPage.allowPersonalLanguageOffNote')}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <LockIcon className="size-3.5" aria-hidden="true" />
          {t('InstanceSettingsPage.authenticationSectionLabel')}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('InstanceSettingsPage.sessionTimeoutTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('InstanceSettingsPage.sessionTimeoutDescription')}
            </p>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <label htmlFor="session-timeout-days" className="text-sm font-medium">
                  {t('InstanceSettingsPage.timeoutLabel')}
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="session-timeout-days"
                    type="number"
                    min={1}
                    max={90}
                    className="w-20"
                    value={sessionTimeoutInput}
                    onChange={(e) => setSessionTimeoutInput(e.target.value)}
                    disabled={sessionTimeoutDays === undefined}
                    aria-invalid={sessionTimeoutInvalid}
                  />
                  <span className="text-sm text-muted-foreground">{t('InstanceSettingsPage.days')}</span>
                </div>
              </div>
              <Button
                onClick={() => void saveSessionTimeout()}
                disabled={sessionTimeoutDays === undefined || savingSessionTimeout || sessionTimeoutInvalid}
              >
                {savingSessionTimeout ? t('InstanceSettingsPage.saving') : t('InstanceSettingsPage.save')}
              </Button>
            </div>
            {sessionTimeoutInvalid ? (
              <p role="alert" className="text-xs text-destructive">
                {t('InstanceSettingsPage.sessionTimeoutInvalidError')}
              </p>
            ) : sessionTimeoutError ? (
              <p role="alert" className="text-xs text-destructive">
                {sessionTimeoutError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t('InstanceSettingsPage.sessionTimeoutDefaultNote')}</p>
            )}
          </CardContent>
        </Card>
        {ssoSettings && <SSOSettingsCard settings={ssoSettings} onSettingsChange={setSsoSettings} />}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <LinkIcon className="size-3.5" aria-hidden="true" />
          {t('InstanceSettingsPage.integrationsSectionLabel')}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('InstanceSettingsPage.jiraTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('InstanceSettingsPage.jiraDescription')}
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label htmlFor="jira-site-url" className="text-sm font-medium">
                  {t('InstanceSettingsPage.jiraSiteUrlLabel')}
                </label>
                <Input
                  id="jira-site-url"
                  value={jiraSiteUrl}
                  onChange={(e) => setJiraSiteUrl(e.target.value)}
                  placeholder={t('InstanceSettingsPage.jiraSiteUrlPlaceholder')}
                />
              </div>
              <Button onClick={() => void saveJiraSiteUrl()} disabled={savingJiraSiteUrl}>
                {savingJiraSiteUrl ? t('InstanceSettingsPage.saving') : t('InstanceSettingsPage.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('InstanceSettingsPage.mcpTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('InstanceSettingsPage.mcpDescriptionPrefix')}<code>/mcp</code>{t('InstanceSettingsPage.mcpDescriptionSuffix')}{' '}
              {mcpEnabled ? (
                t('InstanceSettingsPage.mcpCurrentlyEnabled')
              ) : (
                <>
                  {t('InstanceSettingsPage.mcpCurrentlyDisabledPrefix')}<code>TESTPULSE_MCP_ENABLED=true</code>{t('InstanceSettingsPage.mcpCurrentlyDisabledSuffix')}
                </>
              )}
            </p>
            <Link to="/settings/tokens" className="text-sm font-medium text-primary hover:underline">
              {t('InstanceSettingsPage.manageTokensLink')}
            </Link>
          </CardContent>
        </Card>
      </section>
    </AdminShell>
  )
}

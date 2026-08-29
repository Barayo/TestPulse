import { useEffect, useState } from 'react'
import { DatabaseIcon, GlobeIcon, LinkIcon, LockIcon, PaletteIcon, TriangleAlertIcon } from 'lucide-react'
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

// Tenant-Admin-only instance-wide settings (enable-public-project-access,
// add-data-retention). Self-gates the same way RolesPage.tsx/PeoplePage.tsx
// do — a client-side check, not just the route-level RequireAuth — since a
// non-admin logged-in user can still navigate here directly.
export default function InstanceSettingsPage() {
  const { user: me, refreshColorTheme } = useAuth()
  const [publicProjectsEnabled, setPublicProjectsEnabled] = useState<boolean>()
  const [runRetentionDays, setRunRetentionDays] = useState<number>()
  const [autoArchiveInactiveDays, setAutoArchiveInactiveDays] = useState<number>()
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

  useEffect(() => {
    if (!me?.isTenantAdmin) return
    void api.GET('/api/v1/instance-settings').then(({ data }) => {
      if (!data) return
      setPublicProjectsEnabled(data.publicProjectsEnabled)
      setRunRetentionDays(data.runRetentionDays)
      setAutoArchiveInactiveDays(data.autoArchiveInactiveDays)
      setColorTheme(data.colorTheme)
      setCustomPalette(data.customPalette ?? undefined)
      if (data.colorTheme === 'custom') setShowCustomEditor(true)
      setSsoSettings(data)
      setJiraSiteUrl(data.jiraSiteUrl ?? '')
      setSessionTimeoutDays(data.sessionTimeoutDays)
      setSessionTimeoutInput(String(data.sessionTimeoutDays))
    })
  }, [me])

  if (!me?.isTenantAdmin) {
    return <p className="text-sm text-muted-foreground">Not authorized — admin only.</p>
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
      setSessionTimeoutError((error as { error?: string }).error ?? 'Could not save session timeout.')
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
      <h1 className="tp-heading text-xl">Instance</h1>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <GlobeIcon className="size-3.5" aria-hidden="true" />
          Access
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Public project access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Controls whether any project can ever be viewed without an account — a hard switch above each
              project's own &quot;Public access&quot; setting.
            </p>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">Public project access, instance-wide</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{publicProjectsEnabled ? 'On' : 'Off'}</span>
                <Switch
                  aria-label="Public project access, instance-wide"
                  checked={publicProjectsEnabled ?? false}
                  disabled={publicProjectsEnabled === undefined}
                  onCheckedChange={() => void toggle()}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              When off: no project is reachable anonymously, even one with its own &quot;Public access&quot; left
              on — that project's setting is kept, not cleared, and takes effect again the moment this is switched
              back on.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <DatabaseIcon className="size-3.5" aria-hidden="true" />
          Data
        </div>
        <Card className={runRetentionDays ? 'ring-destructive/30' : undefined}>
          <CardHeader>
            <CardTitle>Run retention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Automatically and permanently deletes a closed run once it crosses this age, counted from when the run
              was created. Open runs are never touched, no matter how old. This applies to every closed run already
              in the system today, not just ones closed after you turn it on.
            </p>
            <RetentionPillSelector
              value={runRetentionDays}
              onSelect={selectRunRetention}
              ariaLabel="Run retention period"
              customAriaLabel="Custom retention period, in days"
            />
            {runRetentionDays === undefined ? null : runRetentionDays === 0 ? (
              <p className="text-xs text-muted-foreground">Off — runs are never automatically deleted.</p>
            ) : (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                <p className="text-sm text-foreground">
                  Closed runs older than {runRetentionDays} day{runRetentionDays === 1 ? '' : 's'} are deleted
                  automatically and permanently — including runs already past that age right now.{' '}
                  <strong>This cannot be undone.</strong>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auto-archive inactive projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Automatically archives a project once it's gone quiet for this long — no new runs, case edits, or
              suites. Archiving never deletes anything.
            </p>
            <RetentionPillSelector
              value={autoArchiveInactiveDays}
              onSelect={selectAutoArchive}
              ariaLabel="Auto-archive inactivity period"
              customAriaLabel="Custom inactivity period, in days"
            />
            <p className="text-xs text-muted-foreground">
              {autoArchiveInactiveDays === undefined
                ? null
                : autoArchiveInactiveDays === 0
                  ? 'Off — projects are never automatically archived.'
                  : `Projects inactive for ${autoArchiveInactiveDays} day${autoArchiveInactiveDays === 1 ? '' : 's'} are archived automatically. Reversible any time from the project's own Settings.`}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <PaletteIcon className="size-3.5" aria-hidden="true" />
          Appearance
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Color theme</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div role="group" aria-label="Color theme" className="flex flex-wrap gap-3">
              {PRESETS.map((preset) => (
                <PaletteSwatch
                  key={preset.key}
                  presetKey={preset.key}
                  label={preset.label}
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
                label="Custom"
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
              Applies instantly, instance-wide — every signed-in and public-project visitor sees it the next time
              their page loads.
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
          <LockIcon className="size-3.5" aria-hidden="true" />
          Authentication
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Session timeout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              How long a signed-in session stays valid before requiring another sign-in — a sliding window that
              resets on activity, so nobody working stays logged out mid-session. Changing this only affects
              sessions created or renewed from now on; anyone already signed in keeps their current session&apos;s
              original expiry.
            </p>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <label htmlFor="session-timeout-days" className="text-sm font-medium">
                  Timeout
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
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </div>
              <Button
                onClick={() => void saveSessionTimeout()}
                disabled={sessionTimeoutDays === undefined || savingSessionTimeout || sessionTimeoutInvalid}
              >
                {savingSessionTimeout ? 'Saving…' : 'Save'}
              </Button>
            </div>
            {sessionTimeoutInvalid ? (
              <p role="alert" className="text-xs text-destructive">
                Enter a whole number of days between 1 and 90.
              </p>
            ) : sessionTimeoutError ? (
              <p role="alert" className="text-xs text-destructive">
                {sessionTimeoutError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">1–90 days. Default 30.</p>
            )}
          </CardContent>
        </Card>
        {ssoSettings && <SSOSettingsCard settings={ssoSettings} onSettingsChange={setSsoSettings} />}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <LinkIcon className="size-3.5" aria-hidden="true" />
          Integrations
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Jira</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Used to build a working link out to a linked Jira issue from a test case or run item — separate from
              the Jira connector&apos;s own credentials, which it configures independently. Leave empty to hide
              working links (a linked issue key still shows, just without a clickable link).
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label htmlFor="jira-site-url" className="text-sm font-medium">
                  Jira site URL
                </label>
                <Input
                  id="jira-site-url"
                  value={jiraSiteUrl}
                  onChange={(e) => setJiraSiteUrl(e.target.value)}
                  placeholder="https://mycompany.atlassian.net"
                />
              </div>
              <Button onClick={() => void saveJiraSiteUrl()} disabled={savingJiraSiteUrl}>
                {savingJiraSiteUrl ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </AdminShell>
  )
}

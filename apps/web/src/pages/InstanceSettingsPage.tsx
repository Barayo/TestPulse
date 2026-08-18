import { useEffect, useState } from 'react'
import { DatabaseIcon, GlobeIcon, LockIcon, PaletteIcon, TriangleAlertIcon } from 'lucide-react'
import { useAuth } from '@/lib/useAuth'
import { api } from '@/lib/api'
import { AdminShell } from '@/components/AdminShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RetentionPillSelector } from '@/components/RetentionPillSelector'
import { PaletteSwatch, PRESETS } from '@/components/PaletteSwatchSelector'
import { CustomPaletteEditor } from '@/components/CustomPaletteEditor'
import { PRESET_PALETTES } from '@/lib/presetPalettes'
import { Switch } from '@/components/ui/switch'
import type { CustomPalette } from '@/lib/useAuth'
import type { components } from '@testpulse/shared/api'

type ColorTheme = components['schemas']['ColorTheme']

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
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 opacity-60">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <LockIcon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Require SSO sign-in</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Coming with SSO (v0.2)
                  </span>
                </div>
                <span className="block text-xs text-muted-foreground">
                  Block password login instance-wide once an identity provider is configured.
                </span>
              </div>
              <Switch aria-label="Require SSO sign-in" checked={false} disabled />
            </div>
          </CardContent>
        </Card>
      </section>
    </AdminShell>
  )
}

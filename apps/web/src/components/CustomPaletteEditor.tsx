import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { ParseKeys } from 'i18next'
import { CheckIcon } from 'lucide-react'
import type { CustomPalette, CustomPaletteMode } from '@/lib/useAuth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PropertyRow } from '@/components/PropertyRow'
import { contrastRatio, meetsAA } from '@/lib/contrast'

type Mode = 'light' | 'dark'

const FIELDS: { key: keyof CustomPaletteMode; labelKey: ParseKeys }[] = [
  { key: 'background', labelKey: 'CustomPaletteEditor.fieldBackground' },
  { key: 'foreground', labelKey: 'CustomPaletteEditor.fieldForeground' },
  { key: 'card', labelKey: 'CustomPaletteEditor.fieldCard' },
  { key: 'primary', labelKey: 'CustomPaletteEditor.fieldPrimary' },
  { key: 'primaryForeground', labelKey: 'CustomPaletteEditor.fieldPrimaryText' },
  { key: 'muted', labelKey: 'CustomPaletteEditor.fieldMuted' },
  { key: 'mutedForeground', labelKey: 'CustomPaletteEditor.fieldMutedText' },
  { key: 'accent', labelKey: 'CustomPaletteEditor.fieldAccent' },
  { key: 'border', labelKey: 'CustomPaletteEditor.fieldBorder' },
  { key: 'input', labelKey: 'CustomPaletteEditor.fieldInput' },
]

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/

// The seven real contrast pairs used elsewhere in this app (design.md) —
// live, non-blocking readouts, not a Save-blocking guardrail.
const CONTRAST_PAIRS: { labelKey: ParseKeys; fg: keyof CustomPaletteMode; bg: keyof CustomPaletteMode }[] = [
  { labelKey: 'CustomPaletteEditor.contrastForegroundBackground', fg: 'foreground', bg: 'background' },
  { labelKey: 'CustomPaletteEditor.contrastForegroundCard', fg: 'foreground', bg: 'card' },
  { labelKey: 'CustomPaletteEditor.contrastPrimaryTextPrimary', fg: 'primaryForeground', bg: 'primary' },
  { labelKey: 'CustomPaletteEditor.contrastMutedTextMuted', fg: 'mutedForeground', bg: 'muted' },
  { labelKey: 'CustomPaletteEditor.contrastForegroundAccent', fg: 'foreground', bg: 'accent' },
  { labelKey: 'CustomPaletteEditor.contrastMutedTextCard', fg: 'mutedForeground', bg: 'card' },
  { labelKey: 'CustomPaletteEditor.contrastPrimaryAccent', fg: 'primary', bg: 'accent' },
]

interface CustomPaletteEditorProps {
  initial: CustomPalette
  onSave: (palette: CustomPalette) => void | Promise<void>
  saving?: boolean
}

// Full custom palette editor (add-color-theme-customization): 10 fields per
// light/dark mode, live WCAG contrast readouts, a live visual preview, and
// an explicit Save step (unlike every other live-apply control on this
// page — ten free-text hex fields shouldn't flash instance-wide, to every
// visitor, on every keystroke).
export function CustomPaletteEditor({ initial, onSave, saving }: CustomPaletteEditorProps) {
  const { t } = useTranslation()
  const [light, setLight] = useState<CustomPaletteMode>(initial.light)
  const [dark, setDark] = useState<CustomPaletteMode>(initial.dark)
  const [activeMode, setActiveMode] = useState<Mode>('light')
  const [errors, setErrors] = useState<Partial<Record<keyof CustomPaletteMode, string>>>({})

  const draft = activeMode === 'light' ? light : dark
  const setDraft = activeMode === 'light' ? setLight : setDark

  function updateField(key: keyof CustomPaletteMode, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function handleSave() {
    const newErrors: Partial<Record<keyof CustomPaletteMode, string>> = {}
    for (const mode of [light, dark]) {
      for (const { key } of FIELDS) {
        if (!HEX_PATTERN.test(mode[key])) {
          const fieldLabelKey = FIELDS.find((f) => f.key === key)?.labelKey
          newErrors[key] = t('CustomPaletteEditor.invalidHexError', {
            field: fieldLabelKey ? t(fieldLabelKey) : '',
          })
        }
      }
    }
    if (Object.values(newErrors).some(Boolean)) {
      setErrors(newErrors)
      return
    }
    void onSave({ light, dark })
  }

  const previewStyle = {
    '--background': draft.background,
    '--foreground': draft.foreground,
    '--card': draft.card,
    '--card-foreground': draft.foreground,
    '--primary': draft.primary,
    '--primary-foreground': draft.primaryForeground,
    '--muted': draft.muted,
    '--muted-foreground': draft.mutedForeground,
    '--accent': draft.accent,
    '--accent-foreground': draft.foreground,
    '--border': draft.border,
    '--input': draft.input,
  } as CSSProperties

  return (
    <div className="space-y-4 rounded-lg border p-3">
      <div role="group" aria-label={t('CustomPaletteEditor.modeAriaLabel')} className="flex gap-0.5 rounded-full bg-muted p-1 w-fit">
        {(['light', 'dark'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={activeMode === mode}
            onClick={() => setActiveMode(mode)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              activeMode === mode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {mode === 'light' ? t('CustomPaletteEditor.lightLabel') : t('CustomPaletteEditor.darkLabel')}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {FIELDS.map(({ key, labelKey }) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`palette-${key}`}>{t(labelKey)}</Label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    aria-hidden="true"
                    tabIndex={-1}
                    value={HEX_PATTERN.test(draft[key]) ? draft[key] : '#000000'}
                    onChange={(e) => updateField(key, e.target.value.toUpperCase())}
                    className="size-8 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                  <Input
                    id={`palette-${key}`}
                    value={draft[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                {errors[key] && <p className="text-xs text-destructive">{errors[key]}</p>}
              </div>
            ))}
          </div>

          <div role="region" aria-label={t('CustomPaletteEditor.contrastAriaLabel')} className="space-y-1 rounded-md bg-muted p-2.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('CustomPaletteEditor.contrastAriaLabel')}</p>
            {CONTRAST_PAIRS.map(({ labelKey, fg, bg }) => {
              const ratio = contrastRatio(draft[fg], draft[bg])
              const ok = meetsAA(ratio)
              return (
                <div key={labelKey} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t(labelKey)}</span>
                  <span className={ok ? 'text-foreground' : 'font-medium text-destructive'}>
                    {ratio.toFixed(2)}:1 · {ok ? t('CustomPaletteEditor.aaPass') : t('CustomPaletteEditor.aaFail')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div role="region" aria-label={t('CustomPaletteEditor.previewAriaLabel')} className="md:sticky md:top-6 md:self-start">
          <div style={previewStyle} className="space-y-3 rounded-lg border p-3" data-testid="palette-preview">
            {/* A non-interactive sample, not the real Save action below —
                labeled to read as an example, not confused with the actual
                "Save custom palette" button (user-reported confusion). */}
            <Button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              style={{ '--primary': draft.primary, '--primary-foreground': draft.primaryForeground } as CSSProperties}
            >
              {t('CustomPaletteEditor.exampleButtonLabel')}
            </Button>
            <Card>
              <CardHeader>
                <CardTitle>{t('CustomPaletteEditor.loginFlowTestTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <PropertyRow label={t('CustomPaletteEditor.sampleTestTypeLabel')} value={t('CustomPaletteEditor.sampleTestTypeValue')} />
                <PropertyRow label={t('CustomPaletteEditor.samplePlatformLabel')} value={t('CustomPaletteEditor.samplePlatformValue')} />
              </CardContent>
            </Card>
            <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              {t('CustomPaletteEditor.sampleNoResultHistoryText')}
            </p>
            <div className="rounded-md bg-accent px-2.5 py-1.5 text-sm font-semibold text-primary">{t('CustomPaletteEditor.sampleRolesLabel')}</div>
            <div className="flex items-center justify-between rounded-md border bg-accent px-2.5 py-1.5 text-sm">
              <span>{t('CustomPaletteEditor.sampleCasesCount')}</span>
              <span className="text-muted-foreground">{t('CustomPaletteEditor.sampleUpdatedAgoText')}</span>
            </div>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? (
          t('CustomPaletteEditor.saving')
        ) : (
          <>
            <CheckIcon className="size-4" aria-hidden="true" />
            {t('CustomPaletteEditor.saveCustomPaletteButton')}
          </>
        )}
      </Button>
    </div>
  )
}

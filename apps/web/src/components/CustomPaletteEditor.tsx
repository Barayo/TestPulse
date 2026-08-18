import { useState, type CSSProperties } from 'react'
import { CheckIcon } from 'lucide-react'
import type { CustomPalette, CustomPaletteMode } from '@/lib/useAuth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PropertyRow } from '@/components/PropertyRow'
import { contrastRatio, meetsAA } from '@/lib/contrast'

type Mode = 'light' | 'dark'

const FIELDS: { key: keyof CustomPaletteMode; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'foreground', label: 'Foreground' },
  { key: 'card', label: 'Card' },
  { key: 'primary', label: 'Primary' },
  { key: 'primaryForeground', label: 'Primary text' },
  { key: 'muted', label: 'Muted' },
  { key: 'mutedForeground', label: 'Muted text' },
  { key: 'accent', label: 'Accent' },
  { key: 'border', label: 'Border' },
  { key: 'input', label: 'Input' },
]

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/

// The seven real contrast pairs used elsewhere in this app (design.md) —
// live, non-blocking readouts, not a Save-blocking guardrail.
const CONTRAST_PAIRS: { label: string; fg: keyof CustomPaletteMode; bg: keyof CustomPaletteMode }[] = [
  { label: 'Foreground / Background', fg: 'foreground', bg: 'background' },
  { label: 'Foreground / Card', fg: 'foreground', bg: 'card' },
  { label: 'Primary text / Primary', fg: 'primaryForeground', bg: 'primary' },
  { label: 'Muted text / Muted', fg: 'mutedForeground', bg: 'muted' },
  { label: 'Foreground / Accent', fg: 'foreground', bg: 'accent' },
  { label: 'Muted text / Card', fg: 'mutedForeground', bg: 'card' },
  { label: 'Primary / Accent', fg: 'primary', bg: 'accent' },
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
          newErrors[key] = `${FIELDS.find((f) => f.key === key)?.label} must be a valid #RRGGBB hex color`
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
      <div role="group" aria-label="Mode" className="flex gap-0.5 rounded-full bg-muted p-1 w-fit">
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
            {mode === 'light' ? 'Light' : 'Dark'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {FIELDS.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`palette-${key}`}>{label}</Label>
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

          <div role="region" aria-label="Contrast" className="space-y-1 rounded-md bg-muted p-2.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contrast</p>
            {CONTRAST_PAIRS.map(({ label, fg, bg }) => {
              const ratio = contrastRatio(draft[fg], draft[bg])
              const ok = meetsAA(ratio)
              return (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={ok ? 'text-foreground' : 'font-medium text-destructive'}>
                    {ratio.toFixed(2)}:1 · {ok ? 'AA' : 'fails AA'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div role="region" aria-label="Preview" className="md:sticky md:top-6 md:self-start">
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
              Example button
            </Button>
            <Card>
              <CardHeader>
                <CardTitle>Login flow test</CardTitle>
              </CardHeader>
              <CardContent>
                <PropertyRow label="Test type" value="E2E" />
                <PropertyRow label="Platform" value="Web" />
              </CardContent>
            </Card>
            <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              No result history yet — record a run to see success rate here.
            </p>
            <div className="rounded-md bg-accent px-2.5 py-1.5 text-sm font-semibold text-primary">Roles</div>
            <div className="flex items-center justify-between rounded-md border bg-accent px-2.5 py-1.5 text-sm">
              <span>3 cases</span>
              <span className="text-muted-foreground">updated 2h ago</span>
            </div>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? (
          'Saving…'
        ) : (
          <>
            <CheckIcon className="size-4" aria-hidden="true" />
            Save custom palette
          </>
        )}
      </Button>
    </div>
  )
}

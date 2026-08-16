import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'

// Preset thresholds, in days — the values most admins reach for (mirrors
// what GitHub Actions/S3/Slack retention settings converge on). Anything
// else is "Custom" (Pepe design review, 2026-08-16). Shared by every
// instance-wide day-threshold control (Run retention, Auto-archive
// inactive projects — add-data-retention design.md D8/D9).
const PRESETS = [30, 90, 365]
const SEGMENTS: { label: string; value: number | 'custom' }[] = [
  { label: 'Off', value: 0 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '365d', value: 365 },
  { label: 'Custom', value: 'custom' },
]

interface RetentionPillSelectorProps {
  /** The saved threshold, or undefined while still loading. */
  value: number | undefined
  /** Called with the new threshold on a preset click or a committed custom value. */
  onSelect: (days: number) => void | Promise<void>
  /** Accessible name for the segmented control (role="group"). */
  ariaLabel: string
  /** Accessible name for the inline custom-days input, shown only in Custom mode. */
  customAriaLabel: string
}

export function RetentionPillSelector({ value, onSelect, ariaLabel, customAriaLabel }: RetentionPillSelectorProps) {
  // showCustom/customInput are UI-only: whether the inline "days" field is
  // revealed, and its live (uncommitted) text. Kept separate from value
  // (the saved threshold) so clicking "Custom" can reveal the field before
  // anything has been typed or saved.
  const [showCustom, setShowCustom] = useState(false)
  const [customInput, setCustomInput] = useState('')

  // Whenever the saved threshold changes (initial load, a preset click, or
  // a committed custom value), sync whether the custom field should be
  // showing — this is what makes typing a preset number into Custom (e.g.
  // "30") snap the UI back to the "30d" pill on commit, rather than leaving
  // a redundant Custom state around.
  useEffect(() => {
    if (value === undefined) return
    const isCustom = value !== 0 && !PRESETS.includes(value)
    setShowCustom(isCustom)
    setCustomInput(isCustom ? String(value) : '')
  }, [value])

  function commitCustom() {
    const days = Number(customInput)
    if (customInput.trim() === '' || !Number.isInteger(days) || days < 0) return
    void onSelect(days)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={ariaLabel} className="flex gap-0.5 rounded-full bg-muted p-1">
        {SEGMENTS.map((seg) => {
          const active = seg.value === 'custom' ? showCustom : !showCustom && value === seg.value
          return (
            <button
              key={seg.label}
              type="button"
              aria-pressed={active}
              onClick={() => (seg.value === 'custom' ? setShowCustom(true) : void onSelect(seg.value))}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {seg.label}
            </button>
          )
        })}
      </div>
      {showCustom && (
        <Input
          aria-label={customAriaLabel}
          type="number"
          min={0}
          className="w-20"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onBlur={commitCustom}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      )}
    </div>
  )
}

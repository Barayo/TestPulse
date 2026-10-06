import { CheckIcon } from 'lucide-react'

// Built-in preset swatch colors (add-color-theme-customization) — literal
// hex values matching index.css's [data-palette="…"] blocks exactly, since
// the grid must show every option's own colors regardless of which one is
// currently active on the page itself.
export const PRESETS = [
  { key: 'teal', labelKey: 'PaletteSwatchSelector.presetTeal', light: '#F7FAFA', lightPrimary: '#14B8A6', dark: '#0B2A28', darkPrimary: '#2DD4BF' },
  { key: 'indigo', labelKey: 'PaletteSwatchSelector.presetIndigo', light: '#F8F7FA', lightPrimary: '#4514B8', dark: '#140B2A', darkPrimary: '#5F2DD4' },
  { key: 'ocean', labelKey: 'PaletteSwatchSelector.presetOcean', light: '#F7F8FA', lightPrimary: '#1453B8', dark: '#0B172A', darkPrimary: '#2D6DD4' },
  { key: 'forest', labelKey: 'PaletteSwatchSelector.presetForest', light: '#F7FAF8', lightPrimary: '#14B850', dark: '#0B2A16', darkPrimary: '#2DD46A' },
] as const

interface PaletteSwatchProps {
  presetKey: string
  label: string
  light: string
  lightPrimary: string
  dark: string
  darkPrimary: string
  selected: boolean
  onSelect: () => void
}

// A single two-tone swatch: light half + dark half, each with a primary
// dot, so an admin can judge a palette in both modes at a glance without
// switching their own theme (Pepe design review).
export function PaletteSwatch({ label, light, lightPrimary, dark, darkPrimary, selected, onSelect }: PaletteSwatchProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex flex-col items-center gap-1.5 rounded-lg p-1.5 transition-colors ${
        selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:bg-muted'
      }`}
    >
      <span className="relative flex h-10 w-16 overflow-hidden rounded-md ring-1 ring-foreground/10">
        <span className="flex flex-1 items-center justify-center" style={{ backgroundColor: light }}>
          <span className="size-2.5 rounded-full" style={{ backgroundColor: lightPrimary }} />
        </span>
        <span className="flex flex-1 items-center justify-center" style={{ backgroundColor: dark }}>
          <span className="size-2.5 rounded-full" style={{ backgroundColor: darkPrimary }} />
        </span>
        {selected && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/10">
            <CheckIcon className="size-4 text-white drop-shadow" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

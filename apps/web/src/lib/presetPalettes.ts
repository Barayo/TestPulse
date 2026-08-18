import type { CustomPalette } from '@/lib/useAuth'

// Full 10-field-per-mode values for each built-in preset (add-color-theme-
// customization) — matches index.css's [data-palette="…"] blocks exactly.
// Used only to seed the custom editor when an admin opens it from a preset
// (so it starts from real, known-good values, not blank/black fields).
export const PRESET_PALETTES: Record<string, CustomPalette> = {
  teal: {
    light: {
      background: '#F7FAFA', foreground: '#0B2E2C', card: '#FFFFFF', primary: '#14B8A6',
      primaryForeground: '#FFFFFF', muted: '#F0F3F2', mutedForeground: '#5B6B6A',
      accent: '#EAFAF7', border: '#E1E8E7', input: '#D8E4E3',
    },
    dark: {
      background: '#0B2A28', foreground: '#E6F5F3', card: '#12403C', primary: '#2DD4BF',
      primaryForeground: '#0B2A28', muted: '#163A37', mutedForeground: '#8FBDB8',
      accent: '#163F3B', border: '#1D524C', input: '#1D524C',
    },
  },
  indigo: {
    light: {
      background: '#F8F7FA', foreground: '#160B2E', card: '#FFFFFF', primary: '#4514B8',
      primaryForeground: '#FFFFFF', muted: '#F0F0F3', mutedForeground: '#605B6B',
      accent: '#EEEAFA', border: '#E3E1E8', input: '#DCD8E4',
    },
    dark: {
      background: '#140B2A', foreground: '#EAE6F5', card: '#221240', primary: '#5F2DD4',
      primaryForeground: '#EAE6F5', muted: '#22163A', mutedForeground: '#9D8FBD',
      accent: '#23163F', border: '#2E1D52', input: '#2E1D52',
    },
  },
  ocean: {
    light: {
      background: '#F7F8FA', foreground: '#0B182E', card: '#FFFFFF', primary: '#1453B8',
      primaryForeground: '#FFFFFF', muted: '#F0F2F3', mutedForeground: '#5B616B',
      accent: '#EAF1FA', border: '#E1E4E8', input: '#D8DCE4',
    },
    dark: {
      background: '#0B172A', foreground: '#E6ECF5', card: '#122240', primary: '#2D6DD4',
      primaryForeground: '#E6ECF5', muted: '#16223A', mutedForeground: '#8FA1BD',
      accent: '#16253F', border: '#1D3152', input: '#1D3152',
    },
  },
  forest: {
    light: {
      background: '#F7FAF8', foreground: '#0B2E18', card: '#FFFFFF', primary: '#14B850',
      primaryForeground: '#FFFFFF', muted: '#F0F3F0', mutedForeground: '#5B6B61',
      accent: '#EAFAEF', border: '#E1E8E3', input: '#D8E4DD',
    },
    dark: {
      background: '#0B2A16', foreground: '#E6F5EB', card: '#124025', primary: '#2DD46A',
      primaryForeground: '#0B2A16', muted: '#163A25', mutedForeground: '#8FBDA0',
      accent: '#163F26', border: '#1D5231', input: '#1D5231',
    },
  },
}

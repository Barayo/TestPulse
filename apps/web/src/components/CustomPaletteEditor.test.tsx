import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomPaletteEditor } from './CustomPaletteEditor'
import type { CustomPalette } from '@/lib/useAuth'

const initial: CustomPalette = {
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
}

describe('CustomPaletteEditor', () => {
  it('renders 10 fields for the active (Light) mode, pre-seeded from initial values', () => {
    render(<CustomPaletteEditor initial={initial} onSave={vi.fn()} />)
    expect(screen.getByLabelText('Background')).toHaveValue('#F7FAFA')
    expect(screen.getByLabelText('Foreground')).toHaveValue('#0B2E2C')
    expect(screen.getByLabelText('Card')).toHaveValue('#FFFFFF')
    expect(screen.getByLabelText('Primary')).toHaveValue('#14B8A6')
    expect(screen.getByLabelText('Primary text')).toHaveValue('#FFFFFF')
    expect(screen.getByLabelText('Muted')).toHaveValue('#F0F3F2')
    expect(screen.getByLabelText('Muted text')).toHaveValue('#5B6B6A')
    expect(screen.getByLabelText('Accent')).toHaveValue('#EAFAF7')
    expect(screen.getByLabelText('Border')).toHaveValue('#E1E8E7')
    expect(screen.getByLabelText('Input')).toHaveValue('#D8E4E3')
  })

  it('switching to Dark shows the dark draft, and switching back preserves in-progress Light edits', async () => {
    render(<CustomPaletteEditor initial={initial} onSave={vi.fn()} />)
    await userEvent.clear(screen.getByLabelText('Primary'))
    await userEvent.type(screen.getByLabelText('Primary'), '#123456')

    await userEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(screen.getByLabelText('Primary')).toHaveValue('#2DD4BF')

    await userEvent.click(screen.getByRole('button', { name: 'Light' }))
    expect(screen.getByLabelText('Primary')).toHaveValue('#123456')
  })

  it('does not call onSave on keystroke, only on clicking Save custom palette', async () => {
    const onSave = vi.fn()
    render(<CustomPaletteEditor initial={initial} onSave={onSave} />)
    await userEvent.clear(screen.getByLabelText('Primary'))
    await userEvent.type(screen.getByLabelText('Primary'), '#123456')
    expect(onSave).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Save custom palette' }))
    expect(onSave).toHaveBeenCalledWith({
      light: { ...initial.light, primary: '#123456' },
      dark: initial.dark,
    })
  })

  it('shows an inline error and does not call onSave when a field has an invalid hex value', async () => {
    const onSave = vi.fn()
    render(<CustomPaletteEditor initial={initial} onSave={onSave} />)
    await userEvent.clear(screen.getByLabelText('Primary'))
    await userEvent.type(screen.getByLabelText('Primary'), 'not-a-color')

    await userEvent.click(screen.getByRole('button', { name: 'Save custom palette' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText(/must be a valid.*hex color/i)).toBeInTheDocument()
  })

  it('shows live WCAG contrast readouts for the seven real pairs, updating on edit', async () => {
    render(<CustomPaletteEditor initial={initial} onSave={vi.fn()} />)
    const readouts = screen.getByRole('region', { name: 'Contrast' })
    const fgBgRow = within(readouts).getByText('Foreground / Background').closest('div') as HTMLElement
    expect(within(fgBgRow).getByText(/13\.8/)).toBeInTheDocument() // teal fg/bg ~13.88:1

    await userEvent.clear(screen.getByLabelText('Foreground'))
    await userEvent.type(screen.getByLabelText('Foreground'), '#FFFFFF')
    expect(within(fgBgRow).queryByText(/13\.8/)).not.toBeInTheDocument()
    expect(within(fgBgRow).getByText(/fails AA/i)).toBeInTheDocument()
  })

  it('shows a live visual preview reflecting the current field values', async () => {
    render(<CustomPaletteEditor initial={initial} onSave={vi.fn()} />)
    const preview = screen.getByRole('region', { name: 'Preview' })
    // The sample button is deliberately non-interactive (aria-hidden) and
    // labeled as an example — not queryable by role, since it isn't a real
    // control and shouldn't be confused with the actual Save action below.
    const previewButton = within(preview).getByText('Example button')
    expect(previewButton).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Primary'))
    await userEvent.type(screen.getByLabelText('Primary'), '#123456')
    expect(previewButton).toHaveStyle({ '--primary': '#123456' })
  })

  it('shows a "Saving…" state while a save is in flight', () => {
    render(<CustomPaletteEditor initial={initial} onSave={vi.fn()} saving />)
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
  })
})

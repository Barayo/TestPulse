import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RunShortcutsHint, RunShortcutsOverlay } from './RunShortcuts'

const shortcuts = [
  { keys: 'P', label: 'Pass' },
  { keys: 'F', label: 'Failed' },
]

describe('RunShortcutsHint', () => {
  it('renders the passed-in shortcut list as a persistent legend', () => {
    render(<RunShortcutsHint shortcuts={shortcuts} />)
    expect(screen.getByText('Pass')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('P')).toBeInTheDocument()
    expect(screen.getByText('F')).toBeInTheDocument()
  })
})

describe('RunShortcutsOverlay', () => {
  it('opens when ? is pressed and lists the shortcuts', async () => {
    render(<RunShortcutsOverlay shortcuts={shortcuts} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.keyboard('?')

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Pass')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('closes when ? is pressed again', async () => {
    render(<RunShortcutsOverlay shortcuts={shortcuts} />)
    await userEvent.keyboard('?')
    await screen.findByRole('dialog')

    await userEvent.keyboard('?')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    render(<RunShortcutsOverlay shortcuts={shortcuts} />)
    await userEvent.keyboard('?')
    await screen.findByRole('dialog')

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not open while an input has focus', async () => {
    render(
      <>
        <input aria-label="typing" />
        <RunShortcutsOverlay shortcuts={shortcuts} />
      </>,
    )
    screen.getByLabelText('typing').focus()

    await userEvent.keyboard('?')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

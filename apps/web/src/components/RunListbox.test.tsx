import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RunListbox } from './RunListbox'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']

const runA: Run = {
  id: 'r1',
  key: 'p1-R1',
  projectId: 'p1',
  projectKey: 'p1',
  name: 'Smoke run',
  status: 'closed',
  archived: false,
  passRate: 80,
  createdAt: '2026-08-01T00:00:00Z',
}

const runB: Run = {
  id: 'r2',
  key: 'p1-R2',
  projectId: 'p1',
  projectKey: 'p1',
  name: 'Smoke run',
  status: 'closed',
  archived: false,
  passRate: 40,
  createdAt: '2026-08-10T00:00:00Z',
}

const runs = [runA, runB]

describe('RunListbox', () => {
  it('shows a placeholder in the trigger when nothing is selected', () => {
    render(<RunListbox label="Base run" runs={runs} value="" onChange={() => {}} placeholder="Select a run…" />)
    expect(screen.getByRole('combobox', { name: 'Base run' })).toHaveTextContent('Select a run…')
  })

  it("shows the selected run's name and date in the trigger", () => {
    render(<RunListbox label="Base run" runs={runs} value="p1-R2" onChange={() => {}} placeholder="Select a run…" />)
    const trigger = screen.getByRole('combobox', { name: 'Base run' })
    expect(trigger).toHaveTextContent('Smoke run')
    expect(trigger).not.toHaveTextContent('Select a run…')
  })

  it('opens a listbox of options on click, one per run, showing name and health', async () => {
    const user = userEvent.setup()
    render(<RunListbox label="Base run" runs={runs} value="" onChange={() => {}} placeholder="Select a run…" />)
    await user.click(screen.getByRole('combobox', { name: 'Base run' }))
    const listbox = screen.getByRole('listbox', { name: 'Base run' })
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(listbox).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('selects a run when its option is clicked, and closes the popup', async () => {
    const user = userEvent.setup()
    let selected = ''
    render(
      <RunListbox
        label="Base run"
        runs={runs}
        value=""
        onChange={(key) => {
          selected = key
        }}
        placeholder="Select a run…"
      />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Base run' }))
    await user.click(screen.getAllByRole('option')[1])
    expect(selected).toBe('p1-R2')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('moves aria-activedescendant with Arrow Down/Up without moving DOM focus off the trigger', async () => {
    const user = userEvent.setup()
    render(<RunListbox label="Base run" runs={runs} value="" onChange={() => {}} placeholder="Select a run…" />)
    const trigger = screen.getByRole('combobox', { name: 'Base run' })
    await user.click(trigger)
    const options = screen.getAllByRole('option')

    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(trigger)
    expect(trigger).toHaveAttribute('aria-activedescendant', options[1].id)

    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(trigger)
    expect(trigger).toHaveAttribute('aria-activedescendant', options[0].id)
  })

  it('selects the active option on Enter and closes the popup', async () => {
    const user = userEvent.setup()
    let selected = ''
    render(
      <RunListbox
        label="Base run"
        runs={runs}
        value=""
        onChange={(key) => {
          selected = key
        }}
        placeholder="Select a run…"
      />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Base run' }))
    await user.keyboard('{ArrowDown}{Enter}')
    expect(selected).toBe('p1-R2')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes on Escape without changing the selection', async () => {
    const user = userEvent.setup()
    let called = false
    render(
      <RunListbox
        label="Base run"
        runs={runs}
        value=""
        onChange={() => {
          called = true
        }}
        placeholder="Select a run…"
      />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Base run' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('closes when clicking outside the component', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <button type="button">outside</button>
        <RunListbox label="Base run" runs={runs} value="" onChange={() => {}} placeholder="Select a run…" />
      </div>,
    )
    await user.click(screen.getByRole('combobox', { name: 'Base run' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('renders each option without its own actions menu, even though it reuses run row content', async () => {
    const user = userEvent.setup()
    render(<RunListbox label="Base run" runs={runs} value="" onChange={() => {}} placeholder="Select a run…" />)
    await user.click(screen.getByRole('combobox', { name: 'Base run' }))
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument()
  })
})

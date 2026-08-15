import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GeneratedPasswordChip } from './GeneratedPasswordChip'

describe('GeneratedPasswordChip', () => {
  it('shows the value and a Copy button', () => {
    render(<GeneratedPasswordChip value="correcthorse-generated" />)
    expect(screen.getByText('correcthorse-generated')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
  })

  it('copies the value to the clipboard and shows Copied', async () => {
    const user = userEvent.setup()
    // Must come after userEvent.setup() — it installs its own clipboard
    // stub (for its copy/cut/paste API), which would otherwise clobber this.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<GeneratedPasswordChip value="correcthorse-generated" />)

    await user.click(screen.getByRole('button', { name: /copy/i }))

    expect(writeText).toHaveBeenCalledWith('correcthorse-generated')
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument()
  })
})

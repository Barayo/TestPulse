import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from './ThemeProvider'

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  let changeHandler: ((e: { matches: boolean }) => void) | null = null
  window.matchMedia = vi.fn().mockReturnValue({
    get matches() {
      return matches
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((event: string, handler: (e: { matches: boolean }) => void) => {
      if (event === 'change') changeHandler = handler
    }),
    removeEventListener: vi.fn(),
  })
  return {
    fireChange(newMatches: boolean) {
      matches = newMatches
      act(() => changeHandler?.({ matches: newMatches }))
    },
  }
}

function Consumer() {
  const [theme, setOverride] = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setOverride('dark')}>Go dark</button>
    </div>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
})

describe('ThemeProvider', () => {
  it('applies the dark class to the document root when resolved theme is dark', () => {
    mockMatchMedia(true)
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    )
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes the dark class when resolved theme is light', () => {
    mockMatchMedia(false)
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    )
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('updates the document class when a consumer sets an override', async () => {
    mockMatchMedia(false)
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    )
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Go dark' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('shares the same resolved theme across multiple consumers', () => {
    mockMatchMedia(true)
    render(
      <ThemeProvider>
        <Consumer />
        <Consumer />
      </ThemeProvider>,
    )
    const [first, second] = screen.getAllByTestId('theme')
    expect(first.textContent).toBe('dark')
    expect(second.textContent).toBe('dark')
  })
})

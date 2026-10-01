import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

vi.mock('@/lib/reportClientError', () => ({ reportClientError: vi.fn() }))

function Bomb(): never {
  throw new Error('kaboom')
}

describe('ErrorBoundary', () => {
  it('renders the fallback UI instead of the crashed child', async () => {
    // React logs the caught error to console.error by default — silence it
    // for this expected-crash test, same as React's own testing guidance.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument()
    expect(screen.queryByText('kaboom')).not.toBeInTheDocument()
  })

  it('reports the crash with message and component stack', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { reportClientError } = await import('@/lib/reportClientError')
    vi.mocked(reportClientError).mockClear()

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    await screen.findByText('Something went wrong')

    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'crash',
        message: 'kaboom',
        componentStack: expect.stringContaining('Bomb'),
      }),
    )
  })

  it('renders children normally when nothing crashes', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('all good')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })
})

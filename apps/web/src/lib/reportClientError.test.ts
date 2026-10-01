import { describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({ api: { POST: vi.fn() } }))

describe('reportClientError', () => {
  it('posts the report to /api/v1/client-errors', async () => {
    const { api } = await import('./api')
    const { reportClientError } = await import('./reportClientError')
    vi.mocked(api.POST).mockResolvedValue({ data: undefined, error: undefined } as never)

    reportClientError({ kind: 'crash', message: 'boom' })
    await Promise.resolve()

    expect(api.POST).toHaveBeenCalledWith('/api/v1/client-errors', { body: { kind: 'crash', message: 'boom' } })
  })

  it('does not throw when the request itself fails', async () => {
    const { api } = await import('./api')
    const { reportClientError } = await import('./reportClientError')
    vi.mocked(api.POST).mockRejectedValue(new Error('network down'))

    expect(() => reportClientError({ kind: 'apiError', message: 'failed' })).not.toThrow()
    await Promise.resolve()
  })
})

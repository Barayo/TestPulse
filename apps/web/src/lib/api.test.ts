import { describe, expect, it, vi } from 'vitest'

vi.mock('./sessionExpiry', () => ({ notifySessionExpired: vi.fn() }))

function fakeParams(schemaPath: string, response: Response) {
  return {
    request: new Request(`http://localhost${schemaPath}`),
    response,
    schemaPath,
    params: {},
    id: 'test',
    options: {} as never,
  }
}

describe('sessionExpiryMiddleware', () => {
  it('notifies session expiry on a 401 from a domain route', async () => {
    const { notifySessionExpired } = await import('./sessionExpiry')
    const { sessionExpiryMiddleware } = await import('./api')

    await sessionExpiryMiddleware.onResponse?.(fakeParams('/api/v1/projects', new Response(null, { status: 401 })))

    expect(notifySessionExpired).toHaveBeenCalledOnce()
  })

  it('does not notify on a 401 from the login endpoint', async () => {
    vi.clearAllMocks()
    const { notifySessionExpired } = await import('./sessionExpiry')
    const { sessionExpiryMiddleware } = await import('./api')

    await sessionExpiryMiddleware.onResponse?.(
      fakeParams('/api/v1/auth/login', new Response(null, { status: 401 })),
    )

    expect(notifySessionExpired).not.toHaveBeenCalled()
  })

  it('does not notify on a 401 from the logout endpoint', async () => {
    vi.clearAllMocks()
    const { notifySessionExpired } = await import('./sessionExpiry')
    const { sessionExpiryMiddleware } = await import('./api')

    await sessionExpiryMiddleware.onResponse?.(
      fakeParams('/api/v1/auth/logout', new Response(null, { status: 401 })),
    )

    expect(notifySessionExpired).not.toHaveBeenCalled()
  })

  it('does not notify on a non-401 response', async () => {
    vi.clearAllMocks()
    const { notifySessionExpired } = await import('./sessionExpiry')
    const { sessionExpiryMiddleware } = await import('./api')

    await sessionExpiryMiddleware.onResponse?.(fakeParams('/api/v1/projects', new Response(null, { status: 200 })))

    expect(notifySessionExpired).not.toHaveBeenCalled()
  })
})

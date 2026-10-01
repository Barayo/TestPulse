import { describe, expect, it, vi } from 'vitest'

vi.mock('./sessionExpiry', () => ({ notifySessionExpired: vi.fn() }))
vi.mock('./reportClientError', () => ({ reportClientError: vi.fn() }))

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

function fakeErrorParams(schemaPath: string, error: unknown) {
  return {
    request: new Request(`http://localhost${schemaPath}`),
    error,
    schemaPath,
    params: {},
    id: 'test',
    options: {} as never,
  }
}

describe('errorReportingMiddleware', () => {
  it('reports a 400+ response from a domain route', async () => {
    const { reportClientError } = await import('./reportClientError')
    const { errorReportingMiddleware } = await import('./api')

    await errorReportingMiddleware.onResponse?.(fakeParams('/api/v1/projects', new Response(null, { status: 404 })))

    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'apiError', status: 404, path: '/api/v1/projects' }),
    )
  })

  it('does not report a 2xx response', async () => {
    vi.clearAllMocks()
    const { reportClientError } = await import('./reportClientError')
    const { errorReportingMiddleware } = await import('./api')

    await errorReportingMiddleware.onResponse?.(fakeParams('/api/v1/projects', new Response(null, { status: 200 })))

    expect(reportClientError).not.toHaveBeenCalled()
  })

  it('does not report a failure of the reporting endpoint itself', async () => {
    vi.clearAllMocks()
    const { reportClientError } = await import('./reportClientError')
    const { errorReportingMiddleware } = await import('./api')

    await errorReportingMiddleware.onResponse?.(
      fakeParams('/api/v1/client-errors', new Response(null, { status: 500 })),
    )

    expect(reportClientError).not.toHaveBeenCalled()
  })

  it('reports a network-level failure', async () => {
    vi.clearAllMocks()
    const { reportClientError } = await import('./reportClientError')
    const { errorReportingMiddleware } = await import('./api')

    await errorReportingMiddleware.onError?.(fakeErrorParams('/api/v1/projects', new Error('offline')))

    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'apiError', message: 'offline', path: '/api/v1/projects' }),
    )
  })

  it('does not report a network-level failure of the reporting endpoint itself', async () => {
    vi.clearAllMocks()
    const { reportClientError } = await import('./reportClientError')
    const { errorReportingMiddleware } = await import('./api')

    await errorReportingMiddleware.onError?.(fakeErrorParams('/api/v1/client-errors', new Error('offline')))

    expect(reportClientError).not.toHaveBeenCalled()
  })
})

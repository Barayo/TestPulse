import { describe, expect, it, vi } from 'vitest'
import { discoverUrls } from './discover-urls.mjs'

const BASE_URL = 'http://localhost:8080'

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body }
}

const COOKIE = 'testpulse_session=abc123'

describe('discoverUrls', () => {
  it('resolves the four target page URLs from the sample project and its first run', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          { key: 'OTHER', isSample: false },
          { key: 'TD', isSample: true },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [{ key: 'TD-R1' }, { key: 'TD-R2' }] }))

    const urls = await discoverUrls(BASE_URL, fetchImpl, COOKIE)

    expect(urls).toEqual({
      projectsUrl: `${BASE_URL}/`,
      projectUrl: `${BASE_URL}/projects/TD`,
      libraryUrl: `${BASE_URL}/projects/TD/library`,
      runUrl: `${BASE_URL}/runs/TD-R1`,
    })
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE_URL}/api/v1/projects`, {
      headers: { Cookie: COOKIE },
    })
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE_URL}/api/v1/projects/TD/runs`, {
      headers: { Cookie: COOKIE },
    })
  })

  it('throws a clear error when no sample project exists', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse([{ key: 'OTHER', isSample: false }]))

    await expect(discoverUrls(BASE_URL, fetchImpl, COOKIE)).rejects.toThrow(/no sample project/i)
  })

  it('throws a clear error when the sample project has no runs', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ key: 'TD', isSample: true }]))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))

    await expect(discoverUrls(BASE_URL, fetchImpl, COOKIE)).rejects.toThrow(/no runs/i)
  })
})

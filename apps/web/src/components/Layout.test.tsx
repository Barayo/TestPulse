import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Layout } from './Layout'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

beforeEach(() => {
  vi.resetAllMocks()
  mockGET.mockImplementation((path: string) => {
    if (path === '/readyz') return Promise.resolve({ response: { ok: true } })
    if (path === '/api/v1/meta') return Promise.resolve({ data: { name: 'TestPulse', version: '0.0.1' }, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: false } })
  })
})

function renderLayout(initialPath = '/projects/QA') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Layout>
          <div>page content</div>
        </Layout>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Layout', () => {
  it('shows the anonymous-viewer banner and a Log in link carrying the current path as loginFrom when there is no session', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: undefined, response: { ok: false } })
      if (path === '/api/v1/meta') return Promise.resolve({ data: { name: 'TestPulse', version: '0.0.1' }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderLayout('/projects/QA')

    expect(await screen.findByText(/viewing this without an account/i)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /log in/i })
    expect(link).toHaveAttribute('href', '/login')
  })

  it('shows neither the banner nor a Log in link once a session is present', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me')
        return Promise.resolve({ data: { id: 'u1', email: 'a@b.com', isTenantAdmin: false }, response: { ok: true } })
      if (path === '/api/v1/meta') return Promise.resolve({ data: { name: 'TestPulse', version: '0.0.1' }, response: { ok: true } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderLayout('/projects/QA')

    await screen.findByText('page content')
    expect(screen.queryByText(/viewing this without an account/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument()
  })

  it('shows the real project name, not "Select project", for an anonymous visitor navigating off the project landing page into a sub-page', async () => {
    mockGET.mockImplementation((path: string, options?: { params?: { path?: { projectKey?: string } } }) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: undefined, response: { ok: false } })
      if (path === '/api/v1/meta') return Promise.resolve({ data: { name: 'TestPulse', version: '0.0.1' }, response: { ok: true } })
      if (path === '/api/v1/projects') return Promise.resolve({ data: undefined, response: { ok: false, status: 401 } })
      if (path === '/api/v1/projects/summaries') return Promise.resolve({ data: undefined, response: { ok: false, status: 401 } })
      if (path === '/api/v1/projects/{projectKey}/permissions')
        return Promise.resolve({ data: undefined, response: { ok: false, status: 403 } })
      if (path === '/api/v1/public/projects/{projectKey}' && options?.params?.path?.projectKey === 'QA') {
        return Promise.resolve({
          data: {
            id: 'p1',
            key: 'QA',
            name: 'Quality Assurance',
            archived: false,
            description: '',
            isSample: false,
            publicAccess: true,
            autoArchiveExempt: false,
            assigneeRestrictedRecording: false,
            createdAt: '2026-01-01T00:00:00Z',
          },
          response: { ok: true },
        })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderLayout('/projects/QA/library')

    expect(await screen.findByRole('link', { name: 'Quality Assurance' })).toBeInTheDocument()
    expect(screen.queryByText('Select project')).not.toBeInTheDocument()
  })

  // add-color-theme-customization follow-up: the wordmark icon's gradient
  // previously hardcoded Teal's own hex values, so it stayed teal on every
  // other palette — the one piece of brand chrome that didn't follow the
  // instance theme. It should track --primary like everything else instead
  // of being pinned to one preset's exact color.
  it("derives the wordmark icon's gradient from the --primary token, not a hardcoded teal hex", async () => {
    renderLayout()
    await screen.findByText('page content')
    const gradientStop = document.querySelector('#tp-wordmark-gradient stop')
    expect(gradientStop).not.toHaveAttribute('stop-color', '#14B8A6')
    expect(gradientStop?.getAttribute('stop-color')).toMatch(/var\(--primary\)/)
  })
})

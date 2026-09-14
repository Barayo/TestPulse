import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import ImportProjectPage from './ImportProjectPage'
import { api } from '@/lib/api'
import { AuthProvider } from '@/lib/useAuth'

vi.mock('@/lib/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn() },
}))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

const ME_TENANT_ADMIN = { id: 'admin1', email: 'admin@example.com', isTenantAdmin: true }
const ME_NON_ADMIN = { id: 'member1', email: 'member@example.com', isTenantAdmin: false }

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    key: 'p1',
    name: 'Existing Empty Project',
    archived: false,
    description: '',
    isSample: false,
    createdAt: '',
    ...overrides,
  }
}

function summary(overrides: Record<string, unknown> = {}) {
  return { projectId: 'p1', suiteCount: 0, caseCount: 0, passRate: null, isFavorite: false, ...overrides }
}

function importJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job1',
    projectId: 'p1',
    source: 'testrail',
    mode: 'dry_run',
    status: 'pending',
    progressCurrent: 0,
    progressTotal: 0,
    createdBy: 'admin1',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function mockBaseAPI(opts: {
  me?: unknown
  projects?: unknown[]
  summaries?: unknown[]
} = {}) {
  const me = opts.me ?? ME_TENANT_ADMIN
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') return Promise.resolve({ data: me, response: { ok: true } })
    if (path === '/api/v1/projects') return Promise.resolve({ data: opts.projects ?? [], response: { ok: true } })
    if (path === '/api/v1/projects/summaries')
      return Promise.resolve({ data: opts.summaries ?? [], response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: false } })
  })
}

function renderImportPage(path = '/projects/import/testrail') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/projects/import/:source" element={<ImportProjectPage />} />
          <Route path="/projects/:projectKey" element={<div>Project page stub</div>} />
          <Route path="/projects/:projectKey/library" element={<div>Library stub</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function fillConnectForm(opts: { targetMode?: 'new' | 'existing'; existingLabel?: string } = {}) {
  await userEvent.type(screen.getByLabelText(/testrail site url/i), 'https://acme.testrail.io')
  await userEvent.type(screen.getByLabelText(/testrail project id/i), '7')
  await userEvent.type(screen.getByLabelText(/testrail account email/i), 'qa-lead@acme.com')
  await userEvent.type(screen.getByLabelText(/testrail api key/i), 'secret-key')
  if (opts.targetMode === 'existing') {
    await userEvent.click(screen.getByRole('button', { name: /existing empty project/i }))
    await userEvent.selectOptions(screen.getByLabelText(/existing project/i), opts.existingLabel ?? 'Existing Empty Project')
  } else {
    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ImportProjectPage — page shell', () => {
  it('renders the breadcrumb, heading, and subhead copy', async () => {
    mockBaseAPI()
    renderImportPage()
    await screen.findByRole('heading', { name: 'Import from TestRail' })
    expect(screen.getByText(/doesn't touch TestPulse's own Suite feature/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/')
  })

  it('denies access to a non-Tenant-Admin', async () => {
    mockBaseAPI({ me: ME_NON_ADMIN })
    renderImportPage()
    expect(await screen.findByText(/don't have permission/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Import from TestRail' })).not.toBeInTheDocument()
  })
})

describe('ImportProjectPage — Connect stage (add-testrail-importer tasks.md 7.3)', () => {
  it('renders the four TestRail connection fields and the trademark disclaimer footnote (design.md D10)', async () => {
    mockBaseAPI()
    renderImportPage()
    await screen.findByText('Connect to TestRail')

    expect(screen.getByLabelText(/testrail site url/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/testrail project id/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/testrail account email/i)).toBeInTheDocument()
    const apiKeyField = screen.getByLabelText(/testrail api key/i)
    expect(apiKeyField).toHaveAttribute('type', 'password')

    expect(
      screen.getByText(/not affiliated with, endorsed by, or sponsored by Idera, Inc\./i),
    ).toBeInTheDocument()
    expect(screen.getByText(/TestRail is a trademark of Idera, Inc\./i)).toBeInTheDocument()
  })

  it('defaults to "New project" and shows a name field', async () => {
    mockBaseAPI()
    renderImportPage()
    await screen.findByText('Connect to TestRail')
    expect(screen.getByRole('button', { name: /^new project$/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/new project name/i)).toBeInTheDocument()
  })

  it('switching to "Existing empty project" lists only zero-case, zero-suite projects', async () => {
    mockBaseAPI({
      projects: [project({ id: 'p1', key: 'p1', name: 'Empty One' }), project({ id: 'p2', key: 'p2', name: 'Has Cases' })],
      summaries: [
        summary({ projectId: 'p1', suiteCount: 0, caseCount: 0 }),
        summary({ projectId: 'p2', suiteCount: 2, caseCount: 30 }),
      ],
    })
    renderImportPage()
    await screen.findByText('Connect to TestRail')
    await userEvent.click(screen.getByRole('button', { name: /existing empty project/i }))

    const select = screen.getByLabelText(/existing project/i)
    expect(within(select).getByText('Empty One')).toBeInTheDocument()
    expect(within(select).queryByText('Has Cases')).not.toBeInTheDocument()
    expect(screen.getByText(/only projects with no folders, suites, or cases yet are listed/i)).toBeInTheDocument()
  })

  it('submitting creates the new target project, then a dry-run import job, and shows a scanning state while pending', async () => {
    mockBaseAPI()
    mockPOST.mockImplementation((path: string) => {
      if (path === '/api/v1/projects')
        return Promise.resolve({
          data: { id: 'newp', key: 'QAP', name: 'QA Platform', archived: false, description: '', createdAt: '' },
          response: { ok: true },
        })
      if (path === '/api/v1/projects/{projectKey}/import-jobs')
        return Promise.resolve({ data: importJob({ id: 'job1', status: 'pending' }), response: { ok: true, status: 201 } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderImportPage()
    await screen.findByText('Connect to TestRail')
    await fillConnectForm()
    await userEvent.click(screen.getByRole('button', { name: /preview import/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith('/api/v1/projects', expect.objectContaining({ body: { name: 'QA Platform' } }))
    })
    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/import-jobs',
        expect.objectContaining({
          params: { path: { projectKey: 'QAP' } },
          body: {
            source: 'testrail',
            mode: 'dry_run',
            credentials: {
              siteUrl: 'https://acme.testrail.io',
              email: 'qa-lead@acme.com',
              apiKey: 'secret-key',
              testRailProjectId: '7',
            },
          },
        }),
      )
    })

    expect(await screen.findByText(/scanning your testrail project/i)).toBeInTheDocument()
    // Connect card collapses to a one-line summary once past this stage.
    expect(screen.getByText(/acme\.testrail\.io/)).toBeInTheDocument()
    expect(screen.getByText(/qa-lead@acme\.com/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit connection/i })).toBeInTheDocument()
  })

  it('polls the dry-run job and moves to the Preview stage once it succeeds', async () => {
    mockBaseAPI()
    mockPOST.mockImplementation((path: string) => {
      if (path === '/api/v1/projects')
        return Promise.resolve({
          data: { id: 'newp', key: 'QAP', name: 'QA Platform', archived: false, description: '', createdAt: '' },
          response: { ok: true },
        })
      return Promise.resolve({
        data: importJob({ id: 'job1', status: 'pending' }),
        response: { ok: true, status: 201 },
      })
    })
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: ME_TENANT_ADMIN, response: { ok: true } })
      if (path === '/api/v1/projects') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/summaries') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/import-jobs/{jobId}')
        return Promise.resolve({
          data: importJob({ id: 'job1', status: 'succeeded', report: { counts: { folders: 12, cases: 340 }, unmapped: [] } }),
          response: { ok: true },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderImportPage()
    await screen.findByText('Connect to TestRail')
    await fillConnectForm()
    await userEvent.click(screen.getByRole('button', { name: /preview import/i }))
    await screen.findByText(/scanning your testrail project/i)

    await vi.advanceTimersByTimeAsync(3000)

    expect(await screen.findByText('Preview')).toBeInTheDocument()
  })

  it('shows the job error and returns to an editable Connect stage when the dry-run fails', async () => {
    mockBaseAPI()
    mockPOST.mockImplementation((path: string) => {
      if (path === '/api/v1/projects')
        return Promise.resolve({
          data: { id: 'newp', key: 'QAP', name: 'QA Platform', archived: false, description: '', createdAt: '' },
          response: { ok: true },
        })
      return Promise.resolve({ data: importJob({ id: 'job1', status: 'pending' }), response: { ok: true, status: 201 } })
    })
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: ME_TENANT_ADMIN, response: { ok: true } })
      if (path === '/api/v1/projects') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/summaries') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/import-jobs/{jobId}')
        return Promise.resolve({
          data: importJob({ id: 'job1', status: 'failed', error: 'invalid TestRail API key' }),
          response: { ok: true },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderImportPage()
    await screen.findByText('Connect to TestRail')
    await fillConnectForm()
    await userEvent.click(screen.getByRole('button', { name: /preview import/i }))
    await screen.findByText(/scanning your testrail project/i)

    await vi.advanceTimersByTimeAsync(3000)

    expect(await screen.findByText(/invalid TestRail API key/i)).toBeInTheDocument()
    // Back on the editable Connect stage — the site URL the user typed is preserved.
    expect(screen.getByLabelText(/testrail site url/i)).toHaveValue('https://acme.testrail.io')
  })
})

describe('ImportProjectPage — Preview stage (tasks.md 7.4)', () => {
  async function reachPreview(report: { counts: Record<string, number>; unmapped: string[] }) {
    mockBaseAPI()
    mockPOST.mockImplementation((path: string) => {
      if (path === '/api/v1/projects')
        return Promise.resolve({
          data: { id: 'newp', key: 'QAP', name: 'QA Platform', archived: false, description: '', createdAt: '' },
          response: { ok: true },
        })
      return Promise.resolve({ data: importJob({ id: 'job1', status: 'pending' }), response: { ok: true, status: 201 } })
    })
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: ME_TENANT_ADMIN, response: { ok: true } })
      if (path === '/api/v1/projects') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/summaries') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/import-jobs/{jobId}')
        return Promise.resolve({
          data: importJob({ id: 'job1', status: 'succeeded', report }),
          response: { ok: true },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderImportPage()
    await screen.findByText('Connect to TestRail')
    await fillConnectForm()
    await userEvent.click(screen.getByRole('button', { name: /preview import/i }))
    await screen.findByText(/scanning your testrail project/i)
    await vi.advanceTimersByTimeAsync(3000)
    await screen.findByText('Preview')
  }

  it('renders the report counts and the exact case count on the commit button', async () => {
    await reachPreview({ counts: { folders: 12, cases: 340 }, unmapped: [] })
    expect(screen.getByText('340')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import 340 cases' })).toBeInTheDocument()
  })

  it('renders every unmapped field name with no truncation/"+N more" collapsing', async () => {
    await reachPreview({
      counts: { folders: 3, cases: 10 },
      unmapped: ['Regression Group', 'Automation Owner', 'Test Environment', 'Priority Override'],
    })
    expect(screen.getByText(/4 custom fields won't be imported/i)).toBeInTheDocument()
    for (const name of ['Regression Group', 'Automation Owner', 'Test Environment', 'Priority Override']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    expect(screen.queryByText(/\+\d+ more/i)).not.toBeInTheDocument()
  })

  it('omits the unmapped-fields callout when nothing was dropped', async () => {
    await reachPreview({ counts: { folders: 3, cases: 10 }, unmapped: [] })
    expect(screen.queryByText(/won't be imported/i)).not.toBeInTheDocument()
  })

  it('"Start over" returns to a blank Connect stage', async () => {
    await reachPreview({ counts: { folders: 3, cases: 10 }, unmapped: [] })
    await userEvent.click(screen.getByRole('button', { name: /start over/i }))
    expect(await screen.findByLabelText(/testrail site url/i)).toHaveValue('')
    expect(screen.queryByText('Preview')).not.toBeInTheDocument()
  })

  it('confirming the import dialog triggers a real-mode job with the same credentials', async () => {
    await reachPreview({ counts: { folders: 3, cases: 10 }, unmapped: [] })
    mockPOST.mockResolvedValue({ data: importJob({ id: 'job2', mode: 'real', status: 'pending' }), response: { ok: true, status: 201 } })

    await userEvent.click(screen.getByRole('button', { name: 'Import 10 cases' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Import 10 cases into "QA Platform"?')).toBeInTheDocument()

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /import 10 cases/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/import-jobs',
        expect.objectContaining({
          params: { path: { projectKey: 'QAP' } },
          body: {
            source: 'testrail',
            mode: 'real',
            credentials: {
              siteUrl: 'https://acme.testrail.io',
              email: 'qa-lead@acme.com',
              apiKey: 'secret-key',
              testRailProjectId: '7',
            },
          },
        }),
      )
    })
    expect(await screen.findByText('Importing…')).toBeInTheDocument()
  })
})

describe('ImportProjectPage — Importing stage (tasks.md 7.5)', () => {
  async function reachImporting() {
    mockBaseAPI()
    mockPOST.mockImplementation((path: string, opts?: { body?: { mode?: string } }) => {
      if (path === '/api/v1/projects')
        return Promise.resolve({
          data: { id: 'newp', key: 'QAP', name: 'QA Platform', archived: false, description: '', createdAt: '' },
          response: { ok: true },
        })
      if (opts?.body?.mode === 'real')
        return Promise.resolve({ data: importJob({ id: 'job2', mode: 'real', status: 'pending' }), response: { ok: true, status: 201 } })
      return Promise.resolve({ data: importJob({ id: 'job1', status: 'pending' }), response: { ok: true, status: 201 } })
    })
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: ME_TENANT_ADMIN, response: { ok: true } })
      if (path === '/api/v1/projects') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/summaries') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/import-jobs/{jobId}')
        return Promise.resolve({
          data: importJob({ id: 'job1', status: 'succeeded', report: { counts: { folders: 3, cases: 10 }, unmapped: [] } }),
          response: { ok: true },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderImportPage()
    await screen.findByText('Connect to TestRail')
    await fillConnectForm()
    await userEvent.click(screen.getByRole('button', { name: /preview import/i }))
    await screen.findByText(/scanning your testrail project/i)
    await vi.advanceTimersByTimeAsync(3000)
    await screen.findByText('Preview')
    await userEvent.click(screen.getByRole('button', { name: 'Import 10 cases' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /import 10 cases/i }))
    await screen.findByText('Importing…')
  }

  it('polls the real-mode job and renders a live count-up from progressCurrent/progressTotal, not just a spinner', async () => {
    await reachImporting()
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}/import-jobs/{jobId}')
        return Promise.resolve({
          data: importJob({ id: 'job2', mode: 'real', status: 'running', progressCurrent: 4, progressTotal: 10 }),
          response: { ok: true },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })

    await vi.advanceTimersByTimeAsync(3000)

    expect(await screen.findByText(/4 of 10 cases imported/i)).toBeInTheDocument()
  })
})

describe('ImportProjectPage — Result stage (tasks.md 7.6)', () => {
  async function reachResult(report: { counts: Record<string, number>; unmapped: string[] }) {
    mockBaseAPI()
    mockPOST.mockImplementation((path: string, opts?: { body?: { mode?: string } }) => {
      if (path === '/api/v1/projects')
        return Promise.resolve({
          data: { id: 'newp', key: 'QAP', name: 'QA Platform', archived: false, description: '', createdAt: '' },
          response: { ok: true },
        })
      if (opts?.body?.mode === 'real')
        return Promise.resolve({ data: importJob({ id: 'job2', mode: 'real', status: 'pending' }), response: { ok: true, status: 201 } })
      return Promise.resolve({ data: importJob({ id: 'job1', status: 'pending' }), response: { ok: true, status: 201 } })
    })
    let getCall = 0
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: ME_TENANT_ADMIN, response: { ok: true } })
      if (path === '/api/v1/projects') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/summaries') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/import-jobs/{jobId}') {
        getCall += 1
        if (getCall === 1) {
          return Promise.resolve({
            data: importJob({ id: 'job1', status: 'succeeded', report: { counts: { folders: 3, cases: 10 }, unmapped: [] } }),
            response: { ok: true },
          })
        }
        return Promise.resolve({
          data: importJob({ id: 'job2', mode: 'real', status: 'succeeded', progressCurrent: 10, progressTotal: 10, report }),
          response: { ok: true },
        })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderImportPage()
    await screen.findByText('Connect to TestRail')
    await fillConnectForm()
    await userEvent.click(screen.getByRole('button', { name: /preview import/i }))
    await screen.findByText(/scanning your testrail project/i)
    await vi.advanceTimersByTimeAsync(3000)
    await screen.findByText('Preview')
    await userEvent.click(screen.getByRole('button', { name: 'Import 10 cases' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /import 10 cases/i }))
    await screen.findByText('Importing…')
    await vi.advanceTimersByTimeAsync(3000)
    await screen.findByText('Import complete')
  }

  it('renders the completed report and links into the created project', async () => {
    await reachResult({ counts: { folders: 3, cases: 10 }, unmapped: [] })
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    const openLink = screen.getByRole('link', { name: /open qa platform/i })
    expect(openLink).toHaveAttribute('href', '/projects/QAP')
  })

  it('links the folder stat tile into the created project\'s Library', async () => {
    await reachResult({ counts: { folders: 3, cases: 10 }, unmapped: [] })
    const libraryLink = screen.getByRole('link', { name: /^3/ })
    expect(libraryLink).toHaveAttribute('href', '/projects/QAP/library')
  })

  it('mentions dropped custom fields and untouched Suites only when fields were unmapped', async () => {
    await reachResult({ counts: { folders: 3, cases: 10 }, unmapped: ['Regression Group'] })
    expect(screen.getByText(/1 custom fields were dropped/i)).toBeInTheDocument()
    expect(screen.getByText(/existing TestPulse Suites are untouched/i)).toBeInTheDocument()
  })
})

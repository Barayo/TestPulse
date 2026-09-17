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

describe('ImportProjectPage — Qase Connect stage (add-qase-importer tasks.md 3.3)', () => {
  it('renders Qase-specific connection fields, not TestRail\'s, plus the trademark disclaimer (design.md D-Q6)', async () => {
    mockBaseAPI()
    renderImportPage('/projects/import/qase')
    await screen.findByText('Connect to Qase')

    expect(screen.getByLabelText(/qase api token/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/qase project code/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/testrail site url/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/testrail account email/i)).not.toBeInTheDocument()

    expect(screen.getByText(/not affiliated with, endorsed by, or sponsored by Qase/i)).toBeInTheDocument()
    expect(screen.getByText(/Qase is a trademark of Qase Ltd\./i)).toBeInTheDocument()
  })

  it('renders an optional Advanced base-URL override, collapsed by default (design.md D-Q2)', async () => {
    mockBaseAPI()
    renderImportPage('/projects/import/qase')
    await screen.findByText('Connect to Qase')

    expect(screen.queryByLabelText(/base url/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /advanced/i }))
    expect(screen.getByLabelText(/base url/i)).toBeInTheDocument()
  })

  it('"Preview import" stays disabled until the required fields are filled', async () => {
    mockBaseAPI()
    renderImportPage('/projects/import/qase')
    await screen.findByText('Connect to Qase')
    expect(screen.getByRole('button', { name: /preview import/i })).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/qase api token/i), 'token-123')
    await userEvent.type(screen.getByLabelText(/qase project code/i), 'PRJ')
    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')

    expect(screen.getByRole('button', { name: /preview import/i })).toBeEnabled()
  })

  it('submitting posts source "qase" with apiToken/projectCode credentials, no baseUrl when Advanced is untouched', async () => {
    mockBaseAPI()
    mockPOST.mockImplementation((path: string) => {
      if (path === '/api/v1/projects')
        return Promise.resolve({
          data: { id: 'newp', key: 'QAP', name: 'QA Platform', archived: false, description: '', createdAt: '' },
          response: { ok: true },
        })
      if (path === '/api/v1/projects/{projectKey}/import-jobs')
        return Promise.resolve({
          data: importJob({ id: 'job1', source: 'qase', status: 'pending' }),
          response: { ok: true, status: 201 },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderImportPage('/projects/import/qase')
    await screen.findByText('Connect to Qase')
    await userEvent.type(screen.getByLabelText(/qase api token/i), 'token-123')
    await userEvent.type(screen.getByLabelText(/qase project code/i), 'PRJ')
    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')
    await userEvent.click(screen.getByRole('button', { name: /preview import/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/import-jobs',
        expect.objectContaining({
          params: { path: { projectKey: 'QAP' } },
          body: {
            source: 'qase',
            mode: 'dry_run',
            credentials: { apiToken: 'token-123', projectCode: 'PRJ' },
          },
        }),
      )
    })
  })
})

describe('ImportProjectPage — Zephyr Scale Connect stage (add-zephyr-scale-importer tasks.md 4.3)', () => {
  it('renders Zephyr Scale-specific connection fields, not TestRail/Qase\'s, plus the trademark disclaimer (design.md D-Z7)', async () => {
    mockBaseAPI()
    renderImportPage('/projects/import/zephyr-scale')
    await screen.findByText('Connect to Zephyr Scale')

    expect(screen.getByLabelText(/zephyr scale api token/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/zephyr scale project key/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/testrail site url/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/qase api token/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/base url/i)).not.toBeInTheDocument()

    expect(screen.getByText(/not affiliated with, endorsed by, or sponsored by SmartBear/i)).toBeInTheDocument()
    expect(screen.getByText(/Zephyr Scale is a trademark of SmartBear/i)).toBeInTheDocument()
  })

  it('"Preview import" stays disabled until the required fields are filled', async () => {
    mockBaseAPI()
    renderImportPage('/projects/import/zephyr-scale')
    await screen.findByText('Connect to Zephyr Scale')
    expect(screen.getByRole('button', { name: /preview import/i })).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/zephyr scale api token/i), 'token-123')
    await userEvent.type(screen.getByLabelText(/zephyr scale project key/i), 'PROJ')
    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')

    expect(screen.getByRole('button', { name: /preview import/i })).toBeEnabled()
  })

  it('submitting posts source "zephyr-scale" with apiToken/projectKey credentials', async () => {
    mockBaseAPI()
    mockPOST.mockImplementation((path: string) => {
      if (path === '/api/v1/projects')
        return Promise.resolve({
          data: { id: 'newp', key: 'QAP', name: 'QA Platform', archived: false, description: '', createdAt: '' },
          response: { ok: true },
        })
      if (path === '/api/v1/projects/{projectKey}/import-jobs')
        return Promise.resolve({
          data: importJob({ id: 'job1', source: 'zephyr-scale', status: 'pending' }),
          response: { ok: true, status: 201 },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderImportPage('/projects/import/zephyr-scale')
    await screen.findByText('Connect to Zephyr Scale')
    await userEvent.type(screen.getByLabelText(/zephyr scale api token/i), 'token-123')
    await userEvent.type(screen.getByLabelText(/zephyr scale project key/i), 'PROJ')
    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')
    await userEvent.click(screen.getByRole('button', { name: /preview import/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/import-jobs',
        expect.objectContaining({
          params: { path: { projectKey: 'QAP' } },
          body: {
            source: 'zephyr-scale',
            mode: 'dry_run',
            credentials: { apiToken: 'token-123', projectKey: 'PROJ' },
          },
        }),
      )
    })
  })
})

describe('ImportProjectPage — Kiwi TCMS Connect stage (add-kiwi-tcms-importer tasks.md 4.3)', () => {
  it('renders Kiwi TCMS-specific connection fields, not the other sources\', plus the trademark disclaimer (design.md D-K8)', async () => {
    mockBaseAPI()
    renderImportPage('/projects/import/kiwi-tcms')
    await screen.findByText('Connect to Kiwi TCMS')

    expect(screen.getByLabelText(/kiwi tcms site url/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/kiwi tcms username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/kiwi tcms password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/kiwi tcms product/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/testrail site url/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/qase api token/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/zephyr scale api token/i)).not.toBeInTheDocument()

    expect(screen.getByText(/not affiliated with, endorsed by, or sponsored by Kiwi TCMS/i)).toBeInTheDocument()
  })

  it('"Preview import" stays disabled until the required fields are filled', async () => {
    mockBaseAPI()
    renderImportPage('/projects/import/kiwi-tcms')
    await screen.findByText('Connect to Kiwi TCMS')
    const submit = screen.getByRole('button', { name: /preview import/i })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/kiwi tcms site url/i), 'https://kiwi.example.com')
    await userEvent.type(screen.getByLabelText(/kiwi tcms username/i), 'admin')
    await userEvent.type(screen.getByLabelText(/kiwi tcms password/i), 's3cr3t')
    await userEvent.type(screen.getByLabelText(/kiwi tcms product/i), 'Acme')
    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')

    expect(screen.getByRole('button', { name: /preview import/i })).toBeEnabled()
  })

  it('submitting posts source "kiwi-tcms" with siteUrl/username/password/product credentials', async () => {
    mockBaseAPI()
    mockPOST.mockImplementation((path: string) => {
      if (path === '/api/v1/projects')
        return Promise.resolve({
          data: { id: 'newp', key: 'QAP', name: 'QA Platform', archived: false, description: '', createdAt: '' },
          response: { ok: true },
        })
      if (path === '/api/v1/projects/{projectKey}/import-jobs')
        return Promise.resolve({
          data: importJob({ id: 'job1', source: 'kiwi-tcms', status: 'pending' }),
          response: { ok: true, status: 201 },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderImportPage('/projects/import/kiwi-tcms')
    await screen.findByText('Connect to Kiwi TCMS')
    await userEvent.type(screen.getByLabelText(/kiwi tcms site url/i), 'https://kiwi.example.com')
    await userEvent.type(screen.getByLabelText(/kiwi tcms username/i), 'admin')
    await userEvent.type(screen.getByLabelText(/kiwi tcms password/i), 's3cr3t')
    await userEvent.type(screen.getByLabelText(/kiwi tcms product/i), 'Acme')
    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')
    await userEvent.click(screen.getByRole('button', { name: /preview import/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/import-jobs',
        expect.objectContaining({
          params: { path: { projectKey: 'QAP' } },
          body: {
            source: 'kiwi-tcms',
            mode: 'dry_run',
            credentials: {
              siteUrl: 'https://kiwi.example.com',
              username: 'admin',
              password: 's3cr3t',
              product: 'Acme',
            },
          },
        }),
      )
    })
  })
})

describe('ImportProjectPage — Xray Connect stage (add-xray-importer tasks.md 5.3)', () => {
  it('defaults to Cloud mode, showing Cloud fields and the trademark disclaimer, not the other sources\' fields', async () => {
    mockBaseAPI()
    renderImportPage('/projects/import/xray')
    await screen.findByText('Connect to Xray')

    expect(screen.getByRole('button', { name: /^cloud$/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /server.*data center/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText(/xray client id/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/xray client secret/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/xray project id/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/xray site url/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/xray personal access token/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/kiwi tcms/i)).not.toBeInTheDocument()

    expect(screen.getByText(/not affiliated with, endorsed by, or sponsored by Xpand IT/i)).toBeInTheDocument()
  })

  it('switching to Server / Data Center swaps in the Server credential fields', async () => {
    mockBaseAPI()
    renderImportPage('/projects/import/xray')
    await screen.findByText('Connect to Xray')

    await userEvent.click(screen.getByRole('button', { name: /server.*data center/i }))

    expect(screen.getByLabelText(/xray site url/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/xray personal access token/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/xray project key/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/xray client id/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/xray client secret/i)).not.toBeInTheDocument()
  })

  it('"Preview import" stays disabled until every required Cloud field is filled', async () => {
    mockBaseAPI()
    renderImportPage('/projects/import/xray')
    await screen.findByText('Connect to Xray')
    const submit = screen.getByRole('button', { name: /preview import/i })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/xray client id/i), 'cid-123')
    await userEvent.type(screen.getByLabelText(/xray client secret/i), 'csecret-123')
    await userEvent.type(screen.getByLabelText(/xray project id/i), '10000')
    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')

    expect(screen.getByRole('button', { name: /preview import/i })).toBeEnabled()
  })

  it('"Preview import" stays disabled until every required Server field is filled', async () => {
    mockBaseAPI()
    renderImportPage('/projects/import/xray')
    await screen.findByText('Connect to Xray')
    await userEvent.click(screen.getByRole('button', { name: /server.*data center/i }))
    const submit = screen.getByRole('button', { name: /preview import/i })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/xray site url/i), 'https://jira.example.com')
    await userEvent.type(screen.getByLabelText(/xray personal access token/i), 'pat-123')
    await userEvent.type(screen.getByLabelText(/xray project key/i), 'XRAY')
    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')

    expect(screen.getByRole('button', { name: /preview import/i })).toBeEnabled()
  })

  it('submitting in Cloud mode posts source "xray" with mode/clientId/clientSecret/projectId credentials', async () => {
    mockBaseAPI()
    mockPOST.mockImplementation((path: string) => {
      if (path === '/api/v1/projects')
        return Promise.resolve({
          data: { id: 'newp', key: 'QAP', name: 'QA Platform', archived: false, description: '', createdAt: '' },
          response: { ok: true },
        })
      if (path === '/api/v1/projects/{projectKey}/import-jobs')
        return Promise.resolve({
          data: importJob({ id: 'job1', source: 'xray', status: 'pending' }),
          response: { ok: true, status: 201 },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderImportPage('/projects/import/xray')
    await screen.findByText('Connect to Xray')
    await userEvent.type(screen.getByLabelText(/xray client id/i), 'cid-123')
    await userEvent.type(screen.getByLabelText(/xray client secret/i), 'csecret-123')
    await userEvent.type(screen.getByLabelText(/xray project id/i), '10000')
    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')
    await userEvent.click(screen.getByRole('button', { name: /preview import/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/import-jobs',
        expect.objectContaining({
          params: { path: { projectKey: 'QAP' } },
          body: {
            source: 'xray',
            mode: 'dry_run',
            credentials: {
              mode: 'cloud',
              clientId: 'cid-123',
              clientSecret: 'csecret-123',
              projectId: '10000',
            },
          },
        }),
      )
    })
  })

  it('submitting in Server mode posts source "xray" with mode/siteUrl/personalAccessToken/projectKey credentials', async () => {
    mockBaseAPI()
    mockPOST.mockImplementation((path: string) => {
      if (path === '/api/v1/projects')
        return Promise.resolve({
          data: { id: 'newp', key: 'QAP', name: 'QA Platform', archived: false, description: '', createdAt: '' },
          response: { ok: true },
        })
      if (path === '/api/v1/projects/{projectKey}/import-jobs')
        return Promise.resolve({
          data: importJob({ id: 'job1', source: 'xray', status: 'pending' }),
          response: { ok: true, status: 201 },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderImportPage('/projects/import/xray')
    await screen.findByText('Connect to Xray')
    await userEvent.click(screen.getByRole('button', { name: /server.*data center/i }))
    await userEvent.type(screen.getByLabelText(/xray site url/i), 'https://jira.example.com')
    await userEvent.type(screen.getByLabelText(/xray personal access token/i), 'pat-123')
    await userEvent.type(screen.getByLabelText(/xray project key/i), 'XRAY')
    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')
    await userEvent.click(screen.getByRole('button', { name: /preview import/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/import-jobs',
        expect.objectContaining({
          params: { path: { projectKey: 'QAP' } },
          body: {
            source: 'xray',
            mode: 'dry_run',
            credentials: {
              mode: 'server',
              siteUrl: 'https://jira.example.com',
              personalAccessToken: 'pat-123',
              projectKey: 'XRAY',
            },
          },
        }),
      )
    })
  })
})

describe('ImportProjectPage — CSV Connect/Result flow (add-csv-import-export tasks.md 6.3, Pepe mock)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a file picker, template link, and help block — no trademark disclaimer (CSV has no vendor)', async () => {
    mockBaseAPI()
    renderImportPage('/projects/import/csv')
    await screen.findByText('Connect to CSV')

    expect(document.querySelector('input[type="file"]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download csv template/i })).toBeInTheDocument()
    expect(screen.queryByText(/not affiliated with/i)).not.toBeInTheDocument()
  })

  it('"Import cases" stays disabled until a file and target project name are chosen', async () => {
    mockBaseAPI()
    renderImportPage('/projects/import/csv')
    await screen.findByText('Connect to CSV')
    const submit = screen.getByRole('button', { name: /import cases/i })
    expect(submit).toBeDisabled()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['Title\nCase A\n'], 'cases.csv', { type: 'text/csv' })
    await userEvent.upload(input, file)
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')
    expect(submit).toBeEnabled()
  })

  it('submitting creates the target project, resolves its root folder, and posts a multipart import request', async () => {
    mockBaseAPI()
    vi.stubGlobal('fetch', vi.fn())
    mockPOST.mockImplementation((path: string) => {
      if (path === '/api/v1/projects')
        return Promise.resolve({
          data: { id: 'newp', key: 'QAP', name: 'QA Platform', archived: false, description: '', createdAt: '' },
          response: { ok: true },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: ME_TENANT_ADMIN, response: { ok: true } })
      if (path === '/api/v1/projects') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/summaries') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/folders')
        return Promise.resolve({
          data: { items: [{ id: 'root1', parentFolderId: undefined }] },
          response: { ok: true },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: 1, newFields: [], problems: [] }),
    } as Response)

    renderImportPage('/projects/import/csv')
    await screen.findByText('Connect to CSV')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['Title\nCase A\n'], 'cases.csv', { type: 'text/csv' })
    await userEvent.upload(input, file)
    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')
    await userEvent.click(screen.getByRole('button', { name: /import cases/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith('/api/v1/projects', expect.objectContaining({ body: { name: 'QA Platform' } }))
    })
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/projects/QAP/cases/import-csv',
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      )
    })
    const [, options] = vi.mocked(fetch).mock.calls[0]
    const body = options?.body as FormData
    expect(body.get('folderId')).toBe('root1')
    expect(body.get('file')).toBeInstanceOf(File)
  })

  it('shows the created count, new fields, and every problem row with no truncation on the Result stage', async () => {
    mockBaseAPI()
    vi.stubGlobal('fetch', vi.fn())
    mockPOST.mockImplementation((path: string) =>
      path === '/api/v1/projects'
        ? Promise.resolve({
            data: { id: 'newp', key: 'QAP', name: 'QA Platform', archived: false, description: '', createdAt: '' },
            response: { ok: true },
          })
        : Promise.resolve({ data: undefined, response: { ok: false } }),
    )
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: ME_TENANT_ADMIN, response: { ok: true } })
      if (path === '/api/v1/projects') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/summaries') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/folders')
        return Promise.resolve({ data: { items: [{ id: 'root1', parentFolderId: undefined }] }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          created: 2,
          newFields: ['Browser'],
          problems: [
            { row: 3, reason: 'title is required' },
            { row: 5, reason: 'invalid priority "urgent"' },
          ],
        }),
    } as Response)

    renderImportPage('/projects/import/csv')
    await screen.findByText('Connect to CSV')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['Title\nCase A\n'], 'cases.csv', { type: 'text/csv' }))
    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')
    await userEvent.click(screen.getByRole('button', { name: /import cases/i }))

    expect(await screen.findByText('Import complete')).toBeInTheDocument()
    expect(screen.getByText(/Browser/)).toBeInTheDocument()
    expect(screen.getByText(/row 3/i)).toBeInTheDocument()
    expect(screen.getByText(/title is required/i)).toBeInTheDocument()
    expect(screen.getByText(/row 5/i)).toBeInTheDocument()
    expect(screen.getByText(/invalid priority "urgent"/i)).toBeInTheDocument()
  })

  it('a whole-file failure shows an inline error and stays on the editable Connect stage', async () => {
    mockBaseAPI()
    vi.stubGlobal('fetch', vi.fn())
    mockPOST.mockImplementation((path: string) =>
      path === '/api/v1/projects'
        ? Promise.resolve({
            data: { id: 'newp', key: 'QAP', name: 'QA Platform', archived: false, description: '', createdAt: '' },
            response: { ok: true },
          })
        : Promise.resolve({ data: undefined, response: { ok: false } }),
    )
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: ME_TENANT_ADMIN, response: { ok: true } })
      if (path === '/api/v1/projects') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/summaries') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/folders')
        return Promise.resolve({ data: { items: [{ id: 'root1', parentFolderId: undefined }] }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'missing file field' }),
    } as Response)

    renderImportPage('/projects/import/csv')
    await screen.findByText('Connect to CSV')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['not a csv'], 'cases.csv', { type: 'text/csv' }))
    await userEvent.type(screen.getByLabelText(/new project name/i), 'QA Platform')
    await userEvent.click(screen.getByRole('button', { name: /import cases/i }))

    expect(await screen.findByText(/missing file field/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import cases/i })).toBeInTheDocument()
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

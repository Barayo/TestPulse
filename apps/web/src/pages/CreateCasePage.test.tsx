import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import CreateCasePage from './CreateCasePage'
import { api } from '@/lib/api'
import { AuthProvider } from '@/lib/useAuth'

vi.mock('@/lib/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn() },
}))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

const root = { id: 'root', projectId: 'p1', name: 'Root', createdAt: '' }
const checkout = { id: 'checkout', projectId: 'p1', parentFolderId: 'root', name: 'Checkout', createdAt: '' }
const authenticatedUser = { id: 'u1', email: 'admin@example.com', isTenantAdmin: false }
const fullPermissions = {
  read: true,
  caseCreate: true,
  caseEdit: true,
  caseDelete: true,
  sectionCreate: true,
  sectionDelete: true,
  suiteCreate: true,
  suiteEditMembership: true,
  runCreate: true,
  runRecordResult: true,
  manageProject: true,
}

function mockCreateAPI(options?: { customFields?: unknown[] }) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}')
      return Promise.resolve({ data: { id: 'p1', key: 'CHK', name: 'Checkout Suite', archived: false, createdAt: '' }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/folders')
      return Promise.resolve({ data: { items: [root, checkout], nextCursor: null }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions')
      return Promise.resolve({ data: fullPermissions, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/custom-fields')
      return Promise.resolve({ data: options?.customFields ?? [], response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: false } })
  })
}

function renderCreate(path = '/projects/CHK/cases/new?folderId=checkout') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/projects/:projectKey/cases/new" element={<CreateCasePage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('CreateCasePage', () => {
  it('renders a title field, the format editor, and classification fields — no separate dialog/drawer', async () => {
    mockCreateAPI()
    renderCreate()
    await screen.findByRole('textbox', { name: /title/i })

    expect(screen.getByRole('group', { name: /format/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^action for step 1/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^priority$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^platform$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^test type$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^automated$/i)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not allow creating without a title', async () => {
    mockCreateAPI()
    renderCreate()
    await screen.findByRole('textbox', { name: /title/i })
    expect(screen.getByRole('button', { name: /create test case/i })).toBeDisabled()
  })

  it('creates the case with the folderId from the query param and navigates to its detail page', async () => {
    mockCreateAPI()
    mockPOST.mockResolvedValue({ data: { key: 'CHK-9', currentVersion: 1 }, response: { ok: true } })
    renderCreate()
    const title = await screen.findByRole('textbox', { name: /title/i })

    await userEvent.type(title, 'Apply loyalty discount')
    await userEvent.type(screen.getByLabelText(/^action for step 1/i), 'Apply the code')
    await userEvent.click(screen.getByRole('button', { name: /create test case/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/cases',
        expect.objectContaining({
          params: { path: { projectKey: 'CHK' } },
          body: expect.objectContaining({
            title: 'Apply loyalty discount',
            folderId: 'checkout',
            steps: [{ action: 'Apply the code', expected: '' }],
            format: 'steps',
          }),
        }),
      )
    })
  })

  it('defaults to the project root folder when no folderId query param is present', async () => {
    mockCreateAPI()
    mockPOST.mockResolvedValue({ data: { key: 'CHK-9', currentVersion: 1 }, response: { ok: true } })
    renderCreate('/projects/CHK/cases/new')
    const title = await screen.findByRole('textbox', { name: /title/i })
    await userEvent.type(title, 'Untitled scenario')
    await userEvent.click(screen.getByRole('button', { name: /create test case/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/cases',
        expect.objectContaining({ body: expect.objectContaining({ folderId: 'root' }) }),
      )
    })
  })

  it('creating with a test data table sends the parameters, added via the empty-state action', async () => {
    mockCreateAPI()
    mockPOST.mockResolvedValue({ data: { key: 'CHK-9', currentVersion: 1 }, response: { ok: true } })
    renderCreate()
    const title = await screen.findByRole('textbox', { name: /title/i })

    await userEvent.type(title, 'Login')
    await userEvent.type(screen.getByLabelText(/^action for step 1/i), 'Log in')
    await userEvent.click(screen.getByRole('button', { name: '+ Add test data' }))
    await userEvent.type(screen.getByLabelText('Row 1 name'), 'valid')
    await userEvent.click(screen.getByRole('button', { name: /create test case/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/cases',
        expect.objectContaining({
          body: expect.objectContaining({
            parameters: { columns: ['Name'], rows: [{ Name: 'valid' }] },
          }),
        }),
      )
    })
  })

  it('creating in Gherkin format sends format and gherkinSource', async () => {
    mockCreateAPI()
    mockPOST.mockResolvedValue({ data: { key: 'CHK-9', currentVersion: 1 }, response: { ok: true } })
    renderCreate()
    const title = await screen.findByRole('textbox', { name: /title/i })
    await userEvent.type(title, 'Login BDD')
    await userEvent.click(screen.getByRole('button', { name: /gherkin/i }))
    await userEvent.type(screen.getByLabelText(/scenario/i), 'Given a user')
    await userEvent.click(screen.getByRole('button', { name: /create test case/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/cases',
        expect.objectContaining({
          body: expect.objectContaining({ format: 'gherkin', gherkinSource: 'Given a user' }),
        }),
      )
    })
  })

  it('shows the server\'s validation error inline when creation is rejected (regression: was silently swallowed)', async () => {
    mockCreateAPI()
    mockPOST.mockResolvedValue({
      data: undefined,
      error: { error: 'step references unknown parameter "sortOrder"' },
      response: { ok: false, status: 400 },
    })
    renderCreate()
    const title = await screen.findByRole('textbox', { name: /title/i })
    await userEvent.type(title, 'Login')
    await userEvent.click(screen.getByRole('button', { name: /create test case/i }))

    expect(await screen.findByText(/step references unknown parameter "sortOrder"/i)).toBeInTheDocument()
    // Still on the create page — the typed title is not lost.
    expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('Login')
  })
})

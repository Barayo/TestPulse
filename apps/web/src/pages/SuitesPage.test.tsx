import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import SuitesPage from './SuitesPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

let navigatedTo: string | undefined
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => (to: string) => {
      navigatedTo = to
    },
  }
})

function mockSuitesAPI(project: unknown, suites: unknown[] = []) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectKey}') return Promise.resolve({ data: project, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/suites') return Promise.resolve({ data: suites, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

const projectQA = { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' }

function renderSuites() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/suites']}>
      <Routes>
        <Route path="/projects/:projectKey/suites" element={<SuitesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  navigatedTo = undefined
})

describe('SuitesPage', () => {
  it('shows a breadcrumb: Projects > project name > Suites', async () => {
    mockSuitesAPI(projectQA)
    renderSuites()
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(await screen.findByText('QA Platform')).toBeInTheDocument()
    expect(nav).toHaveTextContent('Suites')
  })

  it('shows each suite as a card with name, case count, and a pass-rate health bar', async () => {
    mockSuitesAPI(projectQA, [
      { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1', 'c2'], createdAt: '', passRate: 90, lastRunAt: '2026-07-25T10:00:00Z' },
    ])
    renderSuites()
    const list = await screen.findByRole('list', { name: 'Suites' })
    expect(within(list).getByText('Smoke')).toBeInTheDocument()
    expect(within(list).getByText(/2 cases/i)).toBeInTheDocument()
    expect(within(list).getByText('90%')).toBeInTheDocument()
  })

  it('shows "Never run" instead of a fake 0% for a suite with no runs yet', async () => {
    mockSuitesAPI(projectQA, [
      { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Onboarding', caseIds: [], createdAt: '', passRate: null, lastRunAt: null },
    ])
    renderSuites()
    const list = await screen.findByRole('list', { name: 'Suites' })
    expect(within(list).getByText(/never run/i)).toBeInTheDocument()
    expect(within(list).queryByText('0%')).not.toBeInTheDocument()
  })

  it('navigates to the suite detail route when a card is clicked', async () => {
    mockSuitesAPI(projectQA, [
      { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '', passRate: null, lastRunAt: null },
    ])
    renderSuites()
    await userEvent.click(await screen.findByText('Smoke'))
    expect(navigatedTo).toBe('/projects/p1/suites/p1-S1')
  })

  it('creating a suite navigates straight into its new detail page, not an inline form', async () => {
    mockSuitesAPI(projectQA, [])
    mockPOST.mockResolvedValue({
      data: { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '', passRate: null, lastRunAt: null },
      response: { ok: true },
    })
    renderSuites()

    await userEvent.click(await screen.findByRole('button', { name: /new suite/i }))
    await userEvent.type(screen.getByLabelText(/suite name/i), 'Smoke')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/suites',
        expect.objectContaining({ params: { path: { projectKey: 'p1' } }, body: { name: 'Smoke' } }),
      )
    })
    await waitFor(() => expect(navigatedTo).toBe('/projects/p1/suites/p1-S1'))
  })

  it('the Create button stays disabled until a name is entered', async () => {
    mockSuitesAPI(projectQA, [])
    renderSuites()
    await userEvent.click(await screen.findByRole('button', { name: /new suite/i }))
    expect(screen.getByRole('button', { name: /^create$/i })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/suite name/i), 'Smoke')
    expect(screen.getByRole('button', { name: /^create$/i })).toBeEnabled()
  })

  it('shows empty-state copy when there are no suites yet', async () => {
    mockSuitesAPI(projectQA, [])
    renderSuites()
    expect(await screen.findByText(/no suites yet/i)).toBeInTheDocument()
  })

  it('recovers gracefully when the API is unreachable', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    renderSuites()
    expect(await screen.findByText(/no suites yet/i)).toBeInTheDocument()
  })

  it('shows a not-found message instead of an empty, interactive project when the project does not exist', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderSuites()
    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new suite/i })).not.toBeInTheDocument()
  })
})

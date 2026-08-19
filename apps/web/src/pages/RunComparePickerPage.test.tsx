import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import RunComparePickerPage from './RunComparePickerPage'
import { api } from '@/lib/api'
import { AuthProvider } from '@/lib/useAuth'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

const authenticatedUser = { id: 'u1', email: 'admin@example.com', isTenantAdmin: false }

const runs = [
  { id: 'r1', key: 'r1', projectId: 'p1', projectKey: 'p1', name: 'Sprint 1', status: 'closed', passRate: 90, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'r2', key: 'r2', projectId: 'p1', projectKey: 'p1', name: 'Sprint 2', status: 'closed', passRate: 60, createdAt: '2026-01-08T00:00:00Z' },
  { id: 'r3', key: 'r3', projectId: 'p1', projectKey: 'p1', name: 'Sprint 3 (open)', status: 'open', createdAt: '2026-01-15T00:00:00Z' },
]

function mockPickerAPI() {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}')
      return Promise.resolve({ data: { id: 'p1', key: 'p1', name: 'QA', archived: false, createdAt: '' }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/runs') return Promise.resolve({ data: runs, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions')
      return Promise.resolve({ data: { read: true }, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

function ComparePageProbe() {
  const { runKeyA, runKeyB } = useParams<{ runKeyA: string; runKeyB: string }>()
  return <p data-testid="compare-probe">compare {runKeyA} {runKeyB}</p>
}

function renderPicker(initialEntries: Parameters<typeof MemoryRouter>[0]['initialEntries'] = ['/projects/p1/runs/compare']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/projects/:projectKey/runs/compare" element={<RunComparePickerPage />} />
          <Route path="/runs/compare/:runKeyA/:runKeyB" element={<ComparePageProbe />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('RunComparePickerPage', () => {
  it('lists only closed runs from the project as options, showing date and pass-rate health', async () => {
    mockPickerAPI()
    renderPicker()
    await screen.findAllByRole('combobox')
    const [triggerA] = screen.getAllByRole('combobox')
    await userEvent.click(triggerA)
    const listbox = screen.getByRole('listbox', { name: 'First run' })
    expect(within(listbox).queryByText('Sprint 3 (open)')).not.toBeInTheDocument()
    expect(within(listbox).getByText('Sprint 1')).toBeInTheDocument()
    expect(within(listbox).getByText('Sprint 2')).toBeInTheDocument()
    expect(within(listbox).getByText('90%')).toBeInTheDocument()
    expect(within(listbox).getByText('60%')).toBeInTheDocument()
  })

  it('navigates to the comparison route on submit', async () => {
    mockPickerAPI()
    renderPicker()
    await screen.findAllByRole('combobox')
    const [triggerA, triggerB] = screen.getAllByRole('combobox')
    await userEvent.click(triggerA)
    await userEvent.click(within(screen.getByRole('listbox', { name: 'First run' })).getByText('Sprint 1'))
    await userEvent.click(triggerB)
    await userEvent.click(within(screen.getByRole('listbox', { name: 'Second run' })).getByText('Sprint 2'))
    await userEvent.click(screen.getByRole('button', { name: /compare/i }))
    const probe = await screen.findByTestId('compare-probe')
    expect(probe.textContent).toBe('compare r1 r2')
  })

  it('pre-fills the first run from a seedRunKey arriving via router state', async () => {
    mockPickerAPI()
    renderPicker([{ pathname: '/projects/p1/runs/compare', state: { seedRunKey: 'r2' } }])
    await screen.findByText('Sprint 2')
    const [triggerA, triggerB] = screen.getAllByRole('combobox')
    expect(triggerA).toHaveTextContent('Sprint 2')
    expect(triggerB).toHaveTextContent('Select a closed run…')
  })

  it('only needs the second run picked when arriving with a seedRunKey', async () => {
    mockPickerAPI()
    renderPicker([{ pathname: '/projects/p1/runs/compare', state: { seedRunKey: 'r2' } }])
    await screen.findAllByRole('combobox')
    const [, triggerB] = screen.getAllByRole('combobox')
    await userEvent.click(triggerB)
    await userEvent.click(within(screen.getByRole('listbox', { name: 'Second run' })).getByText('Sprint 1'))
    await userEvent.click(screen.getByRole('button', { name: /compare/i }))
    const probe = await screen.findByTestId('compare-probe')
    expect(probe.textContent).toBe('compare r2 r1')
  })

  it("selecting a run on one side removes it from the other side's options", async () => {
    mockPickerAPI()
    renderPicker()
    await screen.findAllByRole('combobox')
    const [triggerA, triggerB] = screen.getAllByRole('combobox')
    await userEvent.click(triggerA)
    await userEvent.click(within(screen.getByRole('listbox', { name: 'First run' })).getByText('Sprint 1'))
    await userEvent.click(triggerB)
    const listboxB = screen.getByRole('listbox', { name: 'Second run' })
    expect(within(listboxB).queryByText('Sprint 1')).not.toBeInTheDocument()
    expect(within(listboxB).getByText('Sprint 2')).toBeInTheDocument()
  })
})

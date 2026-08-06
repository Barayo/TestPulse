import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import PublicProjectPage from './PublicProjectPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

const project = { id: 'p1', key: 'QA', name: 'QA Platform', archived: false, description: '', isSample: false, publicAccess: true, createdAt: '' }
const cases = [{ id: 'c1', key: 'QA-1', projectId: 'p1', folderId: 'f1', currentVersion: 1, content: { title: 'Login works' }, createdAt: '', updatedAt: '' }]
const suites = [{ id: 's1', key: 'QA-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '', passRate: 100, lastRunAt: '2026-01-01T00:00:00Z' }]
const runs = [{ id: 'r1', key: 'QA-R1', projectId: 'p1', projectKey: 'QA', name: 'Sprint 1', status: 'closed', createdAt: '', passRate: 80 }]

function mockAPI() {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/public/projects/{projectKey}') return Promise.resolve({ data: project, response: { ok: true, status: 200 } })
    if (path === '/api/v1/public/projects/{projectKey}/cases') return Promise.resolve({ data: cases, response: { ok: true, status: 200 } })
    if (path === '/api/v1/public/projects/{projectKey}/suites') return Promise.resolve({ data: suites, response: { ok: true, status: 200 } })
    if (path === '/api/v1/public/projects/{projectKey}/runs') return Promise.resolve({ data: runs, response: { ok: true, status: 200 } })
    return Promise.resolve({ data: undefined, response: { ok: false, status: 404 } })
  })
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/public/QA']}>
      <Routes>
        <Route path="/public/:projectKey" element={<PublicProjectPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PublicProjectPage', () => {
  it('renders the project, its cases/suites/runs, and the anonymous-viewer banner', async () => {
    mockAPI()
    renderPage()

    await waitFor(() => expect(screen.getByText('QA Platform')).toBeInTheDocument())
    expect(screen.getByText(/viewing this project without an account/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument()
    expect(screen.getByText('Login works')).toBeInTheDocument()
    expect(screen.getByText('Smoke')).toBeInTheDocument()
    expect(screen.getByText('Sprint 1')).toBeInTheDocument()
  })

  it('never renders any write control — there is nothing to hide because nothing is rendered', async () => {
    mockAPI()
    renderPage()
    await waitFor(() => expect(screen.getByText('QA Platform')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: /new run/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('shows a not-found message when the project is not public', async () => {
    mockGET.mockResolvedValue({ data: undefined, response: { ok: false, status: 404 } })
    renderPage()

    await waitFor(() => expect(screen.getByText(/not found|isn.t public/i)).toBeInTheDocument())
  })
})

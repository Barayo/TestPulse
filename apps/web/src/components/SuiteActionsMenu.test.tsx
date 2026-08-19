import { createRef } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, type NavigateFunction } from 'react-router'
import { SuiteActionsMenu, type SuiteActionsMenuHandle } from './SuiteActionsMenu'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { PUT: vi.fn(), DELETE: vi.fn(), POST: vi.fn() } }))
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)
const mockPOST = vi.mocked(api.POST)

let navigatedTo: string | undefined
let navigatedState: unknown
const navigate: NavigateFunction = ((to: string, opts?: { state?: unknown }) => {
  navigatedTo = to
  navigatedState = opts?.state
}) as NavigateFunction

const smokeSuite = {
  id: 's1',
  key: 'p1-S1',
  projectId: 'p1',
  name: 'Smoke',
  caseIds: ['c1'],
  createdAt: '2026-01-01T00:00:00Z',
  passRate: 90,
  lastRunAt: '2026-07-25T10:00:00Z',
}

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
  runDelete: true,
  projectDelete: true,
}

function renderMenu(props: Partial<React.ComponentProps<typeof SuiteActionsMenu>> = {}) {
  return render(
    <MemoryRouter>
      <SuiteActionsMenu
        suite={smokeSuite}
        projectKey="p1"
        variant="buttons"
        navigate={navigate}
        onChanged={vi.fn()}
        permissions={fullPermissions}
        {...props}
      />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  navigatedTo = undefined
  navigatedState = undefined
})

describe('SuiteActionsMenu', () => {
  describe('variant="buttons"', () => {
    it('renders the three full-width actions', () => {
      renderMenu({ variant: 'buttons' })
      expect(screen.getByRole('button', { name: /run suite/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /rename/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    })

    it('Run suite opens a confirm dialog showing the case count and an editable name', async () => {
      renderMenu({ variant: 'buttons' })
      await userEvent.click(screen.getByRole('button', { name: /run suite/i }))
      expect(screen.getByText(/1 case from smoke/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument()
    })

    it('selects the full suggested name so it reads as something to confirm, not an inert prefill', async () => {
      renderMenu({ variant: 'buttons' })
      await userEvent.click(screen.getByRole('button', { name: /run suite/i }))
      const nameInput = screen.getByLabelText(/^name$/i) as HTMLInputElement
      expect(nameInput.selectionStart).toBe(0)
      expect(nameInput.selectionEnd).toBe(nameInput.value.length)
      expect(nameInput.value.length).toBeGreaterThan(0)
    })

    it('confirming Run suite creates a run and calls onChanged and onRunCreated', async () => {
      mockPOST.mockResolvedValue({
        data: { id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Smoke run', createdAt: '' },
        response: { ok: true },
      })
      const onChanged = vi.fn()
      const onRunCreated = vi.fn()
      renderMenu({ variant: 'buttons', onChanged, onRunCreated })

      await userEvent.click(screen.getByRole('button', { name: /run suite/i }))
      await userEvent.click(screen.getByRole('button', { name: /^create run$/i }))

      await waitFor(() => {
        expect(mockPOST).toHaveBeenCalledWith(
          '/api/v1/projects/{projectKey}/runs',
          expect.objectContaining({
            params: { path: { projectKey: 'p1' } },
            body: { name: 'Smoke run', suiteKey: 'p1-S1' },
          }),
        )
      })
      await waitFor(() => expect(onChanged).toHaveBeenCalled())
      expect(onRunCreated).toHaveBeenCalledWith({ key: 'p1-R1', name: 'Smoke run' })
    })

    it('Customize selection navigates to the New run route pre-seeded with this suite', async () => {
      renderMenu({ variant: 'buttons' })
      await userEvent.click(screen.getByRole('button', { name: /run suite/i }))
      await userEvent.click(screen.getByRole('button', { name: /customize selection/i }))

      expect(navigatedTo).toBe('/projects/p1/runs/new')
      expect(navigatedState).toEqual({ seedFromSuiteKey: 'p1-S1', seedName: 'Smoke run' })
      expect(mockPOST).not.toHaveBeenCalled()
    })

    it('renames the suite and calls onChanged', async () => {
      mockPUT.mockResolvedValue({ data: { ...smokeSuite, name: 'Smoke v2' }, response: { ok: true } })
      const onChanged = vi.fn()
      renderMenu({ variant: 'buttons', onChanged })

      await userEvent.click(screen.getByRole('button', { name: /rename/i }))
      const input = screen.getByLabelText(/suite name/i)
      await userEvent.clear(input)
      await userEvent.type(input, 'Smoke v2')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(mockPUT).toHaveBeenCalledWith(
          '/api/v1/suites/{suiteKey}',
          expect.objectContaining({ params: { path: { suiteKey: 'p1-S1' } }, body: { name: 'Smoke v2' } }),
        )
      })
      await waitFor(() => expect(onChanged).toHaveBeenCalled())
    })

    it('deletes the suite and navigates to the suites index (variant="buttons")', async () => {
      mockDELETE.mockResolvedValue({ response: { ok: true } })
      renderMenu({ variant: 'buttons' })

      await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
      await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

      await waitFor(() => {
        expect(mockDELETE).toHaveBeenCalledWith(
          '/api/v1/suites/{suiteKey}',
          expect.objectContaining({ params: { path: { suiteKey: 'p1-S1' } } }),
        )
      })
      await waitFor(() => expect(navigatedTo).toBe('/projects/p1/suites'))
    })
  })

  describe('variant="menu"', () => {
    it('renders a "⋯" trigger instead of full-width buttons', () => {
      renderMenu({ variant: 'menu' })
      expect(screen.getByRole('button', { name: /actions for smoke/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
    })

    it('opens the menu with Run suite/Rename/Delete items', async () => {
      renderMenu({ variant: 'menu' })
      await userEvent.click(screen.getByRole('button', { name: /actions for smoke/i }))
      expect(screen.getByRole('menuitem', { name: /run suite/i })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /rename/i })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument()
    })

    it('deletes the suite and calls onChanged, without navigating (variant="menu")', async () => {
      mockDELETE.mockResolvedValue({ response: { ok: true } })
      const onChanged = vi.fn()
      renderMenu({ variant: 'menu', onChanged })

      await userEvent.click(screen.getByRole('button', { name: /actions for smoke/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }))
      await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

      await waitFor(() => {
        expect(mockDELETE).toHaveBeenCalledWith(
          '/api/v1/suites/{suiteKey}',
          expect.objectContaining({ params: { path: { suiteKey: 'p1-S1' } } }),
        )
      })
      await waitFor(() => expect(onChanged).toHaveBeenCalled())
      expect(navigatedTo).toBeUndefined()
    })

    it('exposes an imperative openAt handle so a parent row can open it via right-click', async () => {
      const ref = createRef<SuiteActionsMenuHandle>()
      render(
        <MemoryRouter>
          <SuiteActionsMenu
            ref={ref}
            suite={smokeSuite}
            projectKey="p1"
            variant="menu"
            navigate={navigate}
            onChanged={vi.fn()}
            permissions={fullPermissions}
          />
        </MemoryRouter>,
      )
      expect(screen.queryByRole('menuitem', { name: /rename/i })).not.toBeInTheDocument()
      ref.current?.openAt(100, 100)
      expect(await screen.findByRole('menuitem', { name: /rename/i })).toBeInTheDocument()
    })
  })

  // Permission-gating retrofit (backlog #110, unify-authenticated-and-public-views
  // tasks.md 2.1): Run suite/Rename/Delete must be hidden — not merely
  // disabled — for a caller lacking the matching permission flag, since
  // this component is shared by SuiteDetailPage and SuitesPage, both of
  // which will render for anonymous visitors with no permissions at all.
  describe('permission gating', () => {
    it('hides Run suite when the caller lacks runCreate, in both variants', () => {
      renderMenu({ variant: 'buttons', permissions: { ...fullPermissions, runCreate: false } })
      expect(screen.queryByRole('button', { name: /run suite/i })).not.toBeInTheDocument()
    })

    it('hides Rename when the caller lacks suiteEditMembership', () => {
      renderMenu({ variant: 'buttons', permissions: { ...fullPermissions, suiteEditMembership: false } })
      expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument()
    })

    it('hides Delete when the caller lacks manageProject', () => {
      renderMenu({ variant: 'buttons', permissions: { ...fullPermissions, manageProject: false } })
      expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
    })

    it('renders no actions at all, and no "buttons" wrapper, when permissions is undefined', () => {
      renderMenu({ variant: 'buttons', permissions: undefined })
      expect(screen.queryByRole('button', { name: /run suite/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
    })

    it('menu variant: omits the corresponding item when a flag is missing', async () => {
      renderMenu({ variant: 'menu', permissions: { ...fullPermissions, manageProject: false } })
      await userEvent.click(screen.getByRole('button', { name: /actions for smoke/i }))
      expect(screen.getByRole('menuitem', { name: /run suite/i })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /rename/i })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument()
    })

    it('menu variant: renders no trigger at all when every flag is missing', () => {
      renderMenu({ variant: 'menu', permissions: undefined })
      expect(screen.queryByRole('button', { name: /actions for smoke/i })).not.toBeInTheDocument()
    })
  })
})

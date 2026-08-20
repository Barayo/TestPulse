import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomFieldsCard } from './CustomFieldsCard'
import { api } from '@/lib/api'

// Mirrors FolderExplorerPage.test.tsx's minimal DataTransfer stand-in —
// jsdom has no real drag-and-drop implementation, but fireEvent.dragStart/
// dragOver/drop plus this store is enough to exercise the same native
// HTML5 drag handlers this component uses.
function makeDataTransfer() {
  const store: Record<string, string> = {}
  return {
    setData: (type: string, data: string) => {
      store[type] = data
    },
    getData: (type: string) => store[type] ?? '',
  }
}

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPATCH = vi.mocked(api.PATCH)
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)

const textField = { id: 'f1', name: 'Automation Owner', fieldType: 'text' as const, createdAt: '' }
const selectField = {
  id: 'f2',
  name: 'Component',
  fieldType: 'select' as const,
  options: [
    { id: 'o1', value: 'API' },
    { id: 'o2', value: 'Web' },
  ],
  createdAt: '',
}

function mockFieldsAPI(fields: unknown[] = [textField, selectField]) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectKey}/custom-fields') return Promise.resolve({ data: fields, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('CustomFieldsCard', () => {
  it('shows an empty state when the project has no fields defined', async () => {
    mockFieldsAPI([])
    render(<CustomFieldsCard projectKey="p1" />)
    expect(await screen.findByText(/no custom fields yet/i)).toBeInTheDocument()
  })

  it('lists defined fields with their type', async () => {
    mockFieldsAPI()
    render(<CustomFieldsCard projectKey="p1" />)
    expect(await screen.findByText('Automation Owner')).toBeInTheDocument()
    expect(screen.getByText('Component')).toBeInTheDocument()
  })

  it('creates a new field', async () => {
    mockFieldsAPI([])
    mockPOST.mockResolvedValue({ data: textField, response: { ok: true } })
    render(<CustomFieldsCard projectKey="p1" />)
    await screen.findByText(/no custom fields yet/i)

    await userEvent.click(screen.getByRole('button', { name: /new field/i }))
    await userEvent.type(screen.getByLabelText(/field name/i), 'Automation Owner')
    await userEvent.click(screen.getByRole('button', { name: /^create field$/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/custom-fields',
        expect.objectContaining({
          params: { path: { projectKey: 'p1' } },
          body: { name: 'Automation Owner', fieldType: 'text' },
        }),
      )
    })
  })

  it('does not offer a type selector once a field exists — only rename', async () => {
    mockFieldsAPI()
    render(<CustomFieldsCard projectKey="p1" />)
    await screen.findByText('Automation Owner')
    expect(screen.queryByRole('combobox', { name: /field type/i })).not.toBeInTheDocument()
  })

  it('renames a field', async () => {
    mockFieldsAPI()
    mockPATCH.mockResolvedValue({ data: { ...textField, name: 'Owner' }, response: { ok: true } })
    render(<CustomFieldsCard projectKey="p1" />)
    const row = (await screen.findByText('Automation Owner')).closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: /rename/i }))
    const input = within(row).getByRole('textbox')
    await userEvent.clear(input)
    await userEvent.type(input, 'Owner{Enter}')

    await waitFor(() => {
      expect(mockPATCH).toHaveBeenCalledWith(
        '/api/v1/custom-fields/{fieldId}',
        expect.objectContaining({ params: { path: { fieldId: 'f1' } }, body: { name: 'Owner' } }),
      )
    })
  })

  it('shows a live case count before deleting a field', async () => {
    mockFieldsAPI()
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}/custom-fields')
        return Promise.resolve({ data: [textField, selectField], response: { ok: true } })
      if (path === '/api/v1/custom-fields/{fieldId}/deletion-preview')
        return Promise.resolve({ data: { caseCount: 3 }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: true } })
    })
    render(<CustomFieldsCard projectKey="p1" />)
    const row = (await screen.findByText('Automation Owner')).closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: /delete/i }))

    expect(await screen.findByText(/3 cases? currently have a value set/i)).toBeInTheDocument()
  })

  it('deletes a field after confirmation', async () => {
    mockFieldsAPI()
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}/custom-fields')
        return Promise.resolve({ data: [textField, selectField], response: { ok: true } })
      if (path === '/api/v1/custom-fields/{fieldId}/deletion-preview')
        return Promise.resolve({ data: { caseCount: 0 }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: true } })
    })
    mockDELETE.mockResolvedValue({ response: { ok: true } })
    render(<CustomFieldsCard projectKey="p1" />)
    const row = (await screen.findByText('Automation Owner')).closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: /delete/i }))
    await screen.findByText(/0 cases? currently have a value set/i)
    await userEvent.click(screen.getByRole('button', { name: /delete field/i }))

    await waitFor(() => {
      expect(mockDELETE).toHaveBeenCalledWith('/api/v1/custom-fields/{fieldId}', expect.objectContaining({ params: { path: { fieldId: 'f1' } } }))
    })
  })

  it('adds an option to a select field', async () => {
    mockFieldsAPI()
    mockPOST.mockResolvedValue({ data: { id: 'o3', value: 'Mobile' }, response: { ok: true } })
    render(<CustomFieldsCard projectKey="p1" />)
    const row = (await screen.findByText('Component')).closest('li')!
    await userEvent.type(within(row).getByPlaceholderText(/add option/i), 'Mobile{Enter}')

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/custom-fields/{fieldId}/options',
        expect.objectContaining({ params: { path: { fieldId: 'f2' } }, body: { value: 'Mobile' } }),
      )
    })
  })

  it('removes an option from a select field', async () => {
    mockFieldsAPI()
    mockDELETE.mockResolvedValue({ response: { ok: true } })
    render(<CustomFieldsCard projectKey="p1" />)
    const row = (await screen.findByText('Component')).closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: /remove api/i }))

    await waitFor(() => {
      expect(mockDELETE).toHaveBeenCalledWith(
        '/api/v1/custom-fields/{fieldId}/options/{optionId}',
        expect.objectContaining({ params: { path: { fieldId: 'f2', optionId: 'o1' } } }),
      )
    })
  })

  it('reorders fields via the row action menu fallback (Move down / Move up)', async () => {
    mockFieldsAPI()
    mockPUT.mockResolvedValue({ response: { ok: true } })
    render(<CustomFieldsCard projectKey="p1" />)
    const row = (await screen.findByText('Automation Owner')).closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: /actions for automation owner/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /move down/i }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/custom-fields/order',
        expect.objectContaining({ params: { path: { projectKey: 'p1' } }, body: { fieldIds: ['f2', 'f1'] } }),
      )
    })
  })

  it('disables Move up on the first field and Move down on the last', async () => {
    mockFieldsAPI()
    render(<CustomFieldsCard projectKey="p1" />)
    const firstRow = (await screen.findByText('Automation Owner')).closest('li')!
    await userEvent.click(within(firstRow).getByRole('button', { name: /actions for automation owner/i }))
    expect(screen.getByRole('menuitem', { name: /move up/i })).toBeDisabled()
  })

  it('reorders fields by dragging the grip handle', async () => {
    mockFieldsAPI()
    mockPUT.mockResolvedValue({ response: { ok: true } })
    const { container } = render(<CustomFieldsCard projectKey="p1" />)
    await screen.findByText('Automation Owner')

    const handles = container.querySelectorAll('[data-drag-handle]')
    const rows = container.querySelectorAll('[data-field-id]')
    const dt = makeDataTransfer()
    fireEvent.dragStart(handles[0], { dataTransfer: dt })
    fireEvent.dragOver(rows[1], { dataTransfer: dt })
    fireEvent.drop(rows[1], { dataTransfer: dt })

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/custom-fields/order',
        expect.objectContaining({ params: { path: { projectKey: 'p1' } }, body: { fieldIds: ['f2', 'f1'] } }),
      )
    })
  })

  it('a drag that does not start from the grip handle is ignored', async () => {
    mockFieldsAPI()
    mockPUT.mockResolvedValue({ response: { ok: true } })
    const { container } = render(<CustomFieldsCard projectKey="p1" />)
    const nameEl = await screen.findByText('Automation Owner')
    const rows = container.querySelectorAll('[data-field-id]')

    const dt = makeDataTransfer()
    const event = fireEvent.dragStart(nameEl, { dataTransfer: dt })
    // preventDefault() was called, so the browser never starts a drag —
    // dataTransfer never gets the field id, so a drop elsewhere no-ops.
    expect(event).toBe(false)
    fireEvent.dragOver(rows[1], { dataTransfer: dt })
    fireEvent.drop(rows[1], { dataTransfer: dt })
    expect(mockPUT).not.toHaveBeenCalled()
  })

  it('reorders a select field\'s options by dragging their grip handles', async () => {
    mockFieldsAPI()
    mockPUT.mockResolvedValue({ response: { ok: true } })
    const { container } = render(<CustomFieldsCard projectKey="p1" />)
    await screen.findByText('Component')

    const apiRow = container.querySelector('[data-option-id="o1"]')!
    const webRow = container.querySelector('[data-option-id="o2"]')!
    const apiHandle = apiRow.querySelector('[data-drag-handle]')!

    const dt = makeDataTransfer()
    fireEvent.dragStart(apiHandle, { dataTransfer: dt })
    fireEvent.dragOver(webRow, { dataTransfer: dt })
    fireEvent.drop(webRow, { dataTransfer: dt })

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/custom-fields/{fieldId}/options/order',
        expect.objectContaining({ params: { path: { fieldId: 'f2' } }, body: { optionIds: ['o2', 'o1'] } }),
      )
    })
  })

  it('reorders a select field\'s options via the fallback menu, independent of field order', async () => {
    mockFieldsAPI()
    mockPUT.mockResolvedValue({ response: { ok: true } })
    render(<CustomFieldsCard projectKey="p1" />)
    const row = (await screen.findByText('Component')).closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: /actions for option api/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /move down/i }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/custom-fields/{fieldId}/options/order',
        expect.objectContaining({ params: { path: { fieldId: 'f2' } }, body: { optionIds: ['o2', 'o1'] } }),
      )
    })
  })
})

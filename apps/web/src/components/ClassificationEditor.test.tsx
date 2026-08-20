import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClassificationEditor } from './ClassificationEditor'

const baseProps = {
  priority: 'medium' as const,
  tagsText: '',
  platform: '',
  testType: '',
  automated: false,
  onPriorityChange: vi.fn(),
  onTagsTextChange: vi.fn(),
  onPlatformChange: vi.fn(),
  onTestTypeChange: vi.fn(),
  onAutomatedChange: vi.fn(),
}

describe('ClassificationEditor custom fields', () => {
  it('renders nothing extra when the project has no custom fields defined', () => {
    render(<ClassificationEditor {...baseProps} customFieldDefs={[]} customFieldValues={{}} onCustomFieldValueChange={vi.fn()} />)
    expect(screen.queryByText('Custom fields')).not.toBeInTheDocument()
  })

  it('renders a text input for a text field and a select for a select field', () => {
    render(
      <ClassificationEditor
        {...baseProps}
        customFieldDefs={[
          { id: 'f1', name: 'Automation Owner', fieldType: 'text', createdAt: '' },
          { id: 'f2', name: 'Component', fieldType: 'select', options: [{ id: 'o1', value: 'API' }, { id: 'o2', value: 'Web' }], createdAt: '' },
        ]}
        customFieldValues={{}}
        onCustomFieldValueChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Automation Owner').tagName).toBe('INPUT')
    const select = screen.getByLabelText('Component')
    expect(select.tagName).toBe('SELECT')
    expect(screen.getByRole('option', { name: 'API' })).toBeInTheDocument()
  })

  it('a select field has a leading unset option', () => {
    render(
      <ClassificationEditor
        {...baseProps}
        customFieldDefs={[{ id: 'f2', name: 'Component', fieldType: 'select', options: [{ id: 'o1', value: 'API' }], createdAt: '' }]}
        customFieldValues={{}}
        onCustomFieldValueChange={vi.fn()}
      />,
    )
    const select = screen.getByLabelText('Component') as HTMLSelectElement
    expect(select.value).toBe('')
  })

  it('calls onCustomFieldValueChange when a text field is edited', async () => {
    const onChange = vi.fn()
    render(
      <ClassificationEditor
        {...baseProps}
        customFieldDefs={[{ id: 'f1', name: 'Automation Owner', fieldType: 'text', createdAt: '' }]}
        customFieldValues={{}}
        onCustomFieldValueChange={onChange}
      />,
    )
    await userEvent.type(screen.getByLabelText('Automation Owner'), 'ana')
    expect(onChange).toHaveBeenCalledWith('f1', 'a')
  })

  it('selecting a select field option calls onCustomFieldValueChange with the option id', async () => {
    const onChange = vi.fn()
    render(
      <ClassificationEditor
        {...baseProps}
        customFieldDefs={[{ id: 'f2', name: 'Component', fieldType: 'select', options: [{ id: 'o1', value: 'API' }], createdAt: '' }]}
        customFieldValues={{}}
        onCustomFieldValueChange={onChange}
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Component'), 'o1')
    expect(onChange).toHaveBeenCalledWith('f2', 'o1')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CaseFormatEditor } from './CaseFormatEditor'

const noopHandlers = {
  onFormatChange: vi.fn(),
  onStepsChange: vi.fn(),
  onDescriptionChange: vi.fn(),
  onGherkinSourceChange: vi.fn(),
}

describe('CaseFormatEditor', () => {
  it('renders the format picker with the active format pressed', () => {
    render(
      <CaseFormatEditor format="steps" steps={[]} description="" gherkinSource="" {...noopHandlers} />,
    )
    const group = screen.getByRole('group', { name: /format/i })
    expect(group.querySelector('[aria-pressed="true"]')).toHaveTextContent('Steps')
  })

  it('renders CaseStepsList (editable) for format: steps', () => {
    const onStepsChange = vi.fn()
    render(
      <CaseFormatEditor
        format="steps"
        steps={[{ action: 'do it', expected: '' }]}
        description=""
        gherkinSource=""
        {...noopHandlers}
        onStepsChange={onStepsChange}
      />,
    )
    expect(screen.getByLabelText(/^action for step 1/i)).toHaveValue('do it')
  })

  it('renders a description field for format: text', () => {
    render(<CaseFormatEditor format="text" steps={[]} description="hello" gherkinSource="" {...noopHandlers} />)
    expect(screen.getByLabelText(/description/i)).toHaveValue('hello')
  })

  it('renders the Gherkin editor for format: gherkin', () => {
    render(<CaseFormatEditor format="gherkin" steps={[]} description="" gherkinSource="Given x" {...noopHandlers} />)
    expect(screen.getByLabelText(/scenario/i)).toHaveValue('Given x')
  })

  it('switches format immediately when the current format has no content', async () => {
    const onFormatChange = vi.fn()
    render(
      <CaseFormatEditor format="steps" steps={[]} description="" gherkinSource="" {...noopHandlers} onFormatChange={onFormatChange} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /free text/i }))
    expect(onFormatChange).toHaveBeenCalledWith('text')
  })

  it('warns before switching away from a format with content, and confirming clears it and switches', async () => {
    const onFormatChange = vi.fn()
    const onStepsChange = vi.fn()
    const onDescriptionChange = vi.fn()
    const onGherkinSourceChange = vi.fn()
    render(
      <CaseFormatEditor
        format="steps"
        steps={[{ action: 'do it', expected: '' }]}
        description=""
        gherkinSource=""
        onFormatChange={onFormatChange}
        onStepsChange={onStepsChange}
        onDescriptionChange={onDescriptionChange}
        onGherkinSourceChange={onGherkinSourceChange}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /gherkin/i }))
    expect(screen.getByRole('dialog', { name: /switch to gherkin/i })).toBeInTheDocument()
    expect(onFormatChange).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /switch format/i }))
    expect(onStepsChange).toHaveBeenCalledWith([{ action: '', expected: '' }])
    expect(onDescriptionChange).toHaveBeenCalledWith('')
    expect(onGherkinSourceChange).toHaveBeenCalledWith('')
    expect(onFormatChange).toHaveBeenCalledWith('gherkin')
  })

  it('cancel keeps the current format and content untouched', async () => {
    const onFormatChange = vi.fn()
    render(
      <CaseFormatEditor
        format="steps"
        steps={[{ action: 'do it', expected: '' }]}
        description=""
        gherkinSource=""
        {...noopHandlers}
        onFormatChange={onFormatChange}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /free text/i }))
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onFormatChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^action for step 1/i)).toHaveValue('do it')
  })
})

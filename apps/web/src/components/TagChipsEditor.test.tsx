import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TagChipsEditor } from './TagChipsEditor'

describe('TagChipsEditor', () => {
  it('renders current tags as removable chips', () => {
    render(<TagChipsEditor tags={['mobile', 'internal']} vocabulary={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('mobile')).toBeInTheDocument()
    expect(screen.getByText('internal')).toBeInTheDocument()
  })

  it('calls onRemove when a chip\'s remove button is clicked', async () => {
    const onRemove = vi.fn()
    render(<TagChipsEditor tags={['mobile']} vocabulary={[]} onAdd={vi.fn()} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /remove mobile/i }))
    expect(onRemove).toHaveBeenCalledWith('mobile')
  })

  it('shows no chip row when there are no tags', () => {
    render(<TagChipsEditor tags={[]} vocabulary={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('suggests matching vocabulary entries while typing', async () => {
    render(
      <TagChipsEditor tags={[]} vocabulary={['mobile', 'backend', 'internal']} onAdd={vi.fn()} onRemove={vi.fn()} />,
    )
    await userEvent.type(screen.getByPlaceholderText(/add a tag/i), 'mob')
    expect(screen.getByRole('button', { name: 'mobile' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'backend' })).not.toBeInTheDocument()
  })

  it('excludes already-assigned tags from suggestions', async () => {
    render(
      <TagChipsEditor tags={['mobile']} vocabulary={['mobile', 'mobile-app']} onAdd={vi.fn()} onRemove={vi.fn()} />,
    )
    await userEvent.type(screen.getByPlaceholderText(/add a tag/i), 'mob')
    expect(screen.queryByRole('button', { name: 'mobile' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'mobile-app' })).toBeInTheDocument()
  })

  it('calls onAdd with an existing vocabulary entry when selected, clearing the input', async () => {
    const onAdd = vi.fn()
    render(<TagChipsEditor tags={[]} vocabulary={['mobile']} onAdd={onAdd} onRemove={vi.fn()} />)
    const input = screen.getByPlaceholderText(/add a tag/i)
    await userEvent.type(input, 'mobile')
    await userEvent.click(screen.getByRole('button', { name: 'mobile' }))
    expect(onAdd).toHaveBeenCalledWith('mobile')
    expect(input).toHaveValue('')
  })

  it('offers to add a genuinely new tag when there is no exact match', async () => {
    render(<TagChipsEditor tags={[]} vocabulary={['mobile']} onAdd={vi.fn()} onRemove={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/add a tag/i), 'newthing')
    expect(screen.getByRole('button', { name: /add "newthing" as a new tag/i })).toBeInTheDocument()
  })

  it('does not offer to add a new tag when the text exactly matches an existing one', async () => {
    render(<TagChipsEditor tags={[]} vocabulary={['mobile']} onAdd={vi.fn()} onRemove={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/add a tag/i), 'mobile')
    expect(screen.queryByRole('button', { name: /add ".*" as a new tag/i })).not.toBeInTheDocument()
  })

  it('adds a new tag on Enter', async () => {
    const onAdd = vi.fn()
    render(<TagChipsEditor tags={[]} vocabulary={[]} onAdd={onAdd} onRemove={vi.fn()} />)
    const input = screen.getByPlaceholderText(/add a tag/i)
    await userEvent.type(input, 'newthing{Enter}')
    expect(onAdd).toHaveBeenCalledWith('newthing')
    expect(input).toHaveValue('')
  })

  it('does not call onAdd on Enter with empty input', async () => {
    const onAdd = vi.fn()
    render(<TagChipsEditor tags={[]} vocabulary={[]} onAdd={onAdd} onRemove={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/add a tag/i), '{Enter}')
    expect(onAdd).not.toHaveBeenCalled()
  })
})

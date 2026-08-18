import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ResizeHandle } from './ResizeHandle'

describe('ResizeHandle', () => {
  it('renders as a focusable, keyboard-operable vertical separator', () => {
    render(<ResizeHandle width={256} min={200} max={480} onResize={vi.fn()} onKeyDown={vi.fn()} />)
    const handle = screen.getByRole('separator')
    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    expect(handle).toHaveAttribute('aria-valuenow', '256')
    expect(handle).toHaveAttribute('aria-valuemin', '200')
    expect(handle).toHaveAttribute('aria-valuemax', '480')
    expect(handle).toHaveAttribute('tabIndex', '0')
  })

  it('forwards keydown events to the onKeyDown prop', () => {
    const onKeyDown = vi.fn()
    render(<ResizeHandle width={256} min={200} max={480} onResize={vi.fn()} onKeyDown={onKeyDown} />)
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    expect(onKeyDown).toHaveBeenCalledTimes(1)
  })

  it('calls onResize with the dragged delta while pointer-dragging', () => {
    const onResize = vi.fn()
    render(<ResizeHandle width={256} min={200} max={480} onResize={onResize} onKeyDown={vi.fn()} />)
    const handle = screen.getByRole('separator')

    fireEvent.pointerDown(handle, { clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 130 })
    expect(onResize).toHaveBeenCalledWith(286)

    fireEvent.pointerMove(window, { clientX: 90 })
    expect(onResize).toHaveBeenCalledWith(246)
  })

  it('stops resizing after pointerup', () => {
    const onResize = vi.fn()
    render(<ResizeHandle width={256} min={200} max={480} onResize={onResize} onKeyDown={vi.fn()} />)
    const handle = screen.getByRole('separator')

    fireEvent.pointerDown(handle, { clientX: 100 })
    fireEvent.pointerUp(window, { clientX: 100 })
    onResize.mockClear()
    fireEvent.pointerMove(window, { clientX: 200 })
    expect(onResize).not.toHaveBeenCalled()
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { isEditableElementFocused } from './keyboardShortcutGuard'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('isEditableElementFocused', () => {
  it('returns false when the body has focus', () => {
    document.body.focus()
    expect(isEditableElementFocused()).toBe(false)
  })

  it('returns true when an input has focus', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(isEditableElementFocused()).toBe(true)
  })

  it('returns true when a textarea has focus', () => {
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()
    expect(isEditableElementFocused()).toBe(true)
  })

  it('returns true when a contentEditable element has focus', () => {
    const div = document.createElement('div')
    div.contentEditable = 'true'
    div.tabIndex = 0
    document.body.appendChild(div)
    div.focus()
    expect(isEditableElementFocused()).toBe(true)
  })
})

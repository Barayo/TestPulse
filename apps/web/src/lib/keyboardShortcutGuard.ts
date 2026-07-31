export function isEditableElementFocused(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true
  return el.isContentEditable === true || el.contentEditable === 'true'
}
